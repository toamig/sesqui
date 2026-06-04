// React binding for auth + profile state. Establishes an (anonymous) identity
// on mount, tracks sign-in/upgrade changes, and exposes the display name.

import { useCallback, useEffect, useState } from 'react'
import type { User } from '@supabase/supabase-js'
import {
  ensureSignedIn,
  isAnonymous,
  isSupabaseConfigured,
  onAuthChange,
  userLabel,
} from './auth'
import { loadMyProfile } from './profile'

export interface AuthState {
  /** True once an identity (anon or real) is established. */
  ready: boolean
  user: User | null
  /** True when signed in but not yet upgraded to a permanent account. */
  anonymous: boolean
  /** Display name, else email handle, else "Guest". */
  label: string
  /** Re-pull the profile (after setting a display name). */
  refreshProfile: () => void
}

export function useAuth(active: boolean): AuthState {
  const [ready, setReady] = useState(!isSupabaseConfigured)
  const [user, setUser] = useState<User | null>(null)
  const [profileName, setProfileName] = useState<string | null>(null)

  const refreshProfile = useCallback(() => {
    loadMyProfile().then((p) => setProfileName(p?.display_name ?? null))
  }, [])

  useEffect(() => {
    if (!active || !isSupabaseConfigured) return
    let unsub: (() => void) | undefined
    let cancelled = false

    ensureSignedIn().then((u) => {
      if (cancelled) return
      setUser(u)
      setReady(true)
      refreshProfile()
    })
    onAuthChange((u) => {
      if (cancelled) return
      setUser(u)
      refreshProfile()
    }).then((fn) => {
      if (cancelled) fn()
      else unsub = fn
    })

    return () => {
      cancelled = true
      unsub?.()
    }
  }, [active, refreshProfile])

  return {
    ready,
    user,
    anonymous: isAnonymous(user),
    label: userLabel(user, profileName),
    refreshProfile,
  }
}
