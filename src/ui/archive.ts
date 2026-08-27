import { ACHIEVEMENTS, achievementPower, visibleAchievements } from '../game/achievements'
import type { GameState } from '../state'
import { el, type Pane } from './shell'
import { seal, unseal } from './redact'

export function archivePane(): Pane {
  let head: HTMLElement
  let payLine: HTMLElement
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

      // What the set is worth, above the grid, where Antimatter Dimensions puts
      // the same line. An entry you have earned pays, so the tab has to say so
      // somewhere.
      payLine = el('div', 'archive-pay', '')
      section.appendChild(payLine)

      const grid = el('div', 'tile-grid')
      for (const a of ACHIEVEMENTS) {
        const cell = el('div', 'tile')
        const name = el('span', 'tile-name', '')
        const note = el('span', 'tile-note', '')
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

      // Never large enough to need Decimal formatting. Thirty-one entries at
      // x1.03 each come to about x2.5, so three places is the whole story, and
      // the third is where a single new entry shows up.
      const pay = `every solid x${achievementPower(s).toNumber().toFixed(3)}`
      if (payLine.textContent !== pay) payLine.textContent = pay

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
        row.cell.classList.toggle('held', s.achievements.includes(a.id))
      }
      const line = held ? `${held} of these are still sealed` : ''
      if (sealed.textContent !== line) sealed.textContent = line
      sealed.hidden = !held
    },
  }
}
