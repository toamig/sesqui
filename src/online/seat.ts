// Per-browser seat tokens.
//
// Layer 2 lets a player refresh or reconnect and reclaim THEIR colour (not a
// random one), and lets a third visitor become a spectator. That needs a stable
// per-browser identity that is NOT the ephemeral peer id (which is new every
// mount). We persist one opaque token per browser in localStorage; the game row
// records which token holds each seat (v_token / h_token). On load we match our
// token against the row to decide: resume as V, resume as H, or spectate.

const STORAGE_KEY = 'sesqui-seat-token'

/** A stable opaque token for this browser, created once and reused. */
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
