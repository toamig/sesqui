// Board geometry constants and helpers shared by the rules engine and the AI.

import type { Board, Cell } from './types'

export const BOARD_SIZE = 8
export const CELL_COUNT = BOARD_SIZE * BOARD_SIZE

export const rowOf = (i: number): number => Math.floor(i / BOARD_SIZE)
export const colOf = (i: number): number => i % BOARD_SIZE
export const idx = (row: number, col: number): number => row * BOARD_SIZE + col
export const inBounds = (row: number, col: number): boolean =>
  row >= 0 && row < BOARD_SIZE && col >= 0 && col < BOARD_SIZE

export const createEmptyBoard = (): Board =>
  Array.from({ length: CELL_COUNT }, () => null as Cell)

type Dir = readonly [number, number]

// Orthogonal neighbours: used for the placement-adjacency rule.
export const ORTHO_DIRS: readonly Dir[] = [
  [-1, 0],
  [1, 0],
  [0, -1],
  [0, 1],
]

// All eight neighbours: used for chain connectivity and queen-move directions.
export const ALL_DIRS: readonly Dir[] = [
  [-1, 0],
  [1, 0],
  [0, -1],
  [0, 1],
  [-1, -1],
  [-1, 1],
  [1, -1],
  [1, 1],
]
