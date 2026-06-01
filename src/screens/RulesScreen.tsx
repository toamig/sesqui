// Standalone how-to-play page. Pure presentation: small CSS-grid board diagrams
// reuse the live board's palette so each lesson reads the same as the game.
// No game logic lives here.

import type { CSSProperties, ReactNode } from 'react'
import './RulesScreen.css'

interface RulesScreenProps {
  /** Return to the game board. */
  onBack: () => void
}

type Mark = 'ok' | 'no' | 'path' | 'dest' | 'win'
type Tile = { p?: 'V' | 'H'; mark?: Mark }

interface MiniBoardProps {
  /** Side length in cells; the grid is size x size. */
  size: number
  /** Pieces and teaching marks keyed by cell index (row-major). */
  tiles?: Record<number, Tile>
  /** Draw edge cues for a colour: 'v' top+bottom, 'h' left+right. */
  goal?: 'v' | 'h'
  /** Override the per-cell pixel size for emphasis (e.g. the 2x2 crossing). */
  cell?: number
  /** Absolutely positioned overlays (arrow, forbidden mark) sized to the grid. */
  children?: ReactNode
}

function MiniBoard({ size, tiles = {}, goal, cell, children }: MiniBoardProps) {
  const cells: ReactNode[] = []
  for (let i = 0; i < size * size; i++) {
    const row = Math.floor(i / size)
    const col = i % size
    const t = tiles[i]
    cells.push(
      <div key={i} className={`m-cell ${(row + col) % 2 === 0 ? 'm-light' : 'm-dark'}`}>
        {t?.p && <span className={`m-piece m-piece-${t.p === 'V' ? 'v' : 'h'}`} />}
        {t?.mark && <span className={`m-mark m-mark-${t.mark}`} />}
      </div>,
    )
  }
  const gridStyle = {
    '--n': size,
    ...(cell ? { '--cell': `${cell}px` } : {}),
  } as CSSProperties

  return (
    <figure className="mini-frame">
      {goal === 'v' && (
        <>
          <span className="m-goal m-goal-n" aria-hidden />
          <span className="m-goal m-goal-s" aria-hidden />
        </>
      )}
      {goal === 'h' && (
        <>
          <span className="m-goal m-goal-w" aria-hidden />
          <span className="m-goal m-goal-e" aria-hidden />
        </>
      )}
      <div className="mini-grid" style={gridStyle}>
        {cells}
      </div>
      {children}
    </figure>
  )
}

// Diagonal slide arrow drawn in grid space (viewBox 0..100 maps to the grid).
function MoveArrow() {
  return (
    <svg className="m-arrow" viewBox="0 0 100 100" aria-hidden>
      <line x1="18" y1="82" x2="82" y2="18" />
      <line x1="82" y1="18" x2="70" y2="18" />
      <line x1="82" y1="18" x2="82" y2="30" />
    </svg>
  )
}

// Red cross overlay for the forbidden crossing pattern.
function Forbidden() {
  return (
    <svg className="m-forbidden" viewBox="0 0 100 100" aria-hidden>
      <line x1="20" y1="20" x2="80" y2="80" />
      <line x1="80" y1="20" x2="20" y2="80" />
    </svg>
  )
}

let ruleIndex = 0
function Rule({
  num,
  eyebrow,
  title,
  children,
}: {
  num: string
  eyebrow: string
  title: string
  children: ReactNode
}) {
  const i = ruleIndex++
  return (
    <section className="rule" style={{ '--i': i } as CSSProperties}>
      <div className="rule-head">
        <span className="rule-num">{num}</span>
        <div>
          <p className="rule-eyebrow">{eyebrow}</p>
          <h2 className="rule-title">{title}</h2>
        </div>
      </div>
      <div className="rule-body">{children}</div>
    </section>
  )
}

