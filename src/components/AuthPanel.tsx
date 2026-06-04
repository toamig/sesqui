// Compact identity panel for the online lobby.
//
// Layout is FIXED -- nothing expands or swaps in place. Anonymous users always
// see the same sign-in row; the display-name field is always a field (no
// label<->input swap). This avoids the page reshuffling on click that the menu
// redesign is removing everywhere.

import { useState } from 'react'
import { isSupabaseConfigured, linkEmail, linkGoogle } from '../online/auth'
import { setDisplayName } from '../online/profile'
import { useAuth } from '../online/useAuth'

interface AuthPanelProps {
  /** Only initialise auth when the panel is actually shown (keeps it lazy). */
  active: boolean
}

export function AuthPanel({ active }: AuthPanelProps) {
  const auth = useAuth(active)
  const [nameInput, setNameInput] = useState('')
  const [email, setEmail] = useState('')
  const [notice, setNotice] = useState<string | null>(null)

  if (!isSupabaseConfigured) return null
  if (!auth.ready) {
    return (
      <p className="auth-panel auth-loading">
        <span className="lobby-mode-dot" aria-hidden /> Signing in
      </p>
    )
  }

  const saveName = async () => {
    const res = await setDisplayName(nameInput)
    setNotice(res.ok ? 'Name saved.' : res.error ?? 'Could not save name')
    if (res.ok) auth.refreshProfile()
  }

  const sendMagicLink = async () => {
    if (!email.includes('@')) {
      setNotice('Enter a valid email')
      return
    }
    const res = await linkEmail(email)
    setNotice(res.ok ? 'Check your email for a sign-in link.' : res.error ?? 'Could not send link')
  }

  const upgradeGoogle = async () => {
    const res = await linkGoogle()
    if (!res.ok) setNotice(res.error ?? 'Google sign-in unavailable')
  }

  return (
    <div className="auth-panel">
      <div className="auth-identity">
        <span className="auth-avatar" aria-hidden>
          {auth.label.charAt(0).toUpperCase()}
        </span>
        <form
          className="auth-name-edit"
          onSubmit={(e) => {
            e.preventDefault()
            void saveName()
          }}
        >
          <input
            className="auth-name-input"
            value={nameInput}
            onChange={(e) => setNameInput(e.target.value)}
            placeholder={auth.label !== 'Guest' ? auth.label : 'Your name'}
            maxLength={24}
            aria-label="Display name"
          />
          <button type="submit" className="btn btn-small">
            Save
          </button>
        </form>
      </div>

      {auth.anonymous && (
        <div className="auth-upgrade">
          <p className="auth-upgrade-label">Sign in to keep your name and rating</p>
          <button type="button" className="btn btn-google" onClick={() => void upgradeGoogle()}>
            Continue with Google
          </button>
          <form
            className="auth-email"
            onSubmit={(e) => {
              e.preventDefault()
              void sendMagicLink()
            }}
          >
            <input
              className="auth-email-input"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@email.com"
              autoComplete="email"
              aria-label="Email"
            />
            <button type="submit" className="btn btn-small">
              Email link
            </button>
          </form>
        </div>
      )}

      {notice && <p className="auth-notice">{notice}</p>}
    </div>
  )
}
