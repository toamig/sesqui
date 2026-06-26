// Headless 4-player single-elimination tournament using the REAL engine, to
// produce authentic bracket results for a visual walkthrough. Four AI players of
// different strengths play two semifinals and a final; colours are random per
// match (best-of-1, like the live tournament). Prints a JSON blob for the widget.

import { applyAction, createInitialState } from '../src/game/rules'
import { AZSearchAI } from '../src/game/ai/azSearch'
import { MctsAI } from '../src/game/ai/mctsAI'
import { AlphaBetaAI } from '../src/game/ai/alphaBetaAI'
import { HeuristicAI } from '../src/game/ai/heuristicAI'
import { Difficulty, type AIPlayer } from '../src/game/ai/ai'

const THINK = 150

interface Competitor {
  name: string
  label: string
  make: () => AIPlayer
}

const FIELD: Competitor[] = [
  { name: 'Aria', label: 'Neural', make: () => new AZSearchAI({ timeMs: THINK, temperature: 1, tempTurns: 2 }) },
  { name: 'Bolt', label: 'Expert (MCTS)', make: () => new MctsAI({ timeMs: THINK, temperature: 1, tempTurns: 2 }) },
  { name: 'Cyra', label: 'Hard (Alpha-Beta)', make: () => new AlphaBetaAI({ timeMs: THINK, temperature: 1, tempTurns: 2 }) },
  { name: 'Dex', label: 'Medium', make: () => new HeuristicAI(Difficulty.Medium, 1.0) },
]

interface MatchResult {
  a: string
  b: string
  winner: string
  loser: string
  plies: number
  colorWon: 'Black' | 'White'
}

/** Play one match. `a` is randomly assigned Black (V) or White (H). */
function playMatch(ca: Competitor, cb: Competitor): MatchResult {
  const aIsV = Math.random() < 0.5
  const ai = ca.make()
  const bi = cb.make()
  let s = createInitialState()
  let plies = 0
  while (s.winner === null && plies < 400) {
    const currentIsA = (s.current === 'V') === aIsV
    const action = (currentIsA ? ai : bi).chooseAction(s)
    if (!action) break
    s = applyAction(s, action)
    plies++
  }
  const vWon = s.winner === 'V'
  const aWon = vWon === aIsV
  return {
    a: ca.name,
    b: cb.name,
    winner: aWon ? ca.name : cb.name,
    loser: aWon ? cb.name : ca.name,
    plies,
    colorWon: vWon ? 'Black' : 'White',
  }
}

function byName(n: string): Competitor {
  return FIELD.find((c) => c.name === n) as Competitor
}

function main(): void {
  // Shuffle the seeding.
  const seeds = [...FIELD].sort(() => Math.random() - 0.5)
  const semi1 = playMatch(seeds[0], seeds[1])
  const semi2 = playMatch(seeds[2], seeds[3])
  const final = playMatch(byName(semi1.winner), byName(semi2.winner))

  const out = {
    players: FIELD.map((c) => ({ name: c.name, label: c.label })),
    seeding: seeds.map((c) => c.name),
    semis: [semi1, semi2],
    final,
    champion: final.winner,
  }
  console.log(JSON.stringify(out, null, 2))
}

main()
