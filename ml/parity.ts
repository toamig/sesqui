// Sanity: the shipped quantized evaluator vs the float iter-4 model on real
// positions. Confirms int8 dequant matches the float net closely.

import { readFileSync } from 'node:fs'
import { azEvaluate, createEvaluator } from '../src/game/ai/azNet'
import { applyAction, createInitialState, getLegalActions } from '../src/game/rules'

const flo = createEvaluator(JSON.parse(readFileSync('ml/models/azNet-iter4.json', 'utf8')).layers)

let maxV = 0
let maxP = 0
let n = 0
for (let g = 0; g < 10; g++) {
  let s = createInitialState()
  for (let k = 0; k < 10 && s.winner === null; k++) {
    const acts = getLegalActions(s)
    s = applyAction(s, acts[Math.floor(Math.random() * acts.length)])
    const q = azEvaluate(s.board, s.current)
    const f = flo(s.board, s.current)
    maxV = Math.max(maxV, Math.abs(q.value - f.value))
    for (let i = 0; i < 64; i++) maxP = Math.max(maxP, Math.abs(q.policy[i] - f.policy[i]))
    n++
  }
}
console.log(`positions=${n}  max |value diff|=${maxV.toFixed(5)}  max |policy logit diff|=${maxP.toFixed(4)}`)
