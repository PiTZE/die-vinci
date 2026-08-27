// The arcana, and the draft.
//
// Two states in one pane. With a draft waiting it is a choice between three
// cards and nothing else, because a choice competing with a grid of things you
// already own is a choice people click past. Otherwise it is what you hold.
import { ARCANA, ARCANA_BY_ID, draftPending, levelOf, owned } from '../game/tarot'
import { WAGER_AT } from '../game/balance'
import type { GameState } from '../state'
import { el, type Pane } from './shell'
import { seal, unseal } from './redact'

interface Cell {
  root: HTMLElement
  numeral: HTMLElement
  name: HTMLElement
  note: HTMLElement
  level: HTMLElement
}

function setText(n: HTMLElement, v: string): void {
  if (n.textContent !== v) n.textContent = v
}

export function tarotPane(): Pane {
  const cells = new Map<string, Cell>()
  let head: HTMLElement
  let bar: HTMLElement
  let barFill: HTMLElement
  let offerSection: HTMLElement
  let offerRow: HTMLElement
  let heldSection: HTMLElement
  let shownOffer = ''

  return {
    id: 'tarot',
    label: 'TAROT',
    // Nothing to say until the first Wager has paid for a draft.
    visible: (s) => s.wagers > 0 || owned(s) > 0 || draftPending(s),

    mount(root, actions) {
      offerSection = el('div', 'section')
      const oh = el('div', 'section-head')
      oh.appendChild(el('span', 'grow', 'THE DRAFT'))
      offerSection.appendChild(oh)
      offerRow = el('div', 'arcana-offer')
      offerSection.appendChild(offerRow)
      root.appendChild(offerSection)

      heldSection = el('div', 'section')
      const hh = el('div', 'section-head')
      hh.appendChild(el('span', 'grow', 'THE ARCANA'))
      head = el('span', 'num dim', '')
      hh.appendChild(head)
      heldSection.appendChild(hh)

      // How close the next draft is. One per Wager, so it is a Wager bar
      // wearing a different name, and saying so would be more honest than
      // useful: what the player wants to know is whether a card is coming.
      bar = el('div', 'arcana-bar')
      barFill = el('span', 'arcana-bar-fill')
      bar.appendChild(barFill)
      heldSection.appendChild(bar)

      const grid = el('div', 'arcana-grid')
      for (const a of ARCANA) {
        const cell = el('div', 'arcana-cell')
        const numeral = el('span', 'arcana-numeral', a.numeral)
        const name = el('span', 'arcana-name', '')
        const note = el('span', 'arcana-note', '')
        const level = el('span', 'arcana-level', '')
        cell.append(numeral, name, level, note)
        grid.appendChild(cell)
        cells.set(a.id, { root: cell, numeral, name, note, level })
      }
      heldSection.appendChild(grid)
      root.appendChild(heldSection)

      // Delegated, because the three on offer are rebuilt whenever they change
      // and a listener per card would be rebound every time with them.
      offerRow.addEventListener('click', (e) => {
        const card = (e.target as HTMLElement).closest('[data-arcana]')
        if (card) actions.takeCard((card as HTMLElement).dataset.arcana ?? '')
      })
    },

    update(s: GameState) {
      const pending = draftPending(s)
      offerSection.hidden = !pending
      heldSection.hidden = pending

      if (pending) {
        const key = s.pendingDraft.join(',')
        if (key !== shownOffer) {
          shownOffer = key
          offerRow.replaceChildren(
            ...s.pendingDraft.map((id) => {
              const def = ARCANA_BY_ID[id]
              const card = el('button', 'arcana-pick')
              card.type = 'button'
              card.dataset.arcana = id
              const at = levelOf(s, id as never)
              card.append(
                el('span', 'arcana-numeral', def?.numeral ?? '?'),
                el('span', 'arcana-name', def?.name ?? id),
                el('span', 'arcana-note', def?.note ?? ''),
                el('span', 'arcana-level', at ? `held, level ${at} to ${at + 1}` : 'new'),
              )
              return card
            }),
          )
        }
        return
      }
      shownOffer = ''

      const have = owned(s)
      setText(head, `${have}/${ARCANA.length}`)
      // Ink toward the next Wager, on a log scale, because one Wager is one
      // draft. It read 100% from the first Wager onward before this: the
      // placeholder tested draftProgress, which counts drafts already earned
      // and only ever climbs, so the bar filled once and stayed full.
      const pct = `${(Math.min(1, Math.max(0, s.ink.log10()) / WAGER_AT.log10()) * 100).toFixed(1)}%`
      if (barFill.style.width !== pct) barFill.style.width = pct

      for (const a of ARCANA) {
        const cell = cells.get(a.id)
        if (!cell) continue
        const at = levelOf(s, a.id)
        // An arcanum you have never held is redacted like anything else you
        // have not reached: the shape of it, none of the letters.
        if (at > 0) {
          unseal(cell.name, a.name)
          unseal(cell.note, a.note)
        } else {
          seal(cell.name, a.name)
          seal(cell.note, a.note)
        }
        setText(cell.level, at > 0 ? `${at}` : '')
        cell.root.classList.toggle('sealed', at === 0)
        cell.root.classList.toggle('bought', at > 0)
      }
    },
  }
}
