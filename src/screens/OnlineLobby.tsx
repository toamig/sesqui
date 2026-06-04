// Online lobby: create a room or join one by code. Pure UI -- it only collects
// the room code + role and hands them up; all networking lives in the hook.

import { useState } from 'react'
import { makeRoomCode, normalizeRoomCode } from '../online/protocol'
import { isOnlineConfigured, onlineModeLabel } from '../online/config'
import { AuthPanel } from '../components/AuthPanel'

interface OnlineLobbyProps {
  /** Join (or create) a room as host or guest. */
  onEnter: (room: string, role: 'host' | 'guest') => void
  onBack: () => void
}

export function OnlineLobby({ onEnter, onBack }: OnlineLobbyProps) {
  const [joinCode, setJoinCode] = useState('')

  const host = () => onEnter(makeRoomCode(), 'host')
  const join = () => {
    const code = normalizeRoomCode(joinCode)
    if (code.length >= 4) onEnter(code, 'guest')
  }

  const canJoin = normalizeRoomCode(joinCode).length >= 4

  return (
    <main className="online-lobby">
      <header className="game-header">
        <h1>Play Online</h1>
        <p className="subtitle">
          Create a room and share the code, or join a friend&apos;s room.
        </p>
      </header>

      <AuthPanel active />

      <div className="lobby-card">
        <button type="button" className="btn btn-primary lobby-create" onClick={host}>
          Create a room
        </button>

        <div className="lobby-divider">
          <span>or join with a code</span>
        </div>

        <form
          className="lobby-join"
          onSubmit={(e) => {
            e.preventDefault()
            join()
          }}
        >
          <input
            className="lobby-code-input"
            value={joinCode}
            onChange={(e) => setJoinCode(normalizeRoomCode(e.target.value))}
            placeholder="ROOM CODE"
            inputMode="text"
            autoComplete="off"
            autoCapitalize="characters"
            maxLength={8}
            aria-label="Room code"
          />
          <button type="submit" className="btn" disabled={!canJoin}>
            Join
          </button>
        </form>
      </div>

      <p className={`lobby-mode ${isOnlineConfigured ? 'is-live' : 'is-local'}`}>
        <span className="lobby-mode-dot" aria-hidden />
        {onlineModeLabel}
      </p>
      {!isOnlineConfigured && (
        <p className="lobby-hint">
          Cross-device play isn&apos;t configured yet, so rooms are shared between
          tabs of this browser. Open a second tab to test a full game.
        </p>
      )}

      <button type="button" className="rules-link" onClick={onBack}>
        Back to local game
      </button>
    </main>
  )
}
