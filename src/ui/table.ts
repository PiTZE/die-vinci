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
} from '../game/production'
import { format, formatWhole } from '../format'
import type { GameState } from '../state'
import { el, type Actions, type Pane } from './shell'
import { bindKey, holdable } from './hold'
import { wireframe } from './wireframe'

interface Row {
  root: HTMLElement
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
  const rows: Row[] = []
  let maxBtn: HTMLButtonElement
  let barFolio: HTMLButtonElement
  let barStudy: HTMLButtonElement
  let actionGroup: HTMLElement
  let rollLine: HTMLElement
  let rollBtn: HTMLButtonElement
  let studyBtn: HTMLButtonElement
  let studyLine: HTMLElement
  let folioLabel: HTMLElement
  let folioBtn: HTMLButtonElement
  let folioLine: HTMLElement

  return {
    id: 'table',
    label: 'TABLE',

    mount(root, actions: Actions) {
      // The same three actions as the panes below, in the thumb's reach. Folio
      // sits left of study to match the section, and both sit left of max.
      barFolio = el('button', 'bar-btn', 'F')
      barFolio.type = 'button'
      barFolio.title = 'Bind a folio  (f)'
      holdable(barFolio, () => actions.buyFolio())

      barStudy = el('button', 'bar-btn', 'S')
      barStudy.type = 'button'
      barStudy.title = 'Take a study  (s)'
      holdable(barStudy, () => actions.buyStudy())

      maxBtn = el('button', 'bar-btn max', 'M')
      maxBtn.type = 'button'
      maxBtn.title = 'Buy the most expensive first, repeatedly  (m)'
      holdable(maxBtn, () => actions.maxAll())

      actionGroup = el('div', 'action-group')
      actionGroup.append(barFolio, barStudy, maxBtn)


      const chain = el('div', 'section table-chain')
      const head = el('div', 'section-head')
      head.appendChild(el('span', 'grow', 'THE TABLE'))
      chain.appendChild(head)

      for (const def of SOLIDS) {
        const r = el('div', 'solid')
        r.appendChild(wireframe(def.id))

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
        rows.push({ root: r, mult, step, bar, barCan, amount, rate: flow, buy, buyLabel })
      }

      const roll = el('div', 'section')
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
      holdable(folioBtn, () => actions.buyFolio())

      studyBtn = el('button', 'action', '')
      studyBtn.type = 'button'
      studyBtn.title = 'Take a study  (s)'
      holdable(studyBtn, () => actions.buyStudy())

      const resetRow = el('div', 'row')
      resetRow.append(folioBtn, studyBtn)
      resets.appendChild(resetRow)

      // Wide screens put the chain and its controls side by side. Stacked, the
      // controls left most of a desktop empty and pushed the chain off centre.
      const grid = el('div', 'table-grid')
      // Roll rate multiplies the whole chain, so it sits above the chain
      // rather than beside it.
      const controls = el('div', 'table-controls')
      controls.append(resets)
      grid.append(chain, controls)
      root.append(roll, grid)

      // Same actions from the keyboard, held or tapped. Digits are read from
      // the physical key so shift+1 still means the first solid.
      bindKey('m', () => actions.maxAll())
      bindKey('r', () => actions.buyRollRate())
      bindKey('s', () => actions.buyStudy())
      bindKey('f', () => actions.buyFolio())
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

        const per = st.amount.times(mult).times(rate)
        const unit = def.idx === 1 ? 'ink' : SOLIDS[def.idx - 2].short
        setText(r.rate, `+${format(per, n)} ${unit}/s`)

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

      const sq = studyReq(s)
      setText(studyLine, `${s.studies}`)
      setText(studyBtn, `STUDY / ${formatWhole(sq.need, n)} ${SOLIDS[sq.idx - 1].short}`)
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
        setText(folioBtn, `FOLIO / ${formatWhole(need, n)} ${SOLIDS[idx - 1].short}`)
        const canFolio = canBuyFolio(s)
        folioBtn.disabled = !canFolio
        folioBtn.classList.toggle('buyable', canFolio)
      }
    },
  }
}
