// Casual matchmaking client (Layer 2.5).
//
// Thin wrappers over the server-side matchmaking RPCs. The games table doubles
// as the queue: find_casual_match either pairs you with a waiting player (with
// colours balanced server-side) or parks you as the seeker. While parked, the
// client polls poll_wait, which heartbeats the row and reports when a partner
// arrives. cancel_wait drops an abandoned search.
//
// Everything degrades to a no-op when Supabase is unconfigured, matching the
// rest of the online layer.

import { getSupabase } from './supabaseClient'
import type { GameState, Player } from '../game/types'

export interface MatchResult {
  code: string
  /** 'guest' => paired, the game is on. 'host' => parked, keep polling. */
  role: 'host' | 'guest'
  /** The caller's colour, or null while still waiting. */
  color: Player | null
}

export type WaitStatus =
  | { status: 'waiting' }
  | { status: 'matched'; color: Player }
  | { status: 'gone' }

/** Join a waiting casual game or create one. Returns null if the store is off,
 *  the caller isn't a signed-in (non-anonymous) account, or the RPC failed. */
export async function findCasualMatch(state: GameState): Promise<MatchResult | null> {
  const client = await getSupabase()
  if (!client) return null
  const { data, error } = await client.rpc('find_casual_match', { p_state: state })
  if (error || !data) return null
  const d = data as { ok?: boolean; code?: string; role?: 'host' | 'guest'; color?: Player | null }
  if (!d.ok || !d.code || !d.role) return null
  return { code: d.code, role: d.role, color: d.color ?? null }
}

/** Heartbeat + pairing check for a parked seeker. */
export async function pollWait(code: string): Promise<WaitStatus> {
  const client = await getSupabase()
  if (!client) return { status: 'gone' }
  const { data, error } = await client.rpc('poll_wait', { p_code: code })
  if (error || !data) return { status: 'gone' }
  return data as WaitStatus
}

/** Drop our waiting row when we abandon the search. Best-effort. */
export async function cancelWait(code: string): Promise<void> {
  const client = await getSupabase()
  if (!client) return
  await client.rpc('cancel_wait', { p_code: code })
}
