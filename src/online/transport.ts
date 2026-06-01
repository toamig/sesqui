// Transport abstraction.
//
// The netcode (useOnlineGame) talks ONLY to this interface, never to a concrete
// backend. Today we ship a LocalTransport built on BroadcastChannel so two tabs
// on the same machine form a real room -- enough to build and verify the entire
// online flow with zero accounts or infrastructure. A SupabaseTransport
// implementing the same three-method contract drops in later (see
// supabaseTransport.ts) and the game code does not change.

import type { NetMessage } from './protocol'

/** A live connection to one room. Minimal on purpose: send, subscribe, close. */
export interface Transport {
  /** Broadcast a message to everyone else in the room. */
  send(msg: NetMessage): void
  /** Register a handler for inbound messages. Returns an unsubscribe fn. */
  onMessage(handler: (msg: NetMessage) => void): () => void
  /** Tear down the connection and release resources. */
  close(): void
}

/** Factory signature: given a room code, return a connected Transport. Async so
 *  the Supabase version can await channel subscription before first send. */
export type TransportFactory = (room: string) => Promise<Transport>

/**
 * LocalTransport: a same-origin, same-browser room over BroadcastChannel.
 * Two tabs that open the same room code can play each other. Perfect for
 * development and for the "open a second tab" manual test. Does NOT work across
 * devices -- that's exactly what swapping in the Supabase transport buys us.
 */
export class LocalTransport implements Transport {
  private channel: BroadcastChannel
  private handlers = new Set<(msg: NetMessage) => void>()

  constructor(room: string) {
    this.channel = new BroadcastChannel(`sesqui-room-${room}`)
    this.channel.onmessage = (e: MessageEvent<NetMessage>) => {
      for (const h of this.handlers) h(e.data)
    }
  }

  send(msg: NetMessage): void {
    // BroadcastChannel does not echo to the sender, which matches the contract
    // (send = "to everyone else"). Peers still filter by `from` for safety.
    this.channel.postMessage(msg)
  }

  onMessage(handler: (msg: NetMessage) => void): () => void {
    this.handlers.add(handler)
    return () => this.handlers.delete(handler)
  }

  close(): void {
    this.handlers.clear()
    this.channel.onmessage = null
    this.channel.close()
  }
}

/** Default factory used until real backend keys are configured. */
export const createLocalTransport: TransportFactory = async (room) =>
  new LocalTransport(room)
