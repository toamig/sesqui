// Parallel self-play driver. Spawns N shard processes (each runs selfplay.ts on
// one CPU core) so the dataset is generated across all cores at once, then you
// concatenate the shards.
//
//   npx tsx ml/gen.ts --shards 24 --games 150 --think 100
//
// Output: ml/data/shard-0.ndjson ... shard-(N-1).ndjson

import { spawn } from 'node:child_process'
import { mkdirSync } from 'node:fs'

function arg(flag: string, def: string): string {
  const i = process.argv.indexOf(flag)
  return i >= 0 && i + 1 < process.argv.length ? process.argv[i + 1] : def
}

const shards = Number(arg('--shards', '24'))
const games = arg('--games', '150')
const think = arg('--think', '100')
const script = arg('--script', 'ml/selfplayAZ2.ts')
const outdir = arg('--outdir', 'ml/data')

mkdirSync(outdir, { recursive: true })
const started = Date.now()
let done = 0
let failed = 0

console.log(`launching ${shards} shards x ${games} games of ${script} -> ${outdir} (think=${think}ms)...`)

for (let i = 0; i < shards; i++) {
  const out = `${outdir}/shard-${i}.ndjson`
  const child = spawn(
    process.execPath, // node
    ['--import', 'tsx', script, '--games', games, '--think', think, '--out', out],
    { stdio: ['ignore', 'ignore', 'inherit'] },
  )
  child.on('exit', (code) => {
    done++
    if (code !== 0) failed++
    const secs = ((Date.now() - started) / 1000).toFixed(0)
    console.log(`shard ${i} exit=${code} (${done}/${shards} done, ${failed} failed, ${secs}s)`)
    if (done === shards) {
      console.log(`ALL SHARDS DONE in ${((Date.now() - started) / 1000).toFixed(0)}s`)
    }
  })
}
