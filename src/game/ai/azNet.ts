// AlphaZero-lite network inference: a shared conv trunk with a value head (win
// probability) and a policy head (64 logits, one per destination cell). Pure-TS
// forward pass, so the app ships the learned player with NO ML runtime, just a
// weights file and a few matmuls.
//
// Architecture (must match ml/trainAZ.py): conv24(3x3,same,relu) ->
// conv24(3x3,same,relu) -> flatten(NHWC) -> trunk dense64(relu) ->
// { value dense1(sigmoid), policy dense64(logits) }.

import type { Board, Player } from '../types'
import { encodePlanes } from './valueEncode'
import quant from './azNetQuant.json'

export interface LayerW {
  w: ArrayLike<number>
  b: ArrayLike<number>
}
export interface AZLayers {
  conv1: LayerW
  conv2: LayerW
  trunk: LayerW
  value: LayerW
  policy: LayerW
}

const SIDE = 8

function convReluSame(inp: Float32Array, inC: number, layer: LayerW, outC: number): Float32Array {
  const w = layer.w
  const b = layer.b
  const out = new Float32Array(SIDE * SIDE * outC)
  for (let r = 0; r < SIDE; r++) {
    for (let c = 0; c < SIDE; c++) {
      const outBase = (r * SIDE + c) * outC
      for (let oc = 0; oc < outC; oc++) out[outBase + oc] = b[oc]
      for (let kh = 0; kh < 3; kh++) {
        const rr = r + kh - 1
        if (rr < 0 || rr >= SIDE) continue
        for (let kw = 0; kw < 3; kw++) {
          const cc = c + kw - 1
          if (cc < 0 || cc >= SIDE) continue
          const inBase = (rr * SIDE + cc) * inC
          const kBase = (kh * 3 + kw) * inC * outC
          for (let ic = 0; ic < inC; ic++) {
            const v = inp[inBase + ic]
            if (v === 0) continue
            const wRow = kBase + ic * outC
            for (let oc = 0; oc < outC; oc++) out[outBase + oc] += v * w[wRow + oc]
          }
        }
      }
      for (let oc = 0; oc < outC; oc++) if (out[outBase + oc] < 0) out[outBase + oc] = 0
    }
  }
  return out
}

function dense(inp: Float32Array, inN: number, layer: LayerW, outN: number, relu: boolean): Float32Array {
  const w = layer.w
  const b = layer.b
  const out = new Float32Array(outN)
  for (let o = 0; o < outN; o++) out[o] = b[o]
  for (let i = 0; i < inN; i++) {
    const v = inp[i]
    if (v === 0) continue
    const row = i * outN
    for (let o = 0; o < outN; o++) out[o] += v * w[row + o]
  }
  if (relu) for (let o = 0; o < outN; o++) if (out[o] < 0) out[o] = 0
  return out
}

export interface AZEval {
  /** Vertical-perspective win probability in [0,1]. */
  value: number
  /** Raw logits over the 64 destination cells (softmax applied by the caller
   *  over the legal action set). */
  policy: Float32Array
}

export type Evaluator = (board: Board, current: Player) => AZEval

/** Bind a forward pass to a specific set of weights. The app uses the default
 *  (bundled) evaluator; tools can build one per weight file to compare models. */
export function createEvaluator(layers: AZLayers): Evaluator {
  return (board: Board, current: Player): AZEval => {
    const planes = encodePlanes(board, current)
    const h1 = convReluSame(planes, 3, layers.conv1, 24)
    const h2 = convReluSame(h1, 24, layers.conv2, 24)
    const trunk = dense(h2, SIDE * SIDE * 24, layers.trunk, 64, true)
    const value = 1 / (1 + Math.exp(-dense(trunk, 64, layers.value, 1, false)[0]))
    const policy = dense(trunk, 64, layers.policy, 64, false)
    return { value, policy }
  }
}

/** One int8-quantized layer: base64 weights + scale, float biases. */
interface QuantLayer {
  ws: number
  wq: string
  b: number[]
}

/** Dequantize a layer's int8 weights back to Float32 (done once, at load). */
function dequant(layer: QuantLayer): LayerW {
  const bytes = Uint8Array.from(atob(layer.wq), (c) => c.charCodeAt(0))
  const i8 = new Int8Array(bytes.buffer)
  const w = new Float32Array(i8.length)
  for (let i = 0; i < i8.length; i++) w[i] = i8[i] * layer.ws
  return { w, b: layer.b }
}

const Q = quant as unknown as { layers: Record<string, QuantLayer> }
const bundledLayers: AZLayers = {
  conv1: dequant(Q.layers.conv1),
  conv2: dequant(Q.layers.conv2),
  trunk: dequant(Q.layers.trunk),
  value: dequant(Q.layers.value),
  policy: dequant(Q.layers.policy),
}

/** Default evaluator using the bundled (shipped) int8 weights. */
export const azEvaluate: Evaluator = createEvaluator(bundledLayers)
