import Decimal from 'break_infinity.js'
import { format, formatTime } from '../format'
import { consumeAway } from '../game/offline'
import { pickThought } from './thoughts'
import { inkPerRoll, mustWager, rollingItself } from '../game/production'
import { checkAchievements, byId as achievementById } from '../game/achievements'
import type { GameState, TabId } from '../state'

/** What a pane is allowed to do to the game. Implemented in main.ts. */
export interface Actions {
  maxAll(): void
  buySolid(idx: number, one?: boolean): void
  buyRollRate(): void
  /** Start a spin by hand. Refused while one is already in the air. */
  roll(): void
  buyAutomator(): void
  toggleAutomator(): void
  takeCard(id: string): void
  melt(): void
  buyStudy(): void
  buyFolio(): void
  wager(): void
  buyUpgrade(id: string): void
  enterChallenge(id: number): void
  exitChallenge(): void
  toggleAutobuyer(id: string): void
  upgradeAutobuyer(id: string): void
  setNotation(n: GameState['options']['notation']): void
  /** Pixels a second for the thoughts ticker. 0 holds each line still. */
  setThoughtSpeed(px: number): void
  setSound(on: boolean): void
  /** `echo` is the browser telling us it changed, not the player asking. */
  setFullscreen(on: boolean, echo?: boolean): void
  setOffline(on: boolean): void
  setOfflineTicks(n: number): void
  setConfirm(key: string, on: boolean): void
  cycleAutobuyerMode(id: string): void
  useSlot(n: number): void
  exportSave(): string
  importSave(blob: string): boolean
  wipe(): void
  restoreBackup(id: string): boolean
}

export interface Pane {
  id: TabId
  label: string
  mount(el: HTMLElement, actions: Actions): void
  update(s: GameState): void
  /**
   * Controls that belong in the bar above the tabs rather than in the scrolling
   * pane. Called once after mount. Returning null means this pane has none.
   */
  action?(): HTMLElement | null
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

/** Owns the chrome: resource bar, tabs, panes, and the action bar. */
export class Shell {
  private panes: Pane[] = []
  private tabButtons = new Map<TabId, HTMLButtonElement>()
  private paneEls = new Map<TabId, HTMLElement>()
  private actionEls = new Map<TabId, HTMLElement>()
  private actionBar = el('div', 'action-bar')
  private actionInner = el('div', 'action-bar-inner')
  private toastEl = el('div', 'toast')
  private thoughtEl = el('div', 'thought')
  private thoughtLine = el('span', 'thought-line')
  private thoughtAt = 0
  /** Left edge of the line, in pixels from the left of the ticker. */
  private thoughtX = 0
  /** Cached on each new line, because reading offsetWidth every frame forces
   *  a layout and this runs inside the render loop. */
  private thoughtW = 0
  private thoughtFrame = 0
  private seenTabs = new Set<TabId>()
  private announced = false
  private announcedFull = false
  private toastTimer = 0
  private inkOut = new Readout('INK')
  private pointsOut = new Readout('POINTS')
  private active: TabId = 'table'

  constructor(
    private root: HTMLElement,
    private actions: Actions,
  ) {}

  build(panes: Pane[], initial: TabId): void {
    this.panes = panes

    const bar = el('div', 'bar')
    const barInner = el('div', 'bar-inner')
    // Readouts only. Theme lives in OPTIONS, which is the only place it needs
    // to be, and the bar is for numbers that change.
    barInner.append(this.inkOut.root, this.pointsOut.root, el('div', 'bar-spacer'))
    bar.appendChild(barInner)

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

      // The action bar lives in the shell grid, not inside the pane. A sticky
      // element only pins while the content overflows, so early on, with three
      // solids and no folio section, it fell back into the flow and sat under
      // the last section instead of staying in the thumb's reach.
      const act = p.action?.()
      if (act) {
        this.actionEls.set(p.id, act)
        this.actionInner.appendChild(act)
      }
    }

    this.actionBar.appendChild(this.actionInner)
    this.toastEl.setAttribute('role', 'status')
    this.root.appendChild(this.toastEl)
    this.root.append(bar)
    this.thoughtEl.setAttribute('aria-live', 'off')
    this.thoughtEl.appendChild(this.thoughtLine)
    this.root.appendChild(this.thoughtEl)
    for (const pane of this.paneEls.values()) this.root.appendChild(pane)
    this.root.append(this.actionBar, tabs)

    this.select(initial)
  }

