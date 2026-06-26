// Tournament bracket: a single-elimination tree styled as a "tournament night".
// Gold traces the winners toward a serif champion banner; live matches pulse in
// purple; the viewer's own live match is promoted to a bold call-to-action so the
// match cards stay a uniform height (which keeps the round-to-round connectors
// aligned).

import type { Tournament, TournamentMatch, TournamentPlayer } from '../online/tournaments'

interface TournamentBracketProps {
  tournament: Tournament
  matches: TournamentMatch[]
  players: TournamentPlayer[]
  meId: string | null
  onPlay: (gameCode: string, role: 'host' | 'guest') => void
  onWatch: (gameCode: string) => void
}

const Trophy = (
  <svg viewBox="0 0 24 24" width="30" height="30" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
    <path d="M8 21h8M12 17v4M7 4h10v5a5 5 0 0 1-10 0V4Z" />
    <path d="M7 6H4v1.5a3.5 3.5 0 0 0 3.4 3.5M17 6h3v1.5a3.5 3.5 0 0 1-3.4 3.5" />
  </svg>
)
const Check = (
  <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
    <path d="M4 12l5 5L20 6" />
  </svg>
)

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
  const pMap = new Map(players.map((p) => [p.user_id, p]))
  const nameOf = (id: string | null): string | null => (id ? pMap.get(id)?.display_name || 'Player' : null)
  const seedOf = (id: string | null): number | null => (id ? pMap.get(id)?.seed ?? null : null)

  const rounds = [...new Set(matches.map((m) => m.round))].sort((a, b) => a - b)
  const total = rounds.length
  const champion = tournament.status === 'complete' ? tournament.champion : null

  // The viewer's own live match, if any (drives the top call-to-action).
  const myLive = !champion
    ? matches.find(
        (m) => m.status === 'playing' && !!m.game_code && (m.player_a === meId || m.player_b === meId),
      )
    : undefined

  const seat = (id: string | null, win: boolean, lose: boolean) => {
    const name = nameOf(id)
    const seed = seedOf(id)
    return (
      <div className={`tbk-seat${win ? ' tbk-win' : ''}${lose ? ' tbk-lose' : ''}${name ? '' : ' tbk-tbd'}`}>
        <span className="tbk-ava">{name ? name[0] : ''}</span>
        <span className="tbk-name">{name || 'Awaiting'}</span>
        {seed != null && name && <span className="tbk-seed">#{seed}</span>}
        {win && <span className="tbk-tick">{Check}</span>}
      </div>
    )
  }

  return (
    <div className="tbk">
      {champion && (
        <div className="tbk-crown">
          <span className="tbk-crown-trophy">{Trophy}</span>
          <span className="tbk-crown-eyebrow">Champion</span>
          <span className="tbk-crown-name">{nameOf(champion)}</span>
        </div>
      )}

      {myLive && (
        <button
          type="button"
          className="tbk-cta"
          onClick={() => onPlay(myLive.game_code as string, myLive.player_a === meId ? 'host' : 'guest')}
        >
          <span className="tbk-cta-dot" aria-hidden />
          <span className="tbk-cta-text">
            <strong>Your match is live</strong>
            <span>vs {nameOf(myLive.player_a === meId ? myLive.player_b : myLive.player_a)}</span>
          </span>
          <span className="tbk-cta-go">Play →</span>
        </button>
      )}

      <div className="tbk-scroll">
        <div className="tbk-tree">
          {rounds.map((r, ri) => (
            <div className="tbk-round" key={r} style={{ ['--pow' as string]: 2 ** ri, ['--ri' as string]: ri }}>
              <div className="tbk-round-head">{roundLabel(r, total)}</div>
              <div className="tbk-round-body">
                {matches
                  .filter((m) => m.round === r)
                  .map((m) => {
                    const mine = m.player_a === meId || m.player_b === meId
                    const live = m.status === 'playing' && !!m.game_code
                    const done = m.status === 'done'
                    const onClick = live
                      ? () =>
                          mine
                            ? onPlay(m.game_code as string, m.player_a === meId ? 'host' : 'guest')
                            : onWatch(m.game_code as string)
                      : undefined
                    return (
                      <div
                        key={m.id}
                        className={`tbk-match tbk-${m.status}${mine ? ' tbk-mine' : ''}${live ? ' tbk-clickable' : ''}`}
                        onClick={onClick}
                        role={live ? 'button' : undefined}
                        tabIndex={live ? 0 : undefined}
                      >
                        <div className="tbk-bar">
                          {live ? (
                            <span className="tbk-live">
                              <span className="tbk-livedot" aria-hidden />
                              {mine ? 'Your match' : 'Live · watch'}
                            </span>
                          ) : done ? (
                            <span className="tbk-played">Played</span>
                          ) : (
                            <span className="tbk-upcoming">Upcoming</span>
                          )}
                        </div>
                        {seat(m.player_a, done && m.winner === m.player_a, done && m.winner !== m.player_a)}
                        {seat(m.player_b, done && m.winner === m.player_b, done && m.winner !== m.player_b)}
                      </div>
                    )
                  })}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
