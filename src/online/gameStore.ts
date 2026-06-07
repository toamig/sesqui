// Durable game store (Layer 2).
//
// Persists each online game to a Supabase Postgres row so games survive a
// refresh, support reconnect, and allow spectators. Live moves still flow over
// Realtime Broadcast (Layer 1); this store is the durable backstop that clients
// hydrate from on load and write through to on every action.
//
// Written so the app COMPILES AND RUNS without Supabase configured: the client
// is created lazily and only when keys exist. When unconfigured, every method is
// a no-op returning null/false, so the online flow gracefully degrades to
// in-memory Layer 1 behaviour.

import type { Action, GameState, Player } from '../game/types'
import { getSupabase, isSupabaseConfigured } from './supabaseClient'

/** One persisted game row, mirroring the public.games table. */
export interface GameRow {
  code: string
  game_id: number
  state: GameState
  seq: number
  host_color: Player
  v_token: string | null
  h_token: string | null
  /** Durable atomic-action log, for building replays. */
  actions?: Action[]
  /** Online mode label ('friend' | 'casual' | 'ranked'). */
  mode?: string
}

/** Seat a token can hold when it (re)joins a room. */
export type Seat = Player | 'spectator'

/** True when the durable store is available (keys present). */
export const isStoreConfigured = isSupabaseConfigured

const TABLE = 'games'

// Uses the ONE shared client (see supabaseClient.ts) so DB writes carry the auth
// session and row-level security sees auth.uid().
const getClient = getSupabase

/** Fetch a game row by room code, or null if it doesn't exist / store is off. */
export async function loadGame(code: string): Promise<GameRow | null> {
  const client = await getClient()
  if (!client) return null
  const { data, error } = await client.from(TABLE).select('*').eq('code', code).maybeSingle()
  if (error || !data) return null
  return data as GameRow
}

/** Create a fresh game row for a host. Returns false if the row already exists
 *  (someone else created it) or the store is off. */
export async function createGame(row: {
  code: string
  gameId: number
  state: GameState
  hostColor: Player
  hostToken: string
}): Promise<boolean> {
  const client = await getClient()
  if (!client) return false
  const { error } = await client.from(TABLE).insert({
    code: row.code,
    game_id: row.gameId,
    state: row.state,
    seq: 0,
    host_color: row.hostColor,
    v_token: row.hostColor === 'V' ? row.hostToken : null,
    h_token: row.hostColor === 'H' ? row.hostToken : null,
  })
  return !error
}

/** Reset an existing row to a fresh game (rematch): bump game_id, reset state +
 *  seq. By default seats are kept; with `swapColors` the two players trade sides.
 *  Best-effort.
 *
 *  Also clears the settlement marker (settled_at / winner_color) so the NEW game
 *  settles and records its own match-history row when it ends. Safe: the board
 *  is reset to empty here too, so a re-settle of the old generation can't double
 *  count (finish_game finds no connection on an empty board).
 *
 *  `swapColors` exchanges v_token <-> h_token and flips host_color, so a friend
 *  rematch rotates colours durably. This MUST move the seat tokens, not just the
 *  clients' local colours: finish_game maps each seat token to a colour, so a
 *  client-only swap would settle the new game (winner, Elo, replays) under the
 *  old colours. */
export async function resetGame(args: {
  code: string
  gameId: number
  state: GameState
  swapColors?: boolean
}): Promise<void> {
  const client = await getClient()
  if (!client) return
  const patch: Record<string, unknown> = {
    game_id: args.gameId,
    state: args.state,
    seq: 0,
    settled_at: null,
    winner_color: null,
    actions: [],
  }
  if (args.swapColors) {
    const row = await loadGame(args.code)
    if (row) {
      patch.v_token = row.h_token
      patch.h_token = row.v_token
      patch.host_color = row.host_color === 'V' ? 'H' : 'V'
    }
  }
  await client.from(TABLE).update(patch).eq('code', args.code)
}

/** Persist the latest state + seq after an action. Best-effort: a failed write
 *  never blocks live play (broadcast already delivered the move). */
export async function saveState(code: string, state: GameState, seq: number): Promise<void> {
  const client = await getClient()
  if (!client) return
  await client.from(TABLE).update({ state, seq }).eq('code', code)
}

/** Persist the latest state + seq AND append this action to the durable move log
 *  (server-side append via RPC), so finish_game can build a replay from the full
 *  sequence regardless of refreshes. Best-effort, like saveState. */
export async function recordMove(
  code: string,
  action: Action,
  state: GameState,
  seq: number,
): Promise<void> {
  const client = await getClient()
  if (!client) return
  await client.rpc('record_move', { p_code: code, p_action: action, p_state: state, p_seq: seq })
}

/** Claim an open seat for a token. Returns the seat the caller holds:
 *  - token already seated -> that seat (reconnect)
 *  - an open seat exists   -> claim and return it
 *  - both seats taken      -> 'spectator'
 *  Returns null only when the store is off or the row is missing. */
export async function claimSeat(code: string, token: string): Promise<Seat | null> {
  const client = await getClient()
  if (!client) return null
  const row = await loadGame(code)
  if (!row) return null

  if (row.v_token === token) return 'V'
  if (row.h_token === token) return 'H'

  if (row.v_token === null) {
    const { error } = await client.from(TABLE).update({ v_token: token }).eq('code', code)
    return error ? 'spectator' : 'V'
  }
  if (row.h_token === null) {
    const { error } = await client.from(TABLE).update({ h_token: token }).eq('code', code)
    return error ? 'spectator' : 'H'
  }
  return 'spectator'
}

/**
 * Release a seat held by `token` when a player *explicitly* leaves (the "Leave
 * room" button -- NOT a tab close or refresh, which must preserve the seat so
 * the player can reclaim it). Frees the matching seat; if that leaves the room
 * with no seated players, deletes the row entirely so abandoned games don't
 * accumulate.
 *
 * Re-reads the row immediately before deciding, so two players leaving at once
 * resolve correctly: whoever sees the last empty seat triggers the delete.
 */
export async function releaseSeat(code: string, token: string): Promise<void> {
  const client = await getClient()
  if (!client) return
  const row = await loadGame(code)
  if (!row) return

  const isV = row.v_token === token
  const isH = row.h_token === token
  if (!isV && !isH) return // not seated here (e.g. spectator) -> nothing to free

  // Would the room be empty once this seat is freed?
  const otherSeatEmpty = isV ? row.h_token === null : row.v_token === null
  if (otherSeatEmpty) {
    // Both seats now vacant -> reap the room.
    await client.from(TABLE).delete().eq('code', code)
    return
  }
  // Opponent still holds their seat -> just free ours; they can return.
  const patch = isV ? { v_token: null } : { h_token: null }
  await client.from(TABLE).update(patch).eq('code', code)
}
