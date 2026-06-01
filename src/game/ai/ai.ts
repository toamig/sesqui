// AI opponent contract for Sesqui.
//
// Each difficulty is a separate AIPlayer implementation. The UI talks only to
// this interface and drives a turn by calling chooseAction repeatedly until the
// turn passes back to the other player.

import type { Action, GameState } from '../types'

export const Difficulty = {
  Easy: 'easy',
  Medium: 'medium',
  Hard: 'hard',
  Expert: 'expert',
} as const

export type Difficulty = (typeof Difficulty)[keyof typeof Difficulty]

export interface AIPlayer {
  readonly difficulty: Difficulty
  /** Choose the next atomic action for the current player, or null if none. */
  chooseAction(state: GameState): Action | null
}
