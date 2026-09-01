// What this is and which build you are running.
//
// The version block used to sit under a dozen settings in OPTIONS, which is the
// last place anyone looks when they want to know which build they are on.
import { el, type Pane } from './shell'

interface Entry {
  label: string
  value: string
}

function block(root: HTMLElement, title: string, entries: Entry[], value = ''): void {
  const sec = el('div', 'section')
  const h = el('div', 'section-head')
  h.appendChild(el('span', 'grow', title))
  // Section heads carry their value on the right everywhere else in the game.
  if (value) h.appendChild(el('span', 'num dim', value))
  sec.appendChild(h)
  const list = el('div', 'kv-list')
  for (const e of entries) {
    const row = el('div', 'kv-row')
    row.appendChild(el('span', 'kv-label', e.label))
    row.appendChild(el('span', 'kv-value', e.value))
    list.appendChild(row)
  }
  sec.appendChild(list)
  root.appendChild(sec)
}

export function aboutPane(): Pane {
  return {
    id: 'about',
    label: 'ABOUT',

    mount(root) {
      const intro = el('div', 'section')
      const ih = el('div', 'section-head')
      ih.appendChild(el('span', 'grow', 'DIE VINCI'))
      intro.appendChild(ih)
      // The same line as the meta description in index.html and the manifest,
      // so the game describes itself the same way wherever it is asked.
      intro.appendChild(el('div', 'kv-note', 'A game about Leo.'))
      root.appendChild(intro)

      block(root, 'VERSION', [
        { label: 'CHANNEL', value: __CHANNEL__ },
        { label: 'BUILT', value: __BUILD_ID__ },
      ], __VERSION__)

      // The work this is built out of.
      //
      // Only one of these four is obliged to be here: break_infinity.js is
      // MIT, and MIT asks for its notice to travel with the code. The other
      // three are CC0 or OFL and ask for nothing. They were credited anyway,
      // in a comment or a text file beside the asset, which left the game in
      // the odd position of thanking everyone who did not require it and
      // nobody who did.
      block(root, 'BUILT ON', [
        { label: 'NUMBERS', value: 'break_infinity.js, MIT' },
        { label: 'TYPE', value: 'IBM Plex Mono, OFL' },
        { label: 'DICE', value: 'Kenney, CC0' },
        { label: 'ARCANA', value: 'OpenGameArt, CC0' },
      ])
      const note = el('div', 'kv-note',
        'break_infinity.js is by Patashu and is the library Antimatter ' +
        'Dimensions uses. Its licence ships with the source.')
      root.lastElementChild?.appendChild(note)
    },

    update() {
      // Nothing here changes while you play.
    },
  }
}
