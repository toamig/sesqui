// Wire protocol for online play.
//
// The whole design leans on one fact about Sesqui: the game is fully
// deterministic. From createInitialState(), replaying the same ordered list of
// Actions yields byte-identical state on every client. So online play does not
// need to ship board state around at all -- it only relays each atomic Action
// plus a sequence number, and every peer replays it through the existing rules
// engine. State is the safety net (resync), not the channel.

import type { Action, GameState, Player } from '../game/types'

/** Whoever created the room is the host; the joiner is the guest. The host owns
 *  the colour assignment and the game id (so rematches have a single author). */
export type Role = 'host' | 'guest'

/** Messages exchanged on a room channel. `from` is the sender's peer id so a
 *  client can ignore any echo of its own traffic. */
export type NetMessage =
  // Heartbeat + presence. Host hellos also carry the colour/game id so a guest
  // can bootstrap a game from a hello alone, even if it missed the `start`.
  | { t: 'hello'; from: string; role: Role; hostColor?: Player; gameId?: number }
  // Explicit "(re)start this game id" with the host's colour. Idempotent: a peer
  // that has already adopted this gameId ignores duplicates.
  | { t: 'start'; from: string; hostColor: Player; gameId: number }
  // One atomic action, tagged with its index in the global move order and a hash
  // of the state it should produce (cheap divergence check).
  | { t: 'action'; from: string; gameId: number; seq: number; action: Action; hash: number }
  // Full-state answer to a resync request (used only when a peer falls behind).
  | { t: 'state'; from: string; gameId: number; seq: number; state: GameState }
  // "I'm behind, someone send me the authoritative state."
  | { t: 'resync'; from: string; gameId: number }
  // Guest asking the host to start a fresh game (host is the gameId author).
  | { t: 'rematch'; from: string }
  // Graceful leave (tab close / mode switch) so the opponent sees it instantly.
  | { t: 'bye'; from: string }

/** Unambiguous room-code alphabet: no I/L/O/0/1 to avoid misreads when shared
 *  over chat or read aloud. */
const CODE_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789'

/** A short, shareable, case-insensitive-friendly room code (default 5 chars). */
export function makeRoomCode(length = 5): string {
  const bytes = new Uint32Array(length)
  crypto.getRandomValues(bytes)
  let out = ''
  for (let i = 0; i < length; i++) out += CODE_ALPHABET[bytes[i] % CODE_ALPHABET.length]
  return out
}

/** Normalise user-typed room codes (trim, uppercase, strip stray chars). */
export function normalizeRoomCode(raw: string): string {
  return raw
    .toUpperCase()
    .split('')
    .filter((ch) => CODE_ALPHABET.includes(ch))
    .join('')
}

/** A unique id for this browser context, used to ignore our own echoed traffic. */
export function makePeerId(): string {
  const c = globalThis.crypto as Crypto & { randomUUID?: () => string }
  return c.randomUUID ? c.randomUUID() : makeRoomCode(10)
}

/** FNV-1a hash of the meaningful game state. Two peers that applied the same
 *  action list must agree on this; a mismatch means they have diverged. */
export function hashState(s: GameState): number {
  let h = 2166136261 >>> 0
  const mix = (n: number) => {
    h ^= n & 0xff
    h = Math.imul(h, 16777619) >>> 0
  }
  for (let i = 0; i < s.board.length; i++) {
    const cell = s.board[i]
    mix(cell === 'V' ? 1 : cell === 'H' ? 2 : 0)
  }
  mix(s.current === 'V' ? 1 : 2)
  mix(s.turn)
  mix(s.placementsLeft)
  mix(s.movesLeft)
  return h >>> 0
}
