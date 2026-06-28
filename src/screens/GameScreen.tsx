import { useEffect, useMemo, useRef, useState } from 'react'
import { Board } from '../components/Board'
import { CELL_COUNT } from '../game/board'
import {
  applyAction,
  createInitialState,
  isOpening,
  legalMoveTargets,
  legalPlacementTargets,
  MAX_PIECES,
} from '../game/rules'
import type { Action, Board as BoardModel, GameState, Player } from '../game/types'
// Import the Difficulty enum from the lightweight contract module, NOT the
// factory barrel ('../game/ai'), so the main bundle doesn't pull in the AI
// implementations (incl. the neural net weights). The worker loads those.
import { Difficulty } from '../game/ai/ai'
import { useAuth } from '../online/useAuth'
import { saveReplay } from '../online/replays'

type Mode = 'pvp' | 'ai' | 'watch'

interface GameScreenProps {
  /** Which local mode this screen runs: chosen on the main menu, fixed here so
   *  the controls never reshuffle. ('pvp' | 'ai' | 'watch') */
  mode: Mode
  /** vs-Computer engine, chosen on the pre-game opponent screen. */
  initialDifficulty?: Difficulty
  /** vs-Computer side the human plays, chosen pre-game. */
  initialHumanColor?: Player
  /** Return to the opponent picker to change engine/side (vs-Computer only). */
  onChangeOpponent?: () => void
  /** Return to the main menu. */
  onBack: () => void
  /** Open the standalone rules / how-to-play page. */
  onShowRules: () => void
  /** Tournament bot match: play a single game, then report the winner and return
   *  to the bracket. When set, the screen runs as one match (no New Game / undo). */
  onTournamentEnd?: (winner: Player | 'draw') => void
}

const playerName = (p: Player): string =>
  p === 'V' ? 'Vertical (Black)' : 'Horizontal (White)'

const modeTitle = (m: Mode): string =>
  m === 'pvp' ? 'Pass & Play' : m === 'ai' ? 'vs Computer' : 'Watch AI'

const engineLabel = (d: Difficulty): string =>
  d === Difficulty.Easy
    ? 'Random'
    : d === Difficulty.Medium
      ? 'Heuristic'
      : d === Difficulty.Hard
        ? 'Alpha-Beta'
        : d === Difficulty.Expert
          ? 'Monte Carlo (MCTS)'
          : 'Neural (AlphaZero)'

const countPieces = (board: BoardModel, player: Player): number => {
  let n = 0
  for (let i = 0; i < CELL_COUNT; i++) if (board[i] === player) n++
  return n
}

