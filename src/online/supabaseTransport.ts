// Supabase realtime transport (Layer 1 cross-device relay).
//
// Implements the same Transport contract as LocalTransport, but over a Supabase
// Realtime "broadcast" channel keyed by room code. Broadcast is the simplest
// realtime primitive: a pub/sub topic two clients join by name.
//
// Uses the ONE shared client (supabaseClient.ts) so realtime, auth, and the DB
// share a session. Before going online we ensure an (anonymous) identity exists,
// so every connection is tied to a real auth.uid().

import type { NetMessage } from './protocol'
import type { Transport, TransportFactory } from './transport'
import { getSupabase } from './supabaseClient'
import { ensureSignedIn } from './auth'

const EVENT = 'msg'

/** Supabase-backed transport factory using the shared client. */
export function createSupabaseTransport(): TransportFactory {
  return async (room: string): Promise<Transport> => {
    // Establish an identity (anonymous if not signed in) before connecting, so
    // RLS and seat ownership see auth.uid().
    await ensureSignedIn()
    const client = await getSupabase()
    if (!client) {
      throw new Error('Online backend not configured (missing Supabase keys).')
    }

    // Hand the CURRENT access token to the realtime socket right before
    // subscribing. On a cold first visit (invite link in a fresh browser) the
    // socket would otherwise try to authorise with no token and the first
    // channel subscribe is rejected ("Realtime channel timed out"). Doing it
    // here, immediately before channel creation, removes the race that made the
    // cold join intermittently fail.
    try {
      const { data } = await client.auth.getSession()
      const token = data.session?.access_token
      if (token) client.realtime.setAuth(token)
    } catch {
      // Non-fatal: broadcast still works; only RLS-bound features need the token.
    }

    // `self: false` means we never receive our own broadcasts (matches the
    // LocalTransport contract). Channel name namespaces the room.
    const topic = `sesqui-room-${room}`

    // Supabase rejects a second channel with the same topic, so a subscribe
    // hangs if a stale channel for this room is still attached (e.g. React
    // StrictMode mounts the connection effect twice, or a fast reconnect).
    // Remove any existing channel for this topic before creating a fresh one.
    for (const existing of client.getChannels()) {
      if (existing.topic === `realtime:${topic}` || existing.topic === topic) {
        await client.removeChannel(existing)
      }
    }

    const handlers = new Set<(msg: NetMessage) => void>()

    // Create + subscribe a channel, resolving the channel on SUBSCRIBED and
    // rejecting on error/timeout. Used with a one-time retry below.
    const trySubscribe = (perAttemptMs: number) =>
      new Promise<ReturnType<typeof client.channel>>((resolve, reject) => {
        const channel = client.channel(topic, { config: { broadcast: { self: false } } })
        channel.on('broadcast', { event: EVENT }, (payload: { payload: NetMessage }) => {
          for (const h of handlers) h(payload.payload)
        })
        const timer = setTimeout(() => reject(new Error('Realtime channel timed out')), perAttemptMs)
        channel.subscribe((s: string) => {
          if (s === 'SUBSCRIBED') {
            clearTimeout(timer)
            resolve(channel)
          } else if (s === 'CHANNEL_ERROR' || s === 'TIMED_OUT') {
            clearTimeout(timer)
            reject(new Error(`Realtime channel error: ${s}`))
          }
        })
      })

    // First attempt with a shorter budget; if the realtime socket wasn't yet
    // authorised on a cold first visit, the channel errors fast -- so we
    // re-apply auth, drop the dead channel, and retry once with the full budget.
    // This makes the cold invite-link join deterministic instead of racy.
    let channel: ReturnType<typeof client.channel>
    try {
      channel = await trySubscribe(5000)
    } catch {
      for (const existing of client.getChannels()) {
        if (existing.topic === `realtime:${topic}` || existing.topic === topic) {
          await client.removeChannel(existing)
        }
      }
      try {
        const { data } = await client.auth.getSession()
        if (data.session?.access_token) client.realtime.setAuth(data.session.access_token)
      } catch {
        // ignore; retry below
      }
      channel = await trySubscribe(10000)
    }

    return {
      send(msg: NetMessage) {
        void channel.send({ type: 'broadcast', event: EVENT, payload: msg })
      },
      onMessage(handler) {
        handlers.add(handler)
        return () => handlers.delete(handler)
      },
      close() {
        handlers.clear()
        void client.removeChannel(channel)
      },
    }
  }
}
