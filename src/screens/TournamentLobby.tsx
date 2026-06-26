// Tournament lobby (Phase 1): share the code, watch the roster fill, leave.
// The host's "Start" is stubbed until the bracket engine (Phase 2) lands.

import { useEffect, useState } from 'react'
import { useAuth } from '../online/useAuth'
import {
  getPlayers,
  getTournament,
  leaveTournament,
  type Tournament,
  type TournamentPlayer,
} from '../online/tournaments'

interface TournamentLobbyProps {
  code: string
  /** Left or the lobby was cancelled: return to the tournament hub. */
  onLeave: () => void
}

export function TournamentLobby({ code, onLeave }: TournamentLobbyProps) {
  const auth = useAuth(true)
  const [tournament, setTournament] = useState<Tournament | null | undefined>(undefined)
  const [players, setPlayers] = useState<TournamentPlayer[]>([])
  const [copied, setCopied] = useState(false)

  // Poll the lobby so the roster fills live as players join.
  useEffect(() => {
    let active = true
    const tick = () => {
      void getTournament(code).then((t) => {
        if (active) setTournament(t)
      })
      void getPlayers(code).then((p) => {
        if (active) setPlayers(p)
      })
    }
    tick()
    const id = setInterval(tick, 3000)
    return () => {
      active = false
      clearInterval(id)
    }
  }, [code])

  const leave = async () => {
    await leaveTournament(code)
    onLeave()
  }

  const copy = () => {
    void navigator.clipboard?.writeText(code)
    setCopied(true)
    setTimeout(() => setCopied(false), 1500)
  }

  if (tournament === undefined) {
    return (
      <main className="tournament-lobby">
        <p className="t-note">Loading…</p>
      </main>
    )
  }

  if (tournament === null) {
    return (
      <main className="tournament-lobby">
        <div className="screen-topbar">
          <button type="button" className="icon-back" onClick={onLeave} aria-label="Back">
            <span aria-hidden>←</span> Tournaments
          </button>
          <span className="screen-title">Tournament</span>
          <span className="topbar-spacer" aria-hidden />
        </div>
        <p className="t-note">This tournament no longer exists. The host may have cancelled it.</p>
      </main>
    )
  }

  const isHost = auth.user?.id === tournament.host_user
  const empties = Math.max(0, tournament.size - players.length)

  return (
    <main className="tournament-lobby">
      <div className="screen-topbar">
        <button type="button" className="icon-back" onClick={leave} aria-label="Leave">
          <span aria-hidden>←</span> {isHost ? 'Cancel' : 'Leave'}
        </button>
        <span className="screen-title">{tournament.name}</span>
        <span className="topbar-spacer" aria-hidden />
      </div>

      <div className="t-share">
        <span className="t-share-label">Invite code</span>
        <span className="t-share-code">{tournament.code}</span>
        <button type="button" className="btn btn-sm" onClick={copy}>
          {copied ? 'Copied' : 'Copy'}
        </button>
      </div>

      <div className="t-roster">
        <div className="t-roster-head">
          <span>Players</span>
          <span className="t-count">
            {players.length} / {tournament.size}
          </span>
        </div>
        <ul className="t-roster-list">
          {players.map((p) => (
            <li key={p.user_id}>
              <span className="t-dot" aria-hidden />
              <span className="t-name">{p.display_name || 'Player'}</span>
              {p.user_id === tournament.host_user && <span className="t-host-tag">host</span>}
            </li>
          ))}
          {Array.from({ length: empties }).map((_, i) => (
            <li key={`empty-${i}`} className="t-empty">
              <span className="t-dot t-dot-empty" aria-hidden />
              Waiting for a player…
            </li>
          ))}
        </ul>
      </div>

      {isHost ? (
        <button
          type="button"
          className="btn btn-primary"
          disabled
          title="Bracket play arrives in the next update"
        >
          Start tournament (coming soon)
        </button>
      ) : (
        <p className="t-note">Waiting for the host to start the tournament.</p>
      )}
    </main>
  )
}
