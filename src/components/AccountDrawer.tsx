// Account drawer: a slide-in overlay reachable from anywhere via the fixed
// AccountButton. It floats ABOVE the current screen, so opening it mid-game and
// closing it returns you exactly where you were -- the account is a control, not
// a destination you navigate to.
//
// Holds everything the old ProfileScreen did (identity, stats, security, danger
// zone) PLUS Appearance (theme), which used to clutter the main menu. All
// sections are fixed-layout; nothing reshuffles the page on click.

import { useEffect, useState } from 'react'
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
import { SkinPicker } from './SkinPicker'
import type { SkinId } from '../theme'

interface AccountDrawerProps {
  open: boolean
  onClose: () => void
  skin: SkinId
  onSkinChange: (id: SkinId) => void
}

export function AccountDrawer({ open, onClose, skin, onSkinChange }: AccountDrawerProps) {
  // Auth initialises while the drawer is open. The shared Supabase client + the
  // persisted session are cached, so closing/reopening re-subscribes instantly
  // without redoing the network sign-in.
  const auth = useAuth(open)

  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [pw, setPw] = useState('')
  const [newPw, setNewPw] = useState('')
  const [notice, setNotice] = useState<string | null>(null)
  const [confirmDelete, setConfirmDelete] = useState(false)

  // Close on Escape for keyboard users.
  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, onClose])

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
    ? 'Guest'
    : auth.providers.includes('google')
      ? 'Google'
      : auth.hasPassword
        ? 'Email & password'
        : 'Email link'

  return (
    <div className={`drawer-root ${open ? 'is-open' : ''}`} aria-hidden={!open}>
      <div className="drawer-scrim" onClick={onClose} />
      <aside
        className="drawer-panel"
        role="dialog"
        aria-modal="true"
        aria-label="Account"
      >
        <div className="drawer-head">
          <span className="drawer-title">Account</span>
          <button type="button" className="drawer-close" onClick={onClose} aria-label="Close">
            ✕
          </button>
        </div>

        <div className="drawer-body">
          {/* ---- Identity & stats ---- */}
          <section className="acc-identity">
            <span className="acc-avatar" aria-hidden>
              {auth.ready || !isSupabaseConfigured ? auth.label.charAt(0).toUpperCase() : '·'}
            </span>
            <div className="acc-id-text">
              <span className="acc-name">{isSupabaseConfigured ? auth.label : 'Player'}</span>
              <span className={`acc-method ${auth.anonymous ? 'is-guest' : 'is-signed'}`}>
                {isSupabaseConfigured ? methodLabel : 'Local play'}
              </span>
            </div>
          </section>

          {isSupabaseConfigured && (
            <div className="acc-stats">
              <div className="acc-stat">
                <span className="acc-stat-value">{auth.rating?.rating ?? '—'}</span>
                <span className="acc-stat-label">Rating</span>
              </div>
              <div className="acc-stat">
                <span className="acc-stat-value">{auth.rating?.wins ?? 0}</span>
                <span className="acc-stat-label">Wins</span>
              </div>
              <div className="acc-stat">
                <span className="acc-stat-value">{auth.rating?.losses ?? 0}</span>
                <span className="acc-stat-label">Losses</span>
              </div>
            </div>
          )}

          {isSupabaseConfigured && (
            <>
              {/* ---- Display name ---- */}
              <section className="acc-section">
                <h3 className="acc-heading">Display name</h3>
                <form
                  className="acc-row"
                  onSubmit={(e) => {
                    e.preventDefault()
                    void saveName()
                  }}
                >
                  <input
                    className="field acc-grow"
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
              <section className="acc-section">
                <h3 className="acc-heading">Account &amp; security</h3>
                {auth.anonymous ? (
                  <>
                    <p className="acc-muted">
                      Secure your account to keep your name and rating across devices.
                    </p>
                    <button type="button" className="btn btn-google" onClick={() => void doGoogle()}>
                      Continue with Google
                    </button>
                    <form
                      className="acc-stack"
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
                    <div className="acc-line">
                      <span className="acc-muted">Signed in as</span>
                      <span className="acc-value">{auth.email ?? auth.label}</span>
                    </div>
                    {!auth.providers.includes('google') && (
                      <button type="button" className="btn btn-google" onClick={() => void doGoogle()}>
                        Link Google
                      </button>
                    )}
                    {auth.hasPassword && (
                      <form
                        className="acc-row"
                        onSubmit={(e) => {
                          e.preventDefault()
                          void doChangePassword()
                        }}
                      >
                        <input
                          className="field acc-grow"
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
            </>
          )}

          {/* ---- Appearance (moved off the main menu) ---- */}
          <section className="acc-section">
            <h3 className="acc-heading">Appearance</h3>
            <SkinPicker value={skin} onChange={onSkinChange} />
          </section>

          {/* ---- Danger zone ---- */}
          {isSupabaseConfigured && !auth.anonymous && (
            <section className="acc-section acc-danger">
              <h3 className="acc-heading">Danger zone</h3>
              {!confirmDelete ? (
                <>
                  <p className="acc-muted">
                    Permanently delete your account, rating, and games. This cannot be undone.
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
                  <p className="acc-muted">
                    Are you sure? Your rating and history will be gone for good.
                  </p>
                  <div className="acc-row">
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

          {notice && <p className="acc-notice">{notice}</p>}
        </div>
      </aside>
    </div>
  )
}
