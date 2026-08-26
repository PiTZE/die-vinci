import Decimal from 'break_infinity.js'
import { SOLIDS } from '../game/solids'
import {
  buyCount,
  buyPrice,
  canBuyFolio,
  canBuyRollRate,
  canBuySolid,
  canBuyStudy,
  folioReq,
  folioUnlocked,
  manualRollYield,
  rollCost,
  rollRate,
  solidMultiplier,
  studyReq,
} from '../game/production'
import { format, formatWhole } from '../format'
import { unlockedSolids, type GameState } from '../state'
import { el, type Actions, type Pane } from './shell'
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
  let handBtn: HTMLButtonElement
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
      handBtn = el('button', 'roll', 'ROLL')
      handBtn.type = 'button'
      handBtn.addEventListener('click', () => actions.roll())

      const chain = el('div', 'section')
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
        buy.addEventListener('click', () => actions.buySolid(def.idx))
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
      rollBtn.addEventListener('click', () => actions.buyRollRate())
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
      studyBtn.addEventListener('click', () => actions.buyStudy())
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
      folioBtn.addEventListener('click', () => actions.buyFolio())
      const fr = el('div', 'row')
      fr.appendChild(folioBtn)
      folioSection.appendChild(fr)

      root.append(handBtn, chain, roll, study, folioSection)
    },

    update(s: GameState) {
      const n = s.options.notation
      const open = unlockedSolids(s)
      setText(handBtn, `ROLL  +${format(manualRollYield(s), n)}`)
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
