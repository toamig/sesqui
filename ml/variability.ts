// Measure two things the engines are suspected of:
//   1. Determinism: how repetitive is self-play? (distinct games / N, and what
//      fraction follow the single most common line.)
//   2. Colour balance: with the SAME engine on both sides (so engine strength
//      cancels), how often does V (Black) vs H (White) win? A skew here is a
//      structural game/rules bias, not an engine-strength artifact.
//
//   npx tsx ml/variability.ts --think 150 --det 6 --col 24

import { applyAction, createInitialState, getLegalActions } from '../src/game/rules'
import { MctsAI } from '../src/game/ai/mctsAI'
import { AlphaBetaAI } from '../src/game/ai/alphaBetaAI'
import { HeuristicAI } from '../src/game/ai/heuristicAI'
import { Difficulty, type AIPlayer } from '../src/game/ai/ai'
import { AZSearchAI } from '../src/game/ai/azSearch'
import type { Action, Outcome } from '../src/game/types'

function arg(flag: string, def: string): string {
  const i = process.argv.indexOf(flag)
  return i >= 0 && i + 1 < process.argv.length ? process.argv[i + 1] : def
}

// Matches the in-game factory defaults (temperature on) so the test reflects how
// the engines actually play. Pass --notemp to measure the raw deterministic mode.
const TEMP = !process.argv.includes('--notemp')

function makeEngine(name: string, think: number): AIPlayer {
  if (name === 'neural') {
    return new AZSearchAI({ timeMs: think, temperature: TEMP ? 1 : 0, tempTurns: TEMP ? 6 : 0 })
  }
  if (name === 'alphabeta') {
    return new AlphaBetaAI({ timeMs: think, temperature: TEMP ? 1 : 0, tempTurns: TEMP ? 2 : 0 })
  }
  if (name === 'mcts') {
    return new MctsAI({ timeMs: think, temperature: TEMP ? 1 : 0, tempTurns: TEMP ? 6 : 0 })
  }
  return new HeuristicAI(Difficulty.Medium, 1.0)
}

function sig(actions: Action[]): string {
  return actions.map((a) => (a.kind === 'place' ? `p${a.to}` : `m${a.from}-${a.to}`)).join(',')
}

/** One self-play game (same engine both sides). openRandom random opening plies. */
function playSelf(name: string, think: number, openRandom: number): { winner: Outcome; actions: Action[] } {
  const ai = makeEngine(name, think)
  let s = createInitialState()
  const actions: Action[] = []
  let ply = 0
  while (s.winner === null && ply < 400) {
    let a: Action | null
    if (ply < openRandom) {
      const legal = getLegalActions(s)
      a = legal[Math.floor(Math.random() * legal.length)]
    } else {
      a = ai.chooseAction(s)
    }
    if (!a) break
    actions.push(a)
    s = applyAction(s, a)
    ply++
  }
  return { winner: s.winner, actions }
}

function run(name: string, think: number, games: number, openRandom: number) {
  const sigs = new Map<string, number>()
  const firsts = new Set<string>()
  let v = 0, h = 0, d = 0, len = 0
  for (let i = 0; i < games; i++) {
    const g = playSelf(name, think, openRandom)
    const key = sig(g.actions)
    sigs.set(key, (sigs.get(key) ?? 0) + 1)
    if (g.actions[0]) firsts.add(sig([g.actions[0]]))
    len += g.actions.length
    if (g.winner === 'V') v++
    else if (g.winner === 'H') h++
    else d++
  }
  const top = Math.max(...sigs.values())
  return {
    distinct: sigs.size,
    topLinePct: Math.round((top / games) * 100),
    distinctFirstMoves: firsts.size,
    avgLen: Math.round(len / games),
    v, h, d,
  }
}

function main() {
  const think = Number(arg('--think', '150'))
  const det = Number(arg('--det', '6'))
  const col = Number(arg('--col', '24'))
  const engines = ['neural', 'alphabeta', 'mcts']

  console.log(`think=${think}ms  determinism games=${det} (open=0)  colour games=${col} (open=3)\n`)
  console.log('ENGINE       | determinism (open=0)                 | colour balance (open=3, same engine both sides)')
  console.log('-------------|--------------------------------------|------------------------------------------------')
  for (const e of engines) {
    const dgame = run(e, think, det, 0)
    const cgame = run(e, think, col, 3)
    const vPct = Math.round((cgame.v / col) * 100)
    const hPct = Math.round((cgame.h / col) * 100)
    console.log(
      `${e.padEnd(12)} | ${`${dgame.distinct}/${det} distinct, top line ${dgame.topLinePct}%, firstMoves ${dgame.distinctFirstMoves}`.padEnd(36)} | V ${cgame.v} (${vPct}%) - H ${cgame.h} (${hPct}%)  draws ${cgame.d}`,
    )
  }
}

main()
