// Matchmaking search screen. Casual or Ranked is fixed (chosen on the hub), so
// the layout never toggles. Sign-in is already enforced at the hub, so anyone
// who reaches here is a signed-in player. Frontend-complete; the actual
// queue/pairing is a backend step (Layer 2.5) wired in later -- until then this
// shows the searching state and an honest "matchmaking is coming" note rather
// than faking a match.

import { useEffect, useState } from 'react'

interface MatchSearchProps {
  ranked: boolean
  /** Cancel the search and return to the online hub. */
  onCancel: () => void
}

export function MatchSearch({ ranked, onCancel }: MatchSearchProps) {
  const [seconds, setSeconds] = useState(0)

  useEffect(() => {
    const t = setInterval(() => setSeconds((s) => s + 1), 1000)
    return () => clearInterval(t)
  }, [])

  return (
    <main className="match-search">
      <div className="screen-topbar">
        <button type="button" className="icon-back" onClick={onCancel} aria-label="Back">
          <span aria-hidden>←</span> Online
        </button>
        <span className="screen-title">{ranked ? 'Ranked Match' : 'Casual Match'}</span>
        <span className="topbar-spacer" aria-hidden />
      </div>

      <div className="search-card">
        <div className="search-orbit" aria-hidden>
          <span className="search-dot search-dot-v" />
          <span className="search-dot search-dot-h" />
        </div>
        <h2 className="search-title">
          Searching for an opponent
          <span className="thinking-dots" aria-hidden>
            <i />
            <i />
            <i />
          </span>
        </h2>
        <p className="search-meta">
          {ranked ? 'Ranked' : 'Casual'} · {seconds}s
        </p>
        <p className="search-note">
          Matchmaking is being wired up. For now, use{' '}
          <strong>Play a Friend</strong> to start a game by sharing a code.
        </p>
        <button type="button" className="btn" onClick={onCancel}>
          Cancel
        </button>
      </div>
    </main>
  )
}
