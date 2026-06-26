// Tournament bracket view (Phase 3): rounds as columns, a "Play your match"
// button on the viewer's live match, "Watch" on others, and the champion banner
// when it's over.

import type { Tournament, TournamentMatch, TournamentPlayer } from '../online/tournaments'

interface TournamentBracketProps {
  tournament: Tournament
  matches: TournamentMatch[]
  players: TournamentPlayer[]
  meId: string | null
  onPlay: (gameCode: string, role: 'host' | 'guest') => void
  onWatch: (gameCode: string) => void
}

function roundLabel(round: number, total: number): string {
  const fromEnd = total - round
  if (fromEnd === 0) return 'Final'
  if (fromEnd === 1) return 'Semifinals'
  if (fromEnd === 2) return 'Quarterfinals'
  return `Round ${round}`
}

export function TournamentBracket({
  tournament,
  matches,
  players,
  meId,
  onPlay,
  onWatch,
}: TournamentBracketProps) {
  const nameOf = (id: string | null): string => {
    if (!id) return 'TBD'
    return players.find((p) => p.user_id === id)?.display_name || 'Player'
  }

  const rounds = [...new Set(matches.map((m) => m.round))].sort((a, b) => a - b)
  const total = rounds.length
  const champion = tournament.status === 'complete' ? tournament.champion : null

  return (
    <div className="t-bracket-wrap">
      {champion && (
        <div className="t-champion">
          <span className="t-champion-label">🏆 Champion</span>
          <span className="t-champion-name">{nameOf(champion)}</span>
        </div>
      )}

      <div className="t-bracket">
        {rounds.map((r) => (
          <div className="t-round" key={r}>
            <div className="t-round-title">{roundLabel(r, total)}</div>
            {matches
              .filter((m) => m.round === r)
              .map((m) => {
                const iAmA = meId != null && m.player_a === meId
                const iAmB = meId != null && m.player_b === meId
                const mine = iAmA || iAmB
                const live = m.status === 'playing' && !!m.game_code
                return (
                  <div className={`t-match t-match-${m.status}`} key={m.id}>
                    <div className="t-seats">
                      <span
                        className={`t-seat${m.winner && m.winner === m.player_a ? ' t-seat-win' : ''}`}
                      >
                        {nameOf(m.player_a)}
                      </span>
                      <span
                        className={`t-seat${m.winner && m.winner === m.player_b ? ' t-seat-win' : ''}`}
                      >
                        {nameOf(m.player_b)}
                      </span>
                    </div>
                    {live && mine && (
                      <button
                        type="button"
                        className="btn btn-primary btn-sm t-match-btn"
                        onClick={() => onPlay(m.game_code as string, iAmA ? 'host' : 'guest')}
                      >
                        Play your match
                      </button>
                    )}
                    {live && !mine && (
                      <button
                        type="button"
                        className="btn btn-sm t-match-btn"
                        onClick={() => onWatch(m.game_code as string)}
                      >
                        Watch
                      </button>
                    )}
                    {m.status === 'done' && <span className="t-match-tag">done</span>}
                  </div>
                )
              })}
          </div>
        ))}
      </div>
    </div>
  )
}
