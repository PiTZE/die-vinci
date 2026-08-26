import Decimal from 'break_infinity.js'
import { format } from '../format'
import type { GameState, TabId } from '../state'
import { currentTheme, nextTheme, themes } from './theme'

/** What a pane is allowed to do to the game. Implemented in main.ts. */
export interface Actions {
  roll(): void
  maxAll(): void
  buySolid(idx: number, one?: boolean): void
  buyRollRate(): void
  buyStudy(): void
  buyFolio(): void
  setNotation(n: GameState['options']['notation']): void
  exportSave(): string
  importSave(blob: string): boolean
  wipe(): void
}

export interface Pane {
  id: TabId
  label: string
  mount(el: HTMLElement, actions: Actions): void
  update(s: GameState): void
  /** Tabs stay hidden until the game has something to put in them. */
  visible?(s: GameState): boolean
}

function el<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  cls?: string,
  text?: string,
): HTMLElementTagNameMap[K] {
  const n = document.createElement(tag)
  if (cls) n.className = cls
  if (text !== undefined) n.textContent = text
  return n
}

/** One label-value-rate stack in the top bar. */
class Readout {
  root: HTMLElement
  private value: HTMLElement
  private rate: HTMLElement

  constructor(label: string) {
    this.root = el('div', 'res')
    this.root.appendChild(el('span', 'res-label', label))
    this.value = el('span', 'res-value', '0')
    this.rate = el('span', 'res-rate', '')
    this.root.append(this.value, this.rate)
  }

  set(value: string, rate = ''): void {
    if (this.value.textContent !== value) this.value.textContent = value
    if (this.rate.textContent !== rate) this.rate.textContent = rate
  }

  show(on: boolean): void {
    this.root.hidden = !on
  }
}

export class Shell {
  private panes: Pane[] = []
  private tabButtons = new Map<TabId, HTMLButtonElement>()
  private paneEls = new Map<TabId, HTMLElement>()
  private inkOut = new Readout('INK')
  private pointsOut = new Readout('POINTS')
  private themeBtn = el('button', 'theme-toggle')
  private active: TabId = 'table'

  constructor(
    private root: HTMLElement,
    private actions: Actions,
  ) {}

  build(panes: Pane[], initial: TabId): void {
    this.panes = panes

    const bar = el('div', 'bar')
    bar.append(this.inkOut.root, this.pointsOut.root, el('div', 'bar-spacer'))
    this.themeBtn.type = 'button'
    this.themeBtn.addEventListener('click', () => {
      nextTheme()
      this.paintThemeButton()
    })
    bar.appendChild(this.themeBtn)

    const tabs = el('nav', 'tabs')
    tabs.setAttribute('role', 'tablist')

    for (const p of panes) {
      const btn = el('button', 'tab', p.label)
      btn.type = 'button'
      btn.setAttribute('role', 'tab')
      btn.addEventListener('click', () => this.select(p.id))
      tabs.appendChild(btn)
      this.tabButtons.set(p.id, btn)

      const pane = el('div', 'pane')
      pane.setAttribute('role', 'tabpanel')
      const inner = el('div', 'pane-inner')
      pane.appendChild(inner)
      this.paneEls.set(p.id, pane)
      p.mount(inner, this.actions)
    }

    this.root.append(bar)
    for (const pane of this.paneEls.values()) this.root.appendChild(pane)
    this.root.appendChild(tabs)

    this.paintThemeButton()
    this.select(initial)
  }

  /** The button names the theme it will switch to, and cycles past two. */
  private paintThemeButton(): void {
    const all = themes()
    const i = all.findIndex((t) => t.id === currentTheme().id)
    const next = all[(i + 1) % all.length]
    this.themeBtn.textContent = next.label
    this.themeBtn.setAttribute('aria-label', `Switch to the ${next.label} theme`)
  }

  select(id: TabId): void {
    this.active = id
    for (const [tab, btn] of this.tabButtons) {
      const on = tab === id
      btn.setAttribute('aria-selected', String(on))
      const pane = this.paneEls.get(tab)
      if (pane) pane.hidden = !on
    }
  }

  get activeTab(): TabId {
    return this.active
  }

  update(s: GameState, inkRate: Decimal): void {
    const n = s.options.notation
    this.inkOut.set(format(s.ink, n), `${format(inkRate, n)}/s`)
    const showPoints = s.wagers > 0 || s.points.gt(0)
    this.pointsOut.show(showPoints)
    if (showPoints) this.pointsOut.set(format(s.points, n))

    for (const p of this.panes) {
      const btn = this.tabButtons.get(p.id)
      const on = p.visible ? p.visible(s) : true
      if (btn) btn.hidden = !on
      // A tab that vanishes under the player drops them back to the table.
      if (!on && this.active === p.id) this.select('table')
      if (on && this.active === p.id) p.update(s)
    }
  }
}

export { el }