export function GameScreen({
  mode,
  initialDifficulty,
  initialHumanColor,
  onChangeOpponent,
  onBack,
  onShowRules,
  onTournamentEnd,
}: GameScreenProps) {
  const [state, setState] = useState<GameState>(createInitialState)
  const [difficulty, setDifficulty] = useState<Difficulty>(initialDifficulty ?? Difficulty.Medium)
  // Watch mode (AI vs AI): the engine driving each side. Defaults pit the two
  // strong engines against each other so the matchup is visible immediately.
  const [vEngine, setVEngine] = useState<Difficulty>(Difficulty.Hard)
  const [hEngine, setHEngine] = useState<Difficulty>(Difficulty.Expert)
  const [humanColor, setHumanColor] = useState<Player>(initialHumanColor ?? 'V')
  const [selected, setSelected] = useState<number | null>(null)
  const [history, setHistory] = useState<GameState[]>([])
  // The last atomic action drives the arrival animation for the piece it placed
  // or moved; cleared on reset/undo so nothing replays.
  const [lastAction, setLastAction] = useState<Action | null>(null)
  // Admin-only "hand the game to the AI" tool: when on, the engine plays the
  // human's side too (you watch from the current position).
  const [handedOver, setHandedOver] = useState(false)
  // Auth is read only for the admin flag (shared, already-initialised session).
  const auth = useAuth(mode === 'ai')
  const isAdmin = auth.isAdmin

  const workerRef = useRef<Worker | null>(null)
  const reqIdRef = useRef(0)
  const thinkingRef = useRef(false)
  // Full atomic-action log of the current vs-AI game (human + AI moves), used to
  // save a study replay when a Neural game finishes. Reset with the game.
  const actionsRef = useRef<Action[]>([])
  const replaySavedRef = useRef(false)

  // The AI search runs in a Web Worker so a long think (Hard can take ~1.5s)
  // never freezes the board. Replies are matched by id; any reply whose id was
  // superseded by a reset, undo, or newer request is discarded.
  useEffect(() => {
    const worker = new Worker(new URL('../game/ai/aiWorker.ts', import.meta.url), {
      type: 'module',
    })
    workerRef.current = worker
    worker.onmessage = (e: MessageEvent<{ id: number; action: Action | null }>) => {
      if (e.data.id !== reqIdRef.current) return
      thinkingRef.current = false
      const { action } = e.data
      if (action) {
        actionsRef.current.push(action)
        setLastAction(action)
        setState((prev) => applyAction(prev, action))
      }
    }
    return () => {
      worker.terminate()
      workerRef.current = null
    }
  }, [])

  const humanCanAct =
    mode === 'pvp' || (mode === 'ai' && !handedOver && state.current === humanColor)
  const aiToMove =
    state.winner === null &&
    (mode === 'ai' ? handedOver || state.current !== humanColor : mode === 'watch')
  // Which engine moves now: per-side in watch mode, otherwise the AI difficulty.
  const currentEngine: Difficulty =
    mode === 'watch' ? (state.current === 'V' ? vEngine : hEngine) : difficulty
  const canPlace = state.winner === null && humanCanAct && state.placementsLeft > 0
  const canMove = state.winner === null && humanCanAct && state.movesLeft > 0

  // Drive the computer's turn one action at a time by posting the current state
  // to the worker. The ref guard keeps a single request in flight under React
  // StrictMode's double-invoked effects.
  useEffect(() => {
    if (!aiToMove || thinkingRef.current) return
    const worker = workerRef.current
    if (!worker) return
    thinkingRef.current = true
    reqIdRef.current += 1
    worker.postMessage({ id: reqIdRef.current, difficulty: currentEngine, state })
  }, [aiToMove, state, currentEngine])

  // When a game vs the Neural AI finishes, save a study replay once. Fire and
  // forget (no-op if the backend/identity is unavailable); not a setState.
  useEffect(() => {
    const winner = state.winner
    // Replays are saved only for logged-in (non-anonymous) players; guest games
    // are not tracked.
    if (
      winner === null ||
      mode !== 'ai' ||
      difficulty !== Difficulty.Neural ||
      !auth.ready ||
      auth.anonymous ||
      replaySavedRef.current
    ) {
      return
    }
    replaySavedRef.current = true
    void saveReplay({
      mode: 'ai',
      opponent: 'Neural',
      humanColor,
      winner,
      actions: actionsRef.current.slice(),
    })
  }, [state.winner, mode, difficulty, humanColor, auth.ready, auth.anonymous])

  const allPlaceTargets = useMemo(
    () => (canPlace ? legalPlacementTargets(state) : []),
    [canPlace, state],
  )
  const moveTargets = useMemo(
    () => (selected !== null ? legalMoveTargets(state, selected) : []),
    [selected, state],
  )
  const placeTargets = selected === null ? allPlaceTargets : []

  const commit = (action: Action) => {
    actionsRef.current.push(action)
    setHistory((h) => [...h, state])
    setState(applyAction(state, action))
    setSelected(null)
    setLastAction(action)
  }

  const handleCellClick = (i: number) => {
    if (state.winner !== null || !humanCanAct) return
    const cell = state.board[i]

    if (selected !== null) {
      if (i === selected) {
        // Click the highlighted piece again to cancel the move selection. The
        // green placement hints reappear, so you can choose to place first.
        setSelected(null)
      } else if (moveTargets.includes(i)) {
        commit({ kind: 'move', from: selected, to: i })
      } else if (cell === state.current && canMove) {
        setSelected(i)
      } else {
        setSelected(null)
      }
      return
    }

    if (cell === state.current && canMove) {
      setSelected(i)
    } else if (canPlace && allPlaceTargets.includes(i)) {
      commit({ kind: 'place', to: i })
    }
  }

  const resetWith = (
    next: Partial<{
      difficulty: Difficulty
      humanColor: Player
      vEngine: Difficulty
      hEngine: Difficulty
    }>,
  ) => {
    if (next.difficulty !== undefined) setDifficulty(next.difficulty)
    if (next.humanColor !== undefined) setHumanColor(next.humanColor)
    if (next.vEngine !== undefined) setVEngine(next.vEngine)
    if (next.hEngine !== undefined) setHEngine(next.hEngine)
    setState(createInitialState())
    setHistory([])
    setSelected(null)
    setLastAction(null)
    setHandedOver(false)
    actionsRef.current = []
    replaySavedRef.current = false
    reqIdRef.current += 1 // discard any AI reply still in flight
    thinkingRef.current = false
  }

  const newGame = () => resetWith({})

  /** Hand the human's side to the AI from the current position (admin tool). */
  const handToAI = () => {
    setSelected(null)
    setHandedOver(true)
  }
  /** Resume playing your own side; cancel any AI move in flight for it. */
  const takeControlBack = () => {
    setHandedOver(false)
    reqIdRef.current += 1
    thinkingRef.current = false
  }

  const undo = () => {
    if (history.length === 0) return
    setState(history[history.length - 1])
    setHistory((h) => h.slice(0, -1))
    setSelected(null)
    setLastAction(null)
    reqIdRef.current += 1
    thinkingRef.current = false
  }

  const statusText = (): string => {
    if (state.winner !== null) {
      return state.winner === 'draw' ? 'Draw.' : `${playerName(state.winner)} wins!`
    }
    if (aiToMove) {
      return mode === 'watch'
        ? `${playerName(state.current)} [${engineLabel(currentEngine)}] is thinking`
        : 'Computer is thinking'
    }
    const who = playerName(state.current)
    if (isOpening(state.turn)) {
      if (state.turn === 1) return `${who}: place your first piece on any square.`
      const n = state.placementsLeft
      return `${who}: place ${n} more ${n === 1 ? 'piece' : 'pieces'} on any squares.`
    }
    const parts: string[] = []
    if (state.placementsLeft > 0) parts.push('place next to your colour')
    if (state.movesLeft > 0) parts.push('move like a queen')
    if (parts.length === 2) return `${who}: ${parts[0]} and ${parts[1]}.`
    return `${who}: ${parts[0]}.`
  }

  const blackLeft = MAX_PIECES - countPieces(state.board, 'V')
  const whiteLeft = MAX_PIECES - countPieces(state.board, 'H')

  return (
    <main className="game-screen">
      <div className="screen-topbar topbar-with-fab">
        <div className="topbar-left">
          <button type="button" className="icon-back" onClick={onBack} aria-label="Back to menu">
            <span aria-hidden>←</span> Menu
          </button>
          <button
            type="button"
            className="icon-help"
            onClick={onShowRules}
            aria-label="How to play"
          >
            ?
          </button>
        </div>
        <span className="screen-title">{modeTitle(mode)}</span>
        <span className="topbar-spacer" aria-hidden />
      </div>

      <header className="game-header">
        <h1>Sesqui</h1>
        <p className="subtitle">
          Black links top to bottom. White links left to right.
        </p>
      </header>

      <div className="status-slot">
        <div className={`status ${state.winner !== null ? 'status-win' : ''}`}>
          {statusText()}
          {aiToMove && (
            <span className="thinking-dots" aria-hidden>
              <i />
              <i />
              <i />
            </span>
          )}
        </div>
      </div>

      {mode === 'ai' && handedOver && state.winner === null && (
        <p className="handover-note">
          The AI is playing your side ({playerName(humanColor)}). Watch and learn.
        </p>
      )}

      <Board
        board={state.board}
        selected={selected}
        placeTargets={placeTargets}
        moveTargets={moveTargets}
        winningLine={state.winningLine}
        lastAction={lastAction}
        disabled={state.winner !== null || aiToMove}
        onCellClick={handleCellClick}
      />

      <div className="supply">
        <span className="supply-item">
          <span className="dot dot-v" /> {blackLeft}
        </span>
        <span className="supply-item">
          <span className="dot dot-h" /> {whiteLeft}
        </span>
      </div>

      <div className="controls">
        {mode === 'ai' && !onTournamentEnd && (
          <div className="ai-setup-bar">
            <span className="ai-setup-info">
              <span className="ai-setup-vs">vs {engineLabel(difficulty)}</span>
              <span className="ai-setup-sep" aria-hidden>
                ·
              </span>
              <span className="ai-setup-side">
                You play {humanColor === 'V' ? 'Black' : 'White'}
              </span>
              {difficulty === Difficulty.Neural && (
                <span className="ai-rec-chip" title="This game is saved to your replays">
                  REC
                </span>
              )}
            </span>
            {onChangeOpponent && (
              <button type="button" className="btn btn-small" onClick={onChangeOpponent}>
                Change
              </button>
            )}
          </div>
        )}

        {mode === 'watch' && (
          <>
            <div className="control-group">
              <label htmlFor="v-engine">Black (V)</label>
              <select
                id="v-engine"
                value={vEngine}
                onChange={(e) => resetWith({ vEngine: e.target.value as Difficulty })}
              >
                <option value={Difficulty.Easy}>Random</option>
                <option value={Difficulty.Medium}>Heuristic</option>
                <option value={Difficulty.Hard}>Alpha-Beta</option>
                <option value={Difficulty.Expert}>Monte Carlo (MCTS)</option>
                <option value={Difficulty.Neural}>Neural (AlphaZero)</option>
              </select>
            </div>
            <div className="control-group">
              <label htmlFor="h-engine">White (H)</label>
              <select
                id="h-engine"
                value={hEngine}
                onChange={(e) => resetWith({ hEngine: e.target.value as Difficulty })}
              >
                <option value={Difficulty.Easy}>Random</option>
                <option value={Difficulty.Medium}>Heuristic</option>
                <option value={Difficulty.Hard}>Alpha-Beta</option>
                <option value={Difficulty.Expert}>Monte Carlo (MCTS)</option>
                <option value={Difficulty.Neural}>Neural (AlphaZero)</option>
              </select>
            </div>
          </>
        )}

        <div className="buttons">
          {onTournamentEnd ? (
            <button
              type="button"
              className="btn btn-primary"
              disabled={state.winner === null}
              onClick={() => state.winner !== null && onTournamentEnd(state.winner)}
            >
              {state.winner !== null ? 'Back to the bracket →' : 'Finish the match to continue'}
            </button>
          ) : (
            <>
              <button type="button" className="btn btn-primary" onClick={newGame}>
                New Game
              </button>
              {mode === 'ai' && isAdmin && state.winner === null && (
                <button
                  type="button"
                  className="btn"
                  onClick={handedOver ? takeControlBack : handToAI}
                >
                  {handedOver ? 'Take control back' : 'Hand to AI'}
                </button>
              )}
              {mode === 'pvp' && (
                <button
                  type="button"
                  className="btn"
                  onClick={undo}
                  disabled={history.length === 0}
                >
                  Undo
                </button>
              )}
            </>
          )}
        </div>
      </div>
    </main>
  )
}
