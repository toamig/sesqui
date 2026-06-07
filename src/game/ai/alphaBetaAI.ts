// Hard AI: alpha-beta search with iterative deepening.
//
// Sesqui turns hold two atomic actions (a placement and a queen-move, either
// order) before play passes. We search over atomic actions and only flip the
// negamax sign when applyAction changes `state.current`, so a player's place+move
// are searched as two consecutive same-side plies and the opponent only replies
// after both. Values are always from the perspective of the side to move.
//
// Move ordering is by the connection-distance differential (lengthen the
// opponent's path, shorten ours), which is the "block while advancing" signal and
// also what gives alpha-beta its cutoffs. Each node is capped to the top
// `maxBranch` candidates to keep the large branching factor tractable.

import { applyAction, getLegalActions, otherPlayer } from '../rules'
import type { Action, GameState } from '../types'
import { Difficulty, type AIPlayer } from './ai'
import { connectionDistance } from './heuristicAI'

interface AlphaBetaOptions {
  timeMs?: number
  maxBranch?: number
  maxDepth?: number
  /** Early-game variety: for the first `tempTurns` turns, pick at random among
   *  the top heuristic moves instead of always the same one. 0 disables it. */
  temperature?: number
  tempTurns?: number
}

const WIN = 1_000_000
const ABORT = {} // sentinel thrown to unwind the search when time runs out

// Transposition-table bound flags: an entry's value is either exact, a lower
// bound (a beta cutoff happened), or an upper bound (the node failed low).
const TT_EXACT = 0
const TT_LOWER = 1
const TT_UPPER = 2

// Mate-ish scores (WIN - ply) carry a root-relative ply offset, so reusing them
// across transpositions reached at different plies would be unsound. We store
// every node but only trust a cached bound for cutoffs when it is a plain
// evaluation, i.e. comfortably below this threshold in magnitude.
const TT_MATE_GUARD = WIN - 100_000

interface TTEntry {
  depth: number
  value: number
  flag: number
  move: Action | null
}

const now = (): number =>
  typeof performance !== 'undefined' ? performance.now() : Date.now()

/** Static evaluation from the side-to-move's perspective: we want our own
 *  connection distance small and the opponent's large. */
function evalState(state: GameState): number {
  const me = state.current
  const myDist = connectionDistance(state.board, me)
  const oppDist = connectionDistance(state.board, otherPlayer(me))
  return oppDist - myDist
}

/** Rank a side's legal actions best-first by the differential of the resulting
 *  position (an immediate win sorts first). Drives both ordering and capping. */
function scoredOrder(state: GameState, actions: Action[]): Action[] {
  const me = state.current
  const opp = otherPlayer(me)
  const scored = actions.map((a) => {
    const next = applyAction(state, a)
    const s =
      next.winner === me
        ? Infinity
        : connectionDistance(next.board, opp) - connectionDistance(next.board, me)
    return { a, s }
  })
  scored.sort((x, y) => y.s - x.s)
  return scored.map((x) => x.a)
}

/** Structural action equality. A cached best move comes from an earlier
 *  getLegalActions call whose objects are gone, so it must be matched by value. */
function sameAction(a: Action, b: Action): boolean {
  return a.kind === 'place'
    ? b.kind === 'place' && a.to === b.to
    : b.kind === 'move' && a.from === b.from && a.to === b.to
}

/** Transposition key: everything that affects the search from this node. The
 *  place-then-move and move-then-place orderings of one turn reach the same
 *  end-of-turn position and therefore collapse to a single entry here. */
function ttKey(state: GameState): string {
  return `${state.board.join(',')}|${state.current}|${state.turn}|${state.placementsLeft}|${state.movesLeft}`
}

export class AlphaBetaAI implements AIPlayer {
  readonly difficulty: Difficulty
  readonly timeMs: number
  private readonly maxBranch: number
  private readonly maxDepth: number
  private readonly temperature: number
  private readonly tempTurns: number
  private deadline = 0
  private nodes = 0
  private readonly tt = new Map<string, TTEntry>()
  /** Deepest fully-completed iterative-deepening depth from the last decision. */
  lastDepth = 0

  constructor(options: AlphaBetaOptions = {}) {
    this.difficulty = Difficulty.Hard
    this.timeMs = options.timeMs ?? 1500
    this.maxBranch = options.maxBranch ?? 16
    this.maxDepth = options.maxDepth ?? 32
    this.temperature = options.temperature ?? 0
    this.tempTurns = options.tempTurns ?? 0
  }

