// Replay storage (cloud, Layer 3f). Save / list / load / delete a player's
// completed single-player games (vs the Neural AI) so they can study them move
// by move across devices. Per-user via RLS. Best-effort: a no-op when the
// backend is unconfigured or there is no identity yet.

import type { Action, Player } from '../game/types'
import { getSupabase } from './supabaseClient'

export type ReplayWinner = Player | 'draw'

/** Row metadata for the replays list (no move data). */
export interface ReplayMeta {
  id: number
  played_at: string
  /** 'ai' | 'friend' | 'casual' | 'ranked'. */
  mode: string
  /** Opponent display name ('Neural' for AI games). */
  opponent: string
  human_color: Player
  winner: ReplayWinner
  moves: number
}

/** A full replay including the atomic-action sequence to step through. */
export interface Replay extends ReplayMeta {
  actions: Action[]
}

/** Persist a finished game. Returns true on success. */
export async function saveReplay(r: {
  mode: string
  opponent: string
  humanColor: Player
  winner: ReplayWinner
  actions: Action[]
}): Promise<boolean> {
  const supabase = await getSupabase()
  if (!supabase) return false
  const { data: auth } = await supabase.auth.getUser()
  const uid = auth.user?.id
  if (!uid) return false
  const { error } = await supabase.from('replays').insert({
    user_id: uid,
    mode: r.mode,
    opponent: r.opponent,
    human_color: r.humanColor,
    winner: r.winner,
    moves: r.actions.length,
    actions: r.actions,
  })
  return !error
}

/** The current user's recent replays (metadata only), newest first. */
export async function myReplays(limit = 50): Promise<ReplayMeta[]> {
  const supabase = await getSupabase()
  if (!supabase) return []
  const { data: auth } = await supabase.auth.getUser()
  const uid = auth.user?.id
  if (!uid) return []
  const { data, error } = await supabase
    .from('replays')
    .select('id, played_at, mode, opponent, human_color, winner, moves')
    .eq('user_id', uid)
    .order('played_at', { ascending: false })
    .limit(limit)
  if (error || !data) return []
  return data as ReplayMeta[]
}

/** Load a single replay with its full action sequence. */
export async function getReplay(id: number): Promise<Replay | null> {
  const supabase = await getSupabase()
  if (!supabase) return null
  const { data, error } = await supabase.from('replays').select('*').eq('id', id).maybeSingle()
  if (error || !data) return null
  return data as Replay
}

/** Delete one of the current user's replays. */
export async function deleteReplay(id: number): Promise<boolean> {
  const supabase = await getSupabase()
  if (!supabase) return false
  const { error } = await supabase.from('replays').delete().eq('id', id)
  return !error
}
