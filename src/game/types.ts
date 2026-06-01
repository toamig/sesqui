// Core domain types for Sesqui.

// 'V' = Vertical player, black pieces, connects North (top) to South (bottom).
// 'H' = Horizontal player, white pieces, connects West (left) to East (right).
export type Player = 'V' | 'H'

export type Cell = Player | null

// Flat 8x8 board, length 64. Index = row * 8 + col, row 0 = North, col 0 = West.
export type Board = Cell[]

export type Outcome = Player | 'draw' | null

// A turn is built from atomic actions: a placement and/or a queen-move. Tracking
// them individually keeps the "no crossing at any moment" rule and the click-by-
// click UI simple.
export type Action =
  | { kind: 'place'; to: number }
  | { kind: 'move'; from: number; to: number }

export interface GameState {
  board: Board
  current: Player
  // 1-based turn counter. Turns 1-2 are the opening; from turn 3 on each turn is
  // one placement plus one move.
  turn: number
  placementsLeft: number
  movesLeft: number
  winner: Outcome
  winningLine: number[] | null
}
