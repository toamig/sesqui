// Pre-game "choose your opponent" sub-menu for vs-Computer. Picks the engine
// (difficulty-style, with a strength meter) and which side you play, and makes
// clear up front which games are recorded as replays (only the Neural net).
// Selecting here keeps the in-game UI clean (no dropdowns mid-match).

import { useState } from 'react'
import type { CSSProperties } from 'react'
import { Difficulty } from '../game/ai/ai'
import type { Player } from '../game/types'
import './EngineSelect.css'

interface EngineSelectProps {
  initialEngine: Difficulty
  initialSide: Player
  onStart: (engine: Difficulty, side: Player) => void
  onBack: () => void
}

interface EngineInfo {
  id: Difficulty
  name: string
  blurb: string
  strength: number // 1..5, drives the meter
  recorded?: boolean
}

// Ordered as a difficulty ladder (gentlest first).
const ENGINES: EngineInfo[] = [
  { id: Difficulty.Easy, name: 'Random', blurb: 'Plays any legal move. A gentle warm-up.', strength: 1 },
  { id: Difficulty.Medium, name: 'Heuristic', blurb: 'Races for the shortest connection. Fast and tactical.', strength: 2 },
  { id: Difficulty.Expert, name: 'Monte Carlo', blurb: 'Simulates thousands of games per move.', strength: 3 },
  { id: Difficulty.Hard, name: 'Alpha-Beta', blurb: 'Classic deep game-tree search.', strength: 4 },
  {
    id: Difficulty.Neural,
    name: 'Neural',
    blurb: 'A self-trained AlphaZero net. The strongest opponent.',
    strength: 5,
    recorded: true,
  },
]

function StrengthMeter({ level }: { level: number }) {
  return (
    <span className="engine-meter" aria-label={`Strength ${level} of 5`}>
      {[1, 2, 3, 4, 5].map((n) => (
        <span key={n} className={`meter-bar ${n <= level ? 'is-on' : ''}`} />
      ))}
    </span>
  )
}

export function EngineSelect({ initialEngine, initialSide, onStart, onBack }: EngineSelectProps) {
  const [engine, setEngine] = useState<Difficulty>(initialEngine)
  const [side, setSide] = useState<Player>(initialSide)
  const recorded = ENGINES.find((e) => e.id === engine)?.recorded ?? false

  return (
    <main className="engine-select">
      <div className="screen-topbar">
        <button type="button" className="icon-back" onClick={onBack} aria-label="Back to menu">
          <span aria-hidden>←</span> Menu
        </button>
        <span className="screen-title">vs Computer</span>
        <span className="topbar-spacer" aria-hidden />
      </div>

      <header className="game-header">
        <h1>Choose your opponent</h1>
        <p className="subtitle">Pick an engine to face. Stronger engines play sharper.</p>
      </header>

      <div className="engine-list" role="radiogroup" aria-label="Opponent engine">
        {ENGINES.map((e, i) => {
          const selected = e.id === engine
          return (
            <button
              key={e.id}
              type="button"
              role="radio"
              aria-checked={selected}
              className={`engine-card ${selected ? 'is-selected' : ''}`}
              style={{ '--i': i } as CSSProperties}
              onClick={() => setEngine(e.id)}
            >
              <StrengthMeter level={e.strength} />
              <span className="engine-text">
                <span className="engine-name">
                  {e.name}
                  {e.recorded && <span className="engine-rec">REC</span>}
                </span>
                <span className="engine-blurb">{e.blurb}</span>
              </span>
              <span className="engine-radio" aria-hidden />
            </button>
          )
        })}
      </div>

      <div className="engine-side">
        <span className="engine-side-label">You play</span>
        <div className="side-toggle" role="radiogroup" aria-label="Your side">
          <button
            type="button"
            role="radio"
            aria-checked={side === 'V'}
            className={`side-opt ${side === 'V' ? 'is-on' : ''}`}
            onClick={() => setSide('V')}
          >
            <span className="dot dot-v" aria-hidden />
            Black <span className="side-sub">first</span>
          </button>
          <button
            type="button"
            role="radio"
            aria-checked={side === 'H'}
            className={`side-opt ${side === 'H' ? 'is-on' : ''}`}
            onClick={() => setSide('H')}
          >
            <span className="dot dot-h" aria-hidden />
            White <span className="side-sub">second</span>
          </button>
        </div>
      </div>

      <p className={`engine-legend ${recorded ? 'is-active' : ''}`}>
        <span className="engine-rec">REC</span>
        {recorded
          ? 'This game will be saved to your replays to study move by move.'
          : 'Only games vs Neural are saved to your replays.'}
      </p>

      <button type="button" className="btn btn-primary engine-start" onClick={() => onStart(engine, side)}>
        Start game
        <span aria-hidden> →</span>
      </button>
    </main>
  )
}
