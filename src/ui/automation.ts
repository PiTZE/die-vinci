import {
  AUTOBUYERS,
  anyUnlocked,
  canUpgrade,
  interval,
  isMaxed,
  isUnlocked,
  mode,
  upgradeCost,
} from '../game/autobuyers'
import { format } from '../format'
import type { GameState } from '../state'
import { el, type Actions, type Pane } from './shell'

function setText(n: HTMLElement, v: string): void {
  if (n.textContent !== v) n.textContent = v
}

export function automationPane(): Pane {
  const rows = new Map<
    string,
    {
      root: HTMLElement
      every: HTMLElement
      onBtn: HTMLButtonElement
      modeBtn: HTMLButtonElement
      up: HTMLButtonElement
    }
  >()

  return {
    id: 'automation',
    label: 'AUTOMATION',
    visible: (s) => anyUnlocked(s),

    mount(root, actions: Actions) {
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
        rows.set(a.id, { root: row, every, onBtn, modeBtn, up })
      }
      root.append(section)
    },

    update(s: GameState) {
      const n = s.options.notation
      for (const a of AUTOBUYERS) {
        const row = rows.get(a.id)
        if (!row) continue
        const open = isUnlocked(s, a.id)
        row.root.hidden = !open
        if (!open) continue

        setText(row.every, `${(interval(s, a.id) / 1000).toFixed(2)}s`)
        const on = s.autobuyers[a.id]?.on ?? true
        setText(row.onBtn, on ? 'ON' : 'OFF')
        row.onBtn.classList.toggle('buyable', on)

        const m = mode(s, a.id)
        setText(row.modeBtn, m === 'single' ? '1' : m === 'ten' ? '10' : 'MAX')
        row.modeBtn.hidden = !a.id.startsWith('solid')

        const maxed = isMaxed(s, a.id)
        setText(row.up, maxed ? 'FASTEST' : `FASTER / ${format(upgradeCost(s, a.id), n)}`)
        const can = canUpgrade(s, a.id)
        row.up.disabled = maxed || !can
        row.up.classList.toggle('buyable', can)
      }
    },
  }
}
