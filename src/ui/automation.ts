import {
  AUTOBUYERS,
  anyUnlocked,
  canUpgrade,
  hasLimit,
  interval,
  isMaxed,
  isUnlocked,
  limitAt,
  limitOn,
  mode,
  untilFolios,
  untilOn,
  upgradeCost,
} from '../game/autobuyers'
import Decimal from '../vendor/break-infinity'
import { WAGER_AUTOBUYER, wagerThreshold } from '../game/breaks'
import { format } from '../format'
import type { GameState } from '../state'
import {
  AUTO_ROLL_MAX,
  automatorCost,
  automatorUnlocked,
  autoRollCost,
  canBuyAutomator,
  canBuyAutoRoll,
  dieCanRollItself,
  dieOn,
  nextAutoRoll,
} from '../game/production'
import { SOLIDS } from '../game/solids'
import { el, type Actions, type Pane } from './shell'

function setText(n: HTMLElement, v: string): void {
  if (n.textContent !== v) n.textContent = v
}

/**
 * A small number field.
 *
 * inputmode numeric rather than type="number", because a spinner in a 44px row
 * is two targets nobody wants and iOS draws it differently again. It commits
 * on input, so there is nothing to press afterwards, and a blank box is left
 * alone rather than read as zero: clearing it to type a new number should not
 * stop the autobuyer for the two keystrokes in between.
 */
function numberBox(label: string, write: (v: number) => void): HTMLInputElement {
  const n = document.createElement('input')
  n.className = 'auto-num'
  n.type = 'text'
  n.inputMode = 'numeric'
  n.autocomplete = 'off'
  n.spellcheck = false
  n.setAttribute('aria-label', label)
  n.addEventListener('input', () => {
    const cleaned = n.value.replace(/[^0-9]/g, '')
    if (cleaned !== n.value) n.value = cleaned
    if (cleaned === '') return
    write(Number(cleaned))
  })
  return n
}

/**
 * The same box, for a number that will not fit in one. The Wager threshold
 * climbs with the payout, so it is typed and read as a Decimal.
 */
function bigBox(label: string, write: (v: string) => void): HTMLInputElement {
  const n = document.createElement('input')
  n.className = 'auto-num'
  n.type = 'text'
  n.inputMode = 'decimal'
  n.autocomplete = 'off'
  n.spellcheck = false
  n.setAttribute('aria-label', label)
  n.addEventListener('input', () => {
    const cleaned = n.value.replace(/[^0-9.e+]/gi, '')
    if (cleaned !== n.value) n.value = cleaned
    if (cleaned === '' || !Number.isFinite(new Decimal(cleaned).e)) return
    write(cleaned)
  })
  return n
}

