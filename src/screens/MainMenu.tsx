// Main menu: the landing hub. Players choose what to do here, so every other
// screen has a single clear purpose and a fixed layout (no in-place expansions).
//
// The account button + theme now live in the global account drawer (reachable
// from any screen), so the menu stays focused purely on the game modes.

import type { ReactNode } from 'react'

type MenuTarget = 'online' | 'pvp' | 'ai' | 'watch' | 'rules'

interface MainMenuProps {
  onSelect: (target: MenuTarget) => void
}

interface ItemProps {
  icon: ReactNode
  title: string
  subtitle: string
  onClick: () => void
  accent?: boolean
}

function MenuItem({ icon, title, subtitle, onClick, accent }: ItemProps) {
  return (
    <button
      type="button"
      className={`menu-item ${accent ? 'menu-item-accent' : ''}`}
      onClick={onClick}
    >
      <span className="menu-icon" aria-hidden>
        {icon}
      </span>
      <span className="menu-text">
        <span className="menu-title">{title}</span>
        <span className="menu-subtitle">{subtitle}</span>
      </span>
      <span className="menu-arrow" aria-hidden>
        →
      </span>
    </button>
  )
}

// Small stroke icons (currentColor) so they inherit the theme accent cleanly.
const IconOnline = (
  <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="7" cy="12" r="3" />
    <circle cx="17" cy="12" r="3" />
    <path d="M10 12h4" />
  </svg>
)
const IconLocal = (
  <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="8" cy="9" r="3" />
    <circle cx="16" cy="9" r="3" />
    <path d="M3.5 19a4.5 4.5 0 0 1 9 0M11.5 19a4.5 4.5 0 0 1 9 0" />
  </svg>
)
const IconComputer = (
  <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
    <rect x="5" y="6" width="14" height="12" rx="2" />
    <path d="M9 11h.01M15 11h.01M9.5 15h5" />
    <path d="M9 6V4M15 6V4" />
  </svg>
)
const IconWatch = (
  <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
    <path d="M2 12s3.5-6 10-6 10 6 10 6-3.5 6-10 6-10-6-10-6Z" />
    <circle cx="12" cy="12" r="2.5" />
  </svg>
)

export function MainMenu({ onSelect }: MainMenuProps) {
  return (
    <main className="main-menu">
      <header className="menu-header">
        <h1 className="menu-wordmark">Sesqui</h1>
        <p className="menu-tagline">A connection game of two directions.</p>
      </header>

      <nav className="menu-list" aria-label="Main menu">
        <MenuItem
          icon={IconOnline}
          title="Play Online"
          subtitle="Challenge a friend or rivals anywhere"
          onClick={() => onSelect('online')}
          accent
        />
        <MenuItem
          icon={IconLocal}
          title="Pass &amp; Play"
          subtitle="Two players, one device"
          onClick={() => onSelect('pvp')}
        />
        <MenuItem
          icon={IconComputer}
          title="vs Computer"
          subtitle="Four engines, from gentle to ruthless"
          onClick={() => onSelect('ai')}
        />
        <MenuItem
          icon={IconWatch}
          title="Watch AI"
          subtitle="Let two engines battle it out"
          onClick={() => onSelect('watch')}
        />
      </nav>

      <div className="menu-footer">
        <button type="button" className="rules-link link-help" onClick={() => onSelect('rules')}>
          How to play
        </button>
      </div>
    </main>
  )
}