export function RulesScreen({ onBack }: RulesScreenProps) {
  ruleIndex = 0
  return (
    <main className="rules-screen">
      <div className="rules-topbar">
        <button type="button" className="back-btn" onClick={onBack}>
          <span aria-hidden>&larr;</span> Back
        </button>
        <span className="topbar-label">Sesqui &middot; How to play</span>
      </div>

      <div className="rules-content">
        <header className="rules-hero">
          <p className="hero-eyebrow">A duel of connection</p>
          <h1 className="hero-title">How to play Sesqui</h1>
          <p className="hero-lede">
            Two players, one board, two opposite ambitions. Read this once and you
            will know everything the game asks of you.
          </p>
        </header>

        <Rule num="01" eyebrow="The objective" title="Join your two edges">
          <p>
            Black builds from the top edge to the bottom. White builds from the
            left edge to the right. The instant your stones form one unbroken chain
            between your own two edges, you win.
          </p>
          <div className="demo">
            <MiniBoard
              size={5}
              goal="v"
              tiles={{
                2: { p: 'V', mark: 'win' },
                7: { p: 'V', mark: 'win' },
                11: { p: 'V', mark: 'win' },
                17: { p: 'V', mark: 'win' },
                22: { p: 'V', mark: 'win' },
              }}
            />
            <figcaption>Black has joined top to bottom.</figcaption>
          </div>
        </Rule>

        <Rule num="02" eyebrow="Turns 1 and 2" title="The opening">
          <p>
            The first two turns are placement only, and the stones may land
            anywhere on the empty board. Black opens with a single stone. White
            answers with two. Nothing moves yet.
          </p>
          <div className="demo">
            <MiniBoard
              size={5}
              tiles={{ 7: { p: 'V' }, 16: { p: 'H' }, 13: { p: 'H' } }}
            />
            <figcaption>One black stone, then two white.</figcaption>
          </div>
        </Rule>

        <Rule num="03" eyebrow="Every turn after" title="Place one, move one">
          <p>
            From the third turn on, each turn has two parts: place one new stone and
            move one of your stones. Take them in whichever order you like, and keep
            the board legal after each part.
          </p>
          <div className="demo-pair">
            <div className="demo">
              <MiniBoard
                size={4}
                tiles={{
                  5: { p: 'V' },
                  1: { mark: 'ok' },
                  4: { mark: 'ok' },
                  6: { mark: 'ok' },
                  9: { mark: 'ok' },
                  0: { mark: 'no' },
                  2: { mark: 'no' },
                  8: { mark: 'no' },
                  10: { mark: 'no' },
                }}
              />
              <figcaption>
                <strong>Place.</strong> A new stone must touch one of your own along
                a side. Diagonal touches do not count.
              </figcaption>
            </div>
            <div className="demo">
              <MiniBoard
                size={5}
                tiles={{
                  20: { p: 'V' },
                  16: { mark: 'path' },
                  12: { mark: 'path' },
                  8: { mark: 'path' },
                  4: { mark: 'dest' },
                }}
              >
                <MoveArrow />
              </MiniBoard>
              <figcaption>
                <strong>Move.</strong> Slide a stone like a queen across empty
                squares, in any straight line, onto an empty square.
              </figcaption>
            </div>
          </div>
          <p className="callout">
            Worth remembering: a side by side touch is needed to <em>place</em> a new
            stone, but a diagonal touch is enough to <em>link</em> a finished chain.
          </p>
        </Rule>

        <Rule num="04" eyebrow="The one restriction" title="No crossing">
          <p>
            Enemy stones may never cross. No two by two block may hold your colour on
            one diagonal and your opponent's on the other. The rule holds after every
            placement and every move, so a slide that would create a crossing on
            arrival is simply not allowed.
          </p>
          <div className="demo">
            <MiniBoard
              size={2}
              cell={50}
              tiles={{
                0: { p: 'V' },
                1: { p: 'H' },
                2: { p: 'H' },
                3: { p: 'V' },
              }}
            >
              <Forbidden />
            </MiniBoard>
            <figcaption>This crossed square can never occur.</figcaption>
          </div>
        </Rule>

        <Rule num="05" eyebrow="Reading the board" title="What counts as a chain">
          <p>
            A chain may bend through diagonals. Stones that meet at a corner are
            linked just as firmly as stones that meet along a side. The moment your
            colour runs unbroken from one of your edges to the other, the game is
            yours.
          </p>
          <div className="demo">
            <MiniBoard
              size={5}
              goal="h"
              tiles={{
                10: { p: 'H', mark: 'win' },
                11: { p: 'H', mark: 'win' },
                7: { p: 'H', mark: 'win' },
                13: { p: 'H', mark: 'win' },
                14: { p: 'H', mark: 'win' },
              }}
            />
            <figcaption>White links left to right, bending at a corner.</figcaption>
          </div>
        </Rule>

        <section className="flavor" style={{ '--i': ruleIndex++ } as CSSProperties}>
          <h3>Why &ldquo;Sesqui&rdquo;?</h3>
          <p>
            Sesqui is a Latin prefix meaning <em>one and a half</em>. It hides in the
            opening: Black lays one stone, White answers with two, and the balance of
            that first exchange settles at one and a half. A small imbalance,
            carefully repaid across the game.
          </p>
        </section>

        <div className="rules-cta">
          <button type="button" className="cta-btn" onClick={onBack}>
            Start playing
          </button>
        </div>
      </div>
    </main>
  )
}
