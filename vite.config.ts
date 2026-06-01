import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

// Two build targets:
//  - default: base '/', full PWA. Used for local dev, the Capacitor WebView, and
//    any standalone deploy where Sesqui owns the origin root (installable/offline).
//  - embed (SESQUI_EMBED=1): base '/sesqui/', PWA disabled. Used when Sesqui ships
//    as a static subpath of another site (the toamig.github.io portfolio). The
//    service worker is deliberately left OUT: a worker registered under /sesqui/
//    must never control the host origin, and the embedded copy is online-only, so
//    it needs no offline cache.
//
// Note: inside a Capacitor WebView the PWA service worker can clash with the
// native bridge. When a dedicated native build mode is added, disable VitePWA
// for that mode (see MartialArtsIdle's vite.config.js for the pattern).
const embed = process.env.SESQUI_EMBED === '1'

export default defineConfig({
  base: embed ? '/sesqui/' : '/',
  plugins: [
    react(),
    ...(embed
      ? []
      : [
          VitePWA({
            registerType: 'autoUpdate',
            includeAssets: ['favicon.svg', 'apple-touch-icon.png'],
            manifest: {
              name: 'Sesqui',
              short_name: 'Sesqui',
              description:
                'A connection strategy board game. Black links top to bottom, White links left to right.',
              theme_color: '#15152a',
              background_color: '#15152a',
              display: 'standalone',
              orientation: 'portrait',
              icons: [
                { src: 'pwa-192x192.png', sizes: '192x192', type: 'image/png' },
                { src: 'pwa-512x512.png', sizes: '512x512', type: 'image/png' },
                {
                  src: 'pwa-512x512.png',
                  sizes: '512x512',
                  type: 'image/png',
                  purpose: 'maskable',
                },
                { src: 'icon.svg', sizes: 'any', type: 'image/svg+xml' },
              ],
            },
          }),
        ]),
  ],
})
