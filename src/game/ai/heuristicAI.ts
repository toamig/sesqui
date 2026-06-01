// Medium / Hard AI: greedy one-action lookahead over a connection-distance
// evaluation.
//
// For each player we compute the minimum number of empty cells that still need
// filling to link their two edges (own pieces cost 0, empties cost 1, opponent
// pieces are impassable) via a 0-1 BFS. The AI prefers actions that shorten its
// own distance while lengthening the opponent's.

import { ALL_DIRS, BOARD_SIZE, CELL_COUNT, colOf, idx, inBounds, rowOf } from '../board'
import { applyAction, getLegalActions, otherPlayer } from '../rules'
import type { Action, Board, GameState, Player } from '../types'
import { Difficulty, type AIPlayer } from './ai'

export const UNREACHABLE = 99

/** Minimum empty cells the player must still fill to link their two edges, via a
 *  0-1 BFS (own pieces cost 0, empties cost 1, opponent pieces are walls).
 *  Returns UNREACHABLE if the opponent already severs every path. */
export function connectionDistance(board: Board, player: Player): number {
  const cost = (i: number): number =>
    board[i] === player ? 0 : board[i] === null ? 1 : Number.POSITIVE_INFINITY
  const isStart = (i: number): boolean =>
    player === 'V' ? rowOf(i) === 0 : colOf(i) === 0
  const isTarget = (i: number): boolean =>
    player === 'V' ? rowOf(i) === BOARD_SIZE - 1 : colOf(i) === BOARD_SIZE - 1

  const dist = new Array<number>(CELL_COUNT).fill(Number.POSITIVE_INFINITY)
  const deque: number[] = []
  for (let i = 0; i < CELL_COUNT; i++) {
    if (!isStart(i)) continue
    const c = cost(i)
    if (c < dist[i]) {
      dist[i] = c
      if (c === 0) deque.unshift(i)
      else deque.push(i)
    }
  }

  while (deque.length > 0) {
    const cur = deque.shift() as number
    const d = dist[cur]
    const r = rowOf(cur)
    const c = colOf(cur)
    for (const [dr, dc] of ALL_DIRS) {
      const nr = r + dr
      const nc = c + dc
      if (!inBounds(nr, nc)) continue
      const ni = idx(nr, nc)
      const ec = cost(ni)
      if (!Number.isFinite(ec)) continue
      const nd = d + ec
      if (nd < dist[ni]) {
        dist[ni] = nd
        if (ec === 0) deque.unshift(ni)
        else deque.push(ni)
      }
    }
  }

  let best = Number.POSITIVE_INFINITY
  for (let i = 0; i < CELL_COUNT; i++) {
    if (isTarget(i) && dist[i] < best) best = dist[i]
  }
  return Number.isFinite(best) ? best : UNREACHABLE
}

export class HeuristicAI implements AIPlayer {
  readonly difficulty: Difficulty
  private readonly blockWeight: number

  constructor(difficulty: Difficulty, blockWeight: number) {
    this.difficulty = difficulty
    this.blockWeight = blockWeight
  }

  private evaluate(board: Board, me: Player): number {
    const myDist = connectionDistance(board, me)
    const oppDist = connectionDistance(board, otherPlayer(me))
    return oppDist * this.blockWeight - myDist
  }

  chooseAction(state: GameState): Action | null {
    const actions = getLegalActions(state)
    if (actions.length === 0) return null
    const me = state.current

    let bestScore = Number.NEGATIVE_INFINITY
    let best: Action = actions[0]
    for (const action of actions) {
      const next = applyAction(state, action)
      if (next.winner === me) return action
      const score = this.evaluate(next.board, me) + Math.random() * 0.001
      if (score > bestScore) {
        bestScore = score
        best = action
      }
    }
    return best
  }
}
