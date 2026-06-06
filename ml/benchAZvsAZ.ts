// Head-to-head between two AZ model versions (the hand-written engines are
// saturated at 100%, so the only way to measure further gains is net vs net).
// Loads two weight files, builds an evaluator for each, plays them at equal time
// with colours alternated.
//
//   npx tsx ml/benchAZvsAZ.ts --a src/game/ai/azNet.json --b ml/models/azNet-iter2.json --games 30 --think 600
//
// "A" is the candidate (newer); a win rate clearly above 50% means it improved.

import { readFileSync } from 'node:fs'
import { applyAction, createInitialState, getLegalActions } from '../src/game/rules'
import { AZSearchAI } from '../src/game/ai/azSearch'
import { createEvaluator, type AZLayers, type Evaluator } from '../src/game/ai/azNet'
import type { GameState, Outcome } from '../src/game/types'

function arg(flag: string, def: string): string {
  const i = process.argv.indexOf(flag)
  return i >= 0 && i + 1 < process.argv.length ? process.argv[i + 1] : def
}

function loadEval(path: string): Evaluator {
  const j = JSON.parse(readFileSync(path, 'utf8')) as { layers: AZLayers }
  return createEvaluator(j.layers)
}

function randomPly(state: GameState): GameState {
  const acts = getLegalActions(state)
  return applyAction(state, acts[Math.floor(Math.random() * acts.length)])
}

function playGame(aiV: AZSearchAI, aiH: AZSearchAI, openRandom: number, maxActions: number): Outcome {
  let state = createInitialState()
  let ply = 0
  while (ply < openRandom && state.winner === null) {
    state = randomPly(state)
    ply++
  }
  while (state.winner === null && ply < maxActions) {
    const ai = state.current === 'V' ? aiV : aiH
    const action = ai.chooseAction(state)
    if (!action) break
    state = applyAction(state, action)
    ply++
  }
  return state.winner
}

function main(): void {
  const aPath = arg('--a', 'ml/models/azNet-iter4.json')
  const bPath = arg('--b', 'ml/models/azNet-iter3.json')
  const games = Number(arg('--games', '30'))
  const think = Number(arg('--think', '600'))
  const openRandom = Number(arg('--open', '4'))

  const evalA = loadEval(aPath)
  const evalB = loadEval(bPath)
  console.log(`A = ${aPath}\nB = ${bPath}\n${games} games @ ${think}ms, open=${openRandom}\n`)

  let aWins = 0
  let bWins = 0
  let draws = 0
  for (let g = 0; g < games; g++) {
    const aiA = new AZSearchAI({ timeMs: think, evaluate: evalA })
    const aiB = new AZSearchAI({ timeMs: think, evaluate: evalB })
    const aIsV = g % 2 === 0
    const winner = aIsV ? playGame(aiA, aiB, openRandom, 400) : playGame(aiB, aiA, openRandom, 400)
    if (winner === 'draw' || winner === null) draws++
    else if ((winner === 'V') === aIsV) aWins++
    else bWins++
    const pct = ((aWins / (g + 1)) * 100).toFixed(0)
    process.stdout.write(`\rgame ${g + 1}/${games}  A ${aWins} - ${bWins} B  (draws ${draws})  A%=${pct}   `)
  }
  process.stdout.write('\n')
  console.log(
    `\nRESULT A vs B @ ${think}ms: A ${aWins}/${games} (${((aWins / games) * 100).toFixed(1)}%), B ${bWins}, draws ${draws}`,
  )
}

main()
