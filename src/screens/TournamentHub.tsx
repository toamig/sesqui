// Tournament entry: create a bracket or join one by code. Reached from the online
// hub (admin-gated during development).

import { useState } from 'react'
import { createTournament, joinTournament } from '../online/tournaments'

interface TournamentHubProps {
  onBack: () => void
  onEnterLobby: (code: string) => void
}

const SIZES = [
  { n: 4, rounds: '2 rounds' },
  { n: 8, rounds: '3 rounds' },
  { n: 16, rounds: '4 rounds' },
]

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

      <header className="th-hero">
        <h1>Tournaments</h1>
        <p>Host a bracket or join one by code. Single elimination, winner takes the crown.</p>
      </header>

      {error && <p className="t-error">{error}</p>}

      <section className="th-card th-create">
        <span className="th-eyebrow">Host</span>
        <label className="th-field">
          <span>Name</span>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Friday night Sesqui"
            maxLength={40}
          />
        </label>
        <div className="th-field">
          <span>Field size</span>
          <div className="th-sizes">
            {SIZES.map((s) => (
              <button
                key={s.n}
                type="button"
                className={`th-size${size === s.n ? ' th-size-on' : ''}`}
                onClick={() => setSize(s.n)}
              >
                <span className="th-size-n">{s.n}</span>
                <span className="th-size-sub">{s.rounds}</span>
              </button>
            ))}
          </div>
        </div>
        <button type="button" className="btn btn-primary" disabled={busy} onClick={create}>
          Create tournament
        </button>
      </section>

      <section className="th-card th-join">
        <span className="th-eyebrow">Join</span>
        <label className="th-field">
          <span>Invite code</span>
          <input
            value={code}
            onChange={(e) => setCode(e.target.value)}
            placeholder="ABCDE"
            maxLength={6}
            className="th-code-input"
            autoCapitalize="characters"
          />
        </label>
        <button type="button" className="btn" disabled={busy} onClick={join}>
          Join tournament
        </button>
      </section>
    </main>
  )
}
