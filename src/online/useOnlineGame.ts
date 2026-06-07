// Online game controller.
//
// Owns the networked game lifecycle for one room: connect, assign colours,
// relay actions, keep both peers in lock-step, and recover from desync. The UI
// (GameScreen) consumes the returned state and calls submitAction() exactly as
// it would call a local applyAction -- the hook decides whether a move is legal
// to send and replays inbound moves through the same rules engine.

import { useCallback, useEffect, useRef, useState } from 'react'
import { applyAction, createInitialState, otherPlayer } from '../game/rules'
import type { Action, GameState, Player } from '../game/types'
import {
  hashState,
  makePeerId,
  type NetMessage,
  type Role,
} from './protocol'
import type { Transport, TransportFactory } from './transport'
import {
  claimSeat,
  createGame,
  isStoreConfigured,
  loadGame,
  recordMove,
  releaseSeat,
  resetGame,
} from './gameStore'
import { getSeatToken, resolveSeatToken } from './seat'
import { settleGame, type RatingDelta } from './ratings'

/** Connection lifecycle as the UI cares about it. */
export type OnlineStatus =
  | 'idle' // not connected
  | 'connecting' // transport opening
  | 'waiting' // connected, alone in the room, waiting for opponent
  | 'no-opponent' // guest connected but no host answered within the grace period
  | 'playing' // both peers present
  | 'spectating' // both seats taken; this client watches read-only
  | 'opponent-left' // peer disconnected mid-game
  | 'error'

/** How long a guest waits to hear from a host before showing the "no opponent
 *  yet" hint. The heartbeat keeps running, so a late-joining host still heals
 *  the connection automatically. */
const NO_OPPONENT_GRACE_MS = 12000

export interface OnlineGame {
  status: OnlineStatus
  /** This client's colour, or null until assigned. */
  myColor: Player | null
  role: Role | null
  /** The authoritative local game state (replayed from the action log). */
  state: GameState
  /** True when it is this client's turn to act. */
  myTurn: boolean
  /** True when this client is a read-only spectator (both seats were taken). */
  isSpectator: boolean
  /** Server-settled rating result for the just-finished game, or null. */
  ratingDelta: RatingDelta | null
  /** Submit a local action; relays to the opponent and applies locally. Returns
   *  false if it is not your turn or the game is over. */
  submitAction: (action: Action) => boolean
  /** Host or guest can request a fresh game (host authors the new game id). */
  requestRematch: () => void
  /** Leave the room and reset to idle. */
  leave: () => void
  /** Re-attempt the connection after a 'no-opponent' timeout. */
  retry: () => void
  /** Last human-readable error, if status === 'error'. */
  error: string | null
}

interface Options {
  room: string
  role: Role
  /** Factory for the underlying transport (local today, Supabase later). */
  createTransport: TransportFactory
  /** Host's preferred colour. Default: host plays V (Black), the opener. */
  hostColor?: Player
}

/**
 * The action log is the source of truth. `seq` counts applied actions; replaying
 * log[0..n] from the initial state reproduces `state`. We keep the log so a
 * lagging peer can be re-sent missing actions and a divergent peer can be reset
 * from an authoritative snapshot.
 */
