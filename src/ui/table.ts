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
  step: HTMLElement
  bar: HTMLElement
  barCan: HTMLElement
  amount: HTMLElement
  rate: HTMLElement
  buy: HTMLButtonElement
  buyLabel: HTMLElement
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
  let rollLine: HTMLElement
  let rollBtn: HTMLButtonElement
  let studyBtn: HTMLButtonElement
  let studyLine: HTMLElement
  let folioLabel: HTMLElement
  let folioBtn: HTMLButtonElement
  let folioLine: HTMLElement
  let rollNow: HTMLButtonElement
  let rollFill: HTMLElement
  let wagerNow: HTMLButtonElement
  let resetGroup: HTMLElement
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
      barFolio.addEventListener('click', () => {
        if (confirm.request('folio')) actions.buyFolio()
      })

      barStudy = el('button', 'bar-btn', 'S')
      barStudy.type = 'button'
      barStudy.title = 'Take a study  (s)'
      barStudy.addEventListener('click', () => {
        if (confirm.request('study')) actions.buyStudy()
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
      // of how quickly you can tap. It still cannot beat the roll rate: a roll
      // refuses to start while one is in the air.
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
        const bar = el('span', 'solid-fill')
        const barCan = el('span', 'solid-fill-can')
        const step = el('span', 'solid-step', '')
        const buyLabel = el('span', 'solid-buy-label', '')
        buy.append(bar, barCan, step, buyLabel)
        // Shift buys a single die, the way AD's shift+1-8 does.
        holdable(buy, (m) => actions.buySolid(def.idx, m.shift))
        r.append(amount, rate, buy)

        chain.appendChild(r)
        rows.push({ root: r, icon, face, mult, step, bar, barCan, amount, rate: flow, buy, buyLabel })
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
      const resetHead = el('div', 'section-head reset-head')

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

      // One container for all three, so the same DOM reads as a stack on a
      // phone and as two columns on a desktop. Roll rate was a full width band
      // above the table, which on a wide screen pushed everything down for a
      // single line of text; beside the chain it costs no height at all.
      const grid = el('div', 'table-grid')
      const controls = el('div', 'table-controls')
      controls.append(resets)
      grid.append(roll, chain, controls)
      root.append(grid)

      // Same actions from the keyboard, held or tapped. Digits are read from
      // the physical key so shift+1 still means the first solid.
      bindKey('m', () => actions.maxAll())
      bindKey('space', () => actions.roll())
      bindKey('r', () => actions.buyRollRate())
      bindKey('s', () => {
        if (confirm.request('study')) actions.buyStudy()
      })
      bindKey('f', () => {
        if (confirm.request('folio')) actions.buyFolio()
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
      // openSolids, not unlockedSolids: a challenge can cut the chain short.
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

      // Once the automator is in, the button has nothing left to do: it can
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

      const canStudyNow = canBuyStudy(s)
      barStudy.disabled = !canStudyNow
      barStudy.classList.toggle('buyable', canStudyNow)

      for (const def of SOLIDS) {
        const r = rows[def.idx - 1]
        const shown = def.idx <= open
        r.root.hidden = !shown
        if (!shown) continue

        const st = s.solids[def.idx - 1]
        const mult = solidMultiplier(s, def.idx)
        setText(r.mult, `x${format(mult, n)}`)

        const into = st.bought % 10
        setText(r.step, `${into}/10`)
        const pct = `${into * 10}%`
        if (r.bar.style.width !== pct) r.bar.style.width = pct
        const affordable = canBuySolid(s, def.idx) ? buyCount(s, def.idx) : 0
        const canPct = `${Math.min(10 - into, affordable) * 10}%`
        if (r.barCan.style.left !== pct) r.barCan.style.left = pct
        if (r.barCan.style.width !== canPct) r.barCan.style.width = canPct
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
        setText(r.buyLabel, `BUY ${count} / ${format(price, n)}`)
        const can = canBuySolid(s, def.idx)
        r.buy.disabled = !can
        r.buy.classList.toggle('buyable', can)
      }

      setText(rollLine, `${format(new Decimal(rate), n)}/s`)
      const rc = rollCost(s)
      setText(rollBtn, `FASTER / ${format(rc, n)} INK`)
      const canRoll = canBuyRollRate(s)
      rollBtn.disabled = !canRoll
      rollBtn.classList.toggle('buyable', canRoll)

      confirmSettings = s.options.confirms
      const studyArmed = confirm.isArmed('study')
      const folioArmed = confirm.isArmed('folio')

      const sq = studyReq(s)
      setText(studyLine, `${s.studies}`)
      setText(
        studyBtn,
        studyArmed ? 'SURE? THIS RESETS' : `STUDY / ${formatWhole(sq.need, n)} ${SOLIDS[sq.idx - 1].short}`,
      )
      setText(barStudy, studyArmed ? '?' : 'S')
      const canStudy = canBuyStudy(s)
      studyBtn.disabled = !canStudy
      studyBtn.classList.toggle('buyable', canStudy)

      const showFolio = folioUnlocked(s)
      folioLabel.hidden = !showFolio
      folioBtn.hidden = !showFolio
      barFolio.hidden = !showFolio
      if (showFolio) {
        const canFolioNow = canBuyFolio(s)
        barFolio.disabled = !canFolioNow
        barFolio.classList.toggle('buyable', canFolioNow)
      }
      if (showFolio) {
        const { idx, need } = folioReq(s)
        setText(folioLine, `${s.folios}`)
        setText(
          folioBtn,
          folioArmed ? 'SURE? THIS RESETS' : `FOLIO / ${formatWhole(need, n)} ${SOLIDS[idx - 1].short}`,
        )
        setText(barFolio, folioArmed ? '?' : 'F')
        const canFolio = canBuyFolio(s)
        folioBtn.disabled = !canFolio
        folioBtn.classList.toggle('buyable', canFolio)
      }
    },
  }
}
