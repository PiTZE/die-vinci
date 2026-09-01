import { SOLIDS } from '../game/solids'
import {
  buyCount,
  buyPrice,
  canBuyFolio,
  canBuyRollRate,
  canBuySolid,
  canBuyStudy,
  canMaxAll,
  canMelt,
  meltGain,
  meltUnlocked,
  folioReq,
  folioUnlocked,
  rollCost,
  rollRate,
  solidMultiplier,
  studyReq,
  openSolids,
  rollDuration,
  rollProgress,
  rolling,
  mustWager,
  allRollThemselves,
  dieRollsItself,
  handRolling,
  meanFace,
  faceBias,
  FACE_READABLE_S,
} from '../game/production'
import { FACE_AVERAGE_S, FACE_SETTLE_S, WAGER_AT } from '../game/balance'
import { wagerProgress } from '../game/wager'
import { modifiers } from '../game/tarot'
import { format, formatWhole } from '../format'
import type { GameState } from '../state'
import { el, type Actions, type Pane } from './shell'
import { bindKey, holdable, isPressing } from './hold'
import { Confirmer } from './confirm'
import { vesica, type Vesica } from './geometry'
import { setBlur, setDieRolling, setThrow, wireframe } from './wireframe'
import { playThrow, setSpinBed, THROW_ABOVE_S } from './sound'

interface Row {
  root: HTMLElement
  icon: SVGSVGElement
  face: HTMLElement
  mult: HTMLElement
  amount: HTMLElement
  rate: HTMLElement
  buy: HTMLButtonElement
  blocks: HTMLElement[]
  buyLabel: HTMLElement
  buyCost: HTMLElement
  /** What the column is printing, as a float, so it can walk to the average
   *  rather than cut to it. */
  shownFace: number
  /** The last face the digit was redrawn for, so a landing animates once. */
  drawnFace: number
  /** Where this row's walk to the average started, and which walk it was. */
  fromFace: number
  settledFor: number
  /** The last face this die actually landed on, so the column never blanks. */
  lastFace: number
}

/**
 * A verb on the left and what it costs on the right, rather than the two
 * joined by a slash and centred. A centred pair tells you nothing about the
 * button's width, so a button that stretches ends up with its label adrift in
 * the middle of an empty box, and the longer half ellipsises first.
 *
 * Buttons that only ever say one thing do not call this and stay centred.
 */
function duo(btn: HTMLElement, verb: string, cost = ''): void {
  let a = btn.firstElementChild as HTMLElement | null
  let b = a?.nextElementSibling as HTMLElement | null
  if (!a || !b) {
    btn.textContent = ''
    a = el('span', 'btn-verb', '')
    b = el('span', 'btn-cost', '')
    btn.append(a, b)
    btn.classList.add('duo')
  }
  setText(a, verb)
  setText(b, cost)
  // A confirmation replaces both halves with one sentence, which belongs in
  // the middle of the button the way any single label does.
  btn.classList.toggle('solo', cost === '')
}

function setText(n: HTMLElement, v: string): void {
  if (n.textContent !== v) n.textContent = v
}

/**
 * Restarts the landing animation on a node that may already be running it.
 *
 * Removing the class and adding it back in the same task does nothing: the
 * style never resolves in between, so the browser sees no change. Reading a
 * layout property forces it to, which is the standard way and the only way
 * that does not need a second frame.
 */
function land(n: HTMLElement): void {
  n.classList.remove('landed')
  void n.offsetWidth
  n.classList.add('landed')
}

/**
 * A button's state, held long enough to be worth looking at.
 *
 * Late in a run these flip many times a second and every flip is true. MAX
 * spends the ink and the next roll replaces it; a roll is in the air for a
 * fraction of a millisecond and ROLL is briefly not pressable. Rendered
 * honestly, both buttons strobe. Measured at 6.6K rolls a second, ROLL changed
 * state 45 times in two seconds and MAX 43.
 *
 * So a "yes" is held for a beat. A gap shorter than you could have acted on
 * never reaches the screen, and a state that is really gone still shows up
 * within the window. The lie is small and always in the direction of the
 * button being live, which is the direction a player can test for themselves
 * by pressing it.
 */
