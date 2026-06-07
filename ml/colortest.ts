// Large Neural self-play colour-balance test: does Black (V) or White (H) win
// more in Neural-vs-Neural, or is it ~50/50? Runs the in-game Neural config
// (temperature on, so openings vary) across parallel shards for a big sample.
//
//   npx tsx ml/colortest.ts --shards 24 --games 16 --think 200
//
// Internal shard mode: --shard --games G --think T  ->  prints "RESULT v h d".

import { spawn } from 'node:child_process'
import { applyAction, createInitialState, getLegalActions } from '../src/game/rules'
import { AZSearchAI } from '../src/game/ai/azSearch'
import type { Outcome } from '../src/game/types'

function arg(flag: string, def: string): string {
  const i = process.argv.indexOf(flag)
  return i >= 0 && i + 1 < process.argv.length ? process.argv[i + 1] : def
}

// --notemp: argmax play (temperature off) seeded with `--open` random opening
// plies for variety, to measure the structural (rules) bias on its own.
const NOTEMP = process.argv.includes('--notemp')

function playSelf(think: number, openRandom: number): Outcome {
  const ai = NOTEMP
    ? new AZSearchAI({ timeMs: think })
    : new AZSearchAI({ timeMs: think, temperature: 1, tempTurns: 6 })
  let s = createInitialState()
  let ply = 0
  while (s.winner === null && ply < 400) {
    let a
    if (ply < openRandom) {
      const legal = getLegalActions(s)
      a = legal[Math.floor(Math.random() * legal.length)]
    } else {
      a = ai.chooseAction(s)
    }
    if (!a) break
    s = applyAction(s, a)
    ply++
  }
  return s.winner
}

function shard() {
  const games = Number(arg('--games', '16'))
  const think = Number(arg('--think', '200'))
  const open = Number(arg('--open', '0'))
  let v = 0
  let h = 0
  let d = 0
  for (let i = 0; i < games; i++) {
    const w = playSelf(think, open)
    if (w === 'V') v++
    else if (w === 'H') h++
    else d++
  }
  process.stdout.write(`RESULT ${v} ${h} ${d}\n`)
}

function runner() {
  const shards = Number(arg('--shards', '24'))
  const games = arg('--games', '16')
  const think = arg('--think', '200')
  const open = arg('--open', '0')
  let v = 0
  let h = 0
  let d = 0
  let done = 0
  const started = Date.now()
  const mode = NOTEMP ? `argmax, open=${open}` : 'temperature on'
  console.log(`Neural self-play colour test (${mode}): ${shards} shards x ${games} games (think=${think}ms)...`)
  const shardArgs = ['--import', 'tsx', 'ml/colortest.ts', '--shard', '--games', games, '--think', think, '--open', open]
  if (NOTEMP) shardArgs.push('--notemp')
  for (let i = 0; i < shards; i++) {
    const child = spawn(process.execPath, shardArgs, { stdio: ['ignore', 'pipe', 'inherit'] })
    let buf = ''
    child.stdout.on('data', (chunk) => {
      buf += chunk.toString()
    })
    child.on('exit', () => {
      const m = buf.match(/RESULT (\d+) (\d+) (\d+)/)
      if (m) {
        v += Number(m[1])
        h += Number(m[2])
        d += Number(m[3])
      }
      done++
      if (done === shards) {
        const n = v + h + d
        const secs = ((Date.now() - started) / 1000).toFixed(0)
        const vp = ((v / n) * 100).toFixed(1)
        const hp = ((h / n) * 100).toFixed(1)
        const p = v / n
        const ci = (1.96 * Math.sqrt((p * (1 - p)) / n) * 100).toFixed(1)
        console.log(`\nN = ${n} games in ${secs}s`)
        console.log(`V (Black): ${v}  (${vp}%)`)
        console.log(`H (White): ${h}  (${hp}%)`)
        console.log(`draws:     ${d}`)
        console.log(`Black win-rate 95% CI: ${vp}% +/- ${ci}%  (50% inside => not significant)`)
      }
    })
  }
}

if (process.argv.includes('--shard')) shard()
else runner()
