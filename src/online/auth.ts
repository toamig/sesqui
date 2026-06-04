// Authentication (Layer 3a + 3b).
//
// Identity model designed to PRESERVE the share-a-link magic:
//  - On first online use, the player is signed in ANONYMOUSLY (a real
//    auth.uid(), no prompt, no friction). This becomes their seat identity.
//  - "Sign in" later UPGRADES that same anonymous user to a permanent one
//    (email magic link or Google) via linkIdentity, carrying their uid -- and
//    therefore their games, seats, and (future) rating -- across the upgrade.
//
// So a new player still just opens a link and plays; signing in only ADDS
// durable identity across devices. Nobody ever hits a signup wall.

import type { Session, User } from '@supabase/supabase-js'
import { getSupabase, isSupabaseConfigured } from './supabaseClient'

export { isSupabaseConfigured }

/** Ensure there is a session: reuse the persisted one, else sign in
 *  anonymously. Returns the current user (or null if backend unconfigured).
 *
 *  Critically, this also hands the access token to the REALTIME socket via
 *  setAuth. On a cold first visit (e.g. opening an invite link in a brand-new
 *  browser) the realtime socket would otherwise connect before it has any token
 *  and the very first channel subscribe is rejected ("Realtime channel timed
 *  out"). A warm visit masked this because the socket already had auth from a
 *  prior session. Setting it explicitly fixes the cold invite-link join. */
export async function ensureSignedIn(): Promise<User | null> {
  const supabase = await getSupabase()
  if (!supabase) return null
  const applyRealtimeAuth = (token?: string) => {
    if (token) {
      try {
        supabase.realtime.setAuth(token)
      } catch {
        // Older client signature; ignore -- channels still work for broadcast.
      }
    }
  }
  const { data } = await supabase.auth.getSession()
  if (data.session?.user) {
    applyRealtimeAuth(data.session.access_token)
    return data.session.user
  }
  const { data: anon, error } = await supabase.auth.signInAnonymously()
  if (error) return null
  applyRealtimeAuth(anon.session?.access_token)
  return anon.user
}

/** Current user without forcing sign-in (null if none yet / unconfigured). */
export async function currentUser(): Promise<User | null> {
  const supabase = await getSupabase()
  if (!supabase) return null
  const { data } = await supabase.auth.getUser()
  return data.user
}

/** True when the signed-in user is anonymous (not yet upgraded). */
export function isAnonymous(user: User | null): boolean {
  // Supabase marks anonymous users with is_anonymous; fall back to "no email
  // and no linked identities" for older client versions.
  const u = user as (User & { is_anonymous?: boolean }) | null
  if (!u) return false
  if (typeof u.is_anonymous === 'boolean') return u.is_anonymous
  return !u.email && (u.identities?.length ?? 0) === 0
}

/** A human label for the user: their display name, else email, else "Guest". */
export function userLabel(user: User | null, profileName?: string | null): string {
  if (profileName) return profileName
  if (!user) return 'Guest'
  if (user.email) return user.email.split('@')[0]
  return 'Guest'
}

/** Upgrade the current anonymous user with an email magic link. Supabase links
 *  the email to the SAME uid, preserving all their data. */
export async function linkEmail(email: string): Promise<{ ok: boolean; error?: string }> {
  const supabase = await getSupabase()
  if (!supabase) return { ok: false, error: 'Backend not configured' }
  // updateUser({ email }) on an anonymous user sends a confirmation link and
  // upgrades the account in place once confirmed.
  const { error } = await supabase.auth.updateUser({ email })
  return error ? { ok: false, error: error.message } : { ok: true }
}

/** Upgrade the current (anonymous) user to a permanent email+password account,
 *  keeping the same uid so games/rating carry over. Depending on the project's
 *  "confirm email" setting this may require the user to click a confirmation
 *  link before the password is usable. */
export async function addPassword(
  email: string,
  password: string,
): Promise<{ ok: boolean; error?: string }> {
  const supabase = await getSupabase()
  if (!supabase) return { ok: false, error: 'Backend not configured' }
  const { error } = await supabase.auth.updateUser({ email, password })
  return error ? { ok: false, error: error.message } : { ok: true }
}

