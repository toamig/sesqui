// A compact swatch picker for the visual theme. Each chip previews a skin with
// its background, the two stone colours, and an accent bar, so the choice reads
// at a glance. Renders as a radiogroup for keyboard and screen-reader use.

import type { CSSProperties } from 'react'
import { SKINS } from '../theme'
import type { SkinId } from '../theme'
import './SkinPicker.css'

interface SkinPickerProps {
  value: SkinId
  onChange: (id: SkinId) => void
}

export function SkinPicker({ value, onChange }: SkinPickerProps) {
  return (
    <div className="control-group skin-group">
      <label id="skin-label">Theme</label>
      <div className="skin-swatches" role="radiogroup" aria-labelledby="skin-label">
        {SKINS.map((s) => (
          <button
            key={s.id}
            type="button"
            role="radio"
            aria-checked={value === s.id}
            aria-label={`${s.label}: ${s.blurb}`}
            title={`${s.label} — ${s.blurb}`}
            className={`skin-swatch ${value === s.id ? 'is-active' : ''}`}
            onClick={() => onChange(s.id)}
            style={
              {
                '--sw-bg': s.swatch.bg,
                '--sw-v': s.swatch.v,
                '--sw-h': s.swatch.h,
                '--sw-accent': s.swatch.accent,
              } as CSSProperties
            }
          >
            <span className="skin-swatch-chip" aria-hidden>
              <span className="skin-swatch-v" />
              <span className="skin-swatch-h" />
              <span className="skin-swatch-accent" />
            </span>
            <span className="skin-swatch-name">{s.label}</span>
          </button>
        ))}
      </div>
    </div>
  )
}
