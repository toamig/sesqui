// Did temperature cost any strength? Head-to-head with the SAME shipped net:
//   A = Neural WITH temperature (new in-game config: temp=1, tempTurns=6)
//   B = Neural argmax            (temperature off, the old always-best behaviour)
// Equal time, colours alternated. A near 50% => sampling the opening did not
// meaningfully weaken play. A well below 50% => temperature is too loose.
//
//   npx tsx ml/strengthcheck.ts --shards 24 --games 10 --think 150
//
// Internal shard mode: --shard --games G --think T  ->  prints "RESULT a b d".

import { spawn } from 'node:child_process'
import { applyAction, createInitialState } from '../src/game/rules'
import { AZSearchAI } from '../src/game/ai/azSearch'
import type { Outcome } from '../src/game/types'

function arg(flag: string, def: string): string {
  const i = process.argv.indexOf(flag)
  return i >= 0 && i + 1 < process.argv.length ? process.argv[i + 1] : def
}

function playGame(aiV: AZSearchAI, aiH: AZSearchAI): Outcome {
  let s = createInitialState()
  let ply = 0
  while (s.winner === null && ply < 400) {
    const ai = s.current === 'V' ? aiV : aiH
    const a = ai.chooseAction(s)
    if (!a) break
    s = applyAction(s, a)
    ply++
  }
  return s.winner
}

function shard() {
  const games = Number(arg('--games', '10'))
  const think = Number(arg('--think', '150'))
  let a = 0
  let b = 0
  let d = 0
  for (let i = 0; i < games; i++) {
    const temp = new AZSearchAI({ timeMs: think, temperature: 1, tempTurns: 2 })
    const plain = new AZSearchAI({ timeMs: think, temperature: 0, tempTurns: 0 })
    const aIsV = i % 2 === 0
    const winner = aIsV ? playGame(temp, plain) : playGame(plain, temp)
    if (winner === 'draw' || winner === null) d++
    else if ((winner === 'V') === aIsV) a++
    else b++
  }
  process.stdout.write(`RESULT ${a} ${b} ${d}\n`)
}

function runner() {
  const shards = Number(arg('--shards', '24'))
  const games = arg('--games', '10')
  const think = arg('--think', '150')
  let a = 0
  let b = 0
  let d = 0
  let done = 0
  const started = Date.now()
  console.log(`Strength: temp-Neural (A) vs argmax-Neural (B): ${shards}x${games} games @ ${think}ms...`)
  for (let i = 0; i < shards; i++) {
    const child = spawn(
      process.execPath,
      ['--import', 'tsx', 'ml/strengthcheck.ts', '--shard', '--games', games, '--think', think],
      { stdio: ['ignore', 'pipe', 'inherit'] },
    )
    let buf = ''
    child.stdout.on('data', (chunk) => {
      buf += chunk.toString()
    })
    child.on('exit', () => {
      const m = buf.match(/RESULT (\d+) (\d+) (\d+)/)
      if (m) {
        a += Number(m[1])
        b += Number(m[2])
        d += Number(m[3])
      }
      done++
      if (done === shards) {
        const n = a + b + d
        const secs = ((Date.now() - started) / 1000).toFixed(0)
        const ap = ((a / n) * 100).toFixed(1)
        const bp = ((b / n) * 100).toFixed(1)
        const p = a / n
        const ci = (1.96 * Math.sqrt((p * (1 - p)) / n) * 100).toFixed(1)
        console.log(`\nN = ${n} games in ${secs}s`)
        console.log(`A temp-Neural:   ${a}  (${ap}%)`)
        console.log(`B argmax-Neural: ${b}  (${bp}%)`)
        console.log(`draws:           ${d}`)
        console.log(`temp-Neural win-rate 95% CI: ${ap}% +/- ${ci}%  (>=~45% => strength preserved)`)
      }
    })
  }
}

if (process.argv.includes('--shard')) shard()
else runner()
