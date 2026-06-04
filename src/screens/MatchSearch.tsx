// Matchmaking search screen. Casual or Ranked is fixed (chosen on the hub), so
// the layout never toggles. Frontend-complete; the actual queue/pairing is a
// backend step (Layer 2.5) wired in later -- until then this shows the searching
// state and an honest "matchmaking is coming" note rather than faking a match.

import { useEffect, useState } from 'react'
import { isOnlineConfigured } from '../online/config'
import { useAuth } from '../online/useAuth'

interface MatchSearchProps {
  ranked: boolean
  /** Cancel the search and return to the online hub. */
  onCancel: () => void
}

export function MatchSearch({ ranked, onCancel }: MatchSearchProps) {
  const auth = useAuth(true)
  const [seconds, setSeconds] = useState(0)

  // Ranked needs a real (non-anonymous) account.
  const blockedForRanked = ranked && isOnlineConfigured && auth.ready && auth.anonymous

  useEffect(() => {
    if (blockedForRanked) return
    const t = setInterval(() => setSeconds((s) => s + 1), 1000)
    return () => clearInterval(t)
  }, [blockedForRanked])

  return (
    <main className="match-search">
      <div className="screen-topbar">
        <button type="button" className="icon-back" onClick={onCancel} aria-label="Back">
          <span aria-hidden>←</span> Online
        </button>
        <span className="screen-title">{ranked ? 'Ranked Match' : 'Casual Match'}</span>
        <span className="topbar-spacer" aria-hidden />
      </div>

      {blockedForRanked ? (
        <div className="search-card">
          <h2 className="search-title">Sign in to play ranked</h2>
          <p className="search-note">
            Ranked games affect your Elo and the leaderboard, so they need a real
            account. Casual matches are open to everyone. Sign in from the online
            screen with Google or an email link, then come back.
          </p>
          <button type="button" className="btn btn-primary" onClick={onCancel}>
            Back to online
          </button>
        </div>
      ) : (
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
      )}
    </main>
  )
}
