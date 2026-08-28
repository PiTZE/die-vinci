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
import { canWager, pointsFromWager } from '../game/wager'
import type { GameState } from '../state'
import { el, type Actions, type Pane } from './shell'
import { bindKey } from './hold'
import { Confirmer } from './confirm'

function setText(n: HTMLElement, v: string): void {
  if (n.textContent !== v) n.textContent = v
}

export function wagerPane(): Pane {
  let confirm: Confirmer
  let confirmSettings: Record<string, boolean> = {}
  let callBtn: HTMLButtonElement
  let callLine: HTMLElement
  let pointsLine: HTMLElement
  let note: HTMLElement
  /** Which upgrade the note line is describing, or empty for the prompt. */
  let noteFor = ''
  const cells = new Map<UpgradeId, { btn: HTMLButtonElement; cost: HTMLElement }>()

  return {
    id: 'wager',
    label: 'WAGER',

    // Hidden until the threshold is in sight, so it does not sit there empty
    // for the whole first run.
    visible: (s) => s.wagers > 0 || s.inkThisWager.gte(WAGER_AT.div(1e60)),

    mount(root, actions: Actions) {
      confirm = new Confirmer((k) => confirmSettings[k.split(':')[0]] !== false)
      const call = el('div', 'section')
      const ch = el('div', 'section-head')
      ch.appendChild(el('span', 'grow', 'THE WAGER'))
      callLine = el('span', 'num dim', '')
      ch.appendChild(callLine)
      call.appendChild(ch)


      callBtn = el('button', 'action', '')
      callBtn.type = 'button'
      callBtn.title = 'Call the Wager  (w)'
      callBtn.addEventListener('click', () => {
        if (confirm.request('wager')) actions.wager()
      })
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

      root.append(call, grid)

      bindKey('w', () => {
        if (confirm.request('wager')) actions.wager()
      })
    },

    update(s: GameState) {
      const n = s.options.notation

      // Held until something else is touched, and replaced by the prompt when
      // nothing has been. An empty line here would collapse the grid's footer
      // and shift everything under it on the first tap.
      if (!noteFor) setText(note, 'touch an upgrade to read what it does')

      setText(callLine, `${s.wagers}`)
      confirmSettings = s.options.confirms
      const ready = canWager(s)
      setText(
        callBtn,
        confirm.isArmed('wager')
          ? 'SURE? THIS RESETS EVERYTHING'
          : ready
          ? `CALL THE WAGER  +${format(pointsFromWager(), n)}`
          : `${format(s.inkThisWager, n)} / ${format(WAGER_AT, n)} INK`,
      )
      callBtn.disabled = !ready
      callBtn.classList.toggle('buyable', ready)

      setText(pointsLine, format(s.points, n))
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
