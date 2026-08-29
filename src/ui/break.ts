import { format } from '../format'
import {
  BREAK_UPGRADES,
  breakCost,
  breakLevel,
  breakMaxed,
  canBreak,
  canBuyBreak,
  isRebuyable,
  WAGER_AUTOBUYER,
} from '../game/breaks'
import { interval, isMaxed, isUnlocked } from '../game/autobuyers'
import type { GameState } from '../state'
import { el, type Actions, type Pane } from './shell'
import { Confirmer } from './confirm'
import { metatron } from './geometry'

function setText(n: HTMLElement, v: string): void {
  if (n.textContent !== v) n.textContent = v
}

/**
 * Breaking the Wager.
 *
 * The tab exists as soon as the Wager's own autobuyer does, and until that
 * autobuyer is down at a tenth of a second it says one thing: how far off it
 * is. Antimatter Dimensions' Break Infinity tab does exactly this, down to the
 * sentence.
 */
export function breakPane(): Pane {
  let confirm: Confirmer
  let confirmSettings: Record<string, boolean> = {}
  let gate: HTMLElement
  let btn: HTMLButtonElement
  let note: HTMLElement
  let grid: HTMLElement
  let gridSection: HTMLElement
  let cube: SVGSVGElement
  let title: HTMLElement
  let gridTitle: HTMLElement
  const cells = new Map<
    string,
    { btn: HTMLButtonElement; name: HTMLElement; note: HTMLElement; mark: HTMLElement }
  >()

  return {
    id: 'break',
    label: 'BREAK',

    // Nothing about this exists until the Wager can be automated, which is
    // itself behind the last challenge.
    visible: (s) => s.broke || isUnlocked(s, WAGER_AUTOBUYER),

    mount(root, actions: Actions) {
      confirm = new Confirmer((k) => confirmSettings[k] !== false)

      const head = el('div', 'section')
      const h = el('div', 'section-head')
      title = el('span', 'grow', '')
      h.appendChild(title)
      head.appendChild(h)

      // Metatron's Cube: thirteen circles, every chord between their centres,
      // and all five Platonic solids inside the construction. Five of the nine
      // on the table, and the five Leonardo drew for Pacioli. It is the only
      // figure that says "the whole table at once", which is what this screen
      // is for.
      const figure = el('div', 'break-figure')
      cube = metatron(240)
      figure.appendChild(cube)
      head.appendChild(figure)

      gate = el('div', 'break-gate', '')
      head.appendChild(gate)

      btn = el('button', 'action', 'BREAK IT')
      btn.type = 'button'
      btn.addEventListener('click', () => {
        if (confirm.request('break')) actions.breakWager()
      })
      const row = el('div', 'row')
      row.appendChild(btn)
      head.appendChild(row)

      gridSection = el('div', 'section')
      const gh = el('div', 'section-head')
      gridTitle = el('span', 'grow', '')
      gh.appendChild(gridTitle)
      gridSection.appendChild(gh)
      grid = el('div', 'tile-grid')
      for (const u of BREAK_UPGRADES) {
        const cell = el('button', 'tile upgrade')
        cell.type = 'button'
        const name = el('span', 'tile-name', '')
        const note2 = el('span', 'tile-note', '')
        const mark = el('span', 'tile-mark', '')
        cell.append(name, note2, mark)
        cell.addEventListener('click', () => actions.buyBreak(u.id))
        grid.appendChild(cell)
        cells.set(u.id, { btn: cell, name, note: note2, mark })
      }
      gridSection.appendChild(grid)
      note = el('div', 'upgrade-note', '')
      gridSection.appendChild(note)

      root.append(head, gridSection)
    },

    update(s: GameState) {
      const n = s.options.notation
      confirmSettings = s.options.confirms

      // The pane is built whether or not it can be reached, so its words wait
      // here rather than being written at mount. Until the Wager can be
      // automated there is nothing in this subtree to read.
      const open = s.broke || isUnlocked(s, WAGER_AUTOBUYER)
      setText(title, open ? 'BREAK THE WAGER' : '')
      setText(gridTitle, s.broke ? 'WHAT THE OVERSHOOT BUYS' : '')
      // The section, not just its contents. Hiding the grid and the note left
      // the box around them drawing its own border under an empty heading.
      gridSection.hidden = !s.broke
      if (!open) {
        setText(gate, '')
        setText(btn, '')
        btn.hidden = true
        cube.style.visibility = 'hidden'
        return
      }
      btn.hidden = false
      cube.style.visibility = ''

      const ready = canBreak(s)
      const ms = interval(s, WAGER_AUTOBUYER)
      if (s.broke) {
        setText(gate, 'the ceiling is off. A Wager pays for how far past it the run got.')
      } else if (ready) {
        setText(gate, 'the Wager resolves in a tenth of a second. That is the whole condition.')
      } else if (isMaxed(s, WAGER_AUTOBUYER)) {
        setText(gate, 'the Wager autobuyer is at its floor.')
      } else {
        // AD's own sentence, on AD's own condition.
        setText(gate, `take the Wager autobuyer down to 0.1 seconds. It is at ${(ms / 1000).toFixed(2)}.`)
      }

      // Done is done, which is what AD's button does too: it reads "INFINITY
      // IS BROKEN", takes the unclickable class, and its handler refuses a
      // second press.
      btn.disabled = !ready || s.broke
      btn.classList.toggle('buyable', ready && !s.broke)
      btn.classList.toggle('held', s.broke)
      setText(
        btn,
        s.broke
          ? 'BROKEN'
          : confirm.isArmed('break')
            ? 'SURE? THE PAYOUT CHANGES SHAPE'
            : 'BREAK IT',
      )
      cube.classList.toggle('lit', s.broke)

      if (!s.broke) return

      let described = ''
      for (const u of BREAK_UPGRADES) {
        const cell = cells.get(u.id)
        if (!cell) continue
        const level = breakLevel(s, u.id)
        const maxed = breakMaxed(s, u.id)
        const can = canBuyBreak(s, u.id)
        cell.btn.disabled = maxed || !can
        cell.btn.classList.toggle('held', maxed)
        cell.btn.classList.toggle('buyable', can)
        setText(cell.name, u.label)
        setText(cell.note, u.note)
        cell.btn.title = u.note
        setText(
          cell.mark,
          maxed
            ? 'FULL'
            : isRebuyable(u.id)
              ? `${level}/${u.steps}  ${format(breakCost(s, u.id), n)}`
              : format(breakCost(s, u.id), n),
        )
        if (!described && can) described = `${u.label}  ${u.note}`
      }
      setText(note, described || 'chips buy these, and a broken Wager pays chips by the overshoot')
    },
  }
}
