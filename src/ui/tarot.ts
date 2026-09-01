// The arcana, and the draft.
//
// Two states in one pane. With a draft waiting it is a choice between three
// cards and nothing else, because a choice competing with a grid of things you
// already own is a choice people click past. Otherwise it is what you hold.
import { ARCANA, ARCANA_BY_ID, draftPending, isFull, levelOf, owned } from '../game/tarot'
import { ARCANA_ART } from './arcana-art'
import type { GameState } from '../state'
import { el, type Pane } from './shell'
import { seal, unseal } from './redact'
import { tiltable } from './tilt'
import { electricBorder } from './electric'
import { spiral, type Spiral } from './spiral'

interface Cell {
  root: HTMLElement
  art: SVGElement
  numeral: HTMLElement
  name: HTMLElement
  note: HTMLElement
  level: HTMLElement
}

/**
 * One arcanum's picture, as an inline SVG.
 *
 * Each icon keeps the viewBox it arrived with rather than being squeezed into a
 * square. They are all different shapes, and a shared box would stretch most of
 * them. Filled with currentColor, so a card takes the theme's foreground.
 */
function artFor(id: string): SVGElement {
  const art = ARCANA_ART[id]
  const box = document.createElementNS('http://www.w3.org/2000/svg', 'svg')
  box.setAttribute('class', 'card-art')
  box.setAttribute('viewBox', art ? art.box : '0 0 48 48')
  box.setAttribute('fill', 'currentColor')
  box.setAttribute('aria-hidden', 'true')
  if (art) {
    const path = document.createElementNS('http://www.w3.org/2000/svg', 'path')
    path.setAttribute('d', art.d)
    box.appendChild(path)
  }
  return box
}

/**
 * A card, and the same one in both places it appears.
 *
 * The draft used to be three buttons carrying four lines of text and no
 * picture at all, which is a strange thing to offer someone in a game whose
 * whole upgrade layer is a tarot deck: the art was drawn in the grid below and
 * not on the thing you were actually choosing between. It is a card now, in
 * the proportions a card has, with the numeral above the picture and the name
 * under it, and the grid holds the same card at a smaller size.
 */
interface CardParts {
  root: HTMLElement
  art: SVGElement
  numeral: HTMLElement
  name: HTMLElement
  note: HTMLElement
  level: HTMLElement
}

function card(id: string, numeral: string, tag: 'div' | 'button' = 'div'): CardParts {
  const root = el(tag, 'card')
  if (tag === 'button') (root as HTMLButtonElement).type = 'button'
  const n = el('span', 'card-numeral', numeral)
  const art = artFor(id)
  const name = el('span', 'card-name', '')
  const note = el('span', 'card-note', '')
  const level = el('span', 'card-foot', '')
  // The foil and the glare go under the content and over the face, and both
  // are inert to the pointer, so a card that is a button still answers a
  // click through them.
  root.append(el('span', 'card-foil'), el('span', 'card-glare'), n, art, name, note, level)
  tiltable(root)
  return { root, art, numeral: n, name, note, level }
}

function setText(n: HTMLElement, v: string): void {
  if (n.textContent !== v) n.textContent = v
}

