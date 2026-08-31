import { format } from '../format'
import {
  CODICES,
  CODEX_COUNT,
  canBuyAnyCodex,
  canBuyCodex,
  codexCost,
  codexMultiplier,
  codexPerSecond,
  codexUnlockAt,
  esperienzaMultiplier,
  openCodices,
  PER_PURCHASE,
} from '../game/codices'
import { WAGER_AUTOBUYER, wagerThreshold } from '../game/breaks'
import type { GameState } from '../state'
import { el, type Actions, type Pane } from './shell'

function setText(n: HTMLElement, v: string): void {
  if (n.textContent !== v) n.textContent = v
}

/** The verb-and-cost button the table and the Wager pane both use. */
function duo(btn: HTMLElement, verb: string, cost: string): void {
  let a = btn.firstElementChild as HTMLElement | null
  let b = a?.nextElementSibling as HTMLElement | null
  if (!a || !b) {
    btn.textContent = ''
    a = document.createElement('span')
    a.className = 'btn-verb'
    b = document.createElement('span')
    b.className = 'btn-cost'
    btn.append(a, b)
    btn.classList.add('duo')
  }
  setText(a, verb)
  setText(b, cost)
}

/** Only what update rewrites. The short code and the name are written once at
 *  mount and never change. */
interface Row {
  root: HTMLElement
  mult: HTMLElement
  held: HTMLElement
  rate: HTMLElement
  btn: HTMLButtonElement
}

/**
 * The second chain, above the wall.
 *
 * It is deliberately the same shape as the table downstairs, because it is the
 * same idea: a tier feeds the tier below it and the bottom one feeds a
 * currency. What differs is what it is bought with and what a Wager does to
 * it, and both of those are said on the screen rather than left to be worked
 * out.
 */
export function codicesPane(): Pane {
  // Held from mount, because the shell calls action() afterwards and the
  // button in the bar needs the same handle every other pane's does.
  let acts: Actions
  let head: HTMLElement
  let esperienzaLine: HTMLElement
  let worth: HTMLElement
  let list: HTMLElement
  let nextLine: HTMLElement
  let maxBtn: HTMLButtonElement
  const rows: Row[] = []

  return {
    id: 'codices',
    label: 'CODICES',

    // Nothing about the second chain exists until the first one opens, and it
    // opens on how deep a run has gone rather than on anything you can press.
    visible: (s) => openCodices(s) > 0,

    mount(root, actions: Actions) {
      acts = actions
      head = el('div', 'section')
      const h = el('div', 'section-head')
      h.appendChild(el('span', 'grow', 'THE CODICES'))
      esperienzaLine = el('span', 'num dim', '')
      h.appendChild(esperienzaLine)
      head.appendChild(h)

      worth = el('div', 'codex-worth', '')
      head.appendChild(worth)

      list = el('div', 'codex-list')
      for (const def of CODICES) {
        const row = el('div', 'codex')
        row.title = def.full
        const short = el('span', 'codex-short', def.short)
        // Name and held on the first line, price and rate on the second. Both
        // the name and the multiplier are unbounded strings -- a codex reaches
        // x3.64e64 -- so putting them on one line at 390px overlapped them
        // into the amount beside them.
        const name = el('span', 'codex-name', def.name)
        const mult = el('span', 'codex-mult', '')
        const held = el('span', 'codex-held num', '')
        const rate = el('span', 'codex-rate', '')
        const btn = el('button', 'solid-buy')
        btn.type = 'button'
        btn.addEventListener('click', () => actions.buyCodex(def.idx))
        row.append(short, name, held, mult, rate, btn)
        list.appendChild(row)
        rows.push({ root: row, mult, held, rate, btn })
      }
      head.appendChild(list)

      nextLine = el('div', 'codex-next', '')
      head.appendChild(nextLine)

      root.append(head)
    },

    action() {
      maxBtn = el('button', 'action', 'MAX')
      maxBtn.type = 'button'
      maxBtn.title = 'Buy every codex the chips cover'
      maxBtn.addEventListener('click', () => acts.buyAllCodices())
      // No key. bindKey's map is global and the table already owns m, so
      // binding it here would take MAX away from the table for the rest of
      // the session rather than only while this pane is open.
      return maxBtn
    },

    update(s: GameState) {
      const n = s.options.notation
      const open = openCodices(s)

      setText(esperienzaLine, `${format(s.esperienza, n)} ESPERIENZA`)
      setText(
        worth,
        `every solid is multiplied by ${format(esperienzaMultiplier(s), n)}. ` +
          'Each codex feeds the one under it, the first makes esperienza, and ' +
          'a Wager keeps what you bought and takes back what it grew into.',
      )

      for (const def of CODICES) {
        const r = rows[def.idx - 1]
        const on = def.idx <= open
        r.root.hidden = !on
        if (!on) continue
        const st = s.codices[def.idx - 1]
        setText(r.held, format(st.amount, n))
        // The multiplier and where it came from. The count used to be on the
        // button, which then read BUY 0 on an unbought codex: the table's
        // buttons say how many a press buys, and a press here buys ten.
        setText(
          r.mult,
          st.bought > 0
            ? `x${format(codexMultiplier(s, def.idx), n)} from ${st.bought}`
            : 'x1',
        )
        // No "to FORS" on the end. Where a codex's output goes is the row
        // below it, every time, so the words only competed for space with the
        // two numbers that are not obvious.
        setText(r.rate, `${format(codexPerSecond(s, def.idx), n)}/s`)
        const can = canBuyCodex(s, def.idx)
        r.btn.disabled = !can
        r.btn.classList.toggle('buyable', can)
        duo(r.btn, `BUY ${PER_PURCHASE}`, format(codexCost(s, def.idx), n))
      }

      // What the next one costs, in the currency it is actually priced in,
      // which is how deep a single run has gone rather than chips.
      if (open >= CODEX_COUNT) {
        setText(nextLine, 'every codex is open')
      } else {
        const next = CODICES[open]
        // And where the depth comes from, because it is not obvious and the
        // whole layer stalls on not knowing. Nothing on the table produces
        // depth: a run ends when the Wager autobuyer decides the payout is
        // enough, so how deep it gets is that threshold and nothing else.
        // A run holding the first codex reaches 1e1633 in ten minutes and
        // 1e378 in one, so the difference is entirely in how long you let it
        // go. The rule that says so lives on another tab.
        const chasing =
          s.autobuyers[WAGER_AUTOBUYER]?.unlocked && s.autobuyers[WAGER_AUTOBUYER]?.on
            ? ` The Wager is called as soon as it pays ${format(wagerThreshold(s), n)}` +
              ', so raise that in AUTOMATION to let a run go further.'
            : ''
        setText(
          nextLine,
          `${next.short} opens when one run earns ${format(codexUnlockAt(open + 1), n)} ink. ` +
            `The deepest yet is ${format(s.deepestInk, n)}.${chasing}`,
        )
      }

      if (maxBtn) {
        const can = canBuyAnyCodex(s)
        maxBtn.disabled = !can
        maxBtn.classList.toggle('buyable', can)
      }
    },
  }
}
