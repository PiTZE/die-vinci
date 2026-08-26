import './styles/tokens.css'
import './styles/themes.css'
import './styles/base.css'
import './styles/game.css'

import Decimal from 'break_infinity.js'
import { AUTOSAVE_MS, AWAY_NOTICE_S, CATCHUP_AFTER_S, TICK_MS } from './game/balance'
import {
  buyFolio,
  buyRollRate,
  buySolid,
  buyStudy,
  inkPerSecond,
  maxAll,
  tick,
} from './game/production'
import { publishAway, simulateAway } from './game/offline'
import { doWager } from './game/wager'
import { buyUpgrade } from './game/upgrades'
import type { UpgradeId } from './game/upgrades'
import { exportSave, importSave, loadGame, saveGame, wipeSave } from './save'
import type { GameState } from './state'
import { Shell, type Actions } from './ui/shell'
import { tablePane } from './ui/table'
import { optionsPane } from './ui/options'
import { wagerPane } from './ui/wager'
import { applyTheme, currentTheme } from './ui/theme'
import { registerSW } from 'virtual:pwa-register'

// The plugin's injected registerSW.js only calls navigator.serviceWorker
// .register. The worker then skips waiting and claims the page, but the page
// you are looking at was already rendered from the previous worker's precache,
// so a new build needed two refreshes to appear. Registering through the
// virtual module instead gets the autoUpdate behaviour, which reloads once the
// new worker takes control. The reload fires pagehide, and that saves.
/**
 * Escape hatch for a wedged service worker.
 *
 * A worker from an older build can end up serving its own precached index.html
 * indefinitely, and the page has no way to notice: everything it can see came
 * from that same worker. So this asks the network directly, past the worker,
 * and if the server has a different build it forces the issue. First by asking
 * the registration to update, then, if that did not take, by unregistering the
 * worker and deleting its caches outright.
 *
 * sessionStorage counts the attempts so a genuinely broken deploy cannot put
 * the page into a reload loop.
 */
const TRIES_KEY = 'leonardos-die-refresh-tries'

async function ensureLatest(registration?: ServiceWorkerRegistration): Promise<void> {
  let remote: { buildId?: string }
  try {
    const base = __CHANNEL__ === 'dev' ? '/dev/' : '/'
    const res = await fetch(`${base}version.json?t=${Date.now()}`, { cache: 'no-store' })
    if (!res.ok) return
    remote = await res.json()
  } catch {
    // Offline is the normal case here, not a problem to solve.
    return
  }

  if (!remote.buildId || remote.buildId === __BUILD_ID__) {
    sessionStorage.removeItem(TRIES_KEY)
    return
  }

  const tries = Number(sessionStorage.getItem(TRIES_KEY) ?? '0')
  if (tries >= 2) {
    console.warn(`[leonardos-die] stuck on build ${__BUILD_ID__}, server has ${remote.buildId}`)
    return
  }
  sessionStorage.setItem(TRIES_KEY, String(tries + 1))

  if (registration) {
    if (tries === 0) {
      await registration.update().catch(() => {})
    } else {
      await registration.unregister().catch(() => {})
      if ('caches' in window) {
        const keys = await caches.keys()
        await Promise.all(keys.map((k) => caches.delete(k)))
      }
    }
  }
  location.reload()
}

const updateSW = registerSW({
  immediate: true,
  onRegisteredSW(_url, registration) {
    void ensureLatest(registration)
    if (!registration) return
    // A tab left open for days should still pick up a new build.
    const poll = () => registration.update().catch(() => {})
    setInterval(poll, 60 * 60 * 1000)
    document.addEventListener('visibilitychange', () => {
      if (!document.hidden) poll()
    })
  },
})
void updateSW

// Also runs when there is no service worker at all, so a plain browser tab
// still notices a new build.
if (!('serviceWorker' in navigator)) void ensureLatest()


const root = document.getElementById('app')
if (!root) throw new Error('#app is missing from index.html')

let state: GameState = loadGame(Date.now())

// The head script already set data-theme. This re-applies through the registry
// so colour-scheme, meta theme-color and any custom tokens agree with it.
applyTheme(currentTheme().id)

/**
 * Wiping clears localStorage and reloads, but the reload fires pagehide, and
 * that handler wrote the in-memory state straight back over the wipe. Every
 * save goes through persist() so a wipe can switch them all off first.
 */
