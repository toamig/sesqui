// Rules engine for Sesqui.
//
// The engine applies one Action at a time (a placement or a queen-move) and
// tracks how many of each remain in the current turn. This makes the "no
// crossing at any moment" prohibition and the click-by-click UI fall out
// naturally: every intermediate board is a real, validated state.

import {
  ALL_DIRS,
  BOARD_SIZE,
  CELL_COUNT,
  ORTHO_DIRS,
  colOf,
  createEmptyBoard,
  idx,
  inBounds,
  rowOf,
} from './board'
import type { Action, Board, GameState, Player } from './types'

export const otherPlayer = (p: Player): Player => (p === 'V' ? 'H' : 'V')

// Each side has 30 physical pieces; you cannot place beyond your supply. The cap
// is far above what any connection needs, so it only guards pathological games.
export const MAX_PIECES = 30

// Turns 1 and 2 are the opening: placement is unrestricted and no move is made.
export const isOpening = (turn: number): boolean => turn <= 2

export function createInitialState(): GameState {
  return {
    board: createEmptyBoard(),
    current: 'V', // Vertical (black) opens with a single free placement.
    turn: 1,
    placementsLeft: 1,
    movesLeft: 0,
    winner: null,
    winningLine: null,
  }
}

/** Forbidden crossing: a full 2x2 block whose two diagonals are each one colour
 *  but differ from each other (the "x o / o x" patterns). */
function blockIsCrossing(board: Board, top: number, left: number): boolean {
  const a = board[idx(top, left)]
  const b = board[idx(top, left + 1)]
  const c = board[idx(top + 1, left)]
  const d = board[idx(top + 1, left + 1)]
  if (a === null || b === null || c === null || d === null) return false
  return a === d && b === c && a !== b
}

/** Does cell `at` take part in any forbidden 2x2 crossing on the given board? */
function crossingTouches(board: Board, at: number): boolean {
  const r = rowOf(at)
  const c = colOf(at)
  for (let top = r - 1; top <= r; top++) {
    if (top < 0 || top >= BOARD_SIZE - 1) continue
    for (let left = c - 1; left <= c; left++) {
      if (left < 0 || left >= BOARD_SIZE - 1) continue
      if (blockIsCrossing(board, top, left)) return true
    }
  }
  return false
}

/** Full-board crossing scan. Useful for tests and sanity checks. */
export function boardHasCrossing(board: Board): boolean {
  for (let top = 0; top < BOARD_SIZE - 1; top++) {
    for (let left = 0; left < BOARD_SIZE - 1; left++) {
      if (blockIsCrossing(board, top, left)) return true
    }
  }
  return false
}

function placingCrosses(board: Board, at: number, player: Player): boolean {
  board[at] = player
  const crosses = crossingTouches(board, at)
  board[at] = null
  return crosses
}

function movingCrosses(board: Board, from: number, to: number, player: Player): boolean {
  board[from] = null
  board[to] = player
  const crosses = crossingTouches(board, to)
  board[to] = null
  board[from] = player
  return crosses
}

function pieceCount(board: Board, player: Player): number {
  let n = 0
  for (let i = 0; i < CELL_COUNT; i++) if (board[i] === player) n++
  return n
}

function hasOrthoSameColour(board: Board, at: number, player: Player): boolean {
  const r = rowOf(at)
  const c = colOf(at)
  for (const [dr, dc] of ORTHO_DIRS) {
    const nr = r + dr
    const nc = c + dc
    if (inBounds(nr, nc) && board[idx(nr, nc)] === player) return true
  }
  return false
}

/** Empty cells where the current player may legally place a piece right now. */
export function legalPlacementTargets(state: GameState): number[] {
  const { board, current, turn } = state
  if (pieceCount(board, current) >= MAX_PIECES) return []
  const opening = isOpening(turn)
  const targets: number[] = []
  for (let i = 0; i < CELL_COUNT; i++) {
    if (board[i] !== null) continue
    if (!opening && !hasOrthoSameColour(board, i, current)) continue
    if (placingCrosses(board, i, current)) continue
    targets.push(i)
  }
  return targets
}

/** Empty cells the piece at `from` can legally queen-move to right now. */
export function legalMoveTargets(state: GameState, from: number): number[] {
  const { board, current } = state
  if (board[from] !== current) return []
  const r0 = rowOf(from)
  const c0 = colOf(from)
  const dests: number[] = []
  for (const [dr, dc] of ALL_DIRS) {
    let r = r0 + dr
    let c = c0 + dc
    while (inBounds(r, c) && board[idx(r, c)] === null) {
      const to = idx(r, c)
      if (!movingCrosses(board, from, to, current)) dests.push(to)
      r += dr
      c += dc
    }
  }
  return dests
}

