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
} from '../game/production'
import { consumeAway, type AwaySummary } from '../game/offline'
import { format, formatTime, formatWhole } from '../format'
import { unlockedSolids, type GameState } from '../state'
import { el, type Actions, type Pane } from './shell'
import { bindKey, holdable } from './hold'
import { wireframe } from './wireframe'

interface Row {
  root: HTMLElement
  mult: HTMLElement
  amount: HTMLElement
  rate: HTMLElement
  buy: HTMLButtonElement
}

function setText(n: HTMLElement, v: string): void {
  if (n.textContent !== v) n.textContent = v
}

export function tablePane(): Pane {
  const rows: Row[] = []
  let maxBtn: HTMLButtonElement
  let awayRow: HTMLButtonElement
  let shownAway: AwaySummary | null = null
  let rollLine: HTMLElement
  let rollBtn: HTMLButtonElement
  let studyBtn: HTMLButtonElement
  let studyLine: HTMLElement
  let folioSection: HTMLElement
  let folioBtn: HTMLButtonElement
  let folioLine: HTMLElement

  return {
    id: 'table',
    label: 'TABLE',

    mount(root, actions: Actions) {
      // What the game earned while it was not running. Tap to dismiss.
      awayRow = el('button', 'away', '')
      awayRow.type = 'button'
      awayRow.hidden = true
      awayRow.addEventListener('click', () => {
        shownAway = null
        awayRow.hidden = true
      })

      maxBtn = el('button', 'max', 'MAX')
      maxBtn.type = 'button'
      maxBtn.title = 'Buy the most expensive first, repeatedly  (m)'
      holdable(maxBtn, () => actions.maxAll())


      const chain = el('div', 'section table-chain')
      const head = el('div', 'section-head')
      head.appendChild(el('span', 'grow', 'THE TABLE'))
      chain.appendChild(head)

      for (const def of SOLIDS) {
        const r = el('div', 'solid')
        r.appendChild(wireframe(def.id))

        const name = el('div', 'solid-name', `${def.short} ${def.name.toUpperCase()}`)
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
        // Shift buys a single die, the way AD's shift+1-8 does.
        holdable(buy, (m) => actions.buySolid(def.idx, m.shift))
        r.append(amount, rate, buy)

        chain.appendChild(r)
        rows.push({ root: r, mult, amount, rate: flow, buy })
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

      const study = el('div', 'section')
      const sh = el('div', 'section-head')
      sh.appendChild(el('span', 'grow', 'STUDY'))
      studyLine = el('span', 'num dim', '')
      sh.appendChild(studyLine)
      study.appendChild(sh)
      studyBtn = el('button', 'action', '')
      studyBtn.type = 'button'
      studyBtn.title = 'Take a study  (s)'
      holdable(studyBtn, () => actions.buyStudy())
      const sr = el('div', 'row')
      sr.appendChild(studyBtn)
      study.appendChild(sr)

      folioSection = el('div', 'section')
      const fh = el('div', 'section-head')
      fh.appendChild(el('span', 'grow', 'FOLIO'))
      folioLine = el('span', 'num dim', '')
      fh.appendChild(folioLine)
      folioSection.appendChild(fh)
      folioBtn = el('button', 'action', '')
      folioBtn.type = 'button'
      folioBtn.title = 'Bind a folio  (f)'
      holdable(folioBtn, () => actions.buyFolio())
      const fr = el('div', 'row')
      fr.appendChild(folioBtn)
      folioSection.appendChild(fr)

      // Wide screens put the chain and its controls side by side. Stacked, the
      // controls left most of a desktop empty and pushed the chain off centre.
      const grid = el('div', 'table-grid')
      // Roll rate multiplies the whole chain, so it sits above the chain
      // rather than beside it.
      const controls = el('div', 'table-controls')
      controls.append(study, folioSection)
      grid.append(chain, controls)
      root.append(awayRow, roll, grid)

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
      return maxBtn
    },

    update(s: GameState) {
      const n = s.options.notation
      const open = unlockedSolids(s)

      const arrived = consumeAway()
      if (arrived) shownAway = arrived
      if (shownAway) {
        const tail = shownAway.capped ? ' (capped)' : ''
        setText(
          awayRow,
          `AWAY ${formatTime(shownAway.seconds)}${tail}   +${format(shownAway.ink, n)} INK`,
        )
        awayRow.hidden = false
      }
      const canMax = canMaxAll(s)
      maxBtn.disabled = !canMax
      maxBtn.classList.toggle('buyable', canMax)
      const rate = rollRate(s)

      for (const def of SOLIDS) {
        const r = rows[def.idx - 1]
        const shown = def.idx <= open
        r.root.hidden = !shown
        if (!shown) continue

        const st = s.solids[def.idx - 1]
        const mult = solidMultiplier(s, def.idx)
        setText(r.mult, `x${format(mult, n)}`)
        setText(r.amount, formatWhole(st.amount, n))

        const per = st.amount.times(mult).times(rate)
        const unit = def.idx === 1 ? 'ink' : SOLIDS[def.idx - 2].short
        setText(r.rate, `+${format(per, n)} ${unit}/s`)

        const count = buyCount(s, def.idx)
        const price = buyPrice(s, def.idx)
        setText(r.buy, `BUY ${count} / ${format(price, n)}`)
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

      folioSection.hidden = !folioUnlocked(s)
      if (folioUnlocked(s)) {
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
