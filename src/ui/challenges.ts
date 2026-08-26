import { CHALLENGES, challengesUnlocked, isComplete, isRunning } from '../game/challenges'
import { format } from '../format'
import { WAGER_AT } from '../game/balance'
import type { GameState } from '../state'
import { el, type Actions, type Pane } from './shell'

function setText(n: HTMLElement, v: string): void {
  if (n.textContent !== v) n.textContent = v
}

export function challengesPane(): Pane {
  let head: HTMLElement
  let exitBtn: HTMLButtonElement
  let exitRow: HTMLElement
  const cells = new Map<number, { btn: HTMLButtonElement; state: HTMLElement }>()

  return {
    id: 'challenges',
    label: 'CHALLENGES',
    visible: (s) => challengesUnlocked(s),

    mount(root, actions: Actions) {
      const section = el('div', 'section')
      const h = el('div', 'section-head')
      h.appendChild(el('span', 'grow', 'CHALLENGES'))
      head = el('span', 'num dim', '')
      h.appendChild(head)
      section.appendChild(h)

      exitRow = el('div', 'row')
      exitBtn = el('button', 'action', 'LEAVE THE CHALLENGE')
      exitBtn.type = 'button'
      exitBtn.addEventListener('click', () => actions.exitChallenge())
      exitRow.appendChild(exitBtn)
      section.appendChild(exitRow)

      const list = el('div', 'challenge-list')
      for (const c of CHALLENGES) {
        const btn = el('button', 'challenge')
        btn.type = 'button'
        const title = el('span', 'challenge-title', `${c.id}. ${c.label}`)
        const note = el('span', 'challenge-note', c.note)
        const state = el('span', 'challenge-state', '')
        btn.append(title, note, state)
        btn.addEventListener('click', () => actions.enterChallenge(c.id))
        list.appendChild(btn)
        cells.set(c.id, { btn, state })
      }
      section.appendChild(list)
      root.append(section)
    },

    update(s: GameState) {
      const done = s.challengesDone.length
      setText(head, `${done}/${CHALLENGES.length}`)
      // The row, not just the button: an empty row keeps its padding.
      exitRow.hidden = !s.challengeRunning

      for (const c of CHALLENGES) {
        const cell = cells.get(c.id)
        if (!cell) continue
        const complete = isComplete(s, c.id)
        const active = isRunning(s, c.id)
        cell.btn.classList.toggle('bought', complete)
        cell.btn.classList.toggle('buyable', active)
        cell.btn.disabled = active
        setText(
          cell.state,
          active
            ? `RUNNING  ${format(s.ink, s.options.notation)} / ${format(WAGER_AT, s.options.notation)}`
            : complete
              ? 'CLEARED'
              : 'ENTER',
        )
      }
    },
  }
}