function allLegalMoves(state: GameState): Action[] {
  const { board, current } = state
  const actions: Action[] = []
  for (let from = 0; from < CELL_COUNT; from++) {
    if (board[from] !== current) continue
    for (const to of legalMoveTargets(state, from)) {
      actions.push({ kind: 'move', from, to })
    }
  }
  return actions
}

/** Every atomic action the current player may take in this game state. */
export function getLegalActions(state: GameState): Action[] {
  if (state.winner !== null) return []
  const actions: Action[] = []
  if (state.placementsLeft > 0) {
    for (const to of legalPlacementTargets(state)) actions.push({ kind: 'place', to })
  }
  if (state.movesLeft > 0) {
    for (const move of allLegalMoves(state)) actions.push(move)
  }
  return actions
}

/** The connected chain (8-adjacency) that wins for `player`, or null if none.
 *  Vertical needs a chain spanning top and bottom rows; Horizontal the left and
 *  right columns. */
export function findWinningLine(board: Board, player: Player): number[] | null {
  const seen = new Uint8Array(CELL_COUNT)
  for (let start = 0; start < CELL_COUNT; start++) {
    if (board[start] !== player || seen[start]) continue
    const component: number[] = []
    const stack = [start]
    seen[start] = 1
    let touchesLow = false
    let touchesHigh = false
    while (stack.length > 0) {
      const cur = stack.pop() as number
      component.push(cur)
      const r = rowOf(cur)
      const c = colOf(cur)
      if (player === 'V') {
        if (r === 0) touchesLow = true
        if (r === BOARD_SIZE - 1) touchesHigh = true
      } else {
        if (c === 0) touchesLow = true
        if (c === BOARD_SIZE - 1) touchesHigh = true
      }
      for (const [dr, dc] of ALL_DIRS) {
        const nr = r + dr
        const nc = c + dc
        if (!inBounds(nr, nc)) continue
        const ni = idx(nr, nc)
        if (!seen[ni] && board[ni] === player) {
          seen[ni] = 1
          stack.push(ni)
        }
      }
    }
    if (touchesLow && touchesHigh) return component
  }
  return null
}

/** Zero out any remaining sub-action the player cannot legally perform, so a
 *  turn can never deadlock waiting on an impossible placement or move. */
function normalizeTurn(state: GameState): GameState {
  let placementsLeft = state.placementsLeft
  let movesLeft = state.movesLeft
  if (placementsLeft > 0 && legalPlacementTargets(state).length === 0) placementsLeft = 0
  if (movesLeft > 0 && allLegalMoves(state).length === 0) movesLeft = 0
  if (placementsLeft === state.placementsLeft && movesLeft === state.movesLeft) return state
  return { ...state, placementsLeft, movesLeft }
}

function startNextTurn(state: GameState): GameState {
  const turn = state.turn + 1
  const current: Player = turn % 2 === 1 ? 'V' : 'H'
  const placementsLeft = isOpening(turn) ? (turn === 1 ? 1 : 2) : 1
  const movesLeft = isOpening(turn) ? 0 : 1
  return normalizeTurn({
    ...state,
    current,
    turn,
    placementsLeft,
    movesLeft,
    winningLine: null,
  })
}

/** Apply one atomic action, advancing the turn when both sub-actions are spent.
 *  Callers must pass a legal action (see getLegalActions). */
export function applyAction(state: GameState, action: Action): GameState {
  if (state.winner !== null) return state

  const board = state.board.slice()
  const player = state.current
  let placementsLeft = state.placementsLeft
  let movesLeft = state.movesLeft

  if (action.kind === 'place') {
    board[action.to] = player
    placementsLeft -= 1
  } else {
    board[action.from] = null
    board[action.to] = player
    movesLeft -= 1
  }

  const winningLine = findWinningLine(board, player)
  if (winningLine) {
    return { ...state, board, placementsLeft, movesLeft, winner: player, winningLine }
  }

  let next = normalizeTurn({ ...state, board, placementsLeft, movesLeft })
  if (next.placementsLeft === 0 && next.movesLeft === 0) {
    next = startNextTurn(next)
  }
  return next
}
