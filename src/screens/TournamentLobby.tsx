// Tournament room: the lobby while gathering, the live bracket once started.
// One screen keyed by code; it switches on the tournament's status.

import { useEffect, useState } from 'react'
import { useAuth } from '../online/useAuth'
import {
  getMatches,
  getPlayers,
  getTournament,
  leaveTournament,
  startTournament,
  type Tournament,
  type TournamentMatch,
  type TournamentPlayer,
} from '../online/tournaments'
import { TournamentBracket } from './TournamentBracket'

interface TournamentLobbyProps {
  code: string
  /** Left or the lobby was cancelled: return to the tournament hub. */
  onLeave: () => void
  /** Enter the viewer's own ready match. */
  onPlayMatch: (gameCode: string, role: 'host' | 'guest') => void
  /** Spectate a live match. */
  onWatchMatch: (gameCode: string) => void
}

const VALID_COUNTS = [2, 4, 8, 16]

export function TournamentLobby({ code, onLeave, onPlayMatch, onWatchMatch }: TournamentLobbyProps) {
  const auth = useAuth(true)
  const [tournament, setTournament] = useState<Tournament | null | undefined>(undefined)
  const [players, setPlayers] = useState<TournamentPlayer[]>([])
  const [matches, setMatches] = useState<TournamentMatch[]>([])
  const [copied, setCopied] = useState(false)
  const [starting, setStarting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Poll the room so the roster fills and the bracket advances live.
  useEffect(() => {
    let active = true
    const tick = () => {
      void getTournament(code).then((t) => {
        if (active) setTournament(t)
      })
      void getPlayers(code).then((p) => {
        if (active) setPlayers(p)
      })
      void getMatches(code).then((m) => {
        if (active) setMatches(m)
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

  const start = async () => {
    setStarting(true)
    setError(null)
    const res = await startTournament(code)
    setStarting(false)
    if (!res.ok) {
      setError(
        res.error === 'need_power_of_two'
          ? 'You need exactly 2, 4, 8, or 16 players to start.'
          : res.error === 'not_host'
            ? 'Only the host can start.'
            : 'Could not start the tournament.',
      )
    }
    // On success the poll picks up status = 'active' and the bracket renders.
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
  const inLobby = tournament.status === 'lobby'
  const canStart = isHost && inLobby && VALID_COUNTS.includes(players.length)

  return (
    <main className="tournament-lobby">
      <div className="screen-topbar">
        <button
          type="button"
          className="icon-back"
          onClick={inLobby ? leave : onLeave}
          aria-label="Back"
        >
          <span aria-hidden>←</span> {inLobby ? (isHost ? 'Cancel' : 'Leave') : 'Back'}
        </button>
        <span className="screen-title">{tournament.name}</span>
        <span className="topbar-spacer" aria-hidden />
      </div>

      {inLobby ? (
        <>
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
              {Array.from({ length: Math.max(0, tournament.size - players.length) }).map((_, i) => (
                <li key={`empty-${i}`} className="t-empty">
                  <span className="t-dot t-dot-empty" aria-hidden />
                  Waiting for a player…
                </li>
              ))}
            </ul>
          </div>

          {error && <p className="t-error">{error}</p>}

          {isHost ? (
            <>
              <button
                type="button"
                className="btn btn-primary"
                disabled={!canStart || starting}
                onClick={start}
              >
                {starting ? 'Starting…' : 'Start tournament'}
              </button>
              {!canStart && (
                <p className="t-note">Start needs exactly 2, 4, 8, or 16 players (byes coming soon).</p>
              )}
            </>
          ) : (
            <p className="t-note">Waiting for the host to start the tournament.</p>
          )}
        </>
      ) : (
        <TournamentBracket
          tournament={tournament}
          matches={matches}
          players={players}
          meId={auth.user?.id ?? null}
          onPlay={onPlayMatch}
          onWatch={onWatchMatch}
        />
      )}
    </main>
  )
}
