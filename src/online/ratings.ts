// Ratings client (Layer 3d). Thin wrappers over the server-authoritative
// finish_game RPC and the read-only leaderboard. The client never computes or
// writes a score -- it asks the server to settle a finished game and reads
// results back.

import { getSupabase } from './supabaseClient'

export interface RatingDelta {
  ok: boolean
  winner?: 'V' | 'H'
  rated?: boolean
  already?: boolean
  error?: string
  v?: { old: number; new: number }
  h?: { old: number; new: number }
}

export interface LeaderRow {
  user_id: string
  rating: number
  wins: number
  losses: number
  games: number
  display_name: string | null
}

/** Ask the server to settle a finished game: verify the win and apply Elo.
 *  Idempotent server-side, so calling more than once is safe. */
export async function settleGame(code: string): Promise<RatingDelta | null> {
  const supabase = await getSupabase()
  if (!supabase) return null
  const { data, error } = await supabase.rpc('finish_game', { p_code: code })
  if (error) return { ok: false, error: error.message }
  return data as RatingDelta
}

/** The current user's rating row, or null if unrated / unconfigured. */
export async function myRating(): Promise<{ rating: number; wins: number; losses: number } | null> {
  const supabase = await getSupabase()
  if (!supabase) return null
  const { data: auth } = await supabase.auth.getUser()
  if (!auth.user) return null
  const { data, error } = await supabase
    .from('ratings')
    .select('rating, wins, losses')
    .eq('user_id', auth.user.id)
    .maybeSingle()
  if (error || !data) return null
  return data as { rating: number; wins: number; losses: number }
}

/** Top players by rating, joined to their display names. */
export async function leaderboard(limit = 20): Promise<LeaderRow[]> {
  const supabase = await getSupabase()
  if (!supabase) return []
  // Two reads (no FK between ratings and profiles by design); join client-side.
  const { data: rows, error } = await supabase
    .from('ratings')
    .select('user_id, rating, wins, losses, games')
    .order('rating', { ascending: false })
    .limit(limit)
  if (error || !rows) return []
  const ids = rows.map((r) => r.user_id)
  const { data: profs } = await supabase
    .from('profiles')
    .select('id, display_name')
    .in('id', ids)
  const names = new Map((profs ?? []).map((p) => [p.id, p.display_name]))
  return rows.map((r) => ({ ...r, display_name: names.get(r.user_id) ?? null }) as LeaderRow)
}
