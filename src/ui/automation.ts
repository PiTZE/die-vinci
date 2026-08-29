import {
  AUTOBUYERS,
  anyUnlocked,
  canUpgrade,
  hasLimit,
  interval,
  isMaxed,
  isUnlocked,
  limitAt,
  limitOn,
  mode,
  untilFolios,
  untilOn,
  upgradeCost,
} from '../game/autobuyers'
import { format } from '../format'
import type { GameState } from '../state'
import { automatorCost, automatorUnlocked, canBuyAutomator } from '../game/production'
import { el, type Actions, type Pane } from './shell'

function setText(n: HTMLElement, v: string): void {
  if (n.textContent !== v) n.textContent = v
}

/**
 * A small number field.
 *
 * inputmode numeric rather than type="number", because a spinner in a 44px row
 * is two targets nobody wants and iOS draws it differently again. It commits
 * on input, so there is nothing to press afterwards, and a blank box is left
 * alone rather than read as zero: clearing it to type a new number should not
 * stop the autobuyer for the two keystrokes in between.
 */
function numberBox(label: string, write: (v: number) => void): HTMLInputElement {
  const n = document.createElement('input')
  n.className = 'auto-num'
  n.type = 'text'
  n.inputMode = 'numeric'
  n.autocomplete = 'off'
  n.spellcheck = false
  n.setAttribute('aria-label', label)
  n.addEventListener('input', () => {
    const cleaned = n.value.replace(/[^0-9]/g, '')
    if (cleaned !== n.value) n.value = cleaned
    if (cleaned === '') return
    write(Number(cleaned))
  })
  return n
}

