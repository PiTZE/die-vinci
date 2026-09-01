import Decimal from '../vendor/break-infinity'
import { format, formatTime } from '../format'
import { consumeAway } from '../game/offline'
import { pickThought } from './thoughts'
import { dieRollsItself, inkPerRoll, mustWager } from '../game/production'
import { checkAchievements, byId as achievementById } from '../game/achievements'
import { codicesUnlocked, esperienzaMultiplier } from '../game/codices'
import { NAV_GROUPS, groupOf, type NavGroup } from '../game/nav'
import { anyMarked, clearMark, isMarked } from '../game/marks'
import type { GameState, TabId } from '../state'

/** What a pane is allowed to do to the game. Implemented in main.ts. */
export interface Actions {
  maxAll(): void
  buySolid(idx: number, one?: boolean): void
  buyRollRate(): void
  /** Start a spin by hand. Refused while one is already in the air. */
  roll(): void
  buyAutomator(): void
  /** Auto-roll for the next die on the chain. Paid in ink, kept forever. */
  buyAutoRoll(): void
  /** Hands one die back to your finger, or takes it away again. */
  toggleDie(idx: number): void
  toggleAutomator(): void
  takeCard(id: string): void
  melt(): void
  buyStudy(): void
  buyFolio(): void
  wager(): void
  buyUpgrade(id: string): void
  /** The rebuyable that doubles what a Wager pays. */
  buyChipMult(): void
  breakWager(): void
  buyBreak(id: string): void
  /** One codex, and every codex the chips cover. */
  buyCodex(idx: number): void
  buyAllCodices(): void
  enterChallenge(id: number): void
  exitChallenge(): void
  toggleAutobuyer(id: string): void
  /** The one switch over all thirteen. */
  toggleAutobuyers(): void
  upgradeAutobuyer(id: string): void
  /** A cap on how many a reset autobuyer takes. AD's limitDimBoosts. */
  setAutobuyerLimit(id: string, on: boolean, at?: number): void
  /** The Wager autobuyer's payout threshold, and whether it rises on its own. */
  setWagerThreshold(at: string): void
  setWagerRise(on: boolean): void
  /** And the folio count that lifts it. AD's limitUntilGalaxies. */
  setAutobuyerUntil(id: string, on: boolean, at?: number): void
  setNotation(n: GameState['options']['notation']): void
  /** Pixels a second for the thoughts ticker. 0 holds each line still. */
  setThoughtSpeed(px: number): void
  setSound(on: boolean): void
  /** `echo` is the browser telling us it changed, not the player asking. */
  setFullscreen(on: boolean, echo?: boolean): void
  setOffline(on: boolean): void
  setOfflineTicks(n: number): void
  setUiMs(n: number): void
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
  /**
   * Anything that has to move every frame, whatever the refresh rate says.
   *
   * The refresh rate governs how often the readouts are rewritten, and at sixty
   * a second a table of changing digits is a flicker. An animation is the
   * opposite case: the ROLL fill crosses its button once a roll, and at 100ms
   * that is ten steps rather than a sweep.
   */
  animate?(s: GameState): void
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
  /** One per group, in the strip that is the bottom bar on a phone and the
   *  left nav on a desktop. */
  private groupButtons = new Map<string, HTMLButtonElement>()
  private groupMarks = new Map<string, HTMLElement>()
  /** One per pane, in the second strip. Only the open group's are shown. */
  private tabButtons = new Map<TabId, HTMLButtonElement>()
  private tabMarks = new Map<TabId, HTMLElement>()
  private subtabStrip = el('div', 'subtabs')
  private activeGroup = NAV_GROUPS[0].id
  /** The last state seen by update, so a click can read it. Selecting a tab
   *  clears its mark, and a click arrives between ticks. */
  private lastState: GameState | null = null
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
  private chipsOut = new Readout('CHIPS')
  // The codices' currency. Hidden until the first codex opens, like the tab.
  private espOut = new Readout('ESPERIENZA')
  /**
   * Chips a second, watched rather than worked out.
   *
   * The ink rate is a formula, because production is one. Chips arrive a Wager
   * at a time and the engine has no idea how long the next Wager will take, so
   * this reads the number instead. Smoothed over about three seconds so it
   * settles between Wagers rather than spiking on each one, and only upward:
   * chips go down when you spend them and an income of minus four hundred is
   * not a thing worth printing.
   */
  private chipsSeen: Decimal | null = null
  private chipsAt = 0
  // Decimal, not a double. Chips reach 1e18000 after the wall comes down, and
  // toNumber() on that is Infinity, which the smoothing then held forever and
  // the readout printed as 1e9000000000000000/s. Same mistake the roll rate
  // made, one layer up.
  private chipsRate: Decimal = new Decimal(0)
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
    barInner.append(
      this.inkOut.root, this.chipsOut.root, this.espOut.root, el('div', 'bar-spacer'),
    )
    bar.appendChild(barInner)

