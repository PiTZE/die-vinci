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

const root = document.getElementById('app')
if (!root) throw new Error('#app is missing from index.html')

let state: GameState = loadGame(Date.now())

// The head script already set data-theme. This re-applies through the registry
// so colour-scheme, meta theme-color and any custom tokens agree with it.
applyTheme(currentTheme().id)

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
    saveGame(state)
    return true
  },
  wipe: () => {
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
    saveGame(state)
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
    saveGame(state)
    cancelAnimationFrame(rendering)
    rendering = 0
  } else if (!rendering) {
    rendering = requestAnimationFrame(render)
  }
})

window.addEventListener('pagehide', () => saveGame(state))

// A hook for balance work in the console. Not referenced by the game itself.
;(window as unknown as Record<string, unknown>).LD = {
  get state() {
    return state
  },
  Decimal,
}
