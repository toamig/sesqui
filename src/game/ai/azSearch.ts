// AlphaZero-lite search: PUCT MCTS guided by the network (azNet). Each simulation
// descends by PUCT (prior-weighted UCB), expands ONE leaf by evaluating the net
// once (value + policy priors), and backs the value up. No random rollouts. The
// net's policy steers WHICH moves are searched; its value scores the leaves.
//
// All values are kept Vertical-perspective in [0,1]; the perspective is flipped
// per node by who is to move, so a single sign convention runs the whole tree.

import { applyAction, getLegalActions } from '../rules'
import type { Action, GameState } from '../types'
import { Difficulty, type AIPlayer } from './ai'
import { azEvaluate, type Evaluator } from './azNet'

interface Child {
  action: Action
  prior: number
  n: number
  w: number // sum of Vertical-perspective leaf values
  node: AZNode | null
}

interface AZNode {
  state: GameState
  children: Child[] | null // null until expanded
  terminalV: number // Vertical-perspective value if terminal (else unused)
  isTerminal: boolean
}

const C_PUCT = 1.5

/** Standard normal via Box-Muller (for the Gamma sampler). */
function gaussian(): number {
  let u = 0
  let v = 0
  while (u === 0) u = Math.random()
  while (v === 0) v = Math.random()
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v)
}

/** Gamma(alpha, 1) via Marsaglia-Tsang (with the alpha<1 boost). */
function sampleGamma(alpha: number): number {
  if (alpha < 1) return sampleGamma(1 + alpha) * Math.pow(Math.random(), 1 / alpha)
  const d = alpha - 1 / 3
  const c = 1 / Math.sqrt(9 * d)
  for (;;) {
    let x: number
    let v: number
    do {
      x = gaussian()
      v = 1 + c * x
    } while (v <= 0)
    v = v * v * v
    const u = Math.random()
    if (u < 1 - 0.0331 * x * x * x * x) return d * v
    if (Math.log(u) < 0.5 * x * x + d * (1 - v + Math.log(v))) return d * v
  }
}

/** Symmetric Dirichlet(alpha) sample of length n (for root exploration noise). */
function dirichlet(n: number, alpha: number): number[] {
  const g = new Array<number>(n)
  let sum = 0
  for (let i = 0; i < n; i++) {
    g[i] = sampleGamma(alpha)
    sum += g[i]
  }
  for (let i = 0; i < n; i++) g[i] /= sum || 1
  return g
}

function terminalV(state: GameState): number {
  if (state.winner === 'V') return 1
  if (state.winner === 'H') return 0
  return 0.5
}

function newNode(state: GameState): AZNode {
  return { state, children: null, terminalV: 0, isTerminal: state.winner !== null }
}

/** Expand a leaf: evaluate the net, build children with softmax priors over the
 *  legal actions' destination cells. Returns the leaf's Vertical-perspective
 *  value (terminal result, or the net's value). */
function expand(node: AZNode, evaluate: Evaluator): number {
  if (node.isTerminal) {
    node.children = []
    node.terminalV = terminalV(node.state)
    return node.terminalV
  }
  const { value, policy } = evaluate(node.state.board, node.state.current)
  const legal = getLegalActions(node.state)
  // Softmax of the policy logits restricted to legal destination cells.
  let max = -Infinity
  for (const a of legal) if (policy[a.to] > max) max = policy[a.to]
  let sum = 0
  const exps = legal.map((a) => {
    const e = Math.exp(policy[a.to] - max)
    sum += e
    return e
  })
  node.children = legal.map((a, i) => ({
    action: a,
    prior: exps[i] / sum,
    n: 0,
    w: 0,
    node: null,
  }))
  return value
}

function selectChild(node: AZNode): Child {
  const children = node.children as Child[]
  const vToMove = node.state.current === 'V'
  let parentN = 0
  for (const c of children) parentN += c.n
  const sqrtParent = Math.sqrt(parentN + 1e-8)
  let best = children[0]
  let bestScore = -Infinity
  for (const c of children) {
    // First-play-urgency: unvisited children take a neutral 0.5 (symmetric).
    const q = c.n > 0 ? c.w / c.n : 0.5
    const qEff = vToMove ? q : 1 - q
    const u = (C_PUCT * c.prior * sqrtParent) / (1 + c.n)
    const score = qEff + u
    if (score > bestScore) {
      bestScore = score
      best = c
    }
  }
  return best
}

function simulate(root: AZNode, evaluate: Evaluator): void {
  const path: Child[] = []
  let node = root
  for (;;) {
    if (node.children === null) {
      const v = expand(node, evaluate)
      for (const c of path) {
        c.n += 1
        c.w += v
      }
      return
    }
    if (node.children.length === 0) {
      for (const c of path) {
        c.n += 1
        c.w += node.terminalV
      }
      return
    }
    const child = selectChild(node)
    path.push(child)
    if (child.node === null) child.node = newNode(applyAction(node.state, child.action))
    node = child.node
  }
}