    const tabs = el('nav', 'tabs')
    tabs.setAttribute('role', 'tablist')

    // The top level: one button a group, and this is the only strip that has
    // to fit a phone without scrolling.
    for (const g of NAV_GROUPS) {
      const btn = el('button', 'tab', g.label)
      btn.type = 'button'
      btn.setAttribute('role', 'tab')
      const mark = el('span', 'tab-mark', '')
      mark.setAttribute('aria-hidden', 'true')
      btn.appendChild(mark)
      btn.addEventListener('click', () => this.openGroup(g))
      tabs.appendChild(btn)
      this.groupButtons.set(g.id, btn)
      this.groupMarks.set(g.id, mark)
    }

    for (const p of panes) {
      const btn = el('button', 'subtab', p.label)
      btn.type = 'button'
      btn.setAttribute('role', 'tab')
      const mark = el('span', 'tab-mark', '')
      mark.setAttribute('aria-hidden', 'true')
      btn.appendChild(mark)
      btn.addEventListener('click', () => this.select(p.id))
      this.subtabStrip.appendChild(btn)
      this.tabButtons.set(p.id, btn)
      this.tabMarks.set(p.id, mark)

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
    // Subtabs before the groups in the DOM, because on a phone they are two
    // grid rows and the second strip belongs above the bottom bar. On a
    // desktop the wrapper becomes a flex column and `order` puts the groups
    // back on top; `display: contents` is what lets one markup do both.
    const nav = el('div', 'nav')
    nav.append(this.subtabStrip, tabs)
    this.root.append(this.actionBar, nav)

    this.select(initial)
  }

  /**
   * Opening a group opens the first pane in it that the player can see.
   *
   * Not the last one they were on. A group is a place rather than a memory,
   * and re-entering WAGER to find CHALLENGES because that is where you were
   * four Wagers ago is the kind of state nobody asked to keep.
   */
  private openGroup(g: NavGroup): void {
    const first = g.panes.find((id) => this.paneVisible(id))
    if (first) this.select(first)
  }

  /** Whether a pane is one the player is allowed to know about. The marks
   *  ask before setting one, because a mark on a sealed tab would be the
   *  loudest spoiler in the game. */
  canSee(s: GameState, id: TabId): boolean {
    const p = this.panes.find((x) => x.id === id)
    if (!p) return false
    return p.visible ? p.visible(s) : true
  }

  private paneVisible(id: TabId): boolean {
    const p = this.panes.find((x) => x.id === id)
    if (!p) return false
    return p.visible ? p.visible(this.lastState ?? ({} as GameState)) : true
  }

