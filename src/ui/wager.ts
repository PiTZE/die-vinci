import { format } from '../format'
import { WAGER_AT } from '../game/balance'
import {
  UPGRADES,
  UPGRADE_CHAINS,
  canBuy,
  isAvailable,
  isBought,
  type UpgradeId,
} from '../game/upgrades'
import { canWager, pointsFromWager, wagerProgress } from '../game/wager'
import type { GameState } from '../state'
import { el, type Actions, type Pane } from './shell'
import { bindKey, holdable } from './hold'

function setText(n: HTMLElement, v: string): void {
  if (n.textContent !== v) n.textContent = v
}

export function wagerPane(): Pane {
  let callBtn: HTMLButtonElement
  let callBar: HTMLElement
  let callLine: HTMLElement
  let pointsLine: HTMLElement
  const cells = new Map<UpgradeId, { btn: HTMLButtonElement; cost: HTMLElement }>()

  return {
    id: 'wager',
    label: 'WAGER',

    // Hidden until the threshold is in sight, so it does not sit there empty
    // for the whole first run.
    visible: (s) => s.wagers > 0 || s.ink.gte(WAGER_AT.div(1e60)),

    mount(root, actions: Actions) {
      const call = el('div', 'section')
      const ch = el('div', 'section-head')
      ch.appendChild(el('span', 'grow', 'THE WAGER'))
      callLine = el('span', 'num dim', '')
      ch.appendChild(callLine)
      call.appendChild(ch)

      const barWrap = el('div', 'wager-bar')
      callBar = el('div', 'wager-bar-fill')
      barWrap.appendChild(callBar)
      call.appendChild(barWrap)

      callBtn = el('button', 'action', '')
      callBtn.type = 'button'
      callBtn.title = 'Call the Wager  (w)'
      holdable(callBtn, () => actions.wager())
      const cr = el('div', 'row')
      cr.appendChild(callBtn)
      call.appendChild(cr)

      const grid = el('div', 'section')
      const gh = el('div', 'section-head')
      gh.appendChild(el('span', 'grow', 'POINTS'))
      pointsLine = el('span', 'num dim', '')
      gh.appendChild(pointsLine)
      grid.appendChild(gh)

      const cols = el('div', 'upgrade-grid')
      for (const chain of UPGRADE_CHAINS) {
        const col = el('div', 'upgrade-col')
        for (const id of chain) {
          const def = UPGRADES[id]
          const btn = el('button', 'upgrade')
          btn.type = 'button'
          btn.title = def.note
          btn.appendChild(el('span', 'upgrade-label', def.label))
          const cost = el('span', 'upgrade-cost', String(def.cost))
          btn.appendChild(cost)
          btn.addEventListener('click', () => actions.buyUpgrade(id))
          col.appendChild(btn)
          cells.set(id, { btn, cost })
        }
        cols.appendChild(col)
      }
      grid.appendChild(cols)

      root.append(call, grid)

      bindKey('w', () => actions.wager())
    },

    update(s: GameState) {
      const n = s.options.notation

      setText(callLine, `${s.wagers}`)
      const pct = `${(wagerProgress(s) * 100).toFixed(1)}%`
      if (callBar.style.width !== pct) callBar.style.width = pct
      const ready = canWager(s)
      setText(
        callBtn,
        ready
          ? `CALL THE WAGER  +${format(pointsFromWager(), n)}`
          : `${format(s.ink, n)} / ${format(WAGER_AT, n)} INK`,
      )
      callBtn.disabled = !ready
      callBtn.classList.toggle('buyable', ready)

      setText(pointsLine, format(s.points, n))
      for (const [id, cell] of cells) {
        const bought = isBought(s, id)
        const affordable = canBuy(s, id)
        cell.btn.disabled = bought || !affordable
        cell.btn.classList.toggle('bought', bought)
        cell.btn.classList.toggle('buyable', affordable)
        cell.btn.classList.toggle('locked', !bought && !isAvailable(s, id))
        setText(cell.cost, bought ? 'HELD' : String(UPGRADES[id].cost))
      }
    },
  }
}