const STEADY_MS = 350

/**
 * The ready-to-press highlight, which a button being pressed must not show.
 *
 * Holding MAX buys until the ink runs out, so `canMaxAll` goes false and then
 * true again the moment a roll pays, and the button flashed its highlight back
 * on under a finger that had never left it. The same for ROLL between throws.
 * A control that is plainly being used does not need to advertise itself.
 */
function ready(btn: HTMLElement, on: boolean): void {
  btn.classList.toggle('buyable', on && !isPressing(btn))
}

class Steady {
  private at = new Map<string, number>()

  on(key: string, live: boolean, now: number): boolean {
    if (live) {
      this.at.set(key, now)
      return true
    }
    const last = this.at.get(key)
    return last !== undefined && now - last < STEADY_MS
  }
}

export function tablePane(): Pane {
  let confirm: Confirmer
  /**
   * When the rolls crossed out of sight, or 0 while they are still visible.
   *
   * One clock for the whole table rather than one a row, because every row
   * starts its walk from a different random face and they have to arrive
   * together. A rate of approach would have the die that landed on 12 still
   * moving long after the one that landed on 7 had stopped.
   */
  let settleAt = 0
  const rows: Row[] = []
  let maxBtn: HTMLButtonElement
  let barFolio: HTMLButtonElement
  let barStudy: HTMLButtonElement
  let actionGroup: HTMLElement
  let confirmSettings: Record<string, boolean> = {}
  /**
   * Whether a study or a folio can actually be taken right now.
   *
   * The buttons carry this as `disabled`, but a key binding has no button to
   * be disabled, so S and F armed a confirmation for a reset that could not
   * happen. You then pressed the key again to confirm and nothing at all
   * occurred, which reads as the game ignoring you.
   */
  let canStudyNow = false
  let canFolioNow = false
  let rollLine: HTMLElement
  let rollBtn: HTMLButtonElement
  let studyBtn: HTMLButtonElement
  let studyLine: HTMLElement
  let resetHead: HTMLElement
  let folioLabel: HTMLElement
  let folioBtn: HTMLButtonElement
  let folioLine: HTMLElement
  let meltBtn: HTMLButtonElement
  let meltRow: HTMLElement
  let rollNow: HTMLButtonElement
  let rollFill: HTMLElement
  let wagerNow: HTMLButtonElement
  let resetGroup: HTMLElement
  let runBar: HTMLElement
  let runLens: Vesica
  let runLabel: HTMLElement
  let lastFace = 0
  const steady = new Steady()


  return {
    id: 'table',
    label: 'TABLE',

    mount(root, actions: Actions) {
      confirm = new Confirmer((k) => confirmSettings[k] !== false)
      // The same three actions as the panes below, in the thumb's reach. Folio
      // sits left of study to match the section, and both sit left of max.
      barFolio = el('button', 'bar-btn', 'F')
      barFolio.type = 'button'
      barFolio.title = 'Bind a folio  (f)'
      // Held, like MAX and like the f key, which has repeated since it was
      // bound. A plain click here meant the two bar buttons were the only
      // controls in the game that did nothing when you held them.
      //
      // The confirmation still applies. A repeat arms and the next one fires,
      // so a hold takes studies at half the repeat rate rather than skipping
      // the guard, and a single accidental tap still only arms.
      holdable(barFolio, () => {
        if (canFolioNow && confirm.request('folio')) actions.buyFolio()
      })

      barStudy = el('button', 'bar-btn', 'S')
      barStudy.type = 'button'
      barStudy.title = 'Take a study  (s)'
      holdable(barStudy, () => {
        if (canStudyNow && confirm.request('study')) actions.buyStudy()
      })

      // The whole opening of the game is this button. It sits in the middle of
      // the bar because it is pressed more than everything else combined, and
      // it fills as the dice spin so a roll reads as taking time rather than
      // as a button that sometimes does nothing.
      rollNow = el('button', 'bar-roll')
      rollNow.type = 'button'
      rollNow.title = 'Roll the dice  (space)'
      rollFill = el('span', 'bar-roll-fill')
      const rollText = el('span', 'bar-roll-label', 'ROLL')
      rollNow.append(rollFill, rollText)
      // Held rather than clicked, so a fast roll rate does not become a test
      // of how quickly you can tap. It still cannot beat the roll rate, because
      // a roll refuses to start while one is in the air.
      holdable(rollNow, () => actions.roll())

      maxBtn = el('button', 'bar-btn max', 'M')
      maxBtn.type = 'button'
      maxBtn.title = 'Buy the most expensive first, repeatedly  (m)'
      holdable(maxBtn, () => actions.maxAll())

      // The two resets sit at the far left and MAX at the far right. MAX is
      // held constantly and the other two throw a run away, so they should not
      // share a thumb's landing area.
      // At the threshold the bar has one thing on it, because there is one
      // thing left to do. Antimatter Dimensions does the same at Infinity.
      wagerNow = el('button', 'bar-roll wager-now', 'CALL THE WAGER')
      wagerNow.type = 'button'
      wagerNow.hidden = true
      wagerNow.addEventListener('click', () => {
        if (confirm.request('wager')) actions.wager()
      })

      actionGroup = el('div', 'action-group')
      resetGroup = el('div', 'action-side')
      resetGroup.append(barFolio, barStudy)
      actionGroup.append(resetGroup, rollNow, maxBtn, wagerNow)


      const chain = el('div', 'section table-chain')
      const head = el('div', 'section-head')
      head.appendChild(el('span', 'grow', 'THE TABLE'))
      chain.appendChild(head)

      for (const def of SOLIDS) {
        const r = el('div', 'solid')
        // The face reads left of the solid rather than printed over it. On top
        // it had to dim the wireframe to stay legible, which meant the die
        // faded out at the exact moment it had something to say.
        const face = el('span', 'solid-face', '')
        const icon = wireframe(def.id)
        r.append(face, icon)

        const name = el('div', 'solid-name')
        name.appendChild(el('span', 'solid-name-text', `${def.short} ${def.name.toUpperCase()}`))
        r.appendChild(name)

        const amount = el('div', 'solid-amount', '0')
        // The multiplier shares the rate line. On a 390px screen the name row
        // ellipsised it away entirely, which is worse than small.
        const rate = el('div', 'solid-rate')
        const mult = el('span', 'solid-mult', '')
        const flow = el('span', '', '')
        rate.append(mult, ' ', flow)

        const buy = el('button', 'solid-buy', '')
        buy.type = 'button'
        // Purchases into the current group of ten, in the corner of the button
        // that completes it. Ten of them doubles the row's multiplier, and
        // without this the doubling arrives unannounced.
        // Antimatter Dimensions draws this inside the button: one fill for the
        // part of the group of ten already owned, a second for how many more
        // the ink covers right now. It says more than a number and it stops
        // the row needing a separate bar underlining it.
        // The group of ten, as ten blocks behind the label. One block a die,
        // shaded as you buy them, empty again when the tenth lands the
        // doubling. A continuous bar said the same thing and never said which
        // number it was on; ten blocks you can count.
        const steps = el('span', 'solid-steps')
        const blocks: HTMLElement[] = []
        for (let i = 0; i < 10; i++) {
          const b = el('span', 'solid-block')
          blocks.push(b)
          steps.appendChild(b)
        }
        // What it does on the left, what it costs on the right. The two used
        // to be one centred string joined by a slash, which is a label that
        // floats in the middle of whatever width the button happened to get
        // and ellipsises itself when the cost grows.
        const buyLabel = el('span', 'solid-buy-label', '')
        const buyCost = el('span', 'solid-buy-cost', '')
        buy.append(steps, buyLabel, buyCost)
        // Shift buys a single die, the way AD's shift+1-8 does.
        holdable(buy, (m) => actions.buySolid(def.idx, m.shift))
        r.append(amount, rate, buy)

        chain.appendChild(r)
        rows.push({ root: r, icon, face, mult, blocks, amount, rate: flow, buy, buyLabel, buyCost, lastFace: 0, shownFace: 0, drawnFace: 0, fromFace: 0, settledFor: 0 })
      }

      const roll = el('div', 'section table-roll')
      const rh = el('div', 'section-head')
      rh.appendChild(el('span', 'grow', 'ROLL RATE'))
      rollLine = el('span', 'num dim', '')
      rh.appendChild(rollLine)
      roll.appendChild(rh)
      rollBtn = el('button', 'action', '')
      rollBtn.type = 'button'
      rollBtn.title = 'Buy roll rate  (r)'
      holdable(rollBtn, () => actions.buyRollRate())
      const rr = el('div', 'row')
      rr.appendChild(rollBtn)
      roll.appendChild(rr)

      // Folio and study share one section, folio on the left because it is
      // the deeper reset. Before folios are unlocked, study has it to itself.
      const resets = el('div', 'section')
      resetHead = el('div', 'section-head reset-head')

      folioLabel = el('span', 'reset-half')
      folioLine = el('span', 'num dim', '')
      folioLabel.append(el('span', 'grow', 'FOLIO'), folioLine)

      const studyLabel = el('span', 'reset-half')
      studyLine = el('span', 'num dim', '')
      studyLabel.append(el('span', 'grow', 'STUDY'), studyLine)

      resetHead.append(folioLabel, studyLabel)
      resets.appendChild(resetHead)

      folioBtn = el('button', 'action', '')
      folioBtn.type = 'button'
      folioBtn.title = 'Bind a folio  (f)'
      // Held and stickable, like the F in the bar and like the f key. These
      // two were the last controls in the game that only answered a click.
      holdable(folioBtn, () => {
        if (confirm.request('folio')) actions.buyFolio()
      })

      studyBtn = el('button', 'action', '')
      studyBtn.type = 'button'
      studyBtn.title = 'Take a study  (s)'
      holdable(studyBtn, () => {
        if (confirm.request('study')) actions.buyStudy()
      })

      const resetRow = el('div', 'row')
      resetRow.append(folioBtn, studyBtn)
      resets.appendChild(resetRow)

      // Melting is the deepest of the three and the only one that is not a
      // reset, so it gets its own line rather than a third of a row.
      meltBtn = el('button', 'action', '')
      meltBtn.type = 'button'
      meltBtn.title = 'Melt the chain into the solid at the top of it'
      meltBtn.addEventListener('click', () => {
        if (confirm.request('melt')) actions.melt()
      })
      meltRow = el('div', 'row')
      meltRow.appendChild(meltBtn)
      resets.appendChild(meltRow)

      // One container for all three, so the same DOM reads as a stack on a
      // phone and as two columns on a desktop. Roll rate was a full width band
      // above the table, which on a wide screen pushed everything down for a
      // single line of text; beside the chain it costs no height at all.
      const grid = el('div', 'table-grid')
      const controls = el('div', 'table-controls')
      controls.append(resets)
      grid.append(roll, chain, controls)

      // How far through the run you are, kept on the table rather than behind
      // the WAGER tab. Antimatter Dimensions puts its percentage to Infinity on
      // the main screen, and it matters more here. This run does not merely slow
      // down at the threshold. It stops dead and demands a Wager.
      //
      // On a log scale, because the run spans 308 orders of magnitude and a
      // linear bar would read zero for all but the last seconds of it.
      // A Vesica Piscis rather than a rectangle. Euclid's Elements opens by
      // drawing these two circles, and the lens where they cross is where the
      // first equilateral triangle comes from, which is where every solid on
      // this table eventually comes from. A bar said the same number and said
      // nothing else.
      runBar = el('div', 'run-bar')
      runLens = vesica(120)
      runLabel = el('span', 'run-bar-label', '')
      runBar.append(runLens.root, runLabel)

      root.append(grid, runBar)

      // Same actions from the keyboard, held or tapped. Digits are read from
      // the physical key so shift+1 still means the first solid.
      // Named so a held key marks its button the way a held finger does.
      bindKey('m', () => actions.maxAll(), maxBtn)
      bindKey('space', () => actions.roll(), rollNow)
      bindKey('r', () => actions.buyRollRate(), rollBtn)
      bindKey('s', () => {
        if (canStudyNow && confirm.request('study')) actions.buyStudy()
      }, barStudy)
      bindKey('f', () => {
        if (canFolioNow && confirm.request('folio')) actions.buyFolio()
      }, barFolio)
      for (const def of SOLIDS) {
        bindKey(String(def.idx), (mods) => actions.buySolid(def.idx, mods.shift),
          rows[def.idx - 1]?.buy)
      }
    },

    /**
     * The ROLL fill, every frame whatever the refresh rate says.
     *
     * It crosses the button once a roll, so at 100ms it would be ten steps
     * rather than a sweep. The refresh rate is about how often the readouts are
     * rewritten; a bar moving across a button is the opposite case.
     */
    animate(s: GameState) {
      const now = Date.now()

      // A throw is an eased curve arriving at rest. Rolls too fast to watch get
      // one continuous turn instead, because restarting that curve every thirty
      // milliseconds is a stutter rather than an animation.
      //
      // Every frame, whatever the refresh rate says. Fed from update() it moved
      // in as many steps a second as the readouts were redrawn, which at 100ms
      // is ten and reads as a stutter.
      const duration = rollDuration(s)
      const readable = duration >= FACE_READABLE_S
      const spinning = rolling(s) && s.haltMs <= 0 && !mustWager(s)
      setBlur(spinning && !readable)
      if (!spinning) setThrow(1, duration)
      else if (readable) setThrow(rollProgress(s, now), duration)

      // And the fill crossing the ROLL button, which is one sweep a roll.
      //
      // Only while a sweep is something you could watch. Past that the roll is
      // over inside a frame and the fill lands on an unrelated percentage every
      // time it is read: at 6.6K rolls a second the button is a strobe rather
      // than a bar. It sits full instead, which is the same thing the dice do
      // when they stop being throws and become one continuous turn.
      if (s.autoRoll || rollNow.hidden) return
      // Only for a roll you asked for. The roll clock is shared now, so it
      // runs whenever anything is automated, and reading progress off it made
      // the button sweep on its own with nobody touching it.
      if (!handRolling(s)) {
        if (rollFill.style.width !== '0%') rollFill.style.width = '0%'
        return
      }
      const pct = readable ? `${Math.round(rollProgress(s, now) * 100)}%` : '100%'
      if (rollFill.style.width !== pct) rollFill.style.width = pct
    },

    action() {
      return actionGroup
    },

    update(s: GameState) {
      const n = s.options.notation
      const now = Date.now()
      // openSolids, not unlockedSolids, because a challenge can cut the chain
      // short.
      const open = openSolids(s)
      const rate = rollRate(s)
      const globalMult = modifiers(s).globalMult

      // The dice only turn while a roll is in the air. Under the automator
      // that is always, which is exactly the difference the purchase buys.
      const full = mustWager(s)
      const spinning = rolling(s) && s.haltMs <= 0 && !full

      // The bar gives itself over to the one remaining move.
      resetGroup.hidden = full
      maxBtn.hidden = full
      wagerNow.hidden = !full
      wagerNow.textContent = confirm.isArmed('wager') ? 'SURE? THIS RESETS' : 'CALL THE WAGER'
      // Under a fast roll rate the digit would change every frame, which is
      // noise rather than a reading. The dice just spin then.
      const duration = rollDuration(s)
      // The walk to the average: a fixed window off one clock, so it takes
      // the same nine tenths of a second at any refresh rate and every row
      // lands on its own average at the same instant.
      if (duration < FACE_AVERAGE_S) {
        if (!settleAt) settleAt = now
      } else {
        settleAt = 0
      }
      const settle = settleAt ? Math.min(1, (now - settleAt) / 1000 / FACE_SETTLE_S) : 0
      // Smoothstep, so it leaves the face it landed on gently and arrives the
      // same way rather than braking into the average.
      const settleEase = settle * settle * (3 - 2 * settle)

      // The throw itself is driven from animate(), every frame. Feeding it from
      // here would step the tumble at whatever the refresh rate is.

      // A throw is its own sound only while rolls are far enough apart to hear
      // apart. Below that the shake loop underneath takes over, rising and
      // then fading as the rate climbs past the point where a rattle means
      // anything. Manual throws sound on the press, where the gesture is;
      // automated ones have no press, so they sound on each landing.
      const heard = duration >= THROW_ABOVE_S
      const autoLanded = heard && s.autoRoll && s.faces[0] !== lastFace
      if (s.options.sound && autoLanded) playThrow()
      setSpinBed(duration, s.options.sound && spinning)
      lastFace = s.faces[0]

      // Once the automator is in, the button has nothing left to do, since it can
      // never beat the roll rate, and the bar is better off giving the space
      // back to MAX.
      // Hidden only when every die on the table rolls itself. It used to go on
      // the automator flag alone, which after the Wager grants the whole
      // ladder would take the button away and leave a die switched back to
      // your finger with nothing to press it.
      rollNow.hidden = allRollThemselves(s) || full
      if (!s.autoRoll) {
        ready(
          rollNow,
          // Ready when no roll of yours is in the air. Asking rollStartedAt
          // stopped meaning that once the automated dice began setting it.
          steady.on('roll', !handRolling(s) && s.haltMs <= 0, now),
        )
      }
      // Both the look and the disabled flag come off the held value. A press
      // during one of those gaps buys nothing and costs nothing, and leaving
      // the button live means a held finger keeps its repeat instead of being
      // dropped and restarted several times a second.
      const canMax = steady.on('max', canMaxAll(s), now)
      maxBtn.disabled = !canMax
      ready(maxBtn, canMax)

      canStudyNow = canBuyStudy(s)
      barStudy.disabled = !canStudyNow
      ready(barStudy, canStudyNow)

      for (const def of SOLIDS) {
        const r = rows[def.idx - 1]
        // Every solid you have ever opened stays on the table. A reset drops
        // the chain back to one row, and the rest used to vanish with it, so
        // twenty minutes of building disappeared each time you took a study.
        // They stay, dimmed, with what they need written where their rate goes.
        const shown = def.idx <= Math.max(open, s.stats.solidsEver ?? 0)
        r.root.hidden = !shown
        if (!shown) continue
        const locked = def.idx > open
        r.root.classList.toggle('locked', locked)
        if (locked) {
          setText(r.mult, '')
          setText(r.amount, '')
          setText(r.face, '')
          setDieRolling(r.icon, false)
          for (const b of r.blocks) b.classList.remove('on')
          // The next one along has a real number to give. The ones past it are
          // a count of studies, because their requirement depends on solids
          // that do not exist yet and any figure would be invented.
          const away = def.idx - open
          if (away === 1) {
            const q = studyReq(s)
            setText(r.rate, `${formatWhole(q.need, n)} ${SOLIDS[q.idx - 1].short} opens this`)
          } else {
            setText(r.rate, `${away} studies away`)
          }
          setText(r.buyLabel, 'LOCKED')
          setText(r.buyCost, '')
          r.buy.disabled = true
          r.buy.classList.remove('buyable')
          continue
        }

        const st = s.solids[def.idx - 1]
        const mult = solidMultiplier(s, def.idx)
        setText(r.mult, `x${format(mult, n)}`)

        const into = st.bought % 10
        for (let i = 0; i < 10; i++) r.blocks[i].classList.toggle('on', i < into)
        setText(r.amount, formatWhole(st.amount, n))
        // A row with no dice on it sits the throw out entirely, so an empty
        // solid does not tumble and announce a number that pays nothing. And
        // so does one that is not in this roll: the clock is shared, so a
        // single automated die keeps it running, and without this every die
        // on the table span along with the one that was actually rolling.
        // Two different questions, and they had been sharing one answer.
        //
        // The wireframe asks whether this die is in the roll happening now.
        // The column asks whether the row has dice at all, and then whether
        // the last roll passed it by, which the engine already says by
        // leaving its face at zero. Narrowing both to the first question
        // blanked the number the instant a hand roll was spent, which is a
        // tenth of a second after it landed.
        const hasDice = st.amount.gt(0)
        const takesPart = handRolling(s) || dieRollsItself(s, def.idx)
        setDieRolling(r.icon, hasDice && takesPart)
        const rolling = hasDice
        // The column always has a number in it, and it never jumps.
        //
        // It used to empty for the whole of every throw, because startRoll
        // zeroed the faces and the refresh rate samples on its own clock: the
        // window where a face was set lasted about as long as the hold repeat,
        // so at a refresh of 100ms the number was usually missed entirely. On
        // a held button the column read blank for minutes at a time, in a game
        // whose whole feedback is the number a die landed on.
        //
        // Now the engine keeps the last face it landed rather than clearing
        // it, so there is always something true to print, and the column moves
        // through three states as the rolls get faster:
        //
        //   readable   the exact face, redrawn each landing
        //   a blur     still exact faces, changing as fast as the screen can
        //   invisible  the die's average, walked to rather than cut to
        //
        // The walk is the point of the third one. A d12 that landed on 9 does
        // not become 6.5 between two frames; it travels there over about a
        // second, which is how the eye is told that the number stopped being a
        // reading and became a statistic.
        if (!rolling) {
          setText(r.face, '')
          r.lastFace = 0
          r.shownFace = 0
        } else if (!s.faces[def.idx - 1] && !r.lastFace) {
          // Nothing has landed on this row yet.
          setText(r.face, '')
          r.shownFace = 0
        } else if (!s.faces[def.idx - 1] && !dieRollsItself(s, def.idx) && !handRolling(s)) {
          // It sat the last roll out. Since the engine stopped clearing faces
          // on a throw, a zero here means exactly that and nothing else, and
          // holding the number it landed on three minutes ago made a table
          // where one die was automated look like a table where all of them
          // were.
          setText(r.face, '')
          r.lastFace = 0
          r.shownFace = 0
        } else {
          const face = s.faces[def.idx - 1]
          if (face) r.lastFace = face
          const mean = meanFace(def.faces, faceBias(s))
          if (duration >= FACE_AVERAGE_S) {
            // Fast or slow, this is a real face off a real roll. Only the rate
            // it changes at differs, and the dice underneath are doing the
            // same thing.
            if (r.lastFace) {
              if (r.lastFace !== r.drawnFace) land(r.face)
              r.shownFace = r.lastFace
              setText(r.face, String(r.lastFace))
            } else {
              setText(r.face, '')
            }
            // Never dimmed. It used to grey to 30% while a throw was in the
            // air, which was right when a throw in the air meant the column
            // was showing you the previous number because this one had not
            // landed. The engine keeps the last face now, so that is simply
            // what the column shows, and a die is in the air for the whole
            // interval and at rest for a single frame: the number spent
            // almost all of its life at 30% with a 120ms fade either side.
          } else {
            // Fixed from the face this die was showing when the rolls went out
            // of sight, so the whole table walks in step.
            if (r.settledFor !== settleAt) {
              r.fromFace = r.shownFace > 0 ? r.shownFace : r.lastFace || mean
              r.settledFor = settleAt
            }
            r.shownFace = r.fromFace + (mean - r.fromFace) * settleEase
            // A whole number, all the way down.
            //
            // This printed one decimal place, on the reasoning that a die's
            // average is rarely whole and rounding it would land back on a
            // face the die could actually roll. That is true and it was the
            // wrong call: the column is nine rows of die faces, every one of
            // them an integer, and 2.5 sitting among them reads as a fault
            // rather than as a statistic. Floored rather than rounded so a
            // d12 settles on 6, which is the number a player expects half of
            // twelve to be.
            setText(r.face, String(Math.floor(r.shownFace)))
          }
          r.drawnFace = r.lastFace
        }

        // Averaged over the faces, because that is what the row actually pays
        // over any run of rolls. Per second only once the automator is rolling:
        // before it, a rate per second is a claim about how fast you press.
        //
        // globalMult belongs here for the same reason produce() applies it to
        // every tier and not to the ink alone. Left out, the Tower's x100
        // window moved the header rate and left every row it was multiplying
        // sitting still, which reads as the card not working.
        const each = st.amount
          .times(mult)
          .times(meanFace(def.faces, faceBias(s)))
          .times(globalMult)
        // Per second for a die that rolls itself, per roll for one still
        // waiting on your finger. With the ladder half bought the table says
        // which half is which without a word of explanation.
        const rollsAlone = dieRollsItself(s, def.idx)
        const per = rollsAlone ? each.times(rate) : each
        const unit = def.idx === 1 ? 'ink' : SOLIDS[def.idx - 2].short
        setText(r.rate, `+${format(per, n)} ${unit}${rollsAlone ? '/s' : '/roll'}`)

        const count = buyCount(s, def.idx)
        const price = buyPrice(s, def.idx)
        setText(r.buyLabel, `BUY ${count}`)
        setText(r.buyCost, format(price, n))
        r.buy.title = `${into}/10 toward the next doubling`
        // Held steady per row. Under a fast roll rate the ink crosses a
        // price several times a second, and nine rows blinking together is the
        // whole table strobing.
        const can = steady.on(`buy${def.idx}`, canBuySolid(s, def.idx), now)
        r.buy.disabled = !can
        ready(r.buy, can)
      }

      // Gated exactly as the WAGER tab is, so the bar and the tab that explains
      // it arrive together and neither gives the other away early.
      const showRun = s.wagers > 0 || s.inkThisWager.gte(WAGER_AT.div(1e60))
      runBar.hidden = !showRun
      // Emptied rather than merely hidden. Before the first Wager this gate can
      // close again, when a study drops the ink back under the threshold, and
      // the spoiler test reads textContent, which includes hidden nodes. A
      // label left behind would name the Wager to someone who has not met it.
      if (!showRun) setText(runLabel, '')
      if (showRun) {
        // wagerProgress, not a second copy of the maths. It measures what the
        // run has earned rather than what it is holding, so a study no longer
        // throws the bar away along with the table.
        const pct = wagerProgress(s) * 100
        setText(runLabel, `TO THE WAGER  ${pct.toFixed(2)}%`)
        runLens.set(wagerProgress(s))
      }

      setText(rollLine, `${format(rate, n)}/s`)
      const rc = rollCost(s)
      duo(rollBtn, 'FASTER', `${format(rc, n)} INK`)
      const canRoll = steady.on('faster', canBuyRollRate(s), now)
      rollBtn.disabled = !canRoll
      ready(rollBtn, canRoll)

      // XIII Death is the gate, so nothing about melting exists until it does.
      meltRow.hidden = !meltUnlocked(s)
      if (meltUnlocked(s)) {
        const can = canMelt(s)
        if (confirm.isArmed('melt')) duo(meltBtn, 'SURE? THIS DESTROYS THE CHAIN')
        else duo(meltBtn, 'MELT', `x${format(meltGain(s), n)} ON ${SOLIDS[openSolids(s) - 1].short}`)
        meltBtn.disabled = !can
        ready(meltBtn, can)
      }

      confirmSettings = s.options.confirms
      const studyArmed = confirm.isArmed('study')
      const folioArmed = confirm.isArmed('folio')

      const sq = studyReq(s)
      setText(studyLine, `${s.studies}`)
      if (studyArmed) duo(studyBtn, 'SURE? THIS RESETS')
      else duo(studyBtn, 'STUDY', `${formatWhole(sq.need, n)} ${SOLIDS[sq.idx - 1].short}`)
      setText(barStudy, studyArmed ? '?' : 'S')
      const canStudy = canBuyStudy(s)
      studyBtn.disabled = !canStudy
      ready(studyBtn, canStudy)

      const showFolio = folioUnlocked(s)
      folioLabel.hidden = !showFolio
      // With folio hidden, study has the header to itself and there is nothing
      // for the rule down the middle to divide.
      resetHead.classList.toggle('alone', !showFolio)
      folioBtn.hidden = !showFolio
      barFolio.hidden = !showFolio
      canFolioNow = showFolio && canBuyFolio(s)
      if (showFolio) {
        barFolio.disabled = !canFolioNow
        ready(barFolio, canFolioNow)
      }
      if (showFolio) {
        const { idx, need } = folioReq(s)
        setText(folioLine, `${s.folios}`)
        if (folioArmed) duo(folioBtn, 'SURE? THIS RESETS')
        else duo(folioBtn, 'FOLIO', `${formatWhole(need, n)} ${SOLIDS[idx - 1].short}`)
        setText(barFolio, folioArmed ? '?' : 'F')
        const canFolio = canBuyFolio(s)
        folioBtn.disabled = !canFolio
        folioBtn.classList.toggle('buyable', canFolio)
      }
    },
  }
}
