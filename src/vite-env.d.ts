/// <reference types="vite/client" />
/// <reference types="vite-plugin-pwa/client" />

/** Game version from package.json, injected by vite. See vite.config.ts. */
declare const __VERSION__: string
/** Build timestamp, injected by vite. See vite.config.ts. */
declare const __BUILD_ID__: string
/** Release channel this build belongs to. See vite.config.ts. */
declare const __CHANNEL__: 'stable' | 'dev'
