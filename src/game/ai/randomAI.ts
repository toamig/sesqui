// Easy AI: picks a uniformly random legal action.

import { getLegalActions } from '../rules'
import type { Action, GameState } from '../types'
import { Difficulty, type AIPlayer } from './ai'

export class RandomAI implements AIPlayer {
  readonly difficulty = Difficulty.Easy

  chooseAction(state: GameState): Action | null {
    const actions = getLegalActions(state)
    if (actions.length === 0) return null
    return actions[Math.floor(Math.random() * actions.length)]
  }
}
