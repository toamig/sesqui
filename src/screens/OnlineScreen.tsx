// Online game screen. Reuses the presentational Board and mirrors GameScreen's
// click-to-place / click-to-move interaction, but every committed action goes
// through the online hook (which enforces turn ownership and relays the move).

import { useMemo, useState } from 'react'
import { Board } from '../components/Board'
import { legalMoveTargets, legalPlacementTargets } from '../game/rules'
import type { Player } from '../game/types'
import { useOnlineGame } from '../online/useOnlineGame'
import { transportFactory, isOnlineConfigured } from '../online/config'

interface OnlineScreenProps {
  room: string
  role: 'host' | 'guest'
  onLeave: () => void
}

const playerName = (p: Player): string =>
  p === 'V' ? 'Vertical (Black)' : 'Horizontal (White)'

export function OnlineScreen({ room, role, onLeave }: OnlineScreenProps) {
  // Memoise options so the hook's connection effect runs once per room/role.
  const options = useMemo(
    () => ({ room, role, createTransport: transportFactory, hostColor: 'V' as Player }),
    [room, role],
  )
  const online = useOnlineGame(options)
  const { state, myColor, myTurn, status } = online

  const [selected, setSelected] = useState<number | null>(null)
  const [copied, setCopied] = useState(false)

  // Targets are only meaningful on this client's turn.
  const allPlaceTargets = useMemo(
    () =>
      myTurn && state.placementsLeft > 0 && state.winner === null
        ? legalPlacementTargets(state)
        : [],
    [myTurn, state],
  )
  const moveTargets = useMemo(
    () => (selected !== null ? legalMoveTargets(state, selected) : []),
    [selected, state],
  )
  const placeTargets = selected === null ? allPlaceTargets : []
  const canMove = myTurn && state.movesLeft > 0 && state.winner === null

  const handleCellClick = (i: number) => {
    if (!myTurn || myColor === null || state.winner !== null) return
    const cell = state.board[i]

    if (selected !== null) {
      if (i === selected) {
        setSelected(null)
      } else if (moveTargets.includes(i)) {
        online.submitAction({ kind: 'move', from: selected, to: i })
        setSelected(null)
      } else if (cell === myColor && canMove) {
        setSelected(i)
      } else {
        setSelected(null)
      }
      return
    }

    if (cell === myColor && canMove) {
      setSelected(i)
    } else if (allPlaceTargets.includes(i)) {
      online.submitAction({ kind: 'place', to: i })
    }
  }

  const copyInvite = async () => {
    const link = `${location.origin}${location.pathname}?room=${room}`
    try {
      await navigator.clipboard.writeText(link)
      setCopied(true)
      setTimeout(() => setCopied(false), 1800)
    } catch {
      // Clipboard can be blocked; the code is shown on screen regardless.
    }
  }

  const statusText = (): string => {
    if (status === 'connecting') return 'Connecting'
    if (status === 'error') return online.error ?? 'Connection error'
    if (status === 'waiting') return 'Waiting for an opponent to join'
    if (status === 'no-opponent') return 'No opponent yet'
    if (status === 'opponent-left') return 'Opponent left the room'
    if (state.winner !== null) {
      if (state.winner === 'draw') return 'Draw.'
      if (online.isSpectator) return `${playerName(state.winner)} wins!`
      return state.winner === myColor ? 'You win!' : 'You lost.'
    }
    if (online.isSpectator) {
      return `Spectating ${playerName(state.current)} to move`
    }
    if (myColor === null) return 'Joining game'
    return myTurn ? 'Your turn' : "Opponent's turn"
  }

  const showBoard =
    status === 'playing' || status === 'opponent-left' || status === 'spectating'
  const youAre = online.isSpectator ? 'a spectator' : myColor ? playerName(myColor) : null

  return (
    <main className="game-screen online-screen">
      <header className="game-header">
        <h1>Sesqui</h1>
        <p className="subtitle">
          Online room <strong className="room-tag">{room}</strong>
          {youAre && (
            <>
              {' '}
              &middot; you are <strong>{youAre}</strong>
            </>
          )}
        </p>
      </header>

      {status === 'waiting' && (
        <div className="invite-panel">
          <p className="invite-label">Share this code with your opponent</p>
          <div className="invite-code">{room}</div>
          <button type="button" className="btn" onClick={copyInvite}>
            {copied ? 'Link copied' : 'Copy invite link'}
          </button>
        </div>
      )}

      {status === 'no-opponent' && (
        <div className="invite-panel">
          <p className="invite-label">
            Couldn&apos;t reach an opponent in room <strong>{room}</strong>.
          </p>
          <p className="invite-help">
            Make sure they&apos;ve opened the same room.
            {!isOnlineConfigured && (
              <>
                {' '}
                Cross-device play isn&apos;t enabled on this build yet, so rooms
                only connect between tabs of the same browser.
              </>
            )}
          </p>
          <div className="buttons">
            <button type="button" className="btn btn-primary" onClick={online.retry}>
              Try again
            </button>
            <button type="button" className="btn" onClick={onLeave}>
              Back
            </button>
          </div>
        </div>
      )}

      <div
        className={`status ${state.winner !== null ? 'status-win' : ''}`}
        // Reuse the status pill but without the fixed two-line slot; online
        // messages are short.
      >
        {statusText()}
        {(status === 'connecting' || status === 'waiting') && (
          <span className="thinking-dots" aria-hidden>
            <i />
            <i />
            <i />
          </span>
        )}
      </div>

      {showBoard && (
        <Board
          board={state.board}
          selected={selected}
          placeTargets={placeTargets}
          moveTargets={moveTargets}
          winningLine={state.winningLine}
          lastAction={null}
          disabled={online.isSpectator || !myTurn || state.winner !== null}
          onCellClick={handleCellClick}
        />
      )}

      <div className="controls">
        <div className="buttons">
          {state.winner !== null && !online.isSpectator && (
            <button
              type="button"
              className="btn btn-primary"
              onClick={online.requestRematch}
            >
              Rematch
            </button>
          )}
          <button type="button" className="btn" onClick={onLeave}>
            {online.isSpectator ? 'Stop watching' : 'Leave room'}
          </button>
        </div>
      </div>
    </main>
  )
}
