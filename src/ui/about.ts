// What this is, what it is built from, and who is owed for it.
//
// Antimatter Dimensions keeps its version, its credits and its links on one
// screen rather than at the bottom of the options. The version block used to
// sit under a dozen settings here, which is the last place anyone looks when
// they want to know which build they are running.
import { el, type Pane } from './shell'

interface Entry {
  label: string
  value: string
  href?: string
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
    if (e.href) {
      const a = document.createElement('a')
      a.className = 'kv-value kv-link'
      a.href = e.href
      a.target = '_blank'
      a.rel = 'noreferrer noopener'
      a.textContent = e.value
      row.appendChild(a)
    } else {
      row.appendChild(el('span', 'kv-value', e.value))
    }
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
      // One line. There is no explanatory prose anywhere else in the game and
      // an about screen is not the place to start writing some.
      intro.appendChild(el('div', 'kv-note', 'an incremental game about dice, named for the pun'))
      root.appendChild(intro)

      block(root, 'VERSION', [
        { label: 'CHANNEL', value: __CHANNEL__ },
        { label: 'BUILT', value: __BUILD_ID__ },
      ], __VERSION__)

      // CC0 asks for nothing and the font's licence asks only that the licence
      // travels with it, which it does. Saying so anyway is the point.
      block(root, 'BUILT FROM', [
        { label: 'DICE AUDIO', value: 'Kenney, Casino Audio, CC0', href: 'https://kenney.nl/assets/casino-audio' },
        { label: 'TYPEFACE', value: 'IBM Plex Mono, OFL', href: 'https://github.com/IBM/plex' },
        { label: 'BIG NUMBERS', value: 'break_infinity.js', href: 'https://github.com/Patashu/break_infinity.js' },
      ])

      block(root, 'OWED TO', [
        { label: 'THE ENGINE', value: 'Antimatter Dimensions', href: 'https://ivark.github.io/' },
        { label: 'THE ARCANA', value: 'The Binding of Isaac', href: 'https://bindingofisaacrebirth.wiki.gg/wiki/Cards_and_Runes' },
        { label: 'THE DRAFT', value: 'Idle Dice 2', href: 'https://idledice2.fandom.com/wiki/Cards' },
      ])
    },

    update() {
      // Nothing here changes while you play.
    },
  }
}
