// Casual matchmaking screen. On entry it calls find_casual_match: if a player is
// already waiting it pairs immediately and enters the game; otherwise it parks as
// the seeker and polls until a partner arrives (the poll also heartbeats the
// wait). Cancel drops the wait. Colours are balanced server-side at pairing.
//
// Ranked is not live yet, so this only matchmakes for casual; the ranked path
// shows a "coming soon" note (and is unreachable while the hub card is disabled).

import { useEffect, useRef, useState } from 'react'
import { createInitialState } from '../game/rules'
import { findCasualMatch, pollWait, cancelWait, casualStats } from '../online/matchmaking'
import type { CasualStats } from '../online/matchmaking'

interface MatchSearchProps {
  ranked: boolean
  /** Cancel the search and return to the online hub. */
  onCancel: () => void
  /** A match was found: enter the room with the dealt role. */
  onMatched: (code: string, role: 'host' | 'guest') => void
}

type Phase = 'searching' | 'connecting' | 'error'

const POLL_MS = 2500
const STATS_MS = 4000

export function MatchSearch({ ranked, onCancel, onMatched }: MatchSearchProps) {
  const [seconds, setSeconds] = useState(0)
  const [phase, setPhase] = useState<Phase>('searching')
  const [stats, setStats] = useState<CasualStats>({ searching: 0, liveGames: 0 })
  const onMatchedRef = useRef(onMatched)
  const codeRef = useRef<string | null>(null)
  const doneRef = useRef(false)

  // Keep the latest onMatched in a ref so the matchmaking effect can stay
  // mount-only without going stale.
  useEffect(() => {
    onMatchedRef.current = onMatched
  }, [onMatched])

  // Elapsed timer.
  useEffect(() => {
    const t = setInterval(() => setSeconds((s) => s + 1), 1000)
    return () => clearInterval(t)
  }, [])

  // Live queue / activity snapshot, refreshed while searching.
  useEffect(() => {
    if (ranked) return
    let active = true
    const tick = () => {
      void casualStats().then((s) => {
        if (active) setStats(s)
      })
    }
    tick()
    const t = setInterval(tick, STATS_MS)
    return () => {
      active = false
      clearInterval(t)
    }
  }, [ranked])

  // Matchmaking lifecycle. Runs once; ranked does not matchmake yet.
  useEffect(() => {
    if (ranked) return
    let cancelled = false
    let poll: ReturnType<typeof setInterval> | null = null

    const stopPoll = () => {
      if (poll) {
        clearInterval(poll)
        poll = null
      }
    }

    const finish = (code: string, role: 'host' | 'guest') => {
      if (cancelled || doneRef.current) return
      doneRef.current = true
      stopPoll()
      setPhase('connecting')
      onMatchedRef.current(code, role)
    }

    const runMatch = async () => {
      const res = await findCasualMatch(createInitialState())
      if (cancelled) return
      if (!res) {
        setPhase('error')
        return
      }
      if (res.role === 'guest') {
        finish(res.code, 'guest')
        return
      }
      // Parked as the seeker: poll until a partner arrives (poll also heartbeats).
      codeRef.current = res.code
      stopPoll()
      poll = setInterval(() => {
        const code = codeRef.current
        if (!code) return
        void pollWait(code).then((st) => {
          if (cancelled) return
          if (st.status === 'matched') finish(code, 'host')
          else if (st.status === 'gone') {
            // Our wait expired (e.g. reaped). Re-queue from scratch.
            stopPoll()
            codeRef.current = null
            void runMatch()
          }
        })
      }, POLL_MS)
    }

    void runMatch()
    return () => {
      cancelled = true
      stopPoll()
    }
  }, [ranked])

  const handleCancel = () => {
    doneRef.current = true
    if (codeRef.current) void cancelWait(codeRef.current)
    onCancel()
  }

  const mmss = `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`
  const busy = stats.searching > 1 || stats.liveGames > 0

  return (
    <main className="match-search">
      <div className="screen-topbar">
        <button type="button" className="icon-back" onClick={handleCancel} aria-label="Back">
          <span aria-hidden>←</span> Online
        </button>
        <span className="screen-title">{ranked ? 'Ranked Match' : 'Casual Match'}</span>
        <span className="topbar-spacer" aria-hidden />
      </div>

      <div className="search-card">
        <div className="search-orbit" aria-hidden>
          <span className="search-dot search-dot-v" />
          <span className="search-dot search-dot-h" />
        </div>

        {ranked ? (
          <>
            <h2 className="search-title">Ranked is coming soon</h2>
            <p className="search-note">
              The competitive ladder isn&apos;t live yet. Try <strong>Casual Match</strong> for a quick
              game.
            </p>
          </>
        ) : phase === 'error' ? (
          <>
            <h2 className="search-title">Matchmaking unavailable</h2>
            <p className="search-note">
              Couldn&apos;t reach matchmaking. Check your connection and try again, or use{' '}
              <strong>Play a Friend</strong>.
            </p>
          </>
        ) : (
          <>
            <h2 className="search-title">
              {phase === 'connecting' ? 'Opponent found' : 'Searching for an opponent'}
              {phase === 'searching' && (
                <span className="thinking-dots" aria-hidden>
                  <i />
                  <i />
                  <i />
                </span>
              )}
            </h2>
            <p className="search-meta">
              Casual · <span className="search-timer">{mmss}</span>
            </p>
            <p className="search-activity">
              <span className={`live-dot${busy ? ' live-dot-on' : ''}`} aria-hidden />
              {stats.liveGames > 0
                ? `${stats.liveGames} ${stats.liveGames === 1 ? 'game' : 'games'} in progress`
                : 'Quiet right now'}
              {stats.searching > 1 ? ` · ${stats.searching} in queue` : ''}
            </p>
            <p className="search-note">
              {phase === 'connecting'
                ? 'Setting up the board…'
                : busy
                  ? 'Players are active right now. Hang tight, we’ll pair you with the next one.'
                  : 'It’s quiet right now. We’ll pair you the moment another player arrives, or try Play a Friend.'}
            </p>
          </>
        )}

        <button type="button" className="btn" onClick={handleCancel}>
          {phase === 'connecting' ? 'Leave' : 'Cancel'}
        </button>
      </div>
    </main>
  )
}