let savingEnabled = true

function persist(): void {
  if (savingEnabled) saveGame(state)
}

const actions: Actions = {
  maxAll: () => maxAll(state),
  buySolid: (idx, one) => void buySolid(state, idx, one),
  buyRollRate: () => void buyRollRate(state),
  buyStudy: () => void buyStudy(state),
  buyFolio: () => void buyFolio(state),
  wager: () => void doWager(state),
  buyUpgrade: (id) => void buyUpgrade(state, id as UpgradeId),
  setNotation: (n) => {
    state.options.notation = n
  },
  setOffline: (on) => {
    state.options.offline = on
  },
  setOfflineTicks: (n) => {
    state.options.offlineTicks = n
  },
  exportSave: () => exportSave(state),
  importSave: (blob) => {
    const next = importSave(blob, Date.now())
    if (!next) return false
    state = next
    persist()
    return true
  },
  wipe: () => {
    savingEnabled = false
    wipeSave()
    location.reload()
  },
}

const shell = new Shell(root, actions)
shell.build([tablePane(), wagerPane(), optionsPane()], state.options.tab)

/**
 * Advances the game by however much wall-clock time has actually passed.
 *
 * The previous loop clamped its delta to one second, which quietly threw away
 * almost everything: a browser throttles a hidden tab's timers to roughly once
 * a minute, so a backgrounded game kept one second in sixty. Anything past
 * CATCHUP_AFTER_S is now simulated instead, which covers a background tab, a
 * sleeping machine and a closed game with the same code.
 */
function advance(now: number): void {
  const elapsed = (now - state.lastTick) / 1000
  state.lastTick = now
  if (!Number.isFinite(elapsed) || elapsed <= 0) return

  if (elapsed <= CATCHUP_AFTER_S) {
    tick(state, elapsed)
    return
  }

  // Turning offline progress off means exactly that: time the game was not
  // running does not count, however it came to not be running.
  if (!state.options.offline) return

  const summary = simulateAway(state, elapsed, state.options.offlineTicks)
  if (summary && summary.seconds >= AWAY_NOTICE_S) publishAway(summary)
}

advance(Date.now())

let sinceSave = 0

function loop(): void {
  // Last line of defence. If the page is visible but nothing has drawn for a
  // couple of seconds, the render chain died without any event telling us.
  if (!document.hidden && Date.now() - lastRenderAt > 2000) startRender()

  const before = state.lastTick
  advance(Date.now())
  sinceSave += state.lastTick - before
  if (sinceSave >= AUTOSAVE_MS) {
    sinceSave = 0
    persist()
  }
}

setInterval(loop, TICK_MS)

/**
 * The render loop, restartable.
 *
 * The old version stored the requestAnimationFrame handle and only restarted
 * when that handle was zero. A non-zero handle is not proof that a frame is
 * actually scheduled: a browser that freezes a backgrounded page can discard
 * the pending callback, and the handle then refers to a frame that will never
 * arrive. Rendering stopped for good while the game kept ticking underneath,
 * which is exactly the reported symptom, numbers frozen on screen.
 *
 * A generation counter fixes it. Restarting always works, and any older chain
 * notices it is stale and stops, so restarting twice cannot double the rate.
 */
let loopId = 0
let lastRenderAt = Date.now()

function startRender(): void {
  const mine = ++loopId
  const step = (): void => {
    if (mine !== loopId) return
    lastRenderAt = Date.now()
    state.options.tab = shell.activeTab
    shell.update(state, inkPerSecond(state))
    requestAnimationFrame(step)
  }
  requestAnimationFrame(step)
}

startRender()

/** Settle the clock and make sure something is drawing again. */
function resume(): void {
  advance(Date.now())
  startRender()
}

document.addEventListener('visibilitychange', () => {
  if (document.hidden) persist()
  else resume()
})

// bfcache restore, page-lifecycle resume, and plain window focus. Which of
// these a browser actually sends varies; any one of them is enough.
window.addEventListener('pageshow', resume)
window.addEventListener('focus', resume)
window.addEventListener('resume', resume)

window.addEventListener('pagehide', persist)

// A hook for balance work in the console. Not referenced by the game itself.
;(window as unknown as Record<string, unknown>).LD = {
  get state() {
    return state
  },
  Decimal,
  channel: __CHANNEL__,
  version: __VERSION__,
  buildId: __BUILD_ID__,
}
