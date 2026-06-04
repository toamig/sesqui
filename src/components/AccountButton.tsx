// Persistent account button: a fixed avatar in the top-right of every screen.
// Tapping it opens the AccountDrawer overlay; it never navigates, so you keep
// your place (even mid-game). Shows the player's initial + rating once known.

import { isSupabaseConfigured } from '../online/auth'
import { useAuth } from '../online/useAuth'

interface AccountButtonProps {
  onOpen: () => void
}

export function AccountButton({ onOpen }: AccountButtonProps) {
  // Lazily resolve identity (anon sign-in) so the avatar can show a real
  // initial + rating; harmless when the backend is unconfigured.
  const auth = useAuth(isSupabaseConfigured)
  const initial = isSupabaseConfigured && auth.ready ? auth.label.charAt(0).toUpperCase() : null

  return (
    <button type="button" className="account-fab" onClick={onOpen} aria-label="Account">
      <span className="account-fab-avatar" aria-hidden>
        {initial ?? (
          <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="12" cy="8" r="3.4" />
            <path d="M5.5 19a6.5 6.5 0 0 1 13 0" />
          </svg>
        )}
      </span>
      {isSupabaseConfigured && auth.ready && auth.rating && (
        <span className="account-fab-rating">{auth.rating.rating}</span>
      )}
    </button>
  )
}
