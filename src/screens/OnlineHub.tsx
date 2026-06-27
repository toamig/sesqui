// Online hub: the ways to play online. Flat, fixed cards (no expansions).
//   - Play a Friend  -> private room by code (always casual, no login needed)
//   - Casual Match   -> matchmaking, unranked, requires sign-in
//   - Tournaments    -> host/join a bracket (beta), requires sign-in
//   - Ranked Match   -> disabled "coming soon" until the ranking backend lands,
//                       so players aren't dropped into a feature that isn't real
// Identity / sign-in lives in the global account drawer (the avatar, top-right),
// so a guest who taps a locked card is sent there.

import type { ReactNode } from 'react'
import { isOnlineConfigured } from '../online/config'
import { useAuth } from '../online/useAuth'

export type OnlineChoice = 'friend' | 'casual' | 'ranked' | 'tournaments'

interface OnlineHubProps {
  onChoose: (choice: OnlineChoice) => void
  onBack: () => void
  /** Open the account drawer so a guest can sign in for matchmaking. */
  onRequireAuth: () => void
}

interface CardProps {
  icon: ReactNode
  title: string
  subtitle: string
  onClick?: () => void
  variant?: 'primary'
  badge?: ReactNode
  /** Sign-in gate: tappable, but a guest tap routes to sign-in. */
  locked?: boolean
  /** Not available yet (coming soon): shown but not selectable. */
  disabled?: boolean
}

function HubCard({ icon, title, subtitle, onClick, variant, badge, locked, disabled }: CardProps) {
  return (
    <button
      type="button"
      className={`hub-card ${variant ? `hub-card-${variant}` : ''} ${disabled ? 'hub-card-disabled' : ''}`}
      onClick={onClick}
      disabled={disabled}
      aria-disabled={disabled || undefined}
    >
      <span className="hub-icon" aria-hidden>
        {icon}
      </span>
      <span className="hub-text">
        <span className="hub-title">
          {title}
          {badge}
          {locked && (
            <span className="hub-lock" aria-label="Sign in required" title="Sign in required">
              <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <rect x="5" y="11" width="14" height="9" rx="2" />
                <path d="M8 11V8a4 4 0 0 1 8 0v3" />
              </svg>
            </span>
          )}
        </span>
        <span className="hub-subtitle">{subtitle}</span>
      </span>
      {!disabled && (
        <span className="hub-arrow" aria-hidden>
          →
        </span>
      )}
    </button>
  )
}

const IconFriend = (
  <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="7" cy="12" r="3" />
    <circle cx="17" cy="12" r="3" />
    <path d="M10 12h4" />
  </svg>
)
const IconCasual = (
  <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="12" cy="12" r="9" />
    <path d="M12 7v5l3 2" />
  </svg>
)
const IconRanked = (
  <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
    <path d="M5 4h14l-1 7a6 6 0 0 1-12 0Z" />
    <path d="M9 20h6M12 17v3" />
  </svg>
)
const IconTournament = (
  <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
    <path d="M4 5h5v6H4M4 13h5v6H4M9 8h4v8H9M13 12h7" />
  </svg>
)

export function OnlineHub({ onChoose, onBack, onRequireAuth }: OnlineHubProps) {
  const auth = useAuth(true)
  // Until auth resolves, treat as not-signed-in (the lock shows, tapping prompts
  // sign-in). Friends play never needs a login.
  const signedIn = isOnlineConfigured && auth.ready && !auth.anonymous

  const chooseMatch = (choice: 'casual' | 'ranked' | 'tournaments') => {
    if (signedIn) onChoose(choice)
    else onRequireAuth()
  }

  return (
    <main className="online-hub">
      <div className="screen-topbar">
        <button type="button" className="icon-back" onClick={onBack} aria-label="Back to menu">
          <span aria-hidden>←</span> Menu
        </button>
        <span className="screen-title">Play Online</span>
        <span className="topbar-spacer" aria-hidden />
      </div>

      <header className="game-header">
        <h1>Play Online</h1>
        <p className="subtitle">Pick how you want to play.</p>
      </header>

      <nav className="hub-list" aria-label="Online modes">
        <HubCard
          icon={IconFriend}
          title="Play a Friend"
          subtitle="Create a room or join with a code"
          onClick={() => onChoose('friend')}
          variant="primary"
        />
        <HubCard
          icon={IconCasual}
          title="Casual Match"
          subtitle={signedIn ? 'Quick game vs anyone, no pressure' : 'Sign in to find a match'}
          onClick={() => chooseMatch('casual')}
          locked={!signedIn}
        />
        <HubCard
          icon={IconTournament}
          title="Tournaments"
          subtitle={signedIn ? 'Host or join a bracket' : 'Sign in to play tournaments'}
          onClick={() => chooseMatch('tournaments')}
          locked={!signedIn}
          badge={<span className="hub-badge hub-badge-soon">Beta</span>}
        />
        <HubCard
          icon={IconRanked}
          title="Ranked Match"
          subtitle="Competitive ladder is coming soon"
          badge={<span className="hub-badge hub-badge-soon">Soon</span>}
          disabled
        />
      </nav>
    </main>
  )
}
