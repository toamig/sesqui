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

/** Connection lifecycle as the UI cares about it. */
export type OnlineStatus =
  | 'idle' // not connected
  | 'connecting' // transport opening
  | 'waiting' // connected, alone in the room, waiting for opponent
  | 'no-opponent' // guest connected but no host answered within the grace period
  | 'playing' // both peers present
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

  const setLiveState = useCallback((next: GameState) => {
    stateRef.current = next
    setState(next)
  }, [])

  /** Reset the local game to a fresh board for a given game id and host colour. */
  const beginGame = useCallback(
    (gameId: number, hostColor: Player, myRole: Role) => {
      gameIdRef.current = gameId
      seqRef.current = 0
      logRef.current = []
      const mine: Player = myRole === 'host' ? hostColor : otherPlayer(hostColor)
      myColorRef.current = mine
      setMyColor(mine)
      setLiveState(createInitialState())
      setStatus('playing')
    },
    [setLiveState],
  )

  /** Apply one action to the local state and advance the sequence counter. */
  const applyLocal = useCallback(
    (action: Action) => {
      const next = applyAction(stateRef.current, action)
      logRef.current.push(action)
      seqRef.current += 1
      setLiveState(next)
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
              const hostColor = options?.hostColor ?? 'V'
              const gameId = Date.now()
              beginGame(gameId, hostColor, 'host')
              transport.send({
                t: 'start',
                from: peerIdRef.current,
                hostColor,
                gameId,
              })
            } else if (firstContact) {
              // Opponent (re)joined an existing game: resend start + full state.
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
          const next = applyLocal(msg.action)
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
          // Only the host authors a new game id.
          if (role === 'host') {
            const hostColor = myColorRef.current ?? options?.hostColor ?? 'V'
            const gameId = Date.now()
            beginGame(gameId, hostColor, 'host')
            transport.send({ t: 'start', from: peerIdRef.current, hostColor, gameId })
          }
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

    options
      .createTransport(options.room)
      .then((transport) => {
        if (cancelled) {
          transport.close()
          return
        }
        transportRef.current = transport
        transport.onMessage(handleMessage)
        setStatus(options.role === 'host' ? 'waiting' : 'connecting')

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
      if (cur.winner !== null) return false
      if (cur.current !== mine) return false // not your turn
      const seq = seqRef.current
      const next = applyLocal(action)
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
    if (role === 'host') {
      const hostColor = myColorRef.current ?? options?.hostColor ?? 'V'
      const gameId = Date.now()
      beginGame(gameId, hostColor, 'host')
      transport.send({ t: 'start', from: peerIdRef.current, hostColor, gameId })
    } else {
      transport.send({ t: 'rematch', from: peerIdRef.current })
    }
  }, [beginGame, options?.hostColor, role])

  const leave = useCallback(() => {
    const transport = transportRef.current
    if (transport) {
      transport.send({ t: 'bye', from: peerIdRef.current })
      transport.close()
    }
    transportRef.current = null
    setStatus('idle')
    setMyColor(null)
    myColorRef.current = null
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
    submitAction,
    requestRematch,
    leave,
    retry,
    error,
  }
}