/** Pick a child in proportion to visit_count^(1/temperature). Higher temperature
 *  flattens toward uniform; as temperature -> 0 it approaches argmax. */
function sampleByVisits(children: Child[], temperature: number): Child {
  let total = 0
  const weights = children.map((c) => {
    const w = c.n > 0 ? Math.pow(c.n, 1 / temperature) : 0
    total += w
    return w
  })
  if (total <= 0) {
    let best = children[0]
    for (const c of children) if (c.n > best.n) best = c
    return best
  }
  let r = Math.random() * total
  for (let i = 0; i < children.length; i++) {
    r -= weights[i]
    if (r <= 0) return children[i]
  }
  return children[children.length - 1]
}

export interface AZOptions {
  timeMs?: number
  difficulty?: Difficulty
  /** Mix Dirichlet noise into the root priors (self-play exploration only). */
  rootNoise?: boolean
  noiseEps?: number
  noiseAlpha?: number
  /** Early-game move-sampling temperature (0 = always play the top move). With a
   *  positive value, the first `tempTurns` turns sample among moves by visit
   *  count, so openings and early lines vary instead of being identical. */
  temperature?: number
  tempTurns?: number
  /** Override the network weights (defaults to the bundled net). Used by tools to
   *  pit two model versions against each other. */
  evaluate?: Evaluator
}

/** AlphaZero-lite player: PUCT MCTS over the trained net, time-budgeted. */
export class AZSearchAI implements AIPlayer {
  readonly difficulty: Difficulty
  private readonly timeMs: number
  private readonly rootNoise: boolean
  private readonly noiseEps: number
  private readonly noiseAlpha: number
  private readonly temperature: number
  private readonly tempTurns: number
  private readonly evaluate: Evaluator

  constructor(opts: AZOptions = {}) {
    this.timeMs = opts.timeMs ?? 1200
    this.difficulty = opts.difficulty ?? Difficulty.Expert
    this.rootNoise = opts.rootNoise ?? false
    this.noiseEps = opts.noiseEps ?? 0.25
    this.noiseAlpha = opts.noiseAlpha ?? 0.3
    this.temperature = opts.temperature ?? 0
    this.tempTurns = opts.tempTurns ?? 0
    this.evaluate = opts.evaluate ?? azEvaluate
  }

  /** Build the root, expand it (optionally with exploration noise), and run the
   *  time-budgeted PUCT simulations. Shared by play and self-play. */
  private run(state: GameState): AZNode {
    const root = newNode(state)
    expand(root, this.evaluate)
    const children = root.children as Child[]
    if (this.rootNoise && children.length > 1) {
      const noise = dirichlet(children.length, this.noiseAlpha)
      for (let i = 0; i < children.length; i++) {
        children[i].prior = (1 - this.noiseEps) * children[i].prior + this.noiseEps * noise[i]
      }
    }
    const now = (): number =>
      typeof performance !== 'undefined' ? performance.now() : Date.now()
    const deadline = now() + this.timeMs
    let sims = 0
    while (now() < deadline) {
      simulate(root, this.evaluate)
      sims++
      if ((sims & 63) === 0 && now() >= deadline) break
    }
    return root
  }

  chooseAction(state: GameState): Action | null {
    const actions = state.winner === null ? getLegalActions(state) : []
    if (actions.length === 0) return null
    if (actions.length === 1) return actions[0]

    // Take an immediate win outright.
    const me = state.current
    for (const a of actions) if (applyAction(state, a).winner === me) return a

    const root = this.run(state)
    const children = root.children as Child[]
    // Early-game temperature: sample among moves by visit count so openings and
    // early lines vary. Later turns play the most-visited (strongest) move.
    if (this.temperature > 0 && state.turn <= this.tempTurns) {
      return sampleByVisits(children, this.temperature).action
    }
    let best = children[0]
    for (const c of children) if (c.n > best.n) best = c
    return best.action
  }

  /** Root action visit counts after search: the policy target for self-play. */
  searchRoot(state: GameState): { action: Action; visits: number }[] {
    const actions = state.winner === null ? getLegalActions(state) : []
    if (actions.length === 0) return []
    if (actions.length === 1) return [{ action: actions[0], visits: 1 }]
    const root = this.run(state)
    return (root.children as Child[]).map((c) => ({ action: c.action, visits: c.n }))
  }
}

export function createAZAI(timeMs = 1200): AIPlayer {
  // Vary the opening / early game so matches aren't identical; still argmax later.
  return new AZSearchAI({ timeMs, temperature: 1, tempTurns: 6 })
}
