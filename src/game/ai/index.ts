// Factory for picking an AI implementation by difficulty.

import { AlphaBetaAI } from './alphaBetaAI'
import { Difficulty, type AIPlayer } from './ai'
import { HeuristicAI } from './heuristicAI'
import { MctsAI } from './mctsAI'
import { RandomAI } from './randomAI'
import { createAZAI } from './azSearch'

export function createAI(difficulty: Difficulty): AIPlayer {
  switch (difficulty) {
    case Difficulty.Medium:
      return new HeuristicAI(Difficulty.Medium, 1.0)
    case Difficulty.Hard:
      // temperature: vary the first two placements so games aren't identical.
      return new AlphaBetaAI({ timeMs: 1500, temperature: 1, tempTurns: 2 })
    case Difficulty.Expert:
      return new MctsAI({ timeMs: 1500, temperature: 1, tempTurns: 2 })
    case Difficulty.Neural:
      return createAZAI(1000)
    case Difficulty.Easy:
    default:
      return new RandomAI()
  }
}

export { Difficulty, type AIPlayer }
