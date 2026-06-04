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

    // `self: false` means we never receive our own broadcasts (matches the
    // LocalTransport contract). Channel name namespaces the room.
    const channel = client.channel(`sesqui-room-${room}`, {
      config: { broadcast: { self: false } },
    })

    const handlers = new Set<(msg: NetMessage) => void>()
    channel.on('broadcast', { event: EVENT }, (payload: { payload: NetMessage }) => {
      for (const h of handlers) h(payload.payload)
    })

    await new Promise<void>((resolve, reject) => {
      const timeout = setTimeout(() => reject(new Error('Realtime channel timed out')), 10000)
      channel.subscribe((s: string) => {
        if (s === 'SUBSCRIBED') {
          clearTimeout(timeout)
          resolve()
        } else if (s === 'CHANNEL_ERROR' || s === 'TIMED_OUT') {
          clearTimeout(timeout)
          reject(new Error(`Realtime channel error: ${s}`))
        }
      })
    })

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
