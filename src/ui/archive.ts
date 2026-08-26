import { ACHIEVEMENTS } from '../game/achievements'
import type { GameState } from '../state'
import { el, type Pane } from './shell'

export function archivePane(): Pane {
  let head: HTMLElement
  const cells = new Map<string, HTMLElement>()

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
        cell.title = a.note
        cell.appendChild(el('span', 'archive-name', a.name))
        cell.appendChild(el('span', 'archive-note', a.note))
        grid.appendChild(cell)
        cells.set(a.id, cell)
      }
      section.appendChild(grid)
      root.append(section)
    },

    update(s: GameState) {
      const got = s.achievements.length
      const want = `${got}/${ACHIEVEMENTS.length}`
      if (head.textContent !== want) head.textContent = want
      for (const a of ACHIEVEMENTS) {
        const cell = cells.get(a.id)
        if (cell) cell.classList.toggle('bought', s.achievements.includes(a.id))
      }
    },
  }
}
