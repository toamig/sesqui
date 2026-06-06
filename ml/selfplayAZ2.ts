// Iteration-2 self-play: the teacher is now the TRAINED net itself, searched
// with PUCT (azSearch) + root Dirichlet noise for exploration. Its visit
// distributions are sharper policy targets than the rollout teacher's, and its
// games are stronger, so retraining on this data lifts the net further.
//
// Same NDJSON format as selfplayAZ.ts: { b, c, v, p:[[cell,weight],...] }
// Needs a trained src/game/ai/azNet.json (iteration 1).
//
//   npx tsx ml/selfplayAZ2.ts --games 150 --think 120 --out ml/data3/shard-0.ndjson

import { appendFileSync, mkdirSync, writeFileSync } from 'node:fs'
import { dirname } from 'node:path'
import { applyAction, createInitialState } from '../src/game/rules'
import { AZSearchAI } from '../src/game/ai/azSearch'
import type { Action, GameState } from '../src/game/types'

interface Args {
  games: number
  think: number
  out: string
  tempPlies: number
  maxActions: number
}

function parseArgs(): Args {
  const a = process.argv.slice(2)
  const get = (flag: string, def: string): string => {
    const i = a.indexOf(flag)
    return i >= 0 && i + 1 < a.length ? a[i + 1] : def
  }
  return {
    games: Number(get('--games', '150')),
    think: Number(get('--think', '120')),
    out: get('--out', 'ml/data3/shard.ndjson'),
    tempPlies: Number(get('--tempPlies', '10')),
    maxActions: Number(get('--maxActions', '400')),
  }
}

function encodeBoard(state: GameState): string {
  let s = ''
  for (let i = 0; i < 64; i++) {
    const c = state.board[i]
    s += c === 'V' ? 'V' : c === 'H' ? 'H' : '.'
  }
  return s
}

type Visit = { action: Action; visits: number }

function sampleByVisits(visits: Visit[]): Action {
  let total = 0
  for (const v of visits) total += v.visits
  let r = Math.random() * total
  for (const v of visits) {
    r -= v.visits
    if (r <= 0) return v.action
  }
  return visits[visits.length - 1].action
}

function argmaxVisits(visits: Visit[]): Action {
  let best = visits[0]
  for (const v of visits) if (v.visits > best.visits) best = v
  return best.action
}

function policyTarget(visits: Visit[]): [number, number][] {
  const byCell = new Map<number, number>()
  let total = 0
  for (const v of visits) {
    byCell.set(v.action.to, (byCell.get(v.action.to) ?? 0) + v.visits)
    total += v.visits
  }
  if (total === 0) return []
  return [...byCell.entries()].map(([cell, w]) => [cell, Math.round((w / total) * 1e4) / 1e4])
}

function main(): void {
  const args = parseArgs()
  mkdirSync(dirname(args.out), { recursive: true })
  writeFileSync(args.out, '')
  const teacher = new AZSearchAI({ timeMs: args.think, rootNoise: true })

  let totalPositions = 0
  const startedAt = Date.now()

  for (let g = 0; g < args.games; g++) {
    let state = createInitialState()
    const positions: { b: string; c: 'V' | 'H'; p: [number, number][] }[] = []
    let ply = 0

    while (state.winner === null && ply < args.maxActions) {
      const visits = teacher.searchRoot(state)
      if (visits.length === 0) break
      positions.push({ b: encodeBoard(state), c: state.current, p: policyTarget(visits) })
      const action = ply < args.tempPlies ? sampleByVisits(visits) : argmaxVisits(visits)
      state = applyAction(state, action)
      ply++
    }

    const v = state.winner === 'V' ? 1 : state.winner === 'H' ? 0 : 0.5
    const lines = positions
      .map((pos) => JSON.stringify({ b: pos.b, c: pos.c, v, p: pos.p }))
      .join('\n')
    if (lines) appendFileSync(args.out, lines + '\n')
    totalPositions += positions.length

    const secs = (Date.now() - startedAt) / 1000
    process.stdout.write(
      `\rgame ${g + 1}/${args.games}  last=${state.winner ?? 'cap'}  ` +
        `positions=${totalPositions}  ${(totalPositions / secs).toFixed(1)} pos/s   `,
    )
  }
  process.stdout.write('\n')
  console.log(`done: ${totalPositions} positions -> ${args.out}`)
}

main()
