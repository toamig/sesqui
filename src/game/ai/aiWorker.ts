// Web Worker that runs the AI search off the main thread, so a long MCTS think
// (up to ~1.5s on Hard) never freezes the board UI.
//
// The protocol is one request -> one response, correlated by `id` so the UI can
// discard stale replies after a reset, undo, or settings change.

import type { Action, GameState } from '../types'
import { createAI, type Difficulty } from './index'

interface AiRequest {
  id: number
  difficulty: Difficulty
  state: GameState
}

interface AiResponse {
  id: number
  action: Action | null
}

// Cast the worker global to `Worker` so this file typechecks under the DOM lib
// without pulling in the WebWorker lib (which would clash on `self`/`postMessage`).
const ctx = self as unknown as Worker

ctx.onmessage = (event: MessageEvent<AiRequest>) => {
  const { id, difficulty, state } = event.data
  const action = createAI(difficulty).chooseAction(state)
  const response: AiResponse = { id, action }
  ctx.postMessage(response)
}
