// Per-browser seat tokens.
//
// Layer 2 lets a player refresh or reconnect and reclaim THEIR colour (not a
// random one), and lets a third visitor become a spectator. That needs a stable
// per-browser identity that is NOT the ephemeral peer id (which is new every
// mount). We persist one opaque token per browser in localStorage; the game row
// records which token holds each seat (v_token / h_token). On load we match our
// token against the row to decide: resume as V, resume as H, or spectate.

import { ensureSignedIn } from './auth'
import { isSupabaseConfigured } from './supabaseClient'

const STORAGE_KEY = 'sesqui-seat-token'

/**
 * The identity that holds a seat. When auth is configured this is the user's
 * auth.uid() (stable across devices once they sign in, and verifiable by RLS).
 * When unconfigured (local-test mode) it falls back to the per-browser
 * localStorage token, so two-tab play still works without a backend.
 */
export async function resolveSeatToken(): Promise<string> {
  if (isSupabaseConfigured) {
    const user = await ensureSignedIn()
    if (user) return user.id
  }
  return getSeatToken()
}

/** A stable opaque token for this browser, created once and reused. Used as the
 *  seat identity only in local-test mode (no auth backend). */
export function getSeatToken(): string {
  try {
    const existing = localStorage.getItem(STORAGE_KEY)
    if (existing) return existing
    const c = globalThis.crypto as Crypto & { randomUUID?: () => string }
    const token = c.randomUUID ? c.randomUUID() : `seat-${Math.random().toString(36).slice(2)}`
    localStorage.setItem(STORAGE_KEY, token)
    return token
  } catch {
    // Private mode / storage disabled: fall back to a session-only token. The
    // player just won't reclaim a seat across reloads, which degrades to Layer 1
    // behaviour rather than breaking.
    const c = globalThis.crypto as Crypto & { randomUUID?: () => string }
    return c.randomUUID ? c.randomUUID() : `seat-${Math.random().toString(36).slice(2)}`
  }
}
