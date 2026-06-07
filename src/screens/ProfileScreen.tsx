// Profile page: a player's dashboard. Identity, lifetime record, and recent
// match history, all derived from the durable match_results table (so the stat
// tiles and the history list always agree). Elo/rating is intentionally NOT
// shown yet -- ranked play is still "coming soon", so the profile speaks only in
// games / wins / losses, which are honest today.
//
// Reachable from the global account drawer ("View profile"). Fixed-layout, no
// expansions, themed entirely through tokens so it renders in every skin.

import { useEffect, useState } from 'react'
import { isSupabaseConfigured } from '../online/auth'
import { useAuth } from '../online/useAuth'
import { myMatchStats } from '../online/matches'
import type { MatchStats } from '../online/matches'
import { myReplays } from '../online/replays'
import type { ReplayMeta } from '../online/replays'
import './ProfileScreen.css'

interface ProfileScreenProps {
  onBack: () => void
  /** Open the account drawer (sign in / manage account). */
  onAccount: () => void
  /** Open a saved replay in the step-through viewer. */
  onOpenReplay: (id: number) => void
}

/** "March 2026" from an ISO date, or null if absent/unparseable. */
function monthYear(iso?: string): string | null {
  if (!iso) return null
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return null
  return d.toLocaleDateString(undefined, { month: 'long', year: 'numeric' })
}

/** Compact "2h ago" style relative time. */
function relativeTime(iso: string): string {
  const then = new Date(iso).getTime()
  if (Number.isNaN(then)) return ''
  const s = Math.max(0, Math.floor((Date.now() - then) / 1000))
  if (s < 60) return 'just now'
  const m = Math.floor(s / 60)
  if (m < 60) return `${m}m ago`
  const h = Math.floor(m / 60)
  if (h < 24) return `${h}h ago`
  const d = Math.floor(h / 24)
  if (d < 7) return `${d}d ago`
  const w = Math.floor(d / 7)
  if (w < 5) return `${w}w ago`
  const mo = Math.floor(d / 30)
  if (mo < 12) return `${mo}mo ago`
  return `${Math.floor(d / 365)}y ago`
}

const modeLabel = (m: string): string =>
  m === 'ai'
    ? 'Practice'
    : m === 'friend'
      ? 'Friend'
      : m === 'casual'
        ? 'Casual'
        : m === 'ranked'
          ? 'Ranked'
          : 'Online'

export function ProfileScreen({ onBack, onAccount, onOpenReplay }: ProfileScreenProps) {
  const auth = useAuth(true)
  const [stats, setStats] = useState<MatchStats | null>(null)
  const [replays, setReplays] = useState<ReplayMeta[] | null>(null)

  const uid = auth.user?.id ?? null

  // Pull stats + recent games once an identity is established. Async resolution
  // (not a synchronous setState in the effect body) keeps the renders clean.
  useEffect(() => {
    if (!isSupabaseConfigured || !auth.ready || !uid) return
    let cancelled = false
    void Promise.all([myMatchStats(), myReplays(50)]).then(([s, r]) => {
      if (cancelled) return
      setStats(s)
      setReplays(r)
    })
    return () => {
      cancelled = true
    }
  }, [auth.ready, uid])

  const methodLabel = auth.anonymous
    ? 'Guest'
    : auth.providers.includes('google')
      ? 'Google'
      : auth.hasPassword
        ? 'Email & password'
        : 'Email link'

  const initial = auth.ready || !isSupabaseConfigured ? auth.label.charAt(0).toUpperCase() : '·'
  const since = monthYear(auth.user?.created_at)
  const winRate =
    stats && stats.games > 0 ? `${Math.round((stats.wins / stats.games) * 100)}%` : '—'

  const tiles: { value: string; label: string }[] = [
    { value: stats ? String(stats.games) : '—', label: 'Games' },
    { value: stats ? String(stats.wins) : '—', label: 'Wins' },
    { value: stats ? String(stats.losses) : '—', label: 'Losses' },
    { value: winRate, label: 'Win rate' },
  ]

  return (
    <main className="profile-screen">
      <div className="screen-topbar">
        <button type="button" className="icon-back" onClick={onBack} aria-label="Back">
          <span aria-hidden>←</span> Back
        </button>
        <span className="screen-title">Profile</span>
        <span className="topbar-spacer" aria-hidden />
      </div>

      {!isSupabaseConfigured ? (
        <p className="profile-offline">
          Profiles live online. Add the backend keys to track your games.
        </p>
      ) : (
        <>
          <header className="profile-hero">
            <span className="profile-avatar" aria-hidden>
              {initial}
            </span>
            <h1 className="profile-name">{auth.label}</h1>
            <div className="profile-meta">
              <span className={`profile-method ${auth.anonymous ? 'is-guest' : 'is-signed'}`}>
                {methodLabel}
              </span>
              {since && <span className="profile-since">Since {since}</span>}
            </div>
          </header>

          {auth.anonymous && (
            <div className="profile-guest" role="note">
              <p className="profile-guest-text">
                You're playing as a guest. Sign in to keep your stats and history across devices.
              </p>
              <button type="button" className="btn btn-primary" onClick={onAccount}>
                Sign in
              </button>
            </div>
          )}

          <section className="profile-stats" aria-label="Record">
            {tiles.map((t) => (
              <div key={t.label} className="profile-tile">
                <span className="profile-tile-value">{t.value}</span>
                <span className="profile-tile-label">{t.label}</span>
              </div>
            ))}
          </section>

          <section className="profile-history">
            <h2 className="profile-section-title">Match history</h2>

            {replays === null ? (
              <p className="profile-hint">Loading your games…</p>
            ) : replays.length === 0 ? (
              <div className="profile-empty">
                <svg viewBox="0 0 24 24" width="34" height="34" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                  <circle cx="12" cy="12" r="9" />
                  <path d="M10 9l5 3-5 3z" />
                </svg>
                <p className="profile-empty-title">No games yet</p>
                <p className="profile-hint">Play online or vs the Neural AI, then review your games here.</p>
              </div>
            ) : (
              <ul className="mh-list">
                {replays.map((r) => {
                  const outcome =
                    r.winner === 'draw' ? 'draw' : r.winner === r.human_color ? 'win' : 'loss'
                  return (
                    <li key={r.id}>
                      <button
                        type="button"
                        className="mh-row mh-row-button"
                        onClick={() => onOpenReplay(r.id)}
                      >
                        <span className={`mh-result is-${outcome}`} aria-hidden>
                          {outcome === 'draw' ? 'D' : outcome === 'win' ? 'W' : 'L'}
                        </span>
                        <span className="mh-main">
                          <span className="mh-opp">
                            <span className="mh-mode-badge">{modeLabel(r.mode)}</span>
                            <span className="mh-opp-name">
                              <span className="mh-vs">vs</span> {r.opponent}
                            </span>
                          </span>
                          <span className="mh-sub">
                            Played {r.human_color === 'V' ? 'Vertical' : 'Horizontal'} · {r.moves} moves ·{' '}
                            {relativeTime(r.played_at)}
                          </span>
                        </span>
                        <span className="mh-review" aria-hidden>
                          ▶ Review
                        </span>
                      </button>
                    </li>
                  )
                })}
              </ul>
            )}
          </section>
        </>
      )}
    </main>
  )
}
