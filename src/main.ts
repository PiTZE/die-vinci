import './styles/tokens.css'
import './styles/themes.css'
import './styles/base.css'
import './styles/game.css'

import Decimal from 'break_infinity.js'
import { AUTOSAVE_MS, OFFLINE_CAP_S, TICK_MS } from './game/balance'
import {
  buyFolio,
  buyRollRate,
  buySolid,
  buyStudy,
  inkPerSecond,
  maxAll,
  tick,
} from './game/production'
import { exportSave, importSave, loadGame, saveGame, wipeSave } from './save'
import type { GameState } from './state'
import { Shell, type Actions } from './ui/shell'
import { tablePane } from './ui/table'
import { optionsPane } from './ui/options'
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
  setNotation: (n) => {
    state.options.notation = n
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
shell.build([tablePane(), optionsPane()], state.options.tab)

/**
 * Offline time runs through the same tick in chunks rather than one huge dt.
 * The chain compounds, so a single step would undercount badly, and a thousand
 * steps costs nothing.
 */
function catchUp(now: number): void {
  const elapsed = Math.min((now - state.lastTick) / 1000, OFFLINE_CAP_S)
  state.lastTick = now
  if (elapsed <= 0) return
  const steps = Math.min(1000, Math.max(1, Math.ceil(elapsed)))
  const dt = elapsed / steps
  for (let i = 0; i < steps; i++) tick(state, dt)
}

catchUp(Date.now())

let lastTick = performance.now()
let sinceSave = 0

function loop(): void {
  const now = performance.now()
  const dt = Math.min((now - lastTick) / 1000, 1)
  lastTick = now
  state.lastTick = Date.now()

  tick(state, dt)

  sinceSave += dt * 1000
  if (sinceSave >= AUTOSAVE_MS) {
    sinceSave = 0
    persist()
  }
}

setInterval(loop, TICK_MS)

let rendering = 0
function render(): void {
  rendering = requestAnimationFrame(render)
  state.options.tab = shell.activeTab
  shell.update(state, inkPerSecond(state))
}
rendering = requestAnimationFrame(render)

document.addEventListener('visibilitychange', () => {
  if (document.hidden) {
    persist()
    cancelAnimationFrame(rendering)
    rendering = 0
  } else if (!rendering) {
    rendering = requestAnimationFrame(render)
  }
})

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