export function tarotPane(): Pane {
  /** The lightning on the Tower's card in the deck, once it is held. */
  let towerBolt: (() => void) | null = null
  /** The turning ring the draft is dealt onto, while there is one. */
  let ring: Spiral | null = null
  /** The ids on the ring, in the order it holds them. */
  let shownDraft: string[] = []
  let takeBtn: HTMLButtonElement
  const cells = new Map<string, Cell>()
  let head: HTMLElement
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
      // No section, no heading, no border. A draft is the only thing on the
      // screen while it is waiting, so a box round it is a box round the
      // whole pane, and a word above it saying DRAFT is a caption on the only
      // picture in the room.
      offerSection = el('div', 'arcana-draft')
      offerRow = el('div', 'arcana-offer')
      takeBtn = el('button', 'action arcana-take', '')
      takeBtn.type = 'button'
      takeBtn.addEventListener('click', () => {
        const at = ring?.facing() ?? 0
        const id = shownDraft[at]
        if (id) actions.takeCard(id)
      })
      offerSection.append(offerRow, takeBtn)
      root.appendChild(offerSection)

      heldSection = el('div', 'section')
      const hh = el('div', 'section-head')
      hh.appendChild(el('span', 'grow', 'THE ARCANA'))
      head = el('span', 'num dim', '')
      hh.appendChild(head)
      heldSection.appendChild(hh)

      // The whole deck, as cards, small. The picture is hidden until the card
      // is held: an unowned arcanum has its name and its note redacted, and a
      // sun drawn over the redaction would say which one it is.
      const grid = el('div', 'card-grid')
      for (const a of ARCANA) {
        const c = card(a.id, a.numeral)
        c.root.classList.add('card-sm')
        grid.appendChild(c.root)
        cells.set(a.id, c)
      }
      heldSection.appendChild(grid)
      root.appendChild(heldSection)

      // A tap on a card brings it round rather than taking it. Taking is the
      // button underneath, which acts on whichever card is facing you: a card
      // that is halfway round the back is not something anyone means to
      // choose, and on a ring that turns, the thing under your finger a
      // moment ago is not the thing under it now.
      offerRow.addEventListener('click', (e) => {
        const card = (e.target as HTMLElement).closest('[data-arcana]')
        if (!card) return
        const id = (card as HTMLElement).dataset.arcana ?? ''
        const at = shownDraft.indexOf(id)
        if (at >= 0) ring?.bring(at)
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
          ring?.destroy()
          ring = null
          offerRow.replaceChildren(
            ...s.pendingDraft.map((id) => {
              const def = ARCANA_BY_ID[id]
              const c = card(id, def?.numeral ?? '?', 'button')
              c.root.classList.add('arcana-pick')
              // XVI is a tower struck by lightning, in the deck this game
              // borrowed its cards from and in every deck since. It is the one
              // card whose picture is an event rather than a figure, so it is
              // the one card whose border is.
              if (id === 'tower') electricBorder(c.root, { thickness: 1, speed: 1.1 })
              c.root.dataset.arcana = id
              const at = levelOf(s, id as never)
              setText(c.name, def?.name ?? id)
              setText(c.note, def?.note ?? '')
              setText(c.level, at ? `HELD, LEVEL ${at} TO ${at + 1}` : 'NEW')
              // The ring turns a seat and the card turns itself toward the
              // pointer, so the two transforms never share an element.
              const seat = el('div', 'arcana-seat')
              seat.appendChild(c.root)
              return seat
            }),
          )
          // Three cards on a turn, which is a spread rather than a row. It
          // turns by itself until the first time you touch it and then stops
          // for good: this is a choice, and a moving target is a poor thing to
          // ask anyone to hit.
          shownDraft = [...s.pendingDraft]
          ring = spiral(offerRow, [...offerRow.children] as HTMLElement[], {
            cardsPerTurn: s.pendingDraft.length,
            onFacing: (at) => {
              const def = ARCANA_BY_ID[shownDraft[at] ?? '']
              setText(takeBtn, def ? `TAKE ${def.name.toUpperCase()}` : 'TAKE')
            },
          })
        }
        return
      }
      shownOffer = ''
      // The ring goes with the draft it was dealt for.
      if (ring) {
        ring.destroy()
        ring = null
        offerRow.replaceChildren()
      }

      const have = owned(s)
      setText(head, `${have}/${ARCANA.length}`)

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
        // Hidden by the sealed class on the card, which takes the picture away
        // without taking its space: a card whose art collapses has its name
        // floating in the middle of it while the one beside it has the name
        // under a picture, and a spread of cards has to be one shape.
        //
        // Not the hidden attribute, which it used to be. That is display:none
        // globally, and an <svg> is not an HTMLElement, so the property does
        // nothing and every unheld card used to show its picture beside its
        // redacted name.
        // A full card says so. Nothing more can be drafted into it, and the
        // draft will not offer it again.
        setText(cell.level, at > 0 ? (isFull(s, a.id) ? `LEVEL ${at}  FULL` : `LEVEL ${at}`) : '')
        cell.root.classList.toggle('sealed', at === 0)
        cell.root.classList.toggle('held', at > 0)
        // Struck once you hold it, and not before: a lightning bolt playing
        // over one sealed card in a grid of twenty-two says which one it is
        // as plainly as its name would.
        if (a.id === 'tower') {
          if (at > 0 && !towerBolt) {
            towerBolt = electricBorder(cell.root, { thickness: 1, speed: 1.1 })
          } else if (at === 0 && towerBolt) {
            towerBolt()
            towerBolt = null
          }
        }
      }
    },
  }
}
