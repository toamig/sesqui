// Match history client (Layer 3e). Read-only wrappers over the match_results
// table, which finish_game writes at settlement. The profile reads both the
// recent-games list and the aggregate counts from here, so the stat tiles and
// the history list always agree (both derive from the same rows).

import { getSupabase } from './supabaseClient'

/** One finished game from the current user's point of view. */
export interface MatchRow {
  id: number
  /** ISO timestamp the game was settled. */
  playedAt: string
  result: 'win' | 'loss'
  /** The opponent's display name at the time the game finished. */
  opponent: string
  /** Which colour the current user played ('V' or 'H'). */
  color: 'V' | 'H'
}

/** Aggregate record derived from match history (no Elo surfaced). */
export interface MatchStats {
  games: number
  wins: number
  losses: number
}

interface RawMatch {
  id: number
  played_at: string
  winner_color: 'V' | 'H'
  v_user: string | null
  h_user: string | null
  v_name: string | null
  h_name: string | null
}

/** The current user's recent finished games, newest first. */
export async function myMatches(limit = 20): Promise<MatchRow[]> {
  const supabase = await getSupabase()
  if (!supabase) return []
  const { data: auth } = await supabase.auth.getUser()
  const uid = auth.user?.id
  if (!uid) return []

  const { data, error } = await supabase
    .from('match_results')
    .select('id, played_at, winner_color, v_user, h_user, v_name, h_name')
    .or(`v_user.eq.${uid},h_user.eq.${uid}`)
    .order('played_at', { ascending: false })
    .limit(limit)
  if (error || !data) return []

  return (data as RawMatch[]).map((r) => {
    const iAmV = r.v_user === uid
    const color: 'V' | 'H' = iAmV ? 'V' : 'H'
    const opponent = (iAmV ? r.h_name : r.v_name) ?? 'Player'
    const result: 'win' | 'loss' = r.winner_color === color ? 'win' : 'loss'
    return { id: r.id, playedAt: r.played_at, result, opponent, color }
  })
}

/** Total / won / lost counts across all of the current user's finished games. */
export async function myMatchStats(): Promise<MatchStats> {
  const empty: MatchStats = { games: 0, wins: 0, losses: 0 }
  const supabase = await getSupabase()
  if (!supabase) return empty
  const { data: auth } = await supabase.auth.getUser()
  const uid = auth.user?.id
  if (!uid) return empty

  // Two head-only count queries (no rows fetched): total games, and games won.
  const total = await supabase
    .from('match_results')
    .select('*', { count: 'exact', head: true })
    .or(`v_user.eq.${uid},h_user.eq.${uid}`)
  const won = await supabase
    .from('match_results')
    .select('*', { count: 'exact', head: true })
    .or(`and(v_user.eq.${uid},winner_color.eq.V),and(h_user.eq.${uid},winner_color.eq.H)`)

  const games = total.count ?? 0
  const wins = won.count ?? 0
  return { games, wins, losses: Math.max(0, games - wins) }
}
