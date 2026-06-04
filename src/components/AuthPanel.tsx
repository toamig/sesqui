// Compact identity panel for the online lobby.
//
// Shows who you're playing as, lets you set a display name, and (for anonymous
// users) offers to upgrade the account via email magic link or Google -- keeping
// the same uid, so seats/history carry over. Hidden entirely when the backend
// isn't configured (local-test mode has no accounts).

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
  const [editingName, setEditingName] = useState(false)
  const [nameInput, setNameInput] = useState('')
  const [email, setEmail] = useState('')
  const [notice, setNotice] = useState<string | null>(null)
  const [showUpgrade, setShowUpgrade] = useState(false)

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
    if (res.ok) {
      auth.refreshProfile()
      setEditingName(false)
      setNotice(null)
    } else {
      setNotice(res.error ?? 'Could not save name')
    }
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
    // On success the browser redirects to Google.
  }

  return (
    <div className="auth-panel">
      <div className="auth-identity">
        <span className="auth-avatar" aria-hidden>
          {auth.label.charAt(0).toUpperCase()}
        </span>
        {editingName ? (
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
              placeholder="Display name"
              maxLength={24}
              autoFocus
            />
            <button type="submit" className="btn btn-small">
              Save
            </button>
          </form>
        ) : (
          <span className="auth-label">
            Playing as <strong>{auth.label}</strong>
            <button
              type="button"
              className="auth-link"
              onClick={() => {
                setNameInput(auth.label === 'Guest' ? '' : auth.label)
                setEditingName(true)
              }}
            >
              edit
            </button>
          </span>
        )}
      </div>

      {auth.anonymous && (
        <div className="auth-upgrade">
          {!showUpgrade ? (
            <button type="button" className="auth-link" onClick={() => setShowUpgrade(true)}>
              Sign in to save your games
            </button>
          ) : (
            <div className="auth-upgrade-options">
              <button type="button" className="btn btn-google" onClick={() => void upgradeGoogle()}>
                Continue with Google
              </button>
              <div className="auth-or">or</div>
              <form
                className="auth-email"
                onSubmit={(e) => {
                  e.preventDefault()
                  void sendMagicLink()
                }}
              >
                <input
                  className="field auth-email-input"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="you@email.com"
                  autoComplete="email"
                />
                <button type="submit" className="btn">
                  Email me a link
                </button>
              </form>
            </div>
          )}
        </div>
      )}

      {notice && <p className="auth-notice">{notice}</p>}
    </div>
  )
}
