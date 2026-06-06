// Strength benchmark for the AlphaZero-lite player (PUCT + value/policy net) vs
// an existing engine, equal time per move, colours alternated. Needs a trained
// src/game/ai/azNet.json.
//
//   npx tsx ml/benchAZ.ts --games 40 --think 800 --opp mcts

import { applyAction, createInitialState, getLegalActions } from '../src/game/rules'
import { MctsAI } from '../src/game/ai/mctsAI'
import { AlphaBetaAI } from '../src/game/ai/alphaBetaAI'
import { type AIPlayer } from '../src/game/ai/ai'
import { createAZAI } from '../src/game/ai/azSearch'
import { azEvaluate } from '../src/game/ai/azNet'
import type { GameState, Outcome } from '../src/game/types'

function arg(flag: string, def: string): string {
  const i = process.argv.indexOf(flag)
  return i >= 0 && i + 1 < process.argv.length ? process.argv[i + 1] : def
}

function randomPly(state: GameState): GameState {
  const acts = getLegalActions(state)
  return applyAction(state, acts[Math.floor(Math.random() * acts.length)])
}

function playGame(aiV: AIPlayer, aiH: AIPlayer, openRandom: number, maxActions: number): Outcome {
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

function makeOpp(kind: string, think: number): AIPlayer {
  if (kind === 'alphabeta') return new AlphaBetaAI({ timeMs: think })
  return new MctsAI({ timeMs: think })
}

function main(): void {
  const games = Number(arg('--games', '40'))
  const think = Number(arg('--think', '800'))
  const oppKind = arg('--opp', 'mcts')

  let probe = createInitialState()
  for (let i = 0; i < 6; i++) probe = randomPly(probe)
  const N = 2000
  const t0 = Date.now()
  for (let i = 0; i < N; i++) azEvaluate(probe.board, probe.current)
  const evalMs = (Date.now() - t0) / N
  console.log(`azEvaluate: ${evalMs.toFixed(3)} ms/eval (~${Math.round(1000 / evalMs)} evals/s)\n`)

  let azWins = 0
  let oppWins = 0
  let draws = 0
  for (let g = 0; g < games; g++) {
    const az = createAZAI(think)
    const opp = makeOpp(oppKind, think)
    const azIsV = g % 2 === 0
    const winner = azIsV ? playGame(az, opp, 2, 400) : playGame(opp, az, 2, 400)
    if (winner === 'draw' || winner === null) draws++
    else if ((winner === 'V') === azIsV) azWins++
    else oppWins++
    const pct = ((azWins / (g + 1)) * 100).toFixed(0)
    process.stdout.write(
      `\rgame ${g + 1}/${games}  AZ ${azWins} - ${oppWins} ${oppKind}  (draws ${draws})  win%=${pct}   `,
    )
  }
  process.stdout.write('\n')
  console.log(
    `\nRESULT AZ vs ${oppKind} @ ${think}ms: AZ ${azWins}/${games} ` +
      `(${((azWins / games) * 100).toFixed(1)}%), ${oppKind} ${oppWins}, draws ${draws}`,
  )
}

main()
