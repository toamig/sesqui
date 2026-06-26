// Tournament room: a gathering lobby while filling, the live bracket once started.
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
  onLeave: () => void
  onPlayMatch: (gameCode: string, role: 'host' | 'guest') => void
  onWatchMatch: (gameCode: string) => void
}

const VALID_COUNTS = [2, 4, 8, 16]

const Crown = (
  <svg viewBox="0 0 24 24" width="12" height="12" fill="currentColor" aria-hidden>
    <path d="M3 7l4 3 5-6 5 6 4-3-2 11H5L3 7Z" />
  </svg>
)

export function TournamentLobby({ code, onLeave, onPlayMatch, onWatchMatch }: TournamentLobbyProps) {
  const auth = useAuth(true)
  const [tournament, setTournament] = useState<Tournament | null | undefined>(undefined)
  const [players, setPlayers] = useState<TournamentPlayer[]>([])
  const [matches, setMatches] = useState<TournamentMatch[]>([])
  const [copied, setCopied] = useState(false)
  const [starting, setStarting] = useState(false)
  const [error, setError] = useState<string | null>(null)

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
  const pct = Math.min(100, Math.round((players.length / tournament.size) * 100))

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
          <header className="tl-hero">
            <h1>{tournament.name}</h1>
            <p>
              Single elimination · best of {tournament.match_length} · {tournament.size} players
            </p>
          </header>

          <div className="tl-code">
            <div className="tl-code-main">
              <span className="tl-code-label">Invite code</span>
              <span className="tl-code-val">{tournament.code}</span>
            </div>
            <button type="button" className="btn tl-copy" onClick={copy}>
              {copied ? 'Copied' : 'Copy'}
            </button>
          </div>

          <div className="tl-roster">
            <div className="tl-roster-head">
              <span>Players</span>
              <span className="tl-count">
                {players.length}
                <span> / {tournament.size}</span>
              </span>
            </div>
            <div className="tl-meter" aria-hidden>
              <span style={{ width: `${pct}%` }} />
            </div>
            <ul className="tl-slots">
              {players.map((p) => (
                <li key={p.user_id} className="tl-slot">
                  <span className="tl-ava">{(p.display_name || 'P')[0]}</span>
                  <span className="tl-slot-name">{p.display_name || 'Player'}</span>
                  {p.user_id === tournament.host_user && (
                    <span className="tl-host">
                      {Crown}
                      host
                    </span>
                  )}
                </li>
              ))}
              {Array.from({ length: Math.max(0, tournament.size - players.length) }).map((_, i) => (
                <li key={`empty-${i}`} className="tl-slot tl-slot-empty">
                  <span className="tl-ava tl-ava-empty" aria-hidden />
                  <span className="tl-slot-name">Open seat</span>
                </li>
              ))}
            </ul>
          </div>

          {error && <p className="t-error">{error}</p>}

          {isHost ? (
            <>
              <button
                type="button"
                className="btn btn-primary tl-start"
                disabled={!canStart || starting}
                onClick={start}
              >
                {starting ? 'Seeding the bracket…' : 'Start tournament'}
              </button>
              {!canStart && (
                <p className="t-note">Start unlocks at exactly 2, 4, 8, or 16 players (byes coming soon).</p>
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
