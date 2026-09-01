import { format } from '../format'
import {
  UPGRADES,
  UPGRADE_CHAINS,
  canBuy,
  isAvailable,
  isBought,
  type UpgradeId,
} from '../game/upgrades'
import type { GameState } from '../state'
import { el, type Actions, type Pane } from './shell'
import { Confirmer } from './confirm'
import {
  canBuyChipMult,
  chipMultCost,
  chipMultUnlocked,
  chipMultiplier,
} from '../game/breaks'

function setText(n: HTMLElement, v: string): void {
  if (n.textContent !== v) n.textContent = v
}

/** Same verb-and-cost shape the table's buttons use. */
function duo(btn: HTMLElement, verb: string, cost: string): void {
  let a = btn.firstElementChild as HTMLElement | null
  let b = a?.nextElementSibling as HTMLElement | null
  if (!a || !b) {
    btn.textContent = ''
    a = document.createElement('span')
    a.className = 'btn-verb'
    b = document.createElement('span')
    b.className = 'btn-cost'
    btn.append(a, b)
    btn.classList.add('duo')
  }
  setText(a, verb)
  setText(b, cost)
}

export function wagerPane(): Pane {
  let confirm: Confirmer
  let confirmSettings: Record<string, boolean> = {}
  let chipsLine: HTMLElement
  let note: HTMLElement
  /** Which upgrade the note line is describing, or empty for the prompt. */
  let noteFor = ''
  let multRow: HTMLElement
  let multBtn: HTMLButtonElement
  const cells = new Map<UpgradeId, { btn: HTMLButtonElement; cost: HTMLElement }>()

  return {
    id: 'wager',
    label: 'WAGER',

    // Nothing here until the first Wager has been called. Everything this
    // pane holds is bought with chips, and there are no chips until then, so
    // before that it is a tab with a locked grid in it and a button that says
    // how far away you are. The table says how far away you are, on the run
    // bar, and the button that calls it lives in the action bar where your
    // thumb already is.
    visible: (s) => s.wagers > 0,

    mount(root, actions: Actions) {
      confirm = new Confirmer((k) => confirmSettings[k.split(':')[0]] !== false)
      const grid = el('div', 'section')
      const gh = el('div', 'section-head')
      gh.appendChild(el('span', 'grow', 'CHIPS'))
      chipsLine = el('span', 'num dim', '')
      gh.appendChild(chipsLine)
      grid.appendChild(gh)

      const cols = el('div', 'upgrade-grid')
      for (const chain of UPGRADE_CHAINS) {
        const col = el('div', 'upgrade-col')
        for (const id of chain) {
          const def = UPGRADES[id]
          const btn = el('button', 'tile upgrade')
          btn.type = 'button'
          btn.title = def.note
          btn.appendChild(el('span', 'tile-name', def.label))
          const cost = el('span', 'tile-mark', String(def.cost))
          btn.appendChild(cost)
          // Armed per upgrade, not once for all of them: a shared key would
          // let you arm one tile and fire a different one with the next tap,
          // which is the mis-tap this is here to stop.
          btn.addEventListener('click', () => {
            if (def.cost <= 1 || confirm.request(`upgrade:${id}`)) actions.buyUpgrade(id)
          })
          // A title attribute is a hover, and a phone has no hover. Touching
          // one writes it out below the grid instead, which also means an
          // upgrade you cannot yet afford can be read before you commit to
          // saving for it.
          const describe = () => {
            noteFor = id
            setText(note, `${def.label}  ${def.note}`)
          }
          btn.addEventListener('pointerenter', describe)
          btn.addEventListener('pointerdown', describe)
          btn.addEventListener('focus', describe)
          col.appendChild(btn)
          cells.set(id, { btn, cost })
        }
        cols.appendChild(col)
      }
      grid.appendChild(cols)
      note = el('div', 'upgrade-note', '')
      grid.appendChild(note)

      // AD's ipMult: a rebuyable that doubles the payout, opened by owning the
      // whole grid above it. Its cost is AD's too, 10^(n+1).
      multRow = el('div', 'row')
      multBtn = el('button', 'action', '')
      multBtn.type = 'button'
      multBtn.title = 'Double what every Wager pays'
      multBtn.addEventListener('click', () => actions.buyChipMult())
      multRow.appendChild(multBtn)
      grid.appendChild(multRow)

      root.append(grid)
    },

    update(s: GameState) {
      const n = s.options.notation

      // Held until something else is touched, and replaced by the prompt when
      // nothing has been. An empty line here would collapse the grid's footer
      // and shift everything under it on the first tap.
      if (!noteFor) setText(note, 'touch an upgrade to read what it does')

      confirmSettings = s.options.confirms

      setText(chipsLine, format(s.chips, n))

      const multOpen = chipMultUnlocked(s)
      multRow.hidden = !multOpen
      if (multOpen) {
        const can = canBuyChipMult(s)
        duo(multBtn, `DOUBLE THE PAYOUT  x${format(chipMultiplier(s), n)}`, `${format(chipMultCost(s), n)} CHIPS`)
        multBtn.disabled = !can
        multBtn.classList.toggle('buyable', can)
      }
      for (const [id, cell] of cells) {
        const bought = isBought(s, id)
        const affordable = canBuy(s, id)
        cell.btn.disabled = bought || !affordable
        cell.btn.classList.toggle('held', bought)
        cell.btn.classList.toggle('buyable', affordable)
        cell.btn.classList.toggle('locked', !bought && !isAvailable(s, id))
        setText(
          cell.cost,
          bought
            ? 'HELD'
            : confirm.isArmed(`upgrade:${id}`)
            ? 'SURE?'
            : String(UPGRADES[id].cost),
        )
      }
    },
  }
}
