// Profile access (display name). Thin wrapper over the profiles table using the
// shared authed client. All best-effort: a missing table or unconfigured backend
// returns null and the UI falls back to "Guest".

import { getSupabase } from './supabaseClient'

export interface Profile {
  id: string
  display_name: string | null
  /** Server-controlled admin flag; unlocks admin-only UI. */
  is_admin: boolean
}

/** Load the signed-in user's profile row (null if none / unconfigured). Uses
 *  select('*') so it tolerates the is_admin column not existing yet (older DB). */
export async function loadMyProfile(): Promise<Profile | null> {
  const supabase = await getSupabase()
  if (!supabase) return null
  const { data: auth } = await supabase.auth.getUser()
  if (!auth.user) return null
  const { data, error } = await supabase
    .from('profiles')
    .select('*')
    .eq('id', auth.user.id)
    .maybeSingle()
  if (error || !data) return null
  const row = data as { id: string; display_name: string | null; is_admin?: boolean }
  return { id: row.id, display_name: row.display_name ?? null, is_admin: row.is_admin === true }
}

/** Set the signed-in user's display name. Upserts so it works even if the
 *  auto-create trigger has not run yet. */
export async function setDisplayName(name: string): Promise<{ ok: boolean; error?: string }> {
  const supabase = await getSupabase()
  if (!supabase) return { ok: false, error: 'Backend not configured' }
  const { data: auth } = await supabase.auth.getUser()
  if (!auth.user) return { ok: false, error: 'Not signed in' }
  const clean = name.trim().slice(0, 24)
  if (!clean) return { ok: false, error: 'Name is empty' }
  const { error } = await supabase
    .from('profiles')
    .upsert({ id: auth.user.id, display_name: clean }, { onConflict: 'id' })
  return error ? { ok: false, error: error.message } : { ok: true }
}
