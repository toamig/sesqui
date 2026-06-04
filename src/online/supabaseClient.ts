// Shared Supabase client (Layer 3 foundation).
//
// Auth, database, and realtime MUST share ONE client instance: the client holds
// the auth session, and row-level security only sees the logged-in user
// (auth.uid()) on requests made through the same client that owns the session.
// Before this, gameStore and supabaseTransport each created their own client
// (the "Multiple GoTrueClient instances" warning) -- which would also mean RLS
// never saw the user. This singleton fixes both.
//
// Still lazy + dynamically imported: a player who only plays local/AI never
// loads @supabase/supabase-js. The client (and anonymous auth) initialise the
// first time the online flow asks for it.

import type { SupabaseClient } from '@supabase/supabase-js'

const url = import.meta.env.VITE_SUPABASE_URL as string | undefined
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined

/** True when backend keys are configured (online + auth available). */
export const isSupabaseConfigured = Boolean(url && anonKey)

let clientPromise: Promise<SupabaseClient | null> | null = null

/** The one shared client, created on first use. Returns null when unconfigured
 *  (the app then degrades to local-only / Layer 1 behaviour). */
export function getSupabase(): Promise<SupabaseClient | null> {
  if (!isSupabaseConfigured) return Promise.resolve(null)
  if (!clientPromise) {
    clientPromise = import('@supabase/supabase-js')
      .then((mod) =>
        mod.createClient(url as string, anonKey as string, {
          auth: {
            // Persist the session so an anonymous (or signed-in) identity
            // survives refreshes -- the basis for stable per-user seats.
            persistSession: true,
            autoRefreshToken: true,
            storageKey: 'sesqui-auth',
            // Parse the OAuth result on return from Google and establish the
            // session automatically.
            detectSessionInUrl: true,
            // PKCE returns a ?code= query param (not a #fragment), which is the
            // more secure flow and behaves better under a subpath like /sesqui/.
            flowType: 'pkce',
          },
          realtime: { params: { eventsPerSecond: 20 } },
        }),
      )
      .catch(() => null)
  }
  return clientPromise
}
