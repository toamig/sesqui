// Hard AI: Monte Carlo Tree Search.
//
// The tree is built over *atomic* actions (each place or queen-move), so a single
// turn (place + move) spans two tree edges and a turn boundary simply falls out of
// applyAction flipping `state.current`. UCT selects, we expand one child, run a
// heuristic-biased playout to a terminal or a depth cap, then back up the result.
//
// Rewards are tracked in a fixed Vertical-perspective score in [0, 1] (1 = V wins,
// 0 = H wins, 0.5 = even). Each node converts that to its own mover's perspective
// during back-propagation, which keeps the multi-action-per-turn bookkeeping simple.

import { applyAction, getLegalActions, otherPlayer } from '../rules'
import type { Action, GameState, Player } from '../types'
import { Difficulty, type AIPlayer } from './ai'
import { connectionDistance } from './heuristicAI'

interface MctsOptions {
  timeMs?: number
  explore?: number
  rolloutCap?: number
  /** Max children kept per node; the rest are pruned by a quick distance eval. */
  maxChildren?: number
  /** Difficulty label to report (defaults to Hard). */
  difficulty?: Difficulty
  /** Optional learned leaf evaluator. When provided, a leaf's value comes from
   *  this function (a Vertical-perspective win probability in [0,1]) instead of a
   *  random playout. This turns the search into value-network-guided MCTS
   *  (AlphaZero-style): same tree, but a trained net replaces the rollout. */
  valueFn?: (state: GameState) => number
  /** Early-game move-sampling temperature (0 = always the most-visited move).
   *  When positive, the first `tempTurns` turns sample among root moves by visit
   *  count so games vary instead of repeating the same line. */
  temperature?: number
  tempTurns?: number
}

/** Pick a root child in proportion to visits^(1/temperature) (variety early). */
function sampleNodeByVisits(nodes: Node[], temperature: number): Node {
  let total = 0
  const weights = nodes.map((n) => {
    const w = n.visits > 0 ? Math.pow(n.visits, 1 / temperature) : 0
    total += w
    return w
  })
  if (total <= 0) {
    let best = nodes[0]
    for (const n of nodes) if (n.visits > best.visits) best = n
    return best
  }
  let r = Math.random() * total
  for (let i = 0; i < nodes.length; i++) {
    r -= weights[i]
    if (r <= 0) return nodes[i]
  }
  return nodes[nodes.length - 1]
}

/** Mover-perspective score of a state: shorter own distance and longer opponent
 *  distance is better. Used only to rank candidate actions for tree expansion. */
function actionScore(state: GameState, mover: Player): number {
  const myDist = connectionDistance(state.board, mover)
  const oppDist = connectionDistance(state.board, otherPlayer(mover))
  return oppDist - myDist
}

interface Node {
  state: GameState
  /** Player who moved to reach this node (= parent's mover). Root: its own mover. */
  player: Player
  action: Action | null
  parent: Node | null
  children: Node[]
  /** Legal actions not yet expanded into children (shuffled). */
  untried: Action[]
  visits: number
  /** Total reward from this node's `player` perspective. */
  reward: number
}

function shuffle<T>(arr: T[]): T[] {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[arr[i], arr[j]] = [arr[j], arr[i]]
  }
  return arr
}

/** Legal actions to consider at a node, capped to the `maxChildren` most promising
 *  (plus two random wildcards so nothing is permanently excluded). */
function candidates(state: GameState, maxChildren: number): Action[] {
  const legal = getLegalActions(state)
  if (legal.length <= maxChildren) return shuffle(legal)

  const mover = state.current
  const scored = legal.map((a) => {
    const next = applyAction(state, a)
    const s = next.winner === mover ? Infinity : actionScore(next, mover)
    return { a, s }
  })
  scored.sort((x, y) => y.s - x.s)

  const wildcards = Math.min(2, maxChildren - 1)
  const top = scored.slice(0, maxChildren - wildcards).map((x) => x.a)
  const rest = shuffle(scored.slice(maxChildren - wildcards).map((x) => x.a))
  return shuffle(top.concat(rest.slice(0, wildcards)))
}

function makeNode(
  state: GameState,
  player: Player,
  action: Action | null,
  parent: Node | null,
  maxChildren: number,
): Node {
  const untried = state.winner === null ? candidates(state, maxChildren) : []
  return { state, player, action, parent, children: [], untried, visits: 0, reward: 0 }
}

/** Vertical-perspective value of a board for cut-off (non-terminal) playouts. */
function heuristicVScore(state: GameState): number {
  const dV = connectionDistance(state.board, 'V')
  const dH = connectionDistance(state.board, 'H')
  // Logistic on the distance gap: V closer (dH > dV) pushes the score above 0.5.
  return 1 / (1 + Math.exp(-(dH - dV) / 2))
}

/** Terminal outcome as a Vertical-perspective score, or null if not terminal. */
function terminalVScore(state: GameState): number | null {
  if (state.winner === null) return null
  if (state.winner === 'draw') return 0.5
  return state.winner === 'V' ? 1 : 0
}

export class MctsAI implements AIPlayer {
  readonly difficulty: Difficulty
  readonly timeMs: number
  private readonly explore: number
  private readonly rolloutCap: number
  private readonly maxChildren: number
  private readonly valueFn?: (state: GameState) => number
  private readonly temperature: number
  private readonly tempTurns: number

