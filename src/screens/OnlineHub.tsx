// Online hub: the three ways to play online. Flat, fixed cards (no expansions).
//   - Play a Friend  -> private room by code (always casual)
//   - Casual Match   -> matchmaking, unranked, open to anyone
//   - Ranked Match   -> matchmaking, Elo, signed-in players only
// The leaderboard sits below as context for the ranked ladder.

import type { ReactNode } from 'react'
import { AuthPanel } from '../components/AuthPanel'
import { Leaderboard } from '../components/Leaderboard'
import { isOnlineConfigured } from '../online/config'
import { useAuth } from '../online/useAuth'

export type OnlineChoice = 'friend' | 'casual' | 'ranked'

interface OnlineHubProps {
  onChoose: (choice: OnlineChoice) => void
  onBack: () => void
}

interface CardProps {
  icon: ReactNode
  title: string
  subtitle: string
  onClick: () => void
  variant?: 'primary' | 'ranked'
  badge?: ReactNode
  disabled?: boolean
}

function HubCard({ icon, title, subtitle, onClick, variant, badge, disabled }: CardProps) {
  return (
    <button
      type="button"
      className={`hub-card ${variant ? `hub-card-${variant}` : ''}`}
      onClick={onClick}
      disabled={disabled}
    >
      <span className="hub-icon" aria-hidden>
        {icon}
      </span>
      <span className="hub-text">
        <span className="hub-title">
          {title}
          {badge}
        </span>
        <span className="hub-subtitle">{subtitle}</span>
      </span>
      <span className="hub-arrow" aria-hidden>
        →
      </span>
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

export function OnlineHub({ onChoose, onBack }: OnlineHubProps) {
  const auth = useAuth(true)
  const signedIn = isOnlineConfigured && auth.ready && !auth.anonymous

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

      <AuthPanel active />

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
          subtitle="Quick game vs anyone, no pressure"
          onClick={() => onChoose('casual')}
        />
        <HubCard
          icon={IconRanked}
          title="Ranked Match"
          subtitle={
            signedIn
              ? 'Compete for Elo and the leaderboard'
              : 'Climb the leaderboard · sign in to play'
          }
          onClick={() => onChoose('ranked')}
          variant="ranked"
          badge={<span className="hub-badge hub-badge-rank">Elo</span>}
        />
      </nav>

      <Leaderboard />
    </main>
  )
}
