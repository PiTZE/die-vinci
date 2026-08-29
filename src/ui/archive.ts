import {
  ACHIEVEMENTS,
  ACHIEVEMENT_ROWS,
  ACHIEVEMENT_ROW_BONUS,
  achievementPower,
  visibleAchievements,
} from '../game/achievements'
import type { GameState } from '../state'
import { el, type Pane } from './shell'
import { seal, unseal } from './redact'

export function archivePane(): Pane {
  let head: HTMLElement
  let payLine: HTMLElement
  let sealed: HTMLElement
  const cells = new Map<string, { cell: HTMLElement; name: HTMLElement; note: HTMLElement }>()
  const rows = new Map<string, { head: HTMLElement; title: HTMLElement; mark: HTMLElement }>()

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

      // Nine to a row, and the row is the unit. AD draws its rows as literal
      // rows of eight tiles with the row's own multiplier beside them; nine
      // across does not fit a 390px phone, so each row is its own labelled
      // block and the tiles flow inside it.
      for (const r of ACHIEVEMENT_ROWS) {
        const rh = el('div', 'archive-row-head')
        const title = el('span', 'grow', '')
        const mark = el('span', 'num dim', '')
        rh.append(title, mark)
        section.appendChild(rh)
        rows.set(r.id, { head: rh, title, mark })

        const grid = el('div', 'tile-grid')
        for (const a of r.entries) {
          const cell = el('div', 'tile')
          const name = el('span', 'tile-name', '')
          const note = el('span', 'tile-note', '')
          cell.append(name, note)
          grid.appendChild(cell)
          cells.set(a.id, { cell, name, note })
        }
        section.appendChild(grid)
      }

      sealed = el('div', 'empty', '')
      section.appendChild(sealed)
      root.append(section)
    },

    update(s: GameState) {
      const got = s.achievements.length
      const want = `${got}/${ACHIEVEMENTS.length}`
      if (head.textContent !== want) head.textContent = want

      // Small enough that Decimal formatting would say nothing. Thirty-six
      // entries and four finished rows come to about x7.1, so three places is
      // the whole story and the third is where one new entry shows up.
      const pay = `every solid x${achievementPower(s).toNumber().toFixed(3)}`
      if (payLine.textContent !== pay) payLine.textContent = pay

      // Entries about systems the player has not met yet stay out of sight.
      // The count still says how many there are in total, so nothing is
      // hidden about how much game is left, only about what it consists of.
      const open = new Set(visibleAchievements(s).map((a) => a.id))
      let held = 0
      for (const r of ACHIEVEMENT_ROWS) {
        let mine = 0
        let readable = 0
        for (const a of r.entries) {
          const row = cells.get(a.id)
          if (!row) continue
          const on = open.has(a.id)
          if (!on) held += 1
          else readable += 1
          if (s.achievements.includes(a.id)) mine += 1
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

        const rh = rows.get(r.id)
        if (!rh) continue
        // A row's title gives away what its entries are about, so it is sealed
        // on the same rule they are: readable once any one of them is. THE
        // WAGER over nine redacted tiles would say more than the tiles do.
        if (readable > 0) unseal(rh.title, r.title)
        else seal(rh.title, r.title)
        const done = mine === r.entries.length
        const mark = done
          ? `${mine}/${r.entries.length}  x${ACHIEVEMENT_ROW_BONUS.toFixed(2)}`
          : `${mine}/${r.entries.length}`
        if (rh.mark.textContent !== mark) rh.mark.textContent = mark
        rh.head.classList.toggle('done', done)
      }

      const line = held ? `${held} of these are still sealed` : ''
      if (sealed.textContent !== line) sealed.textContent = line
      sealed.hidden = !held
    },
  }
}