  constructor(options: MctsOptions = {}) {
    this.difficulty = options.difficulty ?? Difficulty.Hard
    this.timeMs = options.timeMs ?? 1500
    this.explore = options.explore ?? Math.SQRT2
    this.rolloutCap = options.rolloutCap ?? 30
    this.maxChildren = options.maxChildren ?? 12
    this.valueFn = options.valueFn
    this.temperature = options.temperature ?? 0
    this.tempTurns = options.tempTurns ?? 0
  }

  chooseAction(state: GameState): Action | null {
    const actions = state.winner === null ? getLegalActions(state) : []
    if (actions.length === 0) return null
    if (actions.length === 1) return actions[0]

    // Take an immediate win without burning the whole time budget.
    const me = state.current
    for (const action of actions) {
      if (applyAction(state, action).winner === me) return action
    }

    const root = makeNode(state, state.current, null, null, this.maxChildren)
    const deadline =
      (typeof performance !== 'undefined' ? performance.now() : Date.now()) + this.timeMs
    const now = (): number =>
      typeof performance !== 'undefined' ? performance.now() : Date.now()

    while (now() < deadline) {
      const leaf = this.select(root)
      const vScore = this.rollout(leaf.state)
      this.backup(leaf, vScore)
    }

    // Early-game temperature: sample among root moves by visit count for variety;
    // later turns take the most-visited (strongest) move.
    if (root.children.length > 0 && this.temperature > 0 && state.turn <= this.tempTurns) {
      return sampleNodeByVisits(root.children, this.temperature).action ?? actions[0]
    }
    // Robust child: most-visited action from the root.
    let best = root.children[0]
    for (const child of root.children) {
      if (child.visits > best.visits) best = child
    }
    return best ? best.action : actions[0]
  }

  /** Run the search and return each root action with its visit count. This is the
   *  raw material for AlphaZero-style policy targets: the visit distribution is a
   *  stronger, search-sharpened policy than the move actually played. Returns an
   *  empty array at a terminal node, or a single entry when only one move exists. */
  searchRoot(state: GameState): { action: Action; visits: number }[] {
    const actions = state.winner === null ? getLegalActions(state) : []
    if (actions.length === 0) return []
    if (actions.length === 1) return [{ action: actions[0], visits: 1 }]

    const root = makeNode(state, state.current, null, null, this.maxChildren)
    const now = (): number =>
      typeof performance !== 'undefined' ? performance.now() : Date.now()
    const deadline = now() + this.timeMs
    while (now() < deadline) {
      const leaf = this.select(root)
      const vScore = this.rollout(leaf.state)
      this.backup(leaf, vScore)
    }
    return root.children.map((c) => ({ action: c.action as Action, visits: c.visits }))
  }

  /** Descend by UCT, expanding the first node that still has an untried action. */
  private select(root: Node): Node {
    let node = root
    while (node.state.winner === null) {
      if (node.untried.length > 0) return this.expand(node)
      if (node.children.length === 0) return node // no legal continuation
      node = this.bestUctChild(node)
    }
    return node
  }

  private expand(node: Node): Node {
    const action = node.untried.pop() as Action
    const childState = applyAction(node.state, action)
    const child = makeNode(childState, node.state.current, action, node, this.maxChildren)
    node.children.push(child)
    return child
  }

  private bestUctChild(node: Node): Node {
    const logN = Math.log(node.visits)
    let best = node.children[0]
    let bestVal = -Infinity
    for (const child of node.children) {
      const exploit = child.reward / child.visits
      const value = exploit + this.explore * Math.sqrt(logN / child.visits)
      if (value > bestVal) {
        bestVal = value
        best = child
      }
    }
    return best
  }

  /** Heuristic-biased playout returning a Vertical-perspective score in [0, 1].
   *  With a learned valueFn, the playout is skipped entirely: the leaf's value is
   *  the net's evaluation (or the exact result if the leaf is terminal). */
  private rollout(start: GameState): number {
    if (this.valueFn) {
      const terminal = terminalVScore(start)
      return terminal !== null ? terminal : this.valueFn(start)
    }
    let state = start
    for (let ply = 0; ply < this.rolloutCap; ply++) {
      const terminal = terminalVScore(state)
      if (terminal !== null) return terminal
      const actions = getLegalActions(state)
      if (actions.length === 0) break
      state = applyAction(state, this.rolloutAction(state, actions))
    }
    const terminal = terminalVScore(state)
    return terminal !== null ? terminal : heuristicVScore(state)
  }

  /** Light playout policy: grab an instant win, else greedily shorten the mover's
   *  own connection distance over a small random sample, else play randomly. */
  private rolloutAction(state: GameState, actions: Action[]): Action {
    const me = state.current
    const sampleSize = Math.min(3, actions.length)
    let bestAction = actions[Math.floor(Math.random() * actions.length)]
    let bestDist = Infinity
    for (let s = 0; s < sampleSize; s++) {
      const action = actions[Math.floor(Math.random() * actions.length)]
      const next = applyAction(state, action)
      if (next.winner === me) return action
      const dist = connectionDistance(next.board, me)
      if (dist < bestDist) {
        bestDist = dist
        bestAction = action
      }
    }
    // Inject noise so playouts stay varied rather than deterministically greedy.
    if (Math.random() < 0.2) return actions[Math.floor(Math.random() * actions.length)]
    return bestAction
  }

  private backup(leaf: Node, vScore: number): void {
    let node: Node | null = leaf
    while (node !== null) {
      node.visits += 1
      node.reward += node.player === 'V' ? vScore : 1 - vScore
      node = node.parent
    }
  }
}
