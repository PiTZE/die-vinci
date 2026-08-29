import type { GameState } from '../state'
import { el, type Pane } from './shell'
import { seal, unseal } from './redact'

/** A line that is only worth reading once the thing it names exists. */
type Line = string | { text: string; needs: (s: GameState) => boolean }

interface Section {
  title: string
  body: Line[]
  /**
   * When this topic may be read. Twelve topics from the first second is a
   * table of contents for the whole game, and a player who has rolled one d4
   * should not be reading about calling the Wager.
   */
  needs?: (s: GameState) => boolean
}

const afterStudy = (s: GameState) => s.studies >= 1 || s.wagers > 0
const afterAutomator = (s: GameState) => s.autoRoll || s.wagers > 0
const nearWager = (s: GameState) => s.wagers > 0 || s.inkThisWager.gte('1e290')
const afterWager = (s: GameState) => s.wagers > 0
const hasTarot = (s: GameState) => s.wagers > 0
const hasMelt = (s: GameState) => (s.tarot?.death ?? 0) > 0
const afterAutobuyer = (s: GameState) =>
  s.challengesDone.length > 0 || Object.values(s.autobuyers).some((a) => a.unlocked)

const SECTIONS: Section[] = [
  {
    title: 'ROLLING',
    body: [
      'Nothing happens until you roll. Press ROLL and the dice spin, and when they land each one shows a face: a d4 lands on 1 to 4, a d12 on 1 to 12.',
      'The face is what each of those dice is worth this roll. Four d4 landing on 4 make sixteen. Every multiplier you own stacks on top of that.',
      'A die with more faces is worth more for that reason alone. A d72 averages 36.5 a face where a d4 averages 2.5, and the swing either way of that average is about 58% at every size.',
      'You cannot roll faster than the roll rate. Holding the button rolls as fast as it allows, and no faster.',
    ],
  },
  {
    title: 'THE TABLE',
    body: [
      'Nine solids in a chain. Each one produces the solid above it in the list, and the tetrahedron produces ink. Ink buys everything.',
      'You start with one die. A study unlocks the next.',
      'Every ten of a solid doubles its multiplier. The counter in the corner of the buy button shows how far into the current ten you are, and the two fills behind it show what you own and what your ink covers.',
      'Each solid is a plate Leonardo drew for Pacioli in 1497.',
    ],
  },
  {
    title: 'ROLL RATE',
    body: [
      'How long a roll takes. Faster rolls mean more of them, so it multiplies the whole chain at once. That is why it sits above the table rather than beside it.',
      'Each upgrade costs twenty times the last.',
      { text: 'Folios make every one of them worth more, permanently.',
        needs: (s) => s.folios > 0 || s.wagers > 0 },
    ],
  },
  {
    title: 'THE AUTOMATOR',
    needs: afterAutomator,
    body: [
      'One chip, once you have called the Wager, and the dice roll on their own. You can switch it off again in AUTOMATION.',
      'Until you own it you hold ROLL, and holding gives exactly the roll rate: a roll refuses to start while one is in the air. It buys you your finger back rather than any extra speed. It is also what makes time away from the game count.',
      'You never lose it. Not to a study, not to a folio, not to the Wager.',
    ],
  },
  {
    title: 'STUDY AND FOLIO',
    needs: afterStudy,
    body: [
      'A study unlocks the next solid and multiplies the ones below it. Its multiplier reaches down the chain rather than across, so the deep solids benefit last.',
      'A folio is a study that also clears your studies. What it leaves behind is a permanently better roll rate.',
      'Both clear the table and your ink. That is the trade.',
    ],
  },
  {
    title: 'THE WAGER',
    needs: nearWager,
    body: [
      'At 1.8e308 ink you can call the Wager, named for the interrupted game of dice Pacioli posed in 1494.',
      'It clears everything on the table and pays one chip. Chips buy the grid, and the grid makes the next run faster. That is the whole loop.',
      'The number is where a double stops being able to count, which is a fair place for a game about chance to break.',
    ],
  },
  {
    title: 'CHALLENGES',
    needs: afterWager,
    body: [
      'Each is a run under a restriction, cleared by reaching the Wager while it is active.',
      'Clearing one awards an autobuyer. That is how the game stops needing your hands.',
    ],
  },
  {
    title: 'AUTOBUYERS',
    needs: afterAutobuyer,
    body: [
      'Each buys one thing on a timer. A chip spent on one cuts its interval to 0.6 of what it was, down to a floor of a tenth of a second.',
      'The mode button sets what each purchase does: one, a group of ten, or as many as the ink allows.',
    ],
  },
  {
    title: 'TAROT',
    needs: hasTarot,
    body: [
      'Every Wager pays a draft. Three arcana are offered and you keep one, and every card you keep stays active, so the choice is what to take first rather than what to equip.',
      // Named only once you hold it. Written into the line above it would say
      // there is a card that widens the draft before you have met one.
      { text: 'The Stars makes that four.', needs: (s: GameState) => (s.tarot?.stars ?? 0) > 0 },
      'Draw one you already hold and it levels instead, and every effect grows with its level, so a repeat is never a wasted draw.',
      'The arcana you have not seen are offered more often than the ones you have, and the ones worth something early are offered more often than the ones that need a full table.',
    ],
  },
  {
    title: 'MELTING',
    needs: hasMelt,
    body: [
      'Death lets you melt the table. Everything below your deepest solid is destroyed, and what is left carries a multiplier for all of it.',
      'The multiplier replaces the one you had rather than adding to it, so melting early for a small number gains you nothing. The question is when, not whether.',
      'It is offered only when it would beat what you already hold.',
    ],
  },
  {
    title: 'KEYS',
    body: [
      'Space rolls the dice. Hold it.',
      'M buys the most expensive thing you can afford, repeatedly. Hold it.',
      '1 to 9 buy a solid, shift for a single one. R buys roll rate.',
      { text: 'S takes a study. It asks twice unless you turn that off.', needs: afterStudy },
      { text: 'F binds a folio, and asks twice as well.', needs: (s) => s.folios > 0 || s.wagers > 0 },
      { text: 'W calls the Wager, and asks twice.', needs: nearWager },
    ],
  },
  {
    title: 'YOUR SAVE',
    body: [
      'It lives in this browser and never leaves it. Three slots, and rolling backups at five minutes, thirty minutes and four hours, plus one taken before any update that changes the save.',
      'OPTIONS shows whether the browser has agreed not to evict it. The game keeps asking for that, but Chrome answers silently and can refuse an installed app for reasons it will not explain.',
      'While it says evictable, the backups are still inside the same browser and go with it. Bind a save file on a desktop, or export a copy on a phone. That is the only copy eviction cannot reach.',
    ],
  },
]

