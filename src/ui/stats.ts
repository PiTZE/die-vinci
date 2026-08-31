// What the save has to say about itself.
//
// Antimatter Dimensions writes its statistics as sentences. "You have played
// for 3 minutes and 57 seconds." That is their voice, not this one. Everything
// here reads label on the left, value on the right, the same grammar as a buy
// button and a section header, and the numbers line up in a column because
// they are the reason you opened the tab.
//
// What is kept from theirs is the shape: a general block, then one block per
// layer, each appearing only once that layer exists. That gating is the rule
// the archive and the help section already follow.
import { ACHIEVEMENTS } from '../game/achievements'
import { meltUnlocked } from '../game/production'
import { owned } from '../game/tarot'
import { CODEX_COUNT, openCodices } from '../game/codices'
import { formatTime } from '../format'
import type { GameState } from '../state'
import { el, type Pane } from './shell'

interface Row {
  value: HTMLElement
  read(s: GameState): string
}

/** A date, without a locale's opinion about which number is the month. */
function stamp(ms: number): string {
  const d = new Date(ms)
  const p = (n: number) => `${n}`.padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`
}

export function statsPane(): Pane {
  const rows: Row[] = []
  const sections: { root: HTMLElement; when: (s: GameState) => boolean }[] = []

  return {
    id: 'stats',
    label: 'STATS',

    mount(root) {
      const section = (title: string, when: (s: GameState) => boolean) => {
        const sec = el('div', 'section')
        const h = el('div', 'section-head')
        h.appendChild(el('span', 'grow', title))
        sec.appendChild(h)
        const list = el('div', 'kv-list')
        sec.appendChild(list)
        root.appendChild(sec)
        sections.push({ root: sec, when })
        return (label: string, read: (s: GameState) => string) => {
          const row = el('div', 'kv-row')
          row.appendChild(el('span', 'kv-label', label))
          const value = el('span', 'kv-value', '')
          row.appendChild(value)
          list.appendChild(row)
          rows.push({ value, read })
        }
      }

      const always = () => true

      const general = section('GENERAL', always)
      general('PLAYED', (s) => formatTime(s.stats.playMs / 1000))
      general('SAVE MADE', (s) => stamp(s.stats.started))
      general('AGE', (s) => formatTime((Date.now() - s.stats.started) / 1000))
      general('ARCHIVE', (s) => `${s.achievements.length}/${ACHIEVEMENTS.length}`)

      const table = section('THE TABLE', always)
      table('SOLIDS BOUGHT', (s) => `${s.solids.reduce((a, d) => a + d.bought, 0)}`)
      table('ROLL RATE', (s) => `${s.rollUpgrades}`)
      table('STUDIES', (s) => `${s.studies}`)
      table('SINCE A RESET', (s) => formatTime(s.stats.sinceResetMs / 1000))

      // Folios are a second reset on top of studies, so the block naming them
      // waits until one has been bound, exactly as the folio section does.
      const folio = section('FOLIOS', (s) => s.stats.foliosEver > 0)
      folio('THIS RUN', (s) => `${s.folios}`)
      folio('ALL TIME', (s) => `${s.stats.foliosEver}`)

      const wager = section('THE WAGER', (s) => s.wagers > 0)
      wager('CALLED', (s) => `${s.wagers}`)
      wager('CHIPS', (s) => s.chips.toString())
      wager('UPGRADES', (s) => `${s.chipUpgrades.length}`)
      wager('IN THIS ONE', (s) => formatTime(s.stats.wagerMs / 1000))
      wager('CHALLENGES', (s) => `${s.challengesDone.length}`)

      const arcana = section('THE ARCANA', (s) => owned(s) > 0)
      arcana('HELD', (s) => `${owned(s)}/22`)
      arcana('LEVELS', (s) => `${Object.values(s.tarot).reduce((a, n) => a + n, 0)}`)

      // One block per layer, appearing once that layer exists, which is the
      // rule the four blocks above already follow.
      const codices = section('THE CODICES', (s) => openCodices(s) > 0)
      codices('OPEN', (s) => `${openCodices(s)}/${CODEX_COUNT}`)
      codices('PURCHASES', (s) => `${s.codices.reduce((a, c) => a + c.bought, 0)}`)
      codices('ESPERIENZA', (s) => s.esperienza.toString())
      codices('DEEPEST RUN', (s) => s.deepestInk.toString())

      const melt = section('MELTING', (s) => meltUnlocked(s))
      melt('MELTS', (s) => `${s.stats.melts}`)
      melt('ON THE DEEPEST', (s) => `x${s.meltPower.toString()}`)
    },

    update(s: GameState) {
      for (const sec of sections) sec.root.hidden = !sec.when(s)
      for (const r of rows) {
        const t = r.read(s)
        if (r.value.textContent !== t) r.value.textContent = t
      }
    },
  }
}
