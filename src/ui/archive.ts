import { ACHIEVEMENTS, visibleAchievements } from '../game/achievements'
import type { GameState } from '../state'
import { el, type Pane } from './shell'
import { seal, unseal } from './redact'

export function archivePane(): Pane {
  let head: HTMLElement
  let sealed: HTMLElement
  const cells = new Map<string, { cell: HTMLElement; name: HTMLElement; note: HTMLElement }>()

  return {
    id: 'archive',
    label: 'ARCHIVE',

    mount(root) {
      const section = el('div', 'section')
      const h = el('div', 'section-head')
      h.appendChild(el('span', 'grow', 'CONQUESTION ARCHIVE'))
      head = el('span', 'num dim', '')
      h.appendChild(head)
      section.appendChild(h)

      const grid = el('div', 'archive-grid')
      for (const a of ACHIEVEMENTS) {
        const cell = el('div', 'archive-cell')
        const name = el('span', 'archive-name', '')
        const note = el('span', 'archive-note', '')
        cell.append(name, note)
        grid.appendChild(cell)
        cells.set(a.id, { cell, name, note })
      }
      section.appendChild(grid)
      sealed = el('div', 'empty', '')
      section.appendChild(sealed)
      root.append(section)
    },

    update(s: GameState) {
      const got = s.achievements.length
      const want = `${got}/${ACHIEVEMENTS.length}`
      if (head.textContent !== want) head.textContent = want

      // Entries about systems the player has not met yet stay out of sight.
      // The count still says how many there are in total, so nothing is
      // hidden about how much game is left, only about what it consists of.
      const open = new Set(visibleAchievements(s).map((a) => a.id))
      let held = 0
      for (const a of ACHIEVEMENTS) {
        const row = cells.get(a.id)
        if (!row) continue
        const on = open.has(a.id)
        if (!on) held += 1
        // The redaction replaces the text rather than covering it. A bar drawn
        // over the name in CSS leaves the name in the DOM, where select-all or
        // a glance at the page source gives the whole game away.
        if (on) {
          unseal(row.name, a.name)
          unseal(row.note, a.note)
        } else {
          seal(row.name, a.name)
          seal(row.note, a.note)
        }
        row.cell.title = on ? a.note : ''
        row.cell.classList.toggle('sealed', !on)
        row.cell.classList.toggle('bought', s.achievements.includes(a.id))
      }
      const line = held ? `${held} of these are still sealed` : ''
      if (sealed.textContent !== line) sealed.textContent = line
      sealed.hidden = !held
    },
  }
}
