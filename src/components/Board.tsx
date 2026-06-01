// Presentational 8x8 board. All game logic lives in the rules engine; this only
// renders cells and reports clicks.

import type { CSSProperties } from 'react'
import { BOARD_SIZE, colOf, rowOf } from '../game/board'
import type { Action, Board as BoardModel } from '../game/types'

interface BoardProps {
  board: BoardModel
  selected: number | null
  placeTargets: number[]
  moveTargets: number[]
  winningLine: number[] | null
  /** The most recent atomic action, used to animate the piece that just arrived. */
  lastAction: Action | null
  disabled: boolean
  onCellClick: (index: number) => void
}

export function Board({
  board,
  selected,
  placeTargets,
  moveTargets,
  winningLine,
  lastAction,
  disabled,
  onCellClick,
}: BoardProps) {
  const placeSet = new Set(placeTargets)
  const moveSet = new Set(moveTargets)
  // Cell -> position along the winning path, so each cell can stagger its reveal.
  const winOrder = new Map<number, number>()
  if (winningLine) winningLine.forEach((cell, order) => winOrder.set(cell, order))

  return (
    <div className="board-frame">
      <span className="edge edge-n" aria-hidden>
        N
      </span>
      <span className="edge edge-s" aria-hidden>
        S
      </span>
      <span className="edge edge-w" aria-hidden>
        W
      </span>
      <span className="edge edge-e" aria-hidden>
        E
      </span>
      <div className="board" role="grid">
        {board.map((cell, i) => {
          const classes = ['cell']
          classes.push((rowOf(i) + colOf(i)) % 2 === 0 ? 'cell-light' : 'cell-dark')
          if (placeSet.has(i)) classes.push('cell-place')
          if (moveSet.has(i)) classes.push('cell-move')
          if (selected === i) classes.push('cell-selected')
          if (winOrder.has(i)) classes.push('cell-win')

          // The destination of the last action mounts a fresh .piece node, so a
          // one-shot CSS animation runs on its own. A move slides in from its
          // origin (offset carried in --dx/--dy, in cell-pitch units); a placement
          // pops. Static pieces never remount, so they never replay.
          const pieceClasses = ['piece', cell === 'V' ? 'piece-v' : 'piece-h']
          let pieceStyle: CSSProperties | undefined
          if (lastAction && lastAction.to === i && cell !== null) {
            // Lift the arriving cell above its neighbours so a long slide travels
            // over the cells it crosses. Without this, cells later in the DOM
            // paint their opaque background on top and the piece looks buried.
            classes.push('cell-arriving')
            if (lastAction.kind === 'move') {
              pieceClasses.push('piece-move-in')
              pieceStyle = {
                '--dx': colOf(lastAction.from) - colOf(i),
                '--dy': rowOf(lastAction.from) - rowOf(i),
              } as CSSProperties
            } else {
              pieceClasses.push('piece-place-in')
            }
          }

          const cellStyle = winOrder.has(i)
            ? ({ '--win-order': winOrder.get(i) } as CSSProperties)
            : undefined

          return (
            <button
              key={i}
              type="button"
              className={classes.join(' ')}
              style={cellStyle}
              disabled={disabled}
              onClick={() => onCellClick(i)}
              aria-label={`row ${rowOf(i) + 1}, column ${colOf(i) + 1}`}
            >
              {cell !== null && <span className={pieceClasses.join(' ')} style={pieceStyle} />}
              {placeSet.has(i) && <span className="hint hint-place" />}
              {moveSet.has(i) && <span className="hint hint-move" />}
            </button>
          )
        })}
      </div>
      <span className="sr-only">{`${BOARD_SIZE} by ${BOARD_SIZE} board`}</span>
    </div>
  )
}
