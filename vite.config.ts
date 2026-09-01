import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
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
    rollupOptions: {
      output: {
        // break_infinity.js is vendored into the bundle and it is MIT, which
        // asks for its notice to travel with the code. It used to travel on
        // the ABOUT pane; this puts it in the thing that is actually
        // distributed. The bang keeps it through minification, which strips
        // every other comment.
        banner:
          '/*! Bundles break_infinity.js v2.2.0, MIT, Copyright (c) 2019 ' +
          'Timothy Stiles. Full licence: src/vendor/break-infinity.LICENSE.txt */',
      },
    },
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
    {
      // vite-plugin-pwa derives the manifest's scope and start_url from its
      // base, and its base has to be /dev/ so the assets resolve. That also
      // makes the dev build a second installable app, which is not wanted:
      // one app, and the channel switch in OPTIONS moves between builds.
      //
      // Rewritten on disk at the end of the build rather than in the bundle,
      // because the plugin writes the manifest itself instead of emitting it
      // as an asset, so a generateBundle hook never sees it.
      //
      // The service worker's scope is untouched. That one does have to stay
      // /dev/, or the dev worker answers for the stable site.
      name: 'one-installable-app',
      closeBundle() {
        const out = CHANNEL === 'dev' ? 'dist-dev' : 'dist'
        const file = resolve(out, 'manifest.webmanifest')
        if (!existsSync(file)) return
        const manifest = JSON.parse(readFileSync(file, 'utf8'))
        manifest.id = '/'
        manifest.scope = '/'
        manifest.start_url = '/'
        writeFileSync(file, JSON.stringify(manifest))
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
        // One installable app, whichever channel you install from. The name,
        // the identity, the scope and the start url are all the stable ones,
        // so a tester who installs from /dev/ gets the same icon and the same
        // app as everybody else and switches channel in OPTIONS.
        //
        // This is only the manifest. The dev service worker is still scoped to
        // /dev/ below, which is what actually keeps the two builds apart; a
        // dev worker scoped at / would answer for the stable site.
        name: 'die Vinci',
        short_name: 'die Vinci',

        description: 'A game about Leo.',
        start_url: BASE,
        scope: BASE,
        // Standalone, not fullscreen. A manifest's display mode is read once
        // at install and nothing can change it afterwards, so shipping
        // fullscreen there makes it permanent and un-toggleable. The switch in
        // OPTIONS uses the Fullscreen API instead, which works at runtime.
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