export function useOnlineGame(options: Options | null): OnlineGame {
  const [status, setStatus] = useState<OnlineStatus>('idle')
  const [myColor, setMyColor] = useState<Player | null>(null)
  const [role, setRole] = useState<Role | null>(null)
  const [state, setState] = useState<GameState>(createInitialState)
  const [error, setError] = useState<string | null>(null)
  // Bumping this re-runs the connection effect (used by retry()).
  const [reconnectNonce, setReconnectNonce] = useState(0)

  // Refs mirror state for use inside stable callbacks / async handlers without
  // re-subscribing the transport on every move.
  const transportRef = useRef<Transport | null>(null)
  const peerIdRef = useRef<string>(makePeerId())
  const gameIdRef = useRef<number>(0)
  const seqRef = useRef<number>(0)
  const logRef = useRef<Action[]>([])
  const stateRef = useRef<GameState>(state)
  const myColorRef = useRef<Player | null>(null)
  const opponentSeenRef = useRef<boolean>(false)
  // Layer 2: this browser's stable seat token, and whether we're a read-only
  // spectator (both seats already held by others when we joined).
  const seatTokenRef = useRef<string>(getSeatToken())
  const spectatorRef = useRef<boolean>(false)
  const roomRef = useRef<string>('')
  // Layer 3d: guard so a finished game is settled (server-side win check + Elo)
  // exactly once per game generation; the resulting rating delta for the UI.
  const settleDoneRef = useRef<boolean>(false)
  const [ratingDelta, setRatingDelta] = useState<RatingDelta | null>(null)

  const setLiveState = useCallback((next: GameState) => {
    stateRef.current = next
    setState(next)
  }, [])

  /** Reset the local game to a fresh board for a given game id and host colour.
   *  When `persistAs` is set, the host writes the new game to the durable store:
   *  'create' inserts a fresh row (first game), 'reset' bumps an existing row
   *  (rematch). Guests never write here; they hydrate/seat via the store on
   *  connect instead. */
  const beginGame = useCallback(
    (gameId: number, hostColor: Player, myRole: Role, persistAs?: 'create' | 'reset') => {
      gameIdRef.current = gameId
      seqRef.current = 0
      logRef.current = []
      const mine: Player = myRole === 'host' ? hostColor : otherPlayer(hostColor)
      myColorRef.current = mine
      spectatorRef.current = false
      settleDoneRef.current = false
      setRatingDelta(null)
      setMyColor(mine)
      const fresh = createInitialState()
      setLiveState(fresh)
      setStatus('playing')
      if (persistAs && isStoreConfigured && roomRef.current) {
        if (persistAs === 'create') {
          void createGame({
            code: roomRef.current,
            gameId,
            state: fresh,
            hostColor,
            hostToken: seatTokenRef.current,
          })
        } else {
          void resetGame({ code: roomRef.current, gameId, state: fresh })
        }
      }
    },
    [setLiveState],
  )

  /** Apply one action to the local state and advance the sequence counter.
   *  Write-through to the durable store is best-effort and fire-and-forget: the
   *  move was already delivered live over broadcast, so a failed/absent DB write
   *  never blocks play. To avoid two writers racing on the same row, only the
   *  player whose move it was (i.e. the local submitter) persists; inbound moves
   *  are persisted by the peer that sent them. */
  const applyLocal = useCallback(
    (action: Action, persist: boolean) => {
      const next = applyAction(stateRef.current, action)
      logRef.current.push(action)
      seqRef.current += 1
      setLiveState(next)
      if (persist && isStoreConfigured && roomRef.current) {
        // Persist the move, then (if it ended the game) ask the server to
        // settle. Ordering matters: finish_game reads the STORED board, so the
        // save must land first. settle is idempotent server-side, so the other
        // client calling too is harmless.
        const room = roomRef.current
        const settledRef = settleDoneRef
        void recordMove(room, action, next, seqRef.current).then(() => {
          if (next.winner !== null && next.winner !== 'draw' && !settledRef.current) {
            settledRef.current = true
            void settleGame(room).then((delta) => {
              if (delta?.ok) setRatingDelta(delta)
            })
          }
        })
      } else if (
        !persist &&
        next.winner !== null &&
        next.winner !== 'draw' &&
        isStoreConfigured &&
        roomRef.current &&
        !settleDoneRef.current
      ) {
        // Inbound winning move: the sender persisted + settles, but call settle
        // too (idempotent) so this client also learns the rating delta. A small
        // delay lets the sender's save land first.
        settleDoneRef.current = true
        const room = roomRef.current
        window.setTimeout(() => {
          void settleGame(room).then((delta) => {
            if (delta?.ok && (delta.rated || delta.already)) setRatingDelta(delta)
          })
        }, 600)
      }
      return next
    },
    [setLiveState],
  )

  // --- Inbound message handling -------------------------------------------
  const handleMessage = useCallback(
    (msg: NetMessage) => {
      if (msg.from === peerIdRef.current) return // ignore our own echo
      const transport = transportRef.current
      if (!transport) return

      switch (msg.t) {
        case 'hello': {
          // First sight of the opponent. Mark presence; if we're the host and
          // a guest just arrived, (re)announce the game so they can start.
          const firstContact = !opponentSeenRef.current
          opponentSeenRef.current = true
          if (role === 'host') {
            // Host is authoritative for colour + game id.
            if (gameIdRef.current === 0) {
              // No game yet (store off, or pre-create skipped): create one now.
              const hostColor = options?.hostColor ?? 'V'
              const gameId = Date.now()
              beginGame(gameId, hostColor, 'host', 'create')
              transport.send({
                t: 'start',
                from: peerIdRef.current,
                hostColor,
                gameId,
              })
            } else if (firstContact) {
              // Game already exists (host pre-created it on connect, or this is a
              // reconnect). Resend start + full state so the guest syncs, and --
              // crucially -- advance the host out of 'waiting' into 'playing'
              // now that a real opponent is present.
              if (!spectatorRef.current) setStatus('playing')
              transport.send({
                t: 'start',
                from: peerIdRef.current,
                hostColor: myColorRef.current ?? 'V',
                gameId: gameIdRef.current,
              })
              transport.send({
                t: 'state',
                from: peerIdRef.current,
                gameId: gameIdRef.current,
                seq: seqRef.current,
                state: stateRef.current,
              })
            }
          }
          break
        }

        case 'start': {
          opponentSeenRef.current = true
          // Adopt the host's game id/colour unless we already run this game.
          if (gameIdRef.current !== msg.gameId) {
            beginGame(msg.gameId, msg.hostColor, role ?? 'guest')
          }
          break
        }

        case 'action': {
          if (msg.gameId !== gameIdRef.current) return
          if (msg.seq < seqRef.current) return // already have it
          if (msg.seq > seqRef.current) {
            // We missed something -- ask for an authoritative snapshot.
            transport.send({ t: 'resync', from: peerIdRef.current, gameId: gameIdRef.current })
            return
          }
          // The sender persists their own move; we just apply it locally.
          const next = applyLocal(msg.action, false)
          if (hashState(next) !== msg.hash) {
            // Divergence: trust the sender's state, request a full snapshot.
            transport.send({ t: 'resync', from: peerIdRef.current, gameId: gameIdRef.current })
          }
          break
        }

        case 'resync': {
          if (msg.gameId !== gameIdRef.current) return
          transport.send({
            t: 'state',
            from: peerIdRef.current,
            gameId: gameIdRef.current,
            seq: seqRef.current,
            state: stateRef.current,
          })
          break
        }

        case 'state': {
          if (msg.gameId !== gameIdRef.current) return
          // Only accept a snapshot that is ahead of us, to avoid loops.
          if (msg.seq >= seqRef.current) {
            seqRef.current = msg.seq
            setLiveState(msg.state)
            setStatus('playing')
          }
          break
        }

        case 'rematch': {
          // Legacy no-op: rematch is now DB-authoritative and announced via a
          // fresh 'start' (see requestRematch). Kept so an older peer's stray
          // 'rematch' message is harmlessly ignored rather than crashing.
          break
        }

        case 'bye': {
          opponentSeenRef.current = false
          setStatus('opponent-left')
          break
        }
      }
    },
    [applyLocal, beginGame, options?.hostColor, role, setLiveState],
  )

  // --- Connection lifecycle -----------------------------------------------
  useEffect(() => {
    if (!options) {
      setStatus('idle')
      return
    }
    let cancelled = false
    let heartbeat: ReturnType<typeof setInterval> | null = null
    let graceTimer: ReturnType<typeof setTimeout> | null = null
    setRole(options.role)
    setStatus('connecting')
    setError(null)
    opponentSeenRef.current = false
    spectatorRef.current = false
    roomRef.current = options.room

    // Layer 2 hydration: before joining the live channel, consult the durable
    // store.
    //  - If a row already exists -> adopt its state (refresh/reconnect resumes
    //    where it left off) and claim our seat (our colour if we held one, an
    //    open seat, or spectator).
    //  - If no row exists and we are the host -> create it now so the room is
    //    durable from creation, not only once a guest arrives.
    // Best-effort and fully skipped when the store is unconfigured (Layer 1).
    const hydrate = async (): Promise<void> => {
      if (!isStoreConfigured) return
      try {
        // Resolve our seat identity (auth.uid() when signed in, else the local
        // browser token) before any seat decision, so seats are owned by a
        // verifiable user that RLS can check.
        seatTokenRef.current = await resolveSeatToken()
        if (cancelled) return
        const existing = await loadGame(options.room)
        if (cancelled) return
        if (existing) {
          const seat = await claimSeat(options.room, seatTokenRef.current)
          if (cancelled) return
          gameIdRef.current = existing.game_id
          seqRef.current = existing.seq
          logRef.current = []
          setLiveState(existing.state)
          if (seat === 'spectator') {
            spectatorRef.current = true
            myColorRef.current = null
            setMyColor(null)
            opponentSeenRef.current = true
            setStatus('spectating')
          } else if (seat === 'V' || seat === 'H') {
            spectatorRef.current = false
            myColorRef.current = seat
            setMyColor(seat)
            // Both seats filled means a real opponent exists; resume playing.
            opponentSeenRef.current = existing.v_token !== null && existing.h_token !== null
            setStatus(opponentSeenRef.current ? 'playing' : 'waiting')
          }
        } else if (options.role === 'host') {
          // First time hosting this room: persist a fresh game immediately so it
          // survives a refresh even before anyone joins. beginGame('create')
          // inserts the row and claims the host's seat.
          const hostColor = options.hostColor ?? 'V'
          const gameId = Date.now()
          beginGame(gameId, hostColor, 'host', 'create')
          // Host has no opponent yet; show the waiting/invite panel.
          opponentSeenRef.current = false
          setStatus('waiting')
        }
      } catch {
        // Ignore store errors; fall through to live Layer 1 behaviour.
      }
    }

    options
      .createTransport(options.room)
      .then(async (transport) => {
        if (cancelled) {
          transport.close()
          return
        }
        transportRef.current = transport
        transport.onMessage(handleMessage)
        setStatus(options.role === 'host' ? 'waiting' : 'connecting')

        await hydrate()
        if (cancelled) return

        const sayHello = () =>
          transport.send({
            t: 'hello',
            from: peerIdRef.current,
            role: options.role,
            hostColor: options.role === 'host' ? options.hostColor ?? 'V' : undefined,
            gameId: gameIdRef.current || undefined,
          })
        sayHello()
        // Periodic hello doubles as presence heartbeat + late-join discovery.
        heartbeat = setInterval(sayHello, 2500)

        // A guest that never hears from a host would otherwise spin on
        // "connecting" forever (e.g. shared the link but the host hasn't opened
        // it yet, or -- in local-test mode -- the opponent is on another device
        // entirely). After a grace period, surface a clear "no opponent yet"
        // state. The heartbeat keeps running, so a host arriving later still
        // heals the connection to 'playing' via the normal hello/start flow.
        if (options.role === 'guest') {
          graceTimer = setTimeout(() => {
            if (!cancelled && !opponentSeenRef.current) setStatus('no-opponent')
          }, NO_OPPONENT_GRACE_MS)
        }
      })
      .catch((err: unknown) => {
        if (cancelled) return
        setError(err instanceof Error ? err.message : 'Failed to connect')
        setStatus('error')
      })

    return () => {
      cancelled = true
      if (heartbeat) clearInterval(heartbeat)
      if (graceTimer) clearTimeout(graceTimer)
      const transport = transportRef.current
      if (transport) {
        transport.send({ t: 'bye', from: peerIdRef.current })
        transport.close()
      }
      transportRef.current = null
      gameIdRef.current = 0
      seqRef.current = 0
      logRef.current = []
      opponentSeenRef.current = false
    }
  }, [options, handleMessage, reconnectNonce])

  // --- Outbound action -----------------------------------------------------
  const submitAction = useCallback(
    (action: Action): boolean => {
      const transport = transportRef.current
      const mine = myColorRef.current
      const cur = stateRef.current
      if (!transport || mine === null) return false
      if (spectatorRef.current) return false // spectators cannot move
      if (cur.winner !== null) return false
      if (cur.current !== mine) return false // not your turn
      const seq = seqRef.current
      // Local mover persists the resulting state to the durable store.
      const next = applyLocal(action, true)
      transport.send({
        t: 'action',
        from: peerIdRef.current,
        gameId: gameIdRef.current,
        seq,
        action,
        hash: hashState(next),
      })
      return true
    },
    [applyLocal],
  )

  const requestRematch = useCallback(() => {
    const transport = transportRef.current
    if (!transport) return
    if (spectatorRef.current) return // spectators cannot start games

    // Rematch is DB-authoritative so it works even if the opponent's live
    // connection has dropped (mobile tabs suspend aggressively): whoever clicks
    // resets the durable game row and broadcasts the new game. The other side
    // applies it live if present, or hydrates it on reconnect. The host's colour
    // is preserved across rematches; the new game id orders generations so a
    // stale board can't win a race.
    const hostColor =
      role === 'host'
        ? myColorRef.current ?? options?.hostColor ?? 'V'
        : myColorRef.current
          ? otherPlayer(myColorRef.current)
          : options?.hostColor ?? 'V'
    const gameId = Date.now()
    const myRole: Role = role ?? 'guest'
    // beginGame('reset') updates our local game AND writes the reset to the DB.
    beginGame(gameId, hostColor, myRole, 'reset')
    transport.send({ t: 'start', from: peerIdRef.current, hostColor, gameId })
  }, [beginGame, options?.hostColor, role])

  const leave = useCallback(() => {
    const transport = transportRef.current
    if (transport) {
      transport.send({ t: 'bye', from: peerIdRef.current })
      transport.close()
    }
    // Explicit leave (the button): release our seat in the durable store, and
    // delete the room if both seats are now empty. This is deliberately NOT done
    // in the effect-cleanup path (tab close / refresh / unmount), which must
    // preserve the seat so the player can reclaim it on return.
    if (isStoreConfigured && roomRef.current && !spectatorRef.current) {
      void releaseSeat(roomRef.current, seatTokenRef.current)
    }
    transportRef.current = null
    setStatus('idle')
    setMyColor(null)
    myColorRef.current = null
    spectatorRef.current = false
  }, [])

  /** Re-open the connection from scratch (used after a 'no-opponent' timeout).
   *  Tears down the current transport; bumping the nonce re-runs the effect. */
  const retry = useCallback(() => {
    const transport = transportRef.current
    if (transport) transport.close()
    transportRef.current = null
    setStatus('connecting')
    setReconnectNonce((n) => n + 1)
  }, [])

  const myTurn =
    status === 'playing' &&
    myColor !== null &&
    state.winner === null &&
    state.current === myColor

  return {
    status,
    myColor,
    role,
    state,
    myTurn,
    isSpectator: status === 'spectating',
    ratingDelta,
    submitAction,
    requestRematch,
    leave,
    retry,
    error,
  }
}
