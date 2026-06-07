// Replay viewer: step through a saved vs-Neural game to study it. Every board
// state is reconstructed from the stored action list and the fixed opening, so
// stepping forward/back is just indexing into that sequence.

import { useEffect, useMemo, useState } from 'react'
import { Board } from '../components/Board'
import { applyAction, createInitialState } from '../game/rules'
import type { GameState, Player } from '../game/types'
import { getReplay, type Replay } from '../online/replays'
import './ReplayScreen.css'

interface ReplayScreenProps {
  replayId: number
  onBack: () => void
}

const colorName = (p: Player): string => (p === 'V' ? 'Black' : 'White')

function formatDate(iso: string): string {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ''
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })
}

export function ReplayScreen({ replayId, onBack }: ReplayScreenProps) {
  // undefined = loading, null = not found, Replay = loaded. A sentinel (rather
  // than a separate loading flag) keeps the effect free of synchronous setState.
  const [replay, setReplay] = useState<Replay | null | undefined>(undefined)
  const [index, setIndex] = useState(0)

  useEffect(() => {
    let cancelled = false
    getReplay(replayId).then((r) => {
      if (!cancelled) setReplay(r)
    })
    return () => {
      cancelled = true
    }
  }, [replayId])

  // Rebuild the whole state sequence (initial + after each action).
  const states = useMemo<GameState[]>(() => {
    const seq: GameState[] = [createInitialState()]
    if (replay) for (const a of replay.actions) seq.push(applyAction(seq[seq.length - 1], a))
    return seq
  }, [replay])

  const maxIndex = states.length - 1
  const clamped = Math.min(index, maxIndex)
  const state = states[clamped]
  const lastAction = clamped > 0 && replay ? replay.actions[clamped - 1] : null

  const go = (i: number) => setIndex(Math.max(0, Math.min(maxIndex, i)))

  const resultText = (): string => {
    if (!replay) return ''
    if (replay.winner === 'draw') return 'Draw'
    return replay.winner === replay.human_color ? 'You won' : 'You lost'
  }

  const stepText = (): string => {
    if (!replay) return ''
    if (clamped === 0) return 'Start'
    if (clamped === maxIndex && replay.winner !== 'draw') return `${colorName(replay.winner)} wins`
    return `${colorName(state.current)} to move`
  }

  return (
    <main className="replay-screen">
      <div className="screen-topbar">
        <button type="button" className="icon-back" onClick={onBack} aria-label="Back">
          <span aria-hidden>←</span> Back
        </button>
        <span className="screen-title">Replay</span>
        <span className="topbar-spacer" aria-hidden />
      </div>

      {replay === undefined ? (
        <p className="replay-hint">Loading replay…</p>
      ) : replay === null ? (
        <p className="replay-hint">Replay not found.</p>
      ) : (
        <>
          <p className="replay-meta">
            vs Neural · You played {colorName(replay.human_color)} · {resultText()} · {replay.moves}{' '}
            moves · {formatDate(replay.played_at)}
          </p>

          <Board
            board={state.board}
            selected={null}
            placeTargets={[]}
            moveTargets={[]}
            winningLine={state.winningLine}
            lastAction={lastAction}
            disabled
            onCellClick={() => undefined}
          />

          <div className="replay-status">
            Move {clamped} / {maxIndex} · {stepText()}
          </div>

          <input
            type="range"
            className="replay-slider"
            min={0}
            max={maxIndex}
            value={clamped}
            onChange={(e) => go(Number(e.target.value))}
            aria-label="Move position"
          />

          <div className="replay-controls">
            <button type="button" className="btn" onClick={() => go(0)} disabled={clamped === 0} aria-label="First move">
              ⏮
            </button>
            <button type="button" className="btn" onClick={() => go(clamped - 1)} disabled={clamped === 0} aria-label="Previous move">
              ◀
            </button>
            <button type="button" className="btn btn-primary" onClick={() => go(clamped + 1)} disabled={clamped === maxIndex} aria-label="Next move">
              ▶
            </button>
            <button type="button" className="btn" onClick={() => go(maxIndex)} disabled={clamped === maxIndex} aria-label="Last move">
              ⏭
            </button>
          </div>
        </>
      )}
    </main>
  )
}
