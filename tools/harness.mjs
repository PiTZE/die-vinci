// Keeps a test run from outliving itself.
//
// Every suite spawns a headless Chrome into a throwaway profile and tidied up
// on the last line. That line only runs when the suite finishes. A timeout, a
// thrown assertion, or a Ctrl-C left the browser running and the profile on
// disk, and forty-eight of those came to 3.2GB and a load average of thirty.
import { readdirSync, rmSync, statSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

/** Test profiles are named ld-*. Nothing else in tmpdir is touched. */
const PREFIX = 'ld-'
/** Old enough that no live suite could still be using it. */
const STALE_MS = 30 * 60_000
/** A suite that has not finished by now is hung, and holding a browser. */
const HARD_LIMIT_MS = 6 * 60_000

/** Chrome writes tens of megabytes of cache per profile and a test never reads
 *  it back. Same flags every suite should use, alongside its own. */
export const LEAN = [
  '--headless=new',
  '--no-sandbox',
  '--disable-gpu',
  '--no-first-run',
  '--disable-dev-shm-usage',
  '--disk-cache-size=1',
  '--media-cache-size=1',
  '--remote-debugging-port=0',
]

/** Clears out whatever an earlier run died and left behind. */
export function sweepStale() {
  let freed = 0
  try {
    for (const name of readdirSync(tmpdir())) {
      if (!name.startsWith(PREFIX)) continue
      const path = join(tmpdir(), name)
      try {
        if (Date.now() - statSync(path).mtimeMs < STALE_MS) continue
        rmSync(path, { recursive: true, force: true })
        freed++
      } catch {
        // Being written by a live suite, or already gone.
      }
    }
  } catch {
    // No tmpdir to read. Nothing to sweep.
  }
  return freed
}

/**
 * Ties the browser and its profile to the life of this process, however it
 * ends. Call it immediately after spawning, before anything can throw.
 */
export function guard(chrome, profile, getSocket) {
  let done = false
  const cleanup = () => {
    if (done) return
    done = true
    try { getSocket?.()?.close() } catch { /* already closed */ }
    try { chrome.kill('SIGKILL') } catch { /* already gone */ }
    try { rmSync(profile, { recursive: true, force: true }) } catch { /* already gone */ }
  }

  process.on('exit', cleanup)
  for (const sig of ['SIGINT', 'SIGTERM', 'SIGHUP']) {
    process.on(sig, () => {
      cleanup()
      process.exit(130)
    })
  }
  process.on('uncaughtException', (e) => {
    console.error(e)
    cleanup()
    process.exit(1)
  })
  process.on('unhandledRejection', (e) => {
    console.error(e)
    cleanup()
    process.exit(1)
  })

  // unref so a suite that finishes early is not held open by this.
  setTimeout(() => {
    console.error(`\nharness: no result after ${HARD_LIMIT_MS / 1000}s, killing the browser`)
    cleanup()
    process.exit(1)
  }, HARD_LIMIT_MS).unref()

  return cleanup
}
