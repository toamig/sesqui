// Top-players leaderboard for the lobby. Read-only; ratings are computed and
// written exclusively by the server (finish_game), so this just displays them.
// Collapsed by default to keep the lobby uncluttered.

import { useEffect, useState } from 'react'
import { isSupabaseConfigured } from '../online/auth'
import { leaderboard, type LeaderRow } from '../online/ratings'

export function Leaderboard() {
  const [open, setOpen] = useState(false)
  const [rows, setRows] = useState<LeaderRow[] | null>(null)
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (!open || rows !== null) return
    setLoading(true)
    leaderboard(10)
      .then(setRows)
      .finally(() => setLoading(false))
  }, [open, rows])

  if (!isSupabaseConfigured) return null

  return (
    <div className="leaderboard">
      <button
        type="button"
        className="leaderboard-toggle"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
      >
        {open ? 'Hide leaderboard' : 'Leaderboard'}
      </button>

      {open && (
        <div className="leaderboard-body">
          {loading && <p className="leaderboard-empty">Loading</p>}
          {!loading && rows && rows.length === 0 && (
            <p className="leaderboard-empty">No rated games yet. Win one to get on the board.</p>
          )}
          {!loading && rows && rows.length > 0 && (
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
      )}
    </div>
  )
}