  select(id: TabId): void {
    this.active = id
    for (const [tab, btn] of this.tabButtons) {
      const on = tab === id
      btn.setAttribute('aria-selected', String(on))
      const pane = this.paneEls.get(tab)
      if (pane) pane.hidden = !on
      const act = this.actionEls.get(tab)
      if (act) act.hidden = !on
      // The bar scrolls on a phone, so a tab selected from anywhere other
      // than a tap on it could sit off the right edge with nothing to say it
      // had changed. Unlock announcements do exactly that.
      if (on) btn.scrollIntoView({ block: 'nearest', inline: 'nearest' })
    }
    this.actionBar.hidden = !this.actionEls.has(id)
  }

  get activeTab(): TabId {
    return this.active
  }

  /** Says its piece and fades. Nothing to dismiss and nothing left behind. */
  toast(text: string): void {
    this.toastEl.textContent = text
    this.toastEl.classList.add('show')
    window.clearTimeout(this.toastTimer)
    this.toastTimer = window.setTimeout(() => this.toastEl.classList.remove('show'), 5000)
  }

  /**
   * Vinci's Thoughts, crawling right to left the way Antimatter Dimensions'
   * ticker does. Each line enters at the right edge, leaves at the left, and
   * the next one is picked as it goes: no gap, no jump, nothing repeated back
   * to back. At zero speed it holds still and rotates every twenty seconds,
   * which is what it did before and what someone who finds a moving line
   * distracting will want.
   */
  private nextThought(s: GameState): void {
    this.thoughtLine.textContent = pickThought(s, this.thoughtLine.textContent ?? '')
    this.thoughtW = this.thoughtLine.offsetWidth
  }

  private thoughts(s: GameState, now: number): void {
    const speed = s.options.thoughtSpeed
    if (!this.thoughtLine.textContent) {
      this.nextThought(s)
      this.thoughtX = this.thoughtEl.clientWidth
    }

    if (speed <= 0) {
      this.thoughtFrame = 0
      if (this.thoughtLine.style.transform) this.thoughtLine.style.transform = ''
      if (now - this.thoughtAt > 20_000) {
        this.thoughtAt = now
        this.nextThought(s)
      }
      return
    }

    // A backgrounded tab hands back a gap of minutes on its first frame. The
    // clamp keeps the line from teleporting across the bar on the way back.
    const dt = this.thoughtFrame ? Math.min((now - this.thoughtFrame) / 1000, 0.25) : 0
    this.thoughtFrame = now
    this.thoughtX -= speed * dt
    if (this.thoughtX < -this.thoughtW) {
      this.nextThought(s)
      this.thoughtX = this.thoughtEl.clientWidth
      this.thoughtAt = now
    }
    this.thoughtLine.style.transform = `translateX(${Math.round(this.thoughtX)}px)`
  }

  update(s: GameState, inkRate: Decimal): void {
    const now = Date.now()
    this.thoughts(s, now)

    // The run is over and waiting on you. Said once, not every frame.
    const full = mustWager(s)
    if (full && !this.announcedFull) this.toast('THE TABLE IS FULL.  CALL THE WAGER.')
    this.announcedFull = full

    for (const id of checkAchievements(s)) {
      const a = achievementById(id)
      if (a) this.toast(`ARCHIVE  ${a.name}`)
    }

    const away = consumeAway()
    if (away) {
      const tail = away.capped ? ' (capped)' : ''
      this.toast(
        `AWAY ${formatTime(away.seconds)}${tail}   +${format(away.ink, s.options.notation)} INK`,
      )
    }

    const n = s.options.notation
    // Per second once something is rolling for you, per roll until then.
    this.inkOut.set(
      format(s.ink, n),
      rollingItself(s) ? `${format(inkRate, n)}/s` : `${format(inkPerRoll(s), n)} per roll`,
    )
    const showPoints = s.wagers > 0 || s.points.gt(0)
    this.pointsOut.show(showPoints)
    if (showPoints) this.pointsOut.set(format(s.points, n))

    for (const p of this.panes) {
      const btn = this.tabButtons.get(p.id)
      const on = p.visible ? p.visible(s) : true
      if (btn) btn.hidden = !on
      // Announce a tab the first time it appears, but not on the first frame,
      // when everything already open would announce itself at once.
      if (on && this.announced && !this.seenTabs.has(p.id)) this.toast(`UNLOCKED  ${p.label}`)
      if (on) this.seenTabs.add(p.id)
      // A tab that vanishes under the player drops them back to the table.
      if (!on && this.active === p.id) this.select('table')
      if (on && this.active === p.id) p.update(s)
    }
    this.announced = true
  }
}

export { el }