/** Sign in with email + password (a returning password account). On success the
 *  realtime socket auth is refreshed so online play works immediately. */
export async function signInPassword(
  email: string,
  password: string,
): Promise<{ ok: boolean; error?: string }> {
  const supabase = await getSupabase()
  if (!supabase) return { ok: false, error: 'Backend not configured' }
  const { data, error } = await supabase.auth.signInWithPassword({ email, password })
  if (error) return { ok: false, error: error.message }
  const token = data.session?.access_token
  if (token) {
    try {
      supabase.realtime.setAuth(token)
    } catch {
      // older client signature; broadcast still works
    }
  }
  return { ok: true }
}

/** Change the password for the signed-in password account. */
export async function changePassword(
  newPassword: string,
): Promise<{ ok: boolean; error?: string }> {
  const supabase = await getSupabase()
  if (!supabase) return { ok: false, error: 'Backend not configured' }
  const { error } = await supabase.auth.updateUser({ password: newPassword })
  return error ? { ok: false, error: error.message } : { ok: true }
}

/** Send a password-reset email (for a user who forgot it). */
export async function resetPassword(email: string): Promise<{ ok: boolean; error?: string }> {
  const supabase = await getSupabase()
  if (!supabase) return { ok: false, error: 'Backend not configured' }
  const { error } = await supabase.auth.resetPasswordForEmail(email, {
    redirectTo: window.location.origin + window.location.pathname,
  })
  return error ? { ok: false, error: error.message } : { ok: true }
}

/** True when the user signed in with email+password (so password change applies).
 *  Detected via the 'email' identity provider on the user. */
export function hasPassword(user: User | null): boolean {
  const u = user as (User & { identities?: { provider: string }[] }) | null
  if (!u || isAnonymous(u)) return false
  return (u.identities ?? []).some((i) => i.provider === 'email')
}

/** Which third-party / email providers are linked to this account. */
export function linkedProviders(user: User | null): string[] {
  const u = user as (User & { identities?: { provider: string }[] }) | null
  if (!u) return []
  return [...new Set((u.identities ?? []).map((i) => i.provider))]
}

/** Permanently delete the account and all its data via a server function, then
 *  drop back to a fresh anonymous identity so the app keeps working. */
export async function deleteAccount(): Promise<{ ok: boolean; error?: string }> {
  const supabase = await getSupabase()
  if (!supabase) return { ok: false, error: 'Backend not configured' }
  const { error } = await supabase.rpc('delete_account')
  if (error) return { ok: false, error: error.message }
  await supabase.auth.signOut()
  await ensureSignedIn()
  return { ok: true }
}

/** Upgrade the current anonymous user via Google OAuth, keeping the same uid.
 *  Redirects the browser; resolves only if the redirect could not start. */
export async function linkGoogle(): Promise<{ ok: boolean; error?: string }> {
  const supabase = await getSupabase()
  if (!supabase) return { ok: false, error: 'Backend not configured' }
  const { error } = await supabase.auth.linkIdentity({
    provider: 'google',
    options: { redirectTo: window.location.origin + window.location.pathname },
  })
  return error ? { ok: false, error: error.message } : { ok: true }
}

/** Sign out and immediately re-establish an anonymous identity, so online play
 *  keeps working (the player just loses their upgraded account locally). */
export async function signOut(): Promise<void> {
  const supabase = await getSupabase()
  if (!supabase) return
  await supabase.auth.signOut()
  await ensureSignedIn()
}

/** Subscribe to auth state changes (sign-in, upgrade, token refresh, sign-out).
 *  Returns an unsubscribe function. */
export async function onAuthChange(
  handler: (user: User | null) => void,
): Promise<() => void> {
  const supabase = await getSupabase()
  if (!supabase) return () => {}
  const { data } = supabase.auth.onAuthStateChange((_event: string, session: Session | null) => {
    handler(session?.user ?? null)
  })
  return () => data.subscription.unsubscribe()
}
