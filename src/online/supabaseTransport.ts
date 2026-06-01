// Supabase realtime transport (Layer 1 cross-device relay).
//
// Implements the same Transport contract as LocalTransport, but over a Supabase
// Realtime "broadcast" channel keyed by room code. Broadcast is the simplest
// realtime primitive: no database, no auth, just a pub/sub topic two clients
// join by name. That is all Layer 1 needs.
//
// This file is written so the app COMPILES AND RUNS without @supabase/supabase-js
// installed: the import is dynamic and only happens when keys are configured.
// To enable cross-device play:
//   1. npm install @supabase/supabase-js
//   2. set VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY (see config.ts)
//   3. rebuild. The factory below then connects real channels.

import type { NetMessage } from './protocol'
import type { Transport, TransportFactory } from './transport'

const EVENT = 'msg'

/** Build a Supabase-backed transport factory bound to the given credentials. */
export function createSupabaseTransport(url: string, anonKey: string): TransportFactory {
  return async (room: string): Promise<Transport> => {
    // Dynamic import keeps @supabase/supabase-js fully optional: bundlers only
    // pull it when this code path runs (i.e. when keys exist).
    const mod = await import('@supabase/supabase-js').catch(() => {
      throw new Error(
        'Online backend selected but @supabase/supabase-js is not installed. Run: npm install @supabase/supabase-js',
      )
    })
    const client = mod.createClient(url, anonKey, {
      realtime: { params: { eventsPerSecond: 20 } },
    })

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