export function automationPane(): Pane {
  /** The last state update() saw, so a click can read the current setting. */
  let shown: GameState
  let autoSection: HTMLElement
  let autoBuy: HTMLButtonElement
  let autoToggle: HTMLButtonElement
  const rows = new Map<
    string,
    {
      root: HTMLElement
      every: HTMLElement
      onBtn: HTMLButtonElement
      modeBtn: HTMLButtonElement
      up: HTMLButtonElement
      /** Only the two reset autobuyers have these. */
      rules?: {
        root: HTMLElement
        capOn: HTMLButtonElement
        capAt: HTMLInputElement
        untilRow?: HTMLElement
        untilBtn?: HTMLButtonElement
        untilAt?: HTMLInputElement
      }
    }
  >()

  return {
    id: 'automation',
    label: 'AUTOMATION',
    visible: (s) => anyUnlocked(s) || automatorUnlocked(s),

    mount(root, actions: Actions) {
      // The roll comes first: it is the one that takes your finger off the
      // button, and every autobuyer below it is a convenience by comparison.
      autoSection = el('div', 'section')
      const ah = el('div', 'section-head')
      ah.appendChild(el('span', 'grow', 'THE ROLL'))
      autoSection.appendChild(ah)
      const autoRow = el('div', 'auto-row')
      autoRow.appendChild(el('span', 'auto-label', 'ROLLS ITSELF'))
      autoBuy = el('button', 'auto-up', '')
      autoBuy.type = 'button'
      autoBuy.addEventListener('click', () => actions.buyAutomator())
      autoToggle = el('button', 'auto-toggle', 'ON')
      autoToggle.type = 'button'
      autoToggle.addEventListener('click', () => actions.toggleAutomator())
      autoRow.append(autoToggle, autoBuy)
      autoSection.appendChild(autoRow)
      root.append(autoSection)

      const section = el('div', 'section')
      const h = el('div', 'section-head')
      h.appendChild(el('span', 'grow', 'AUTOBUYERS'))
      section.appendChild(h)

      for (const a of AUTOBUYERS) {
        const row = el('div', 'auto-row')
        row.appendChild(el('span', 'auto-label', a.label))
        const every = el('span', 'auto-every num dim', '')
        row.appendChild(every)

        const onBtn = el('button', 'auto-toggle', 'ON')
        onBtn.type = 'button'
        onBtn.addEventListener('click', () => actions.toggleAutobuyer(a.id))

        // Single, a group of ten, or as much as the ink allows. AD's modes.
        const modeBtn = el('button', 'auto-toggle', '10')
        modeBtn.type = 'button'
        modeBtn.title = 'What each purchase buys'
        modeBtn.addEventListener('click', () => actions.cycleAutobuyerMode(a.id))

        const up = el('button', 'auto-up', '')
        up.type = 'button'
        up.addEventListener('click', () => actions.upgradeAutobuyer(a.id))

        row.append(onBtn, modeBtn, up)
        section.appendChild(row)

        // A cap on how many to take, and for studies a folio count that lifts
        // it. Typed rather than cycled: the useful values are whatever this
        // run happens to need, and a fixed list of them would be a guess.
        let rules: (typeof rows extends Map<string, infer V> ? V : never)['rules']
        if (hasLimit(a.id)) {
          const box = el('div', 'auto-rules')
          const capRow = el('div', 'auto-rule')
          const capOn = el('button', 'auto-toggle', 'OFF')
          capOn.type = 'button'
          capOn.title = 'Stop after this many'
          capOn.addEventListener('click', () => actions.setAutobuyerLimit(a.id, !limitOn(shown, a.id)))
          capRow.append(el('span', 'auto-rule-label', 'STOP AFTER'), capOn)
          const capAt = numberBox(a.id === 'study' ? 'studies' : 'folios', (v) =>
            actions.setAutobuyerLimit(a.id, limitOn(shown, a.id), v))
          capRow.appendChild(capAt)
          box.appendChild(capRow)

          let untilRow: HTMLElement | undefined
          let untilBtn: HTMLButtonElement | undefined
          let untilAt: HTMLInputElement | undefined
          if (a.id === 'study') {
            untilRow = el('div', 'auto-rule')
            untilBtn = el('button', 'auto-toggle', 'OFF')
            untilBtn.type = 'button'
            untilBtn.title = 'Ignore the cap once you hold this many folios'
            untilBtn.addEventListener('click', () =>
              actions.setAutobuyerUntil(a.id, !untilOn(shown, a.id)))
            untilRow.append(el('span', 'auto-rule-label', 'UNLESS FOLIOS'), untilBtn)
            untilAt = numberBox('folios', (v) =>
              actions.setAutobuyerUntil(a.id, untilOn(shown, a.id), v))
            untilRow.appendChild(untilAt)
            box.appendChild(untilRow)
          }
          section.appendChild(box)
          rules = { root: box, capOn, capAt, untilRow, untilBtn, untilAt }
        }
        rows.set(a.id, { root: row, every, onBtn, modeBtn, up, rules })
      }
      root.append(section)
    },

    update(s: GameState) {
      const n = s.options.notation
      shown = s

      autoSection.hidden = !automatorUnlocked(s)
      if (!s.autoRoll) {
        setText(autoBuy, `UNLOCK / ${automatorCost()} POINT`)
        const can = canBuyAutomator(s)
        autoBuy.disabled = !can
        autoBuy.classList.toggle('buyable', can)
        autoToggle.hidden = true
      } else {
        autoBuy.hidden = true
        autoToggle.hidden = false
        setText(autoToggle, s.autoRollOn ? 'ON' : 'OFF')
        autoToggle.classList.toggle('buyable', s.autoRollOn)
      }
      for (const a of AUTOBUYERS) {
        const row = rows.get(a.id)
        if (!row) continue
        const open = isUnlocked(s, a.id)
        row.root.hidden = !open
        if (row.rules) row.rules.root.hidden = !open
        if (!open) continue

        setText(row.every, `${(interval(s, a.id) / 1000).toFixed(2)}s`)
        const on = s.autobuyers[a.id]?.on ?? true
        setText(row.onBtn, on ? 'ON' : 'OFF')
        row.onBtn.classList.toggle('buyable', on)

        const m = mode(s, a.id)
        setText(row.modeBtn, m === 'single' ? '1' : m === 'ten' ? '10' : 'MAX')
        row.modeBtn.hidden = !a.id.startsWith('solid')

        if (row.rules) {
          const capped = limitOn(s, a.id)
          setText(row.rules.capOn, capped ? 'ON' : 'OFF')
          row.rules.capOn.classList.toggle('buyable', capped)
          // Not while it is being typed into, or the cursor jumps to the end
          // on every keystroke.
          if (document.activeElement !== row.rules.capAt) {
            row.rules.capAt.value = String(limitAt(s, a.id))
          }
          row.rules.capAt.disabled = !capped
          if (row.rules.untilBtn && row.rules.untilAt) {
            const until = untilOn(s, a.id)
            setText(row.rules.untilBtn, until ? 'ON' : 'OFF')
            row.rules.untilBtn.classList.toggle('buyable', until)
            if (document.activeElement !== row.rules.untilAt) {
              row.rules.untilAt.value = String(untilFolios(s, a.id))
            }
            row.rules.untilAt.disabled = !until
            // Folios are a system of their own, and a rule about them has no
            // business on screen before one is bound.
            if (row.rules.untilRow) row.rules.untilRow.hidden = s.folios === 0 && s.wagers === 0
          }
          row.rules.root.hidden = false
        }

        const maxed = isMaxed(s, a.id)
        setText(row.up, maxed ? 'FASTEST' : `FASTER / ${format(upgradeCost(s, a.id), n)}`)
        const can = canUpgrade(s, a.id)
        row.up.disabled = maxed || !can
        row.up.classList.toggle('buyable', can)
      }
    },
  }
}
