// Tournaments client (Layer 4, Phase 1: lobby).
//
// Thin wrappers over the tournament RPCs + reads. Creating/joining requires a
// real signed-in account (enforced server-side). Reads are open by code. The
// bracket (matches + advancement) arrives in Phase 2.

import { getSupabase } from './supabaseClient'

export type TournamentStatus = 'lobby' | 'active' | 'complete'

export interface Tournament {
  code: string
  name: string
  host_user: string
  format: string
  match_length: number
  size: number
  status: TournamentStatus
  champion: string | null
}

export interface TournamentPlayer {
  user_id: string
  display_name: string | null
  seed: number | null
  eliminated_round: number | null
}

/** Create a lobby and auto-join as host. Returns the share code, or null. */
export async function createTournament(name: string, size: number): Promise<string | null> {
  const client = await getSupabase()
  if (!client) return null
  const { data, error } = await client.rpc('create_tournament', { p_name: name, p_size: size })
  if (error || !data) return null
  return data as string
}

export interface JoinResult {
  ok: boolean
  error?: string
  already?: boolean
}

/** Join an open lobby (idempotent). */
export async function joinTournament(code: string): Promise<JoinResult> {
  const client = await getSupabase()
  if (!client) return { ok: false, error: 'offline' }
  const { data, error } = await client.rpc('join_tournament', { p_code: code })
  if (error || !data) return { ok: false, error: 'offline' }
  return data as JoinResult
}

/** Leave a lobby; if the host leaves, the lobby is cancelled. Best-effort. */
export async function leaveTournament(code: string): Promise<void> {
  const client = await getSupabase()
  if (!client) return
  await client.rpc('leave_tournament', { p_code: code })
}

/** Fetch a tournament by code, or null. */
export async function getTournament(code: string): Promise<Tournament | null> {
  const client = await getSupabase()
  if (!client) return null
  const { data, error } = await client.from('tournaments').select('*').eq('code', code).maybeSingle()
  if (error || !data) return null
  return data as Tournament
}

export interface TournamentMatch {
  id: number
  round: number
  slot: number
  player_a: string | null
  player_b: string | null
  a_color: string | null
  game_code: string | null
  winner: string | null
  status: 'pending' | 'ready' | 'playing' | 'done'
}

export interface StartResult {
  ok: boolean
  error?: string
  players?: number
  rounds?: number
}

/** Host-only: seed the bracket and start round 1. */
export async function startTournament(code: string): Promise<StartResult> {
  const client = await getSupabase()
  if (!client) return { ok: false, error: 'offline' }
  const { data, error } = await client.rpc('start_tournament', { p_code: code })
  if (error || !data) return { ok: false, error: 'offline' }
  return data as StartResult
}

/** Fetch all bracket matches, ordered by round then slot. */
export async function getMatches(code: string): Promise<TournamentMatch[]> {
  const client = await getSupabase()
  if (!client) return []
  const { data, error } = await client
    .from('tournament_matches')
    .select('id, round, slot, player_a, player_b, a_color, game_code, winner, status')
    .eq('tournament_code', code)
    .order('round')
    .order('slot')
  if (error || !data) return []
  return data as TournamentMatch[]
}

/** Fetch the roster (join order). */
export async function getPlayers(code: string): Promise<TournamentPlayer[]> {
  const client = await getSupabase()
  if (!client) return []
  const { data, error } = await client
    .from('tournament_players')
    .select('user_id, display_name, seed, eliminated_round')
    .eq('tournament_code', code)
    .order('joined_at')
  if (error || !data) return []
  return data as TournamentPlayer[]
}
