// Skin catalogue and the small bit of glue that applies a chosen skin to the
// document. The visual values for each skin live in theme.css; this file only
// knows each skin's id, its label/swatch for the picker, and its mobile
// status-bar colour. Keep the ids here in sync with the [data-skin] blocks in
// theme.css and the colour map in index.html's no-flash script.

export type SkinId = 'midnight' | 'walnut' | 'bauhaus' | 'synthwave'

export interface SkinMeta {
  id: SkinId
  label: string
  /** One-line flavour shown on hover. */
  blurb: string
  /** Drives the mobile/PWA status-bar colour (<meta name="theme-color">). */
  themeColor: string
  /** Preview colours for the picker chip. */
  swatch: { bg: string; v: string; h: string; accent: string }
}

export const SKINS: SkinMeta[] = [
  {
    id: 'midnight',
    label: 'Midnight',
    blurb: 'Violet dusk and gold',
    themeColor: '#15152a',
    swatch: { bg: '#1c1c36', v: '#0c0c14', h: '#e9e9f2', accent: '#ffd54a' },
  },
  {
    id: 'walnut',
    label: 'Walnut',
    blurb: 'Carved stones on a wooden table',
    themeColor: '#cbb088',
    swatch: { bg: '#cbb088', v: '#16191c', h: '#f3eee2', accent: '#b5872f' },
  },
  {
    id: 'bauhaus',
    label: 'Bauhaus',
    blurb: 'Primary colours, hard edges',
    themeColor: '#f4ece0',
    swatch: { bg: '#f4ece0', v: '#141414', h: '#fbf7f0', accent: '#d6452f' },
  },
  {
    id: 'synthwave',
    label: 'Synthwave',
    blurb: 'Neon dusk and scanlines',
    themeColor: '#0d0a1f',
    swatch: { bg: '#160c2c', v: '#ff2ea0', h: '#46e6ff', accent: '#ff2ea0' },
  },
]

export const DEFAULT_SKIN: SkinId = 'midnight'

const STORAGE_KEY = 'sesqui-skin'

export function isSkinId(value: unknown): value is SkinId {
  return typeof value === 'string' && SKINS.some((s) => s.id === value)
}

/** Resolve the skin to start with: saved choice, else whatever the no-flash
 *  script already put on <html>, else the default. */
export function readStoredSkin(): SkinId {
  try {
    const saved = localStorage.getItem(STORAGE_KEY)
    if (isSkinId(saved)) return saved
  } catch {
    // localStorage can throw in private mode; fall through to the DOM/default.
  }
  const applied = document.documentElement.dataset.skin
  return isSkinId(applied) ? applied : DEFAULT_SKIN
}

/** Apply a skin everywhere: the data-skin hook, persistence, and status bar. */
export function applySkin(id: SkinId): void {
  document.documentElement.dataset.skin = id
  try {
    localStorage.setItem(STORAGE_KEY, id)
  } catch {
    // Persistence is best-effort; the in-memory choice still applies.
  }
  const meta = SKINS.find((s) => s.id === id)
  if (!meta) return
  let tag = document.querySelector('meta[name="theme-color"]')
  if (!tag) {
    tag = document.createElement('meta')
    tag.setAttribute('name', 'theme-color')
    document.head.appendChild(tag)
  }
  tag.setAttribute('content', meta.themeColor)
}
