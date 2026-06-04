// Account & profile screen for a competitive online game. Four sections, all
// fixed-layout (no in-place expansions): Identity & stats, Account & security,
// Settings, Danger zone. Every action maps to a real backend call.

import { useState } from 'react'
import {
  addPassword,
  changePassword,
  deleteAccount,
  isSupabaseConfigured,
  linkGoogle,
  signOut,
} from '../online/auth'
import { setDisplayName } from '../online/profile'
import { useAuth } from '../online/useAuth'
import { SkinPicker } from '../components/SkinPicker'
import type { SkinId } from '../theme'

interface ProfileScreenProps {
  skin: SkinId
  onSkinChange: (id: SkinId) => void
  onBack: () => void
}

export function ProfileScreen({ skin, onSkinChange, onBack }: ProfileScreenProps) {
  const auth = useAuth(true)
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [pw, setPw] = useState('')
  const [newPw, setNewPw] = useState('')
  const [notice, setNotice] = useState<string | null>(null)
  const [confirmDelete, setConfirmDelete] = useState(false)

  const flash = (m: string) => setNotice(m)

  const saveName = async () => {
    const res = await setDisplayName(name)
    flash(res.ok ? 'Name saved.' : res.error ?? 'Could not save name')
    if (res.ok) {
      auth.refreshProfile()
      setName('')
    }
  }

  const doAddPassword = async () => {
    if (!email.includes('@') || pw.length < 6) {
      flash('Enter an email and a password of at least 6 characters.')
      return
    }
    const res = await addPassword(email, pw)
    flash(
      res.ok
        ? 'Account secured. Check your email if confirmation is required.'
        : res.error ?? 'Could not add password',
    )
    if (res.ok) setPw('')
  }

  const doChangePassword = async () => {
    if (newPw.length < 6) {
      flash('New password must be at least 6 characters.')
      return
    }
    const res = await changePassword(newPw)
    flash(res.ok ? 'Password changed.' : res.error ?? 'Could not change password')
    if (res.ok) setNewPw('')
  }

  const doGoogle = async () => {
    const res = await linkGoogle()
    if (!res.ok) flash(res.error ?? 'Google sign-in unavailable')
  }

  const doSignOut = async () => {
    await signOut()
    auth.refreshProfile()
    flash('Signed out.')
  }

  const doDelete = async () => {
    const res = await deleteAccount()
    if (res.ok) {
      setConfirmDelete(false)
      flash('Account deleted.')
      auth.refreshProfile()
    } else {
      flash(res.error ?? 'Could not delete account')
    }
  }

  const methodLabel = auth.anonymous
    ? 'Guest (not signed in)'
    : auth.providers.includes('google')
      ? 'Google'
      : auth.hasPassword
        ? 'Email & password'
        : 'Email link'

  return (
    <main className="profile-screen">
      <div className="screen-topbar">
        <button type="button" className="icon-back" onClick={onBack} aria-label="Back to menu">
          <span aria-hidden>←</span> Menu
        </button>
        <span className="screen-title">Account</span>
        <span className="topbar-spacer" aria-hidden />
      </div>

      {!isSupabaseConfigured ? (
        <section className="profile-card">
          <p className="profile-muted">
            Accounts need the online backend, which isn&apos;t configured on this
            build.
          </p>
        </section>
      ) : !auth.ready ? (
        <section className="profile-card">
          <p className="profile-muted">
            <span className="lobby-mode-dot" aria-hidden /> Loading your account
          </p>
        </section>
      ) : (
        <>
          {/* ---- Identity & stats ---- */}
          <section className="profile-card profile-identity">
            <span className="profile-avatar" aria-hidden>
              {auth.label.charAt(0).toUpperCase()}
            </span>
            <div className="profile-id-text">
              <h2 className="profile-name">{auth.label}</h2>
              <span className={`profile-method ${auth.anonymous ? 'is-guest' : 'is-signed'}`}>
                {methodLabel}
              </span>
            </div>
            <div className="profile-stats">
              <div className="profile-stat">
                <span className="stat-value">{auth.rating?.rating ?? '—'}</span>
                <span className="stat-label">Rating</span>
              </div>
              <div className="profile-stat">
                <span className="stat-value">{auth.rating?.wins ?? 0}</span>
                <span className="stat-label">Wins</span>
              </div>
              <div className="profile-stat">
                <span className="stat-value">{auth.rating?.losses ?? 0}</span>
                <span className="stat-label">Losses</span>
              </div>
            </div>
          </section>

          {/* ---- Display name ---- */}
          <section className="profile-card">
            <h3 className="profile-heading">Display name</h3>
            <form
              className="profile-row"
              onSubmit={(e) => {
                e.preventDefault()
                void saveName()
              }}
            >
              <input
                className="field profile-input"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder={auth.label !== 'Guest' ? auth.label : 'Your name'}
                maxLength={24}
                aria-label="Display name"
              />
              <button type="submit" className="btn btn-small">
                Save
              </button>
            </form>
          </section>

          {/* ---- Account & security ---- */}
          <section className="profile-card">
            <h3 className="profile-heading">Account &amp; security</h3>

            {auth.anonymous ? (
              <>
                <p className="profile-muted">
                  Secure your account to keep your name and rating across devices.
                </p>
                <button type="button" className="btn btn-google" onClick={() => void doGoogle()}>
                  Continue with Google
                </button>
                <form
                  className="profile-stack"
                  onSubmit={(e) => {
                    e.preventDefault()
                    void doAddPassword()
                  }}
                >
                  <input
                    className="field"
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="you@email.com"
                    autoComplete="email"
                    aria-label="Email"
                  />
                  <input
                    className="field"
                    type="password"
                    value={pw}
                    onChange={(e) => setPw(e.target.value)}
                    placeholder="Create a password"
                    autoComplete="new-password"
                    aria-label="Password"
                  />
                  <button type="submit" className="btn btn-primary">
                    Create account
                  </button>
                </form>
              </>
            ) : (
              <>
                <div className="profile-line">
                  <span className="profile-muted">Signed in as</span>
                  <span className="profile-value">{auth.email ?? auth.label}</span>
                </div>

                {!auth.providers.includes('google') && (
                  <button type="button" className="btn btn-google" onClick={() => void doGoogle()}>
                    Link Google
                  </button>
                )}

                {auth.hasPassword && (
                  <form
                    className="profile-row"
                    onSubmit={(e) => {
                      e.preventDefault()
                      void doChangePassword()
                    }}
                  >
                    <input
                      className="field profile-input"
                      type="password"
                      value={newPw}
                      onChange={(e) => setNewPw(e.target.value)}
                      placeholder="New password"
                      autoComplete="new-password"
                      aria-label="New password"
                    />
                    <button type="submit" className="btn btn-small">
                      Change
                    </button>
                  </form>
                )}

                <button type="button" className="btn" onClick={() => void doSignOut()}>
                  Sign out
                </button>
              </>
            )}
          </section>

          {/* ---- Settings ---- */}
          <section className="profile-card">
            <h3 className="profile-heading">Settings</h3>
            <div className="profile-setting">
              <span className="profile-value">Theme</span>
              <SkinPicker value={skin} onChange={onSkinChange} />
            </div>
          </section>

          {/* ---- Danger zone ---- */}
          {!auth.anonymous && (
            <section className="profile-card profile-danger">
              <h3 className="profile-heading">Danger zone</h3>
              {!confirmDelete ? (
                <>
                  <p className="profile-muted">
                    Permanently delete your account, rating, and games. This cannot
                    be undone.
                  </p>
                  <button
                    type="button"
                    className="btn btn-danger"
                    onClick={() => setConfirmDelete(true)}
                  >
                    Delete account
                  </button>
                </>
              ) : (
                <>
                  <p className="profile-muted">
                    Are you sure? Your rating and history will be gone for good.
                  </p>
                  <div className="profile-row">
                    <button type="button" className="btn btn-danger" onClick={() => void doDelete()}>
                      Yes, delete
                    </button>
                    <button type="button" className="btn" onClick={() => setConfirmDelete(false)}>
                      Cancel
                    </button>
                  </div>
                </>
              )}
            </section>
          )}

          {notice && <p className="profile-notice">{notice}</p>}
        </>
      )}
    </main>
  )
}