  chooseAction(state: GameState): Action | null {
    if (state.winner !== null) return null
    const rootActions = getLegalActions(state)
    if (rootActions.length === 0) return null
    if (rootActions.length === 1) return rootActions[0]

    const me = state.current
    for (const a of rootActions) {
      if (applyAction(state, a).winner === me) return a // take an instant win
    }

    // Early-game variety: among the top heuristically-ranked moves, pick one at
    // random instead of always the same. Later turns run the full search.
    if (this.temperature > 0 && state.turn <= this.tempTurns) {
      const ord = scoredOrder(state, rootActions)
      return ord[Math.floor(Math.random() * Math.min(4, ord.length))]
    }

    this.deadline = now() + this.timeMs
    this.nodes = 0
    this.lastDepth = 0
    this.tt.clear() // entries are keyed to this position's subtree only
    let ordered = scoredOrder(state, rootActions) // root: consider all, ordered
    let bestMove = ordered[0]

    try {
      for (let depth = 1; depth <= this.maxDepth; depth++) {
        let localBest = -Infinity
        let localMove = ordered[0]
        let alpha = -Infinity
        for (const a of ordered) {
          const child = applyAction(state, a)
          const score =
            child.current === me
              ? this.search(child, depth - 1, alpha, Infinity, 1)
              : -this.search(child, depth - 1, -Infinity, -alpha, 1)
          if (score > localBest) {
            localBest = score
            localMove = a
          }
          if (localBest > alpha) alpha = localBest
        }
        bestMove = localMove
        this.lastDepth = depth
        // Search the proven-best move first next iteration for stronger cutoffs.
        ordered = [localMove, ...ordered.filter((a) => a !== localMove)]
        if (localBest >= WIN - 100_000) break // forced win located; no need to go deeper
      }
    } catch (e) {
      if (e !== ABORT) throw e // real error: propagate; ABORT just stops deepening
    }
    return bestMove
  }

  private search(
    state: GameState,
    depth: number,
    alpha: number,
    beta: number,
    ply: number,
  ): number {
    if ((++this.nodes & 2047) === 0 && now() > this.deadline) throw ABORT

    if (state.winner !== null) {
      if (state.winner === 'draw') return 0
      // Engine keeps `current` as the winner after a winning action; offset by ply
      // so the search prefers faster wins and slower losses.
      return state.winner === state.current ? WIN - ply : -(WIN - ply)
    }
    if (depth <= 0) return evalState(state)

    const alphaOrig = alpha
    const key = ttKey(state)
    const cached = this.tt.get(key)
    let ttMove: Action | null = null
    if (cached) {
      ttMove = cached.move
      // A deep-enough plain-eval entry can tighten the window or cut outright.
      if (cached.depth >= depth && Math.abs(cached.value) < TT_MATE_GUARD) {
        if (cached.flag === TT_EXACT) return cached.value
        if (cached.flag === TT_LOWER && cached.value > alpha) alpha = cached.value
        else if (cached.flag === TT_UPPER && cached.value < beta) beta = cached.value
        if (alpha >= beta) return cached.value
      }
    }

    const actions = getLegalActions(state)
    if (actions.length === 0) return evalState(state)
    const candidates = scoredOrder(state, actions)
    // Search the cached best move first; it most often still holds and yields the
    // sharpest cutoff. It is guaranteed legal here (the TT key is the full state).
    if (ttMove) {
      const i = candidates.findIndex((a) => sameAction(a, ttMove as Action))
      if (i > 0) {
        const [m] = candidates.splice(i, 1)
        candidates.unshift(m)
      }
    }
    const ordered = candidates.slice(0, this.maxBranch)

    const me = state.current
    let best = -Infinity
    let bestMove: Action | null = null
    for (const a of ordered) {
      const child = applyAction(state, a)
      const score =
        child.current === me
          ? this.search(child, depth - 1, alpha, beta, ply + 1)
          : -this.search(child, depth - 1, -beta, -alpha, ply + 1)
      if (score > best) {
        best = score
        bestMove = a
      }
      if (best > alpha) alpha = best
      if (alpha >= beta) break // beta cutoff
    }

    // Record the bound type so future visits can reuse or prune this position.
    const flag = best <= alphaOrig ? TT_UPPER : best >= beta ? TT_LOWER : TT_EXACT
    this.tt.set(key, { depth, value: best, flag, move: bestMove })
    return best
  }
}
