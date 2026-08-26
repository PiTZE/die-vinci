import { readFileSync } from 'node:fs'
import { defineConfig } from 'vite'
import { VitePWA } from 'vite-plugin-pwa'

// package.json is the one place the version lives. Bump it with `npm run bump`,
// which carries each segment at nine: 0.0.9 becomes 0.1.0, 0.9.9 becomes 1.0.0.
const pkg = JSON.parse(readFileSync('./package.json', 'utf8'))

// Served at the root of leo.generis.ir, so assets resolve from '/'.
// Stamped into the bundle so a player can see which build they are running,
// which is the only way to answer "did my refresh actually pick up the new
// version". It also guarantees consecutive builds differ, so the service
// worker always has something to update to.
const BUILD_ID = new Date().toISOString().slice(0, 19).replace('T', ' ')

// Two channels off one origin. Stable lives at / and dev at /dev/, which keeps
// them on the same host without a second certificate. Build the dev one with
// CHANNEL=dev.
const CHANNEL = process.env.CHANNEL === 'dev' ? 'dev' : 'stable'
const BASE = CHANNEL === 'dev' ? '/dev/' : '/'

// Dev has no version number. A number there would only ever be the last
// released one wearing a suffix, which says nothing about what you are running.
// The build timestamp is the honest answer, and dev always serves the newest.
const VERSION = CHANNEL === 'dev' ? 'dev' : pkg.version

export default defineConfig({
  base: BASE,
  define: {
    __BUILD_ID__: JSON.stringify(BUILD_ID),
    __VERSION__: JSON.stringify(VERSION),
    __CHANNEL__: JSON.stringify(CHANNEL),
  },
  build: {
    outDir: CHANNEL === 'dev' ? 'dist-dev' : 'dist',
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
          source: JSON.stringify({ version: VERSION, buildId: BUILD_ID, channel: CHANNEL }),
        })
      },
    },
    VitePWA({
      // The service worker takes a new build on the next load and activates it
      // without asking. That is the self-updating part.
      registerType: 'autoUpdate',
      base: BASE,
      // The worker must not reach outside its own channel. Without an explicit
      // scope the stable worker at / would also control every page under /dev/.
      scope: BASE,
      // main.ts imports virtual:pwa-register and registers the worker itself.
      // Leaving this on would register it a second time from an injected
      // script, and that plain registration is the one that cannot reload the
      // page when a new worker takes over.
      injectRegister: null,
      includeAssets: ['icon-192.png', 'icon-512.png', 'icon-512-maskable.png'],
      manifest: {
        name: CHANNEL === 'dev' ? 'die Vinci (dev)' : 'die Vinci',
        short_name: CHANNEL === 'dev' ? 'die Vinci dev' : 'die Vinci',
        description: 'A game about Leo.',
        start_url: BASE,
        scope: BASE,
        display: 'standalone',
        orientation: 'any',
        background_color: '#000000',
        theme_color: '#000000',
        icons: [
          { src: `${BASE}icon-192.png`, sizes: '192x192', type: 'image/png' },
          { src: `${BASE}icon-512.png`, sizes: '512x512', type: 'image/png' },
          {
            src: `${BASE}icon-512-maskable.png`,
            sizes: '512x512',
            type: 'image/png',
            purpose: 'maskable',
          },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,png,svg,ico,webmanifest,woff2,mp3}'],
        cleanupOutdatedCaches: true,
        // Navigations into the other channel go to the network. Without this
        // the stable worker answers /dev/ with its own precached index.html.
        navigateFallbackDenylist: CHANNEL === 'stable' ? [/^\/dev\//] : [],
      },
    }),
  ],
})