export function automationPane(): Pane {
  /** The last state update() saw, so a click can read the current setting. */
  let shown: GameState
  let autoSection: HTMLElement
  let autoBuy: HTMLButtonElement
  let autoToggle: HTMLButtonElement
  const rows = new Map<
    string,
    {
      root: HTMLElement
      every: HTMLElement
      onBtn: HTMLButtonElement
      modeBtn: HTMLButtonElement
      up: HTMLButtonElement
      /** Only the two reset autobuyers have these. */
      rules?: {
        root: HTMLElement
        capOn: HTMLButtonElement
        capAt: HTMLInputElement
        untilRow?: HTMLElement
        untilBtn?: HTMLButtonElement
        untilAt?: HTMLInputElement
      }
    }
  >()

  let autobuyerSection: HTMLElement
  let allAutoToggle: HTMLButtonElement
  let autoManualRow: HTMLElement
  let dieNote: HTMLElement
  const dieRows: {
    root: HTMLElement
    state: HTMLElement
    on: HTMLButtonElement
    buy: HTMLButtonElement
  }[] = []

  return {
    id: 'automation',
    label: 'AUTOMATION',
    // The first auto-roll opens this tab, which is two minutes into a first
    // run rather than after the Wager. Everything the tab held before that is
    // still sealed inside it; see the two hidden sections in update.
    visible: (s) =>
      anyUnlocked(s) || automatorUnlocked(s) || s.autoDice > 0 || nextAutoRoll(s) > 0,

    mount(root, actions: Actions) {
      // The roll comes first: it is the one that takes your finger off the
      // button, and every autobuyer below it is a convenience by comparison.
      autoSection = el('div', 'section')
      const ah = el('div', 'section-head')
      ah.appendChild(el('span', 'grow', 'THE ROLL'))
      // The master, in the head, where the autobuyers' one is. It was the last
      // row under the nine it governs, next to a purchase, which made it read
      // as a tenth die rather than as the switch over all of them.
      autoToggle = el('button', 'auto-toggle', 'ON')
      autoToggle.type = 'button'
      autoToggle.title = 'Hand the whole table back to your finger'
      autoToggle.addEventListener('click', () => actions.toggleAutomator())
      ah.appendChild(autoToggle)
      autoSection.appendChild(ah)

      // One row a die, shallowest first, which is the order they are sold in.
      // A die opens for automation when the die below it opens for buying, so
      // this list grows a row at a time alongside the table.
      dieNote = el('div', 'auto-note', '')
      autoSection.appendChild(dieNote)
      for (let idx = 1; idx <= AUTO_ROLL_MAX; idx++) {
        const row = el('div', 'auto-row')
        row.appendChild(el('span', 'auto-label', SOLIDS[idx - 1].short))
        const state = el('span', 'auto-every num dim', '')
        row.appendChild(state)
        // The same switch the automator has, a rung down, and for the same
        // reason: with it on there is no way to watch a single die land.
        const on = el('button', 'auto-toggle', 'ON')
        on.type = 'button'
        on.title = 'Hand this die back to your finger'
        on.addEventListener('click', () => actions.toggleDie(idx))
        row.appendChild(on)
        const buy = el('button', 'auto-up', '')
        buy.type = 'button'
        buy.addEventListener('click', () => actions.buyAutoRoll())
        row.appendChild(buy)
        autoSection.appendChild(row)
        dieRows.push({ root: row, state, on, buy })
      }

      const autoRow = el('div', 'auto-row')
      autoBuy = el('button', 'auto-up', '')
      autoBuy.type = 'button'
      autoBuy.addEventListener('click', () => actions.buyAutomator())
      autoRow.append(el('span', 'auto-label', 'EVERY DIE'), autoBuy)
      autoManualRow = autoRow
      autoSection.appendChild(autoRow)
      root.append(autoSection)

      autobuyerSection = el('div', 'section')
      const section = autobuyerSection
      const h = el('div', 'section-head')
      h.appendChild(el('span', 'grow', 'AUTOBUYERS'))
      // The group switch, in the head rather than in a row of its own: it is
      // about the whole section under it, and a row would read as a fourteenth
      // autobuyer. Each one keeps its own switch, so this stops all of them
      // without forgetting which ones you had off.
      allAutoToggle = el('button', 'auto-toggle', 'ON')
      allAutoToggle.type = 'button'
      allAutoToggle.title = 'Stop every autobuyer, keeping each one as you set it'
      allAutoToggle.addEventListener('click', () => actions.toggleAutobuyers())
      h.appendChild(allAutoToggle)
      section.appendChild(h)

      for (const a of AUTOBUYERS) {
        const row = el('div', 'auto-row')
        row.appendChild(el('span', 'auto-label', a.label))
        const every = el('span', 'auto-every num dim', '')
        row.appendChild(every)

        const onBtn = el('button', 'auto-toggle', 'ON')
        onBtn.type = 'button'
        onBtn.addEventListener('click', () => actions.toggleAutobuyer(a.id))

        // Single, a group of ten, or as much as the ink allows. AD's modes.
        const modeBtn = el('button', 'auto-toggle auto-mode', '10')
        modeBtn.type = 'button'
        modeBtn.title = 'What each purchase buys'
        modeBtn.addEventListener('click', () => actions.cycleAutobuyerMode(a.id))

        const up = el('button', 'auto-up', '')
        up.type = 'button'
        up.addEventListener('click', () => actions.upgradeAutobuyer(a.id))

        row.append(onBtn, modeBtn, up)
        section.appendChild(row)

        // A cap on how many to take, and for studies a folio count that lifts
        // it. Typed rather than cycled: the useful values are whatever this
        // run happens to need, and a fixed list of them would be a guess.
        let rules: (typeof rows extends Map<string, infer V> ? V : never)['rules']
        // The Wager's own rule, and only once the wall is down: what a Wager
        // has to pay before this calls it. Before the wall a Wager pays one
        // chip whenever it is called, so there is nothing to wait for, which
        // is why AD's willInfinity returns true outright while !player.break.
        if (a.id === WAGER_AUTOBUYER) {
          const box = el('div', 'auto-rules')
          const payRow = el('div', 'auto-rule')
          const riseOn = el('button', 'auto-toggle', 'OFF')
          riseOn.type = 'button'
          riseOn.title = 'Raise it whenever the payout doubles'
          riseOn.addEventListener('click', () =>
            actions.setWagerRise(!(shown.autobuyers[WAGER_AUTOBUYER]?.riseWithMult !== false)))
          payRow.append(el('span', 'auto-rule-label', 'ONLY AT'), riseOn)
          const payAt = bigBox('chips', (v) => actions.setWagerThreshold(v))
          payRow.appendChild(payAt)
          box.appendChild(payRow)
          section.appendChild(box)
          rules = { root: box, capOn: riseOn, capAt: payAt }
        }
        if (hasLimit(a.id)) {
          const box = el('div', 'auto-rules')
          const capRow = el('div', 'auto-rule')
          const capOn = el('button', 'auto-toggle', 'OFF')
          capOn.type = 'button'
          capOn.title = 'Stop after this many'
          capOn.addEventListener('click', () => actions.setAutobuyerLimit(a.id, !limitOn(shown, a.id)))
          capRow.append(el('span', 'auto-rule-label', 'STOP AFTER'), capOn)
          const capAt = numberBox(a.id === 'study' ? 'studies' : 'folios', (v) =>
            actions.setAutobuyerLimit(a.id, limitOn(shown, a.id), v))
          capRow.appendChild(capAt)
          box.appendChild(capRow)

          let untilRow: HTMLElement | undefined
          let untilBtn: HTMLButtonElement | undefined
          let untilAt: HTMLInputElement | undefined
          if (a.id === 'study') {
            untilRow = el('div', 'auto-rule')
            untilBtn = el('button', 'auto-toggle', 'OFF')
            untilBtn.type = 'button'
            untilBtn.title = 'Ignore the cap once you hold this many folios'
            untilBtn.addEventListener('click', () =>
              actions.setAutobuyerUntil(a.id, !untilOn(shown, a.id)))
            untilRow.append(el('span', 'auto-rule-label', 'UNLESS FOLIOS'), untilBtn)
            untilAt = numberBox('folios', (v) =>
              actions.setAutobuyerUntil(a.id, untilOn(shown, a.id), v))
            untilRow.appendChild(untilAt)
            box.appendChild(untilRow)
          }
          section.appendChild(box)
          rules = { root: box, capOn, capAt, untilRow, untilBtn, untilAt }
        }
        rows.set(a.id, { root: row, every, onBtn, modeBtn, up, rules })
      }
      root.append(section)
    },

    update(s: GameState) {
      const n = s.options.notation
      shown = s

      // The tab opens on the first auto-roll now, so the two things behind
      // the Wager have to seal themselves rather than relying on the tab
      // being shut. A player two minutes into their first run should not be
      // reading the word AUTOBUYERS, let alone THE WAGER inside it.
      autobuyerSection.hidden = !anyUnlocked(s)
      const allOn = s.autobuyersOn !== false
      setText(allAutoToggle, allOn ? 'ON' : 'OFF')
      allAutoToggle.classList.toggle('buyable', allOn)
      autoSection.hidden = false

      const next = nextAutoRoll(s)
      // Written when the ladder stopped at the eighth die. It has nine rungs
      // now, the deepest waiting on the whole chain instead of on a solid
      // under it, so the old line was telling a player who had bought every
      // rung that one of them had not happened.
      setText(
        dieNote,
        s.autoDice >= AUTO_ROLL_MAX
          ? 'every die rolls itself'
          : s.autoDice === AUTO_ROLL_MAX - 1
          ? 'the deepest die rolls itself once the whole chain is on the table'
          : 'a die rolls itself once you have opened the one below it',
      )
      for (let idx = 1; idx <= AUTO_ROLL_MAX; idx++) {
        const r = dieRows[idx - 1]
        const held = idx <= s.autoDice
        // Sold, or for sale, or automated by the automator, and nothing
        // further down the list. A row for a die you have not opened yet is a
        // row about a solid you have not met.
        const on = held || idx === next || dieCanRollItself(s, idx)
        r.root.hidden = !on
        if (!on) continue
        // A switch is only worth offering for a die something would roll
        // without you, which past the Wager is every one of them: the
        // automator covers the whole table, so it hands each row a switch it
        // did not have when the ladder was the only way to get one.
        const auto = dieCanRollItself(s, idx)
        r.on.hidden = !auto
        r.buy.hidden = held
        if (auto) {
          const running = dieOn(s, idx)
          setText(r.on, running ? 'ON' : 'OFF')
          r.on.classList.toggle('buyable', running)
          setText(r.state, running ? 'ROLLS ITSELF' : 'WAITS FOR YOU')
        } else {
          setText(r.state, '')
        }
        if (held) continue
        const can = canBuyAutoRoll(s)
        setText(r.buy, `AUTOMATE / ${format(autoRollCost(s), n)} INK`)
        r.buy.disabled = !can
        r.buy.classList.toggle('buyable', can)
      }

      // The master over the nine above it. It stopped being a purchase when
      // the Wager began granting the ladder outright: charging a chip for the
      // hands the ladder already sold you is charging twice.
      //
      // It appears with the first automated die rather than with the
      // automator. It used to gate only the automator, so through the whole of
      // a first run, where the ladder is the only automation there is, the one
      // switch labelled EVERY DIE was the one switch that did nothing.
      const anyAuto = s.autoRoll || s.autoDice > 0
      autoToggle.hidden = !anyAuto
      setText(autoToggle, s.autoRollOn ? 'ON' : 'OFF')
      autoToggle.classList.toggle('buyable', s.autoRollOn)
      // The automator, while it is still something to buy. Once the Wager has
      // granted it there is nothing left in this row: the switch it used to
      // carry is in the heading.
      autoManualRow.hidden = s.autoRoll
      if (!s.autoRoll) {
        setText(autoBuy, `UNLOCK / ${automatorCost()} POINT`)
        const can = canBuyAutomator(s)
        autoBuy.disabled = !can
        autoBuy.classList.toggle('buyable', can)
      }
      for (const a of AUTOBUYERS) {
        const row = rows.get(a.id)
        if (!row) continue
        const open = isUnlocked(s, a.id)
        row.root.hidden = !open
        if (row.rules) row.rules.root.hidden = !open
        if (!open) continue

        setText(row.every, `${(interval(s, a.id) / 1000).toFixed(2)}s`)
        const on = (s.autobuyers[a.id]?.on ?? true) && allOn
        setText(row.onBtn, (s.autobuyers[a.id]?.on ?? true) ? 'ON' : 'OFF')
        row.onBtn.classList.toggle('buyable', on)

        const m = mode(s, a.id)
        setText(row.modeBtn, m === 'single' ? '1' : m === 'ten' ? '10' : 'MAX')
        row.modeBtn.hidden = !a.id.startsWith('solid')

        // The Wager's threshold is its own thing, and it stays out of sight
        // until the wall is down, because until then a Wager pays one chip
        // whenever it is called and there is nothing to wait for.
        if (a.id === WAGER_AUTOBUYER && row.rules) {
          row.rules.root.hidden = !s.broke
          if (s.broke) {
            const rise = s.autobuyers[WAGER_AUTOBUYER]?.riseWithMult !== false
            setText(row.rules.capOn, rise ? 'RISES' : 'FIXED')
            row.rules.capOn.classList.toggle('buyable', rise)
            if (document.activeElement !== row.rules.capAt) {
              row.rules.capAt.value = format(wagerThreshold(s), n)
            }
          }
        } else if (row.rules) {
          const capped = limitOn(s, a.id)
          setText(row.rules.capOn, capped ? 'ON' : 'OFF')
          row.rules.capOn.classList.toggle('buyable', capped)
          // Not while it is being typed into, or the cursor jumps to the end
          // on every keystroke.
          if (document.activeElement !== row.rules.capAt) {
            row.rules.capAt.value = String(limitAt(s, a.id))
          }
          row.rules.capAt.disabled = !capped
          if (row.rules.untilBtn && row.rules.untilAt) {
            const until = untilOn(s, a.id)
            setText(row.rules.untilBtn, until ? 'ON' : 'OFF')
            row.rules.untilBtn.classList.toggle('buyable', until)
            if (document.activeElement !== row.rules.untilAt) {
              row.rules.untilAt.value = String(untilFolios(s, a.id))
            }
            row.rules.untilAt.disabled = !until
            // Folios are a system of their own, and a rule about them has no
            // business on screen before one is bound.
            if (row.rules.untilRow) row.rules.untilRow.hidden = s.folios === 0 && s.wagers === 0
          }
          row.rules.root.hidden = false
        }

        const maxed = isMaxed(s, a.id)
        setText(row.up, maxed ? 'FASTEST' : `FASTER / ${format(upgradeCost(s, a.id), n)}`)
        const can = canUpgrade(s, a.id)
        row.up.disabled = maxed || !can
        row.up.classList.toggle('buyable', can)
      }
    },
  }
}
