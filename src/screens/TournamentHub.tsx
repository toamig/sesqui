// Tournament entry screen (Phase 1): create a bracket or join one by code.
// Reached from the online hub (admin-gated during development).

import { useState } from 'react'
import { createTournament, joinTournament } from '../online/tournaments'

interface TournamentHubProps {
  onBack: () => void
  /** A lobby was created or joined: open it. */
  onEnterLobby: (code: string) => void
}

const SIZES = [4, 8, 16]

export function TournamentHub({ onBack, onEnterLobby }: TournamentHubProps) {
  const [name, setName] = useState('')
  const [size, setSize] = useState(8)
  const [code, setCode] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const create = async () => {
    setBusy(true)
    setError(null)
    const c = await createTournament(name.trim() || 'Tournament', size)
    setBusy(false)
    if (!c) {
      setError('Could not create. Make sure you are signed in.')
      return
    }
    onEnterLobby(c)
  }

  const join = async () => {
    const c = code.trim().toUpperCase()
    if (c.length < 4) {
      setError('Enter a valid code.')
      return
    }
    setBusy(true)
    setError(null)
    const res = await joinTournament(c)
    setBusy(false)
    if (!res.ok) {
      setError(
        res.error === 'full'
          ? 'That tournament is full.'
          : res.error === 'already_started'
            ? 'That tournament has already started.'
            : res.error === 'not_found'
              ? 'No tournament with that code.'
              : 'Could not join. Make sure you are signed in.',
      )
      return
    }
    onEnterLobby(c)
  }

  return (
    <main className="tournament-hub">
      <div className="screen-topbar">
        <button type="button" className="icon-back" onClick={onBack} aria-label="Back to online">
          <span aria-hidden>←</span> Online
        </button>
        <span className="screen-title">Tournaments</span>
        <span className="topbar-spacer" aria-hidden />
      </div>

      <header className="game-header">
        <h1>Tournaments</h1>
        <p className="subtitle">Host a bracket or join one by code.</p>
      </header>

      {error && <p className="t-error">{error}</p>}

      <section className="t-card">
        <h2 className="t-card-title">Create</h2>
        <label className="t-field">
          <span>Name</span>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Friday Night Sesqui"
            maxLength={40}
          />
        </label>
        <div className="t-field">
          <span>Players</span>
          <div className="t-sizes">
            {SIZES.map((s) => (
              <button
                key={s}
                type="button"
                className={`t-size${size === s ? ' t-size-on' : ''}`}
                onClick={() => setSize(s)}
              >
                {s}
              </button>
            ))}
          </div>
        </div>
        <button type="button" className="btn btn-primary" disabled={busy} onClick={create}>
          Create tournament
        </button>
      </section>

      <section className="t-card">
        <h2 className="t-card-title">Join by code</h2>
        <label className="t-field">
          <span>Code</span>
          <input
            value={code}
            onChange={(e) => setCode(e.target.value)}
            placeholder="ABCDE"
            maxLength={6}
            className="t-code-input"
            autoCapitalize="characters"
          />
        </label>
        <button type="button" className="btn" disabled={busy} onClick={join}>
          Join
        </button>
      </section>
    </main>
  )
}
