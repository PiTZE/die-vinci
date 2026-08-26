import { readFileSync } from 'node:fs'
import { defineConfig } from 'vite'
import { VitePWA } from 'vite-plugin-pwa'

// package.json is the one place the version lives. Bump it with `npm run bump`,
// which carries each segment at nine: 0.0.9 becomes 0.1.0, 0.9.9 becomes 1.0.0.
const { version: VERSION } = JSON.parse(readFileSync('./package.json', 'utf8'))

// Served at the root of leonard.generis.ir, so assets resolve from '/'.
// Stamped into the bundle so a player can see which build they are running,
// which is the only way to answer "did my refresh actually pick up the new
// version". It also guarantees consecutive builds differ, so the service
// worker always has something to update to.
const BUILD_ID = new Date().toISOString().slice(0, 19).replace('T', ' ')

export default defineConfig({
  base: '/',
  define: {
    __BUILD_ID__: JSON.stringify(BUILD_ID),
    __VERSION__: JSON.stringify(VERSION),
  },
  build: {
    target: 'es2022',
    // One page, one bundle. Splitting buys nothing here and costs a round trip.
    cssCodeSplit: false,
  },
  plugins: [
    {
      // A tiny file the app can fetch past the service worker to find out what
      // the server actually has. .json is outside the precache glob on purpose,
      // so this always comes from the network.
      name: 'emit-version-json',
      generateBundle() {
        this.emitFile({
          type: 'asset',
          fileName: 'version.json',
          source: JSON.stringify({ version: VERSION, buildId: BUILD_ID }),
        })
      },
    },
    VitePWA({
      // The service worker takes a new build on the next load and activates it
      // without asking. That is the self-updating part.
      registerType: 'autoUpdate',
      // main.ts imports virtual:pwa-register and registers the worker itself.
      // Leaving this on would register it a second time from an injected
      // script, and that plain registration is the one that cannot reload the
      // page when a new worker takes over.
      injectRegister: null,
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
        globPatterns: ['**/*.{js,css,html,png,svg,ico,webmanifest,woff2}'],
        cleanupOutdatedCaches: true,
      },
    }),
  ],
})
