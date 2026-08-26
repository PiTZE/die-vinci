import { el, type Pane } from './shell'

interface Section {
  title: string
  body: string[]
}

const SECTIONS: Section[] = [
  {
    title: 'ROLLING',
    body: [
      'Nothing happens until you roll. Press ROLL and the dice spin, and when they land each one shows a face: a d4 lands on 1 to 4, a d12 on 1 to 12.',
      'The face is what that die is worth this roll. Its own average is worth exactly one, so a low face is a bad roll and a high one is a good roll, and every die swings by about the same amount whatever its size.',
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
      'How long a roll takes. Faster rolls mean more of them, so it multiplies the whole chain at once, which is why it sits above it.',
      'Each upgrade costs ten times the last, and folios make each one worth more permanently.',
    ],
  },
  {
    title: 'THE AUTOMATOR',
    body: [
      'One purchase, and the dice roll on their own for good. It appears after your second study.',
      'It is not optional so much as inevitable: past a few rolls a second no hand can keep up with the roll rate, and until you own it, time away from the game produces nothing.',
      'You never lose it. Not to a study, not to a folio, not to the Wager.',
    ],
  },
  {
    title: 'STUDY AND FOLIO',
    body: [
      'A study unlocks the next solid and multiplies the ones below it. Its multiplier reaches down the chain rather than across, so the deep solids benefit last.',
      'A folio is a study that also clears your studies. What it leaves behind is a permanently better roll rate.',
      'Both clear the table and your ink. That is the trade.',
    ],
  },
  {
    title: 'THE WAGER',
    body: [
      'At 1.8e308 ink you can call the Wager, named for the interrupted game of dice Pacioli posed in 1494.',
      'It clears everything on the table and pays one point. Points buy the grid, and the grid makes the next run faster. That is the whole loop.',
      'The number is where a double stops being able to count, which is a fair place for a game about chance to break.',
    ],
  },
  {
    title: 'CHALLENGES',
    body: [
      'Each is a run under a restriction, cleared by reaching the Wager while it is active.',
      'Clearing one awards an autobuyer. That is how the game stops needing your hands.',
    ],
  },
  {
    title: 'AUTOBUYERS',
    body: [
      'Each buys one thing on a timer. Points make them faster, halving in interval roughly every upgrade down to a tenth of a second.',
      'The mode button sets what each purchase does: one, a group of ten, or as many as the ink allows.',
    ],
  },
  {
    title: 'KEYS',
    body: [
      'Space rolls the dice. Hold it.',
      'M buys the most expensive thing you can afford, repeatedly. Hold it.',
      '1 to 9 buy a solid, shift for a single one. R buys roll rate.',
      'S takes a study, F binds a folio, W calls the Wager. Those ask twice unless you turn it off.',
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

        const body = el('div', 'help-body')
        for (const p of s.body) body.appendChild(el('p', 'help-text', p))
        section.appendChild(body)

        const paint = () => {
          const on = open.has(s.title)
          body.hidden = !on
          mark.textContent = on ? '\u2212' : '+'
          h.setAttribute('aria-expanded', String(on))
        }
        h.addEventListener('click', () => {
          if (open.has(s.title)) open.delete(s.title)
          else open.add(s.title)
          paint()
        })
        paint()

        root.appendChild(section)
      }
    },

    update() {},
  }
}