/** Which sections are open. Kept for the life of the tab rather than in the
 *  save: it is a reading position, not progress. */
const open = new Set<string>()

/** Sections that are not always readable, with the test that reveals them. */
const gated: {
  head: HTMLElement
  mark: HTMLElement
  body: HTMLElement
  paint: () => void
  title: string
  text: Line[]
  /** The lines currently rendered, joined, or '' for none. */
  filled: string
  needs?: (s: GameState) => boolean
}[] = []

export function helpPane(): Pane {
  return {
    id: 'help',
    label: 'HELP',

    mount(root) {
      // Closed by default, so the pane opens as a list of what there is to
      // read rather than a wall of it. Twelve sections stacked out flat is
      // three screens of scrolling before you find the one you wanted.
      for (const s of SECTIONS) {
        const section = el('div', 'section')
        const h = el('button', 'section-head help-head')
        h.type = 'button'
        h.appendChild(el('span', 'grow', s.title))
        const mark = el('span', 'help-mark', '+')
        h.appendChild(mark)
        section.appendChild(h)

        // The paragraphs are not written until the topic is unsealed. Building
        // them up front and hiding the section leaves every word of the late
        // game sitting in the document for anyone who looks at the source.
        const body = el('div', 'help-body')
        section.appendChild(body)

        const paint = () => {
          const on = open.has(s.title)
          body.hidden = !on
          mark.textContent = on ? '\u2212' : '+'
          h.setAttribute('aria-expanded', String(on))
        }
        h.addEventListener('click', () => {
          if (h.classList.contains('sealed')) return
          if (open.has(s.title)) open.delete(s.title)
          else open.add(s.title)
          paint()
        })
        paint()

        root.appendChild(section)
        gated.push({ head: h, mark, body, paint, title: s.title, text: s.body, needs: s.needs, filled: '' })
      }
    },

    update(s: GameState) {
      // Topics unseal as the systems they describe arrive. Recomputed each
      // frame rather than at mount, because the pane is built once and a study
      // taken while it is open should open the section it unlocks.
      for (const g of gated) {
        const on = !g.needs || g.needs(s)
        const label = g.head.firstElementChild as HTMLElement
        if (on) {
          unseal(label, g.title)
          // Lines can unlock separately from their topic, so the body is
          // rebuilt whenever the readable set changes rather than filled once.
          const lines = g.text
            .filter((l) => typeof l === 'string' || l.needs(s))
            .map((l) => (typeof l === 'string' ? l : l.text))
          const key = lines.join('\u0000')
          if (g.filled !== key) {
            g.body.replaceChildren(...lines.map((line) => el('p', 'help-text', line)))
            const first = g.filled === ''
            g.filled = key
            // Back to + or -, from the block it wore while sealed.
            if (first) g.paint()
          }
        } else {
          seal(label, g.title)
          open.delete(g.title)
          g.body.replaceChildren()
          g.filled = ''
          g.body.hidden = true
          if (g.mark.textContent !== '?') g.mark.textContent = '?'
        }
        g.head.classList.toggle('sealed', !on)
        g.head.setAttribute('aria-disabled', String(!on))
      }
    },
  }
}
