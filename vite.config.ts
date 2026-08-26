import { defineConfig } from 'vite'

// Served at the root of leonard.generis.ir, so assets resolve from '/'.
export default defineConfig({
  base: '/',
  build: {
    target: 'es2022',
    // One page, one bundle. Splitting buys nothing here and costs a round trip.
    cssCodeSplit: false,
  },
})
