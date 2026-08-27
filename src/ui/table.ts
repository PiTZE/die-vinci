import Decimal from 'break_infinity.js'
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
  rollInterval,
  rollProgress,
  rolling,
  mustWager,
  rollingItself,
  meanFace,
  faceBias,
  FACE_READABLE_S,
} from '../game/production'
import { WAGER_AT } from '../game/balance'
import { format, formatWhole } from '../format'
import type { GameState } from '../state'
import { el, type Actions, type Pane } from './shell'
import { bindKey, holdable } from './hold'
import { Confirmer } from './confirm'
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

export function tablePane(): Pane {
  let confirm: Confirmer
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
  let runFill: HTMLElement
  let runLabel: HTMLElement
  let lastFace = 0


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
        rows.push({ root: r, icon, face, mult, blocks, amount, rate: flow, buy, buyLabel, buyCost })
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
      folioBtn.addEventListener('click', () => {
        if (confirm.request('folio')) actions.buyFolio()
      })

      studyBtn = el('button', 'action', '')
      studyBtn.type = 'button'
      studyBtn.title = 'Take a study  (s)'
      studyBtn.addEventListener('click', () => {
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
      runBar = el('div', 'run-bar')
      runFill = el('span', 'run-bar-fill')
      runLabel = el('span', 'run-bar-label', '')
      runBar.append(runFill, runLabel)

      root.append(grid, runBar)

      // Same actions from the keyboard, held or tapped. Digits are read from
      // the physical key so shift+1 still means the first solid.
      bindKey('m', () => actions.maxAll())
      bindKey('space', () => actions.roll())
      bindKey('r', () => actions.buyRollRate())
      bindKey('s', () => {
        if (canStudyNow && confirm.request('study')) actions.buyStudy()
      })
      bindKey('f', () => {
        if (canFolioNow && confirm.request('folio')) actions.buyFolio()
      })
      for (const def of SOLIDS) {
        bindKey(String(def.idx), (mods) => actions.buySolid(def.idx, mods.shift))
      }
    },

    action() {
      return actionGroup
    },

    update(s: GameState) {
      const n = s.options.notation
      // openSolids, not unlockedSolids, because a challenge can cut the chain
      // short.
      const open = openSolids(s)
      const rate = rollRate(s)
      const now = Date.now()

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
      const duration = rollInterval(s)
      const readable = duration >= FACE_READABLE_S

      // A throw is an eased curve arriving at rest. Rolls too fast to watch
      // get one continuous turn instead, because restarting that curve every
      // thirty milliseconds is a stutter rather than an animation.
      setBlur(spinning && !readable)
      if (!spinning) setThrow(1, duration)
      else if (readable) setThrow(rollProgress(s, now), duration)

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
      rollNow.hidden = rollingItself(s) || full
      if (!s.autoRoll) {
        const p = rollProgress(s, now)
        const pct = `${Math.round(p * 100)}%`
        if (rollFill.style.width !== pct) rollFill.style.width = pct
        rollNow.classList.toggle('buyable', !s.rollStartedAt && s.haltMs <= 0)
      }
      const canMax = canMaxAll(s)
      maxBtn.disabled = !canMax
      maxBtn.classList.toggle('buyable', canMax)

      canStudyNow = canBuyStudy(s)
      barStudy.disabled = !canStudyNow
      barStudy.classList.toggle('buyable', canStudyNow)

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
        // solid does not tumble and announce a number that pays nothing.
        const rolling = st.amount.gt(0)
        setDieRolling(r.icon, rolling)
        // Slow enough to read, and it is the face this die landed on. Faster
        // than that, the digit was blanked, so the column emptied exactly when
        // the table got interesting. It holds the die's average instead, which
        // is what a run of rolls that fast actually pays.
        if (!rolling) setText(r.face, '')
        else if (readable) {
          const face = s.faces[def.idx - 1]
          setText(r.face, face ? String(face) : '')
        } else {
          // Whole numbers. A die never lands on 10.5, and printing it in the
          // same column that shows a landed face the rest of the time reads as
          // a broken number rather than as an average.
          setText(r.face, String(Math.floor(meanFace(def.faces, faceBias(s)))))
        }

        // Averaged over the faces, because that is what the row actually pays
        // over any run of rolls. Per second only once the automator is rolling:
        // before it, a rate per second is a claim about how fast you press.
        const each = st.amount.times(mult).times(meanFace(def.faces, faceBias(s)))
        const per = rollingItself(s) ? each.times(rate) : each
        const unit = def.idx === 1 ? 'ink' : SOLIDS[def.idx - 2].short
        setText(r.rate, `+${format(per, n)} ${unit}${rollingItself(s) ? '/s' : '/roll'}`)

        const count = buyCount(s, def.idx)
        const price = buyPrice(s, def.idx)
        setText(r.buyLabel, `BUY ${count}`)
        setText(r.buyCost, format(price, n))
        r.buy.title = `${into}/10 toward the next doubling`
        const can = canBuySolid(s, def.idx)
        r.buy.disabled = !can
        r.buy.classList.toggle('buyable', can)
      }

      // Gated exactly as the WAGER tab is, so the bar and the tab that explains
      // it arrive together and neither gives the other away early.
      const showRun = s.wagers > 0 || s.ink.gte(WAGER_AT.div(1e60))
      runBar.hidden = !showRun
      // Emptied rather than merely hidden. Before the first Wager this gate can
      // close again, when a study drops the ink back under the threshold, and
      // the spoiler test reads textContent, which includes hidden nodes. A
      // label left behind would name the Wager to someone who has not met it.
      if (!showRun) setText(runLabel, '')
      if (showRun) {
        const pct = Math.min(100, (Math.max(0, s.ink.log10()) / WAGER_AT.log10()) * 100)
        setText(runLabel, `TO THE WAGER  ${pct.toFixed(2)}%`)
        const w = `${pct.toFixed(2)}%`
        if (runFill.style.width !== w) runFill.style.width = w
      }

      setText(rollLine, `${format(new Decimal(rate), n)}/s`)
      const rc = rollCost(s)
      duo(rollBtn, 'FASTER', `${format(rc, n)} INK`)
      const canRoll = canBuyRollRate(s)
      rollBtn.disabled = !canRoll
      rollBtn.classList.toggle('buyable', canRoll)

      // XIII Death is the gate, so nothing about melting exists until it does.
      meltRow.hidden = !meltUnlocked(s)
      if (meltUnlocked(s)) {
        const can = canMelt(s)
        if (confirm.isArmed('melt')) duo(meltBtn, 'SURE? THIS DESTROYS THE CHAIN')
        else duo(meltBtn, 'MELT', `x${format(meltGain(s), n)} ON ${SOLIDS[openSolids(s) - 1].short}`)
        meltBtn.disabled = !can
        meltBtn.classList.toggle('buyable', can)
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
      studyBtn.classList.toggle('buyable', canStudy)

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
        barFolio.classList.toggle('buyable', canFolioNow)
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
