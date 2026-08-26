import { defineConfig } from 'vite'
import { VitePWA } from 'vite-plugin-pwa'

// Served at the root of leonard.generis.ir, so assets resolve from '/'.
export default defineConfig({
  base: '/',
  build: {
    target: 'es2022',
    // One page, one bundle. Splitting buys nothing here and costs a round trip.
    cssCodeSplit: false,
  },
  plugins: [
    VitePWA({
      // The service worker takes a new build on the next load and activates it
      // without asking. That is the self-updating part.
      registerType: 'autoUpdate',
      includeAssets: ['icon-192.png', 'icon-512.png', 'icon-512-maskable.png'],
      manifest: {
        name: "Leonardo's Die",
        short_name: "Leonardo's Die",
        description:
          'An incremental dice game about Leonardo, the Platonic solids, and what happened to determinism.',
        start_url: '/',
        scope: '/',
        display: 'standalone',
        orientation: 'any',
        background_color: '#000000',
        theme_color: '#000000',
        icons: [
          { src: '/icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: '/icon-512.png', sizes: '512x512', type: 'image/png' },
          {
            src: '/icon-512-maskable.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'maskable',
          },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,png,svg,ico,webmanifest}'],
        cleanupOutdatedCaches: true,
        // The font is a CDN request, so it needs its own rule or the game
        // falls back to the generic monospace stack once offline.
        runtimeCaching: [
          {
            urlPattern: /^https:\/\/fonts\.googleapis\.com\//,
            handler: 'StaleWhileRevalidate',
            options: { cacheName: 'google-fonts-css' },
          },
          {
            urlPattern: /^https:\/\/fonts\.gstatic\.com\//,
            handler: 'CacheFirst',
            options: {
              cacheName: 'google-fonts-files',
              expiration: { maxEntries: 8, maxAgeSeconds: 60 * 60 * 24 * 365 },
              cacheableResponse: { statuses: [0, 200] },
            },
          },
        ],
      },
    }),
  ],
})
