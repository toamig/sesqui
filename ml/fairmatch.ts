// Fair-scenario simulation. Two equally-skilled players (BOTH the best in-game
// Neural model) play a series, ROTATING colours every match: P1 is White in even
// matches, Black in odd, and vice-versa for P2. Because the players are equally
// strong, their win rate should converge to ~50/50, proving that rotating colours
// cancels White's structural edge. The raw colour split is reported too, to show
// the edge is still there underneath (it just no longer favours one player).
//
//   npx tsx ml/fairmatch.ts --shards 24 --matches 20 --think 200
//
// Internal shard mode: --shard --matches M --think T
//   -> prints "RESULT p1 p2 white black draws"

import { spawn } from 'node:child_process'
import { applyAction, createInitialState } from '../src/game/rules'
import { AZSearchAI } from '../src/game/ai/azSearch'
import type { Outcome } from '../src/game/types'

function arg(flag: string, def: string): string {
  const i = process.argv.indexOf(flag)
  return i >= 0 && i + 1 < process.argv.length ? process.argv[i + 1] : def
}

/** One match. The same model plays both sides (the players are identical in
 *  skill), so the only asymmetry is colour. 'V' = Black, 'H' = White. */
function playMatch(think: number): Outcome {
  const ai = new AZSearchAI({ timeMs: think, temperature: 1, tempTurns: 2 })
  let s = createInitialState()
  let ply = 0
  while (s.winner === null && ply < 400) {
    const a = ai.chooseAction(s)
    if (!a) break
    s = applyAction(s, a)
    ply++
  }
  return s.winner
}

function shard() {
  const matches = Number(arg('--matches', '20'))
  const think = Number(arg('--think', '200'))
  let p1 = 0
  let p2 = 0
  let white = 0
  let black = 0
  let draws = 0
  for (let i = 0; i < matches; i++) {
    const w = playMatch(think)
    if (w === 'H') white++
    else if (w === 'V') black++
    else {
      draws++
      continue
    }
    // Rotate colours: P1 plays White (H) on even matches, Black (V) on odd.
    const p1IsWhite = i % 2 === 0
    const p1Won = (w === 'H') === p1IsWhite
    if (p1Won) p1++
    else p2++
  }
  process.stdout.write(`RESULT ${p1} ${p2} ${white} ${black} ${draws}\n`)
}

function runner() {
  const shards = Number(arg('--shards', '24'))
  const matches = arg('--matches', '20')
  const think = arg('--think', '200')
  let p1 = 0
  let p2 = 0
  let white = 0
  let black = 0
  let draws = 0
  let done = 0
  const started = Date.now()
  console.log(
    `Fair-scenario: 2 equal Neural players, colours rotate each match. ${shards} x ${matches} matches @ ${think}ms...`,
  )
  for (let i = 0; i < shards; i++) {
    const child = spawn(
      process.execPath,
      ['--import', 'tsx', 'ml/fairmatch.ts', '--shard', '--matches', matches, '--think', think],
      { stdio: ['ignore', 'pipe', 'inherit'] },
    )
    let buf = ''
    child.stdout.on('data', (chunk) => {
      buf += chunk.toString()
    })
    child.on('exit', () => {
      const m = buf.match(/RESULT (\d+) (\d+) (\d+) (\d+) (\d+)/)
      if (m) {
        p1 += Number(m[1])
        p2 += Number(m[2])
        white += Number(m[3])
        black += Number(m[4])
        draws += Number(m[5])
      }
      done++
      if (done === shards) {
        const n = p1 + p2 + draws
        const secs = ((Date.now() - started) / 1000).toFixed(0)
        const pct = (x: number): string => ((x / n) * 100).toFixed(1)
        const p = p1 / n
        const ci = (1.96 * Math.sqrt((p * (1 - p)) / n) * 100).toFixed(1)
        console.log(`\nN = ${n} matches in ${secs}s\n`)
        console.log('WITH COLOUR ROTATION (the fair scenario):')
        console.log(`  Player 1: ${p1}  (${pct(p1)}%)`)
        console.log(`  Player 2: ${p2}  (${pct(p2)}%)`)
        console.log(`  draws:    ${draws}`)
        console.log(`  Player 1 win-rate 95% CI: ${pct(p1)}% +/- ${ci}%  (50% inside => fair)\n`)
        console.log('Underlying colour split (the edge is still there, it just no longer favours one player):')
        console.log(`  White (H): ${white}  (${pct(white)}%)`)
        console.log(`  Black (V): ${black}  (${pct(black)}%)`)
        console.log(`\nFor contrast, with FIXED colours one player would inherit White's ${pct(white)}% rate.`)
      }
    })
  }
}

if (process.argv.includes('--shard')) shard()
else runner()
