// Online backend configuration.
//
// Reads Supabase credentials from Vite env vars. These are PUBLIC by design
// (the anon key is meant to ship in client code and is safe in a public repo;
// row-level security, added at Layer 3, is what actually guards data). When the
// vars are absent -- the default today -- the app falls back to the local
// BroadcastChannel transport so two tabs can still play.
//
// To go cross-device later, create a free Supabase project and set, in a
// .env.local file at the project root (NOT committed):
//   VITE_SUPABASE_URL=https://xxxx.supabase.co
//   VITE_SUPABASE_ANON_KEY=eyJ...
// then restart the dev server / rebuild.

import { createLocalTransport, type TransportFactory } from './transport'
import { createSupabaseTransport } from './supabaseTransport'

const url = import.meta.env.VITE_SUPABASE_URL as string | undefined
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined

/** True when real backend keys are configured (cross-device play available). */
export const isOnlineConfigured = Boolean(url && anonKey)

/** The transport the app should use: Supabase when configured, else local. */
export const transportFactory: TransportFactory = isOnlineConfigured
  ? createSupabaseTransport(url as string, anonKey as string)
  : createLocalTransport

/** Short label for the UI to explain the current networking mode. */
export const onlineModeLabel = isOnlineConfigured
  ? 'Online (cross-device)'
  : 'Local test (same browser, two tabs)'
