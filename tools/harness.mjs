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
/** Old enough that no live suite could still be using it. Comfortably past the
 *  hard limit below, so a slow but living run is never swept out from under
 *  itself. */
const STALE_MS = 12 * 60_000
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

/**
 * Polls until `expr` is truthy in the page, or gives up.
 *
 * Every suite used to wait a fixed number of milliseconds after navigating and
 * after each state change. That is 195 seconds of deliberate sleeping across
 * fourteen suites, 80 of it on boot alone, and it was never a requirement:
 * the first suite did it because a sleep was quick to write, the other
 * thirteen inherited it by copy-paste, and each time one went flaky the number
 * went up instead of being replaced with a condition.
 */
export async function waitFor(ev, expr, { timeout = 20_000, every = 40 } = {}) {
  const until = Date.now() + timeout
  for (;;) {
    try {
      if (await ev(`!!(${expr})`)) return true
    } catch {
      // The document is mid-navigation. Try again.
    }
    if (Date.now() > until) throw new Error(`waitFor timed out: ${expr}`)
    await new Promise((r) => setTimeout(r, every))
  }
}

/** The app has booted and its state is readable. */
export function appReady(ev, opts) {
  return waitFor(ev, 'window.LD && window.LD.state', opts)
}

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
    // Chrome's file handles outlive the kill by a moment, and a removal in that
    // window fails without saying so. A few tries inside the exit handler is
    // all it takes; anything that still survives is swept by the next run.
    for (let i = 0; i < 40; i++) {
      try {
        rmSync(profile, { recursive: true, force: true })
        break
      } catch {
        const until = Date.now() + 25
        while (Date.now() < until) { /* the handler cannot await */ }
      }
    }
  }

  process.on('exit', cleanup)
  // SIGPIPE included: piping a suite into `head` closes the pipe and kills the
  // process, which is how four browsers and 95MB of profiles survived a run
  // that looked like it had finished.
  for (const sig of ['SIGINT', 'SIGTERM', 'SIGHUP', 'SIGPIPE']) {
    process.on(sig, () => {
      cleanup()
      process.exit(130)
    })
  }
  // Node surfaces a broken pipe as an EPIPE write error rather than a signal,
  // so the SIGPIPE handler above never runs for `npm run test:x | head`. This
  // is the one that does.
  for (const stream of [process.stdout, process.stderr]) {
    stream.on('error', (e) => {
      if (e && e.code === 'EPIPE') {
        cleanup()
        process.exit(0)
      }
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