  select(id: TabId): void {
    this.active = id
    const g = groupOf(id)
    if (g) this.activeGroup = g.id
    // Looking at it is what clears it, which is AD's rule.
    if (this.lastState) clearMark(this.lastState, id)
    for (const [gid, btn] of this.groupButtons) {
      btn.setAttribute('aria-selected', String(gid === this.activeGroup))
      btn.classList.toggle('on', gid === this.activeGroup)
    }
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

  /** The per-frame pass, for everything that moves. */
  animate(s: GameState): void {
    // The ticker crawls a line across the bar. Stepped from update() it moved
    // as many times a second as the readouts were redrawn, which at 100ms is
    // ten and reads as a line juddering rather than crawling. A refresh rate is
    // about how often a number is rewritten; this is an animation.
    this.thoughts(s, Date.now())
    this.panes.find((p) => p.id === this.active)?.animate?.(s)
  }

  update(s: GameState, inkRate: Decimal): void {

    // The run is over and waiting on you. Said once, not every frame.
    const full = mustWager(s)
    if (full && !this.announcedFull) this.toast('THE TABLE IS FULL.  CALL THE WAGER.')
    this.announcedFull = full

    for (const id of checkAchievements(s)) {
      const a = achievementById(id)
      if (a) this.toast(`ARCHIVE  ${a.name}`)
    }

    this.lastState = s
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
      // Ink comes off the first solid, so the rate is a rate exactly when
      // that one die rolls without being asked.
      dieRollsItself(s, 1) ? `${format(inkRate, n)}/s` : `${format(inkPerRoll(s), n)} per roll`,
    )
    const showChips = s.wagers > 0 || s.chips.gt(0)
    this.chipsOut.show(showChips)
    if (showChips) {
      const now = Date.now()
      if (this.chipsSeen === null) {
        this.chipsSeen = s.chips
        this.chipsAt = now
      } else {
        const dt = (now - this.chipsAt) / 1000
        if (dt >= 0.25) {
          const gained = s.chips.minus(this.chipsSeen)
          const per = gained.gt(0) ? gained.div(dt) : new Decimal(0)
          const k = Math.min(1, dt / 3)
          this.chipsRate = this.chipsRate.times(1 - k).plus(per.times(k))
          this.chipsSeen = s.chips
          this.chipsAt = now
        }
      }
      // Only once the wall is down. Before it a Wager pays exactly one and the
      // rate is a statement about how fast you are pressing, which is what the
      // ink readout already says.
      this.chipsOut.set(
        format(s.chips, n),
        s.broke ? `${format(this.chipsRate, n)}/s` : '',
      )
    }

    // What the codices are worth, rather than how many there are: the number
    // in the bar is spent as an exponent, so the raw count says less than the
    // multiplier it buys.
    const showEsp = codicesUnlocked(s)
    this.espOut.show(showEsp)
    if (showEsp) {
      this.espOut.set(format(s.esperienza, n), `x${format(esperienzaMultiplier(s), n)}`)
    }

    const open = new Set<TabId>()
    for (const p of this.panes) {
      const btn = this.tabButtons.get(p.id)
      const on = p.visible ? p.visible(s) : true
      if (on) open.add(p.id)
      // Shown only when it is in the group you are looking at. A pane that is
      // unlocked but in another group is not hidden, it is one tap away.
      // `hidden` is about this frame's menu; `data-open` is about the save.
      // A pane in another group is not hidden because it is sealed, it is
      // hidden because you are looking somewhere else, and the two questions
      // have different answers now that the menu has two levels.
      if (btn) btn.dataset.open = on ? '1' : ''
      if (btn) btn.hidden = !on || groupOf(p.id)?.id !== this.activeGroup
      if (btn) btn.classList.toggle('on', this.active === p.id)
      const mark = this.tabMarks.get(p.id)
      if (mark) mark.hidden = !isMarked(s, p.id)
      // Announce a tab the first time it appears, but not on the first frame,
      // when everything already open would announce itself at once.
      if (on && this.announced && !this.seenTabs.has(p.id)) this.toast(`UNLOCKED  ${p.label}`)
      if (on) this.seenTabs.add(p.id)
      // A tab that vanishes under the player drops them back to the table.
      if (!on && this.active === p.id) this.select('table')
      if (on && this.active === p.id) p.update(s)
    }

    // A group exists when anything inside it does, so the top level unseals
    // itself one system at a time exactly as the flat bar used to.
    for (const g of NAV_GROUPS) {
      const btn = this.groupButtons.get(g.id)
      const shown = g.panes.filter((id) => open.has(id))
      if (btn) btn.dataset.open = shown.length ? '1' : ''
      if (btn) btn.hidden = shown.length === 0
      // AD's rule: a parent carries the mark of any child.
      const mark = this.groupMarks.get(g.id)
      if (mark) mark.hidden = g.id === this.activeGroup || !anyMarked(s, shown)
    }

    // The second strip earns its space only when there is a choice in it. A
    // group holding one visible pane is a tab, and a bar under it saying the
    // same word twice is furniture.
    const siblings = (NAV_GROUPS.find((g) => g.id === this.activeGroup)?.panes ?? [])
      .filter((id) => open.has(id))
    this.subtabStrip.hidden = siblings.length < 2
    this.announced = true
  }
}

export { el }
