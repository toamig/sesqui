// Board -> network input encoding. SHARED by the offline trainer (ml/train.ts)
// and the in-app inference (azNet.ts) so they can never drift: if the planes
// here change, both sides change together.
//
// Layout: channels-last (NHWC), length 8*8*3 = 192.
//   index = (row*8 + col)*3 + channel
//   channel 0 = V stone here (1/0)
//   channel 1 = H stone here (1/0)
//   channel 2 = side to move (1 if V to move, else 0) -- constant across cells
//
// The value the net predicts is always from Vertical's perspective (1 = V wins,
// 0 = H wins), matching the MCTS convention, so search code reuses it directly.

import type { Board, Player } from '../types'

export const PLANE_LEN = 192

export function encodePlanes(board: Board, current: Player): Float32Array {
  const out = new Float32Array(PLANE_LEN)
  const vToMove = current === 'V' ? 1 : 0
  for (let i = 0; i < 64; i++) {
    const base = i * 3
    const cell = board[i]
    out[base] = cell === 'V' ? 1 : 0
    out[base + 1] = cell === 'H' ? 1 : 0
    out[base + 2] = vToMove
  }
  return out
}
