// Top-players leaderboard. Read-only; ratings are computed and written
// exclusively by the server (finish_game), so this just displays them.
// Always rendered in a fixed-height frame -- no collapse/expand that would
// reshuffle the lobby.

import { useEffect, useState } from 'react'
import { isSupabaseConfigured } from '../online/auth'
import { leaderboard, type LeaderRow } from '../online/ratings'

export function Leaderboard() {
  const [rows, setRows] = useState<LeaderRow[] | null>(null)

  useEffect(() => {
    if (!isSupabaseConfigured) return
    leaderboard(5).then(setRows)
  }, [])

  if (!isSupabaseConfigured) return null

  return (
    <section className="leaderboard" aria-label="Leaderboard">
      <h2 className="leaderboard-heading">Top players</h2>
      <div className="leaderboard-body">
        {rows === null && <p className="leaderboard-empty">Loading</p>}
        {rows && rows.length === 0 && (
          <p className="leaderboard-empty">No rated games yet. Win one to get on the board.</p>
        )}
        {rows && rows.length > 0 && (
          <ol className="leaderboard-list">
            {rows.map((r, i) => (
              <li key={r.user_id} className="leaderboard-row">
                <span className="lb-rank">{i + 1}</span>
                <span className="lb-name">{r.display_name ?? 'Anonymous'}</span>
                <span className="lb-record">
                  {r.wins}W {r.losses}L
                </span>
                <span className="lb-rating">{r.rating}</span>
              </li>
            ))}
          </ol>
        )}
      </div>
    </section>
  )
}
