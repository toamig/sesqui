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
 *  anonymously. Returns the current user (or null if backend unconfigured). */
export async function ensureSignedIn(): Promise<User | null> {
  const supabase = await getSupabase()
  if (!supabase) return null
  const { data } = await supabase.auth.getSession()
  if (data.session?.user) return data.session.user
  const { data: anon, error } = await supabase.auth.signInAnonymously()
  if (error) return null
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
