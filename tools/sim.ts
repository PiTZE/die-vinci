// Balance simulation.
//
// Plays the game the way someone holding MAX does: buy whatever is affordable,
// take a study or a folio the moment it is, and stop resetting near the end
// because a reset clears the ink and a multiplier stops being worth it. AD
// players do the same, they stop taking galaxies and push for Infinity.
//
// It reports where the time actually goes, because a single number for the
// whole climb says nothing about which tier is the wall.
//
//   npm run sim              eight simulated hours
//   npm run sim -- 24        twenty-four
//   WAGERS=3 npm run sim     play out three runs and compare them
import Decimal from 'break_infinity.js'
import { newGame } from '../src/state'
import * as P from '../src/game/production'
import * as W from '../src/game/wager'
import { AUTOMATOR_AT_STUDIES, WAGER_AT } from '../src/game/balance'
import { SOLIDS } from '../src/game/solids'
import { UPGRADES, buyUpgrade, canBuy, type UpgradeId } from '../src/game/upgrades'
import { format } from '../src/format'

const HOURS = Number(process.argv[2] ?? 8)
const WAGERS = Number(process.env.WAGERS ?? 1)
const PUSH_AT = process.argv[3] ?? '1e200'
const DT = 0.25
const QUIET = process.env.QUIET === '1'

const s = newGame(0)
let t = 0
let ms = 0

const hms = (secs: number) => {
  const h = Math.floor(secs / 3600)
  const m = Math.floor((secs % 3600) / 60)
  const sec = Math.floor(secs % 60)
  return h ? `${h}h${String(m).padStart(2, '0')}m` : `${m}m${String(sec).padStart(2, '0')}s`
}

/** Milestones, so the report says which stretch is slow rather than only how
 *  long the whole thing took. */
const marks: { at: number; what: string; ink: string }[] = []
let lastMark = 0
function mark(what: string): void {
  marks.push({ at: t, what, ink: format(s.ink, 'scientific') })
  lastMark = t
}

/**
 * Before the automator the player is pressing a button, and cannot press it
 * faster than the roll rate. Perfect mashing is the ceiling, so this rolls
 * every interval, which flatters the player slightly and is the right bound
 * for asking whether the opening is too long.
 */
function advance(): void {
  if (!s.autoRoll) {
    // A roll lands whenever one is due, exactly as holding the button would.
    if (!s.rollStartedAt) s.rollStartedAt = ms
    ms += DT * 1000
    P.tick(s, DT, ms)
    return
  }
  ms += DT * 1000
  P.tick(s, DT, ms)
}

function dump(): void {
  if (QUIET || !marks.length) return
  console.log(`\n${'milestone'.padEnd(24)}${'at'.padStart(8)}${'gap'.padStart(9)}   ink`)
  let prev = lastWager
  for (const m of marks) {
    console.log(
      `${m.what.padEnd(24)}${hms(m.at).padStart(8)}${hms(m.at - prev).padStart(9)}   ${m.ink}`,
    )
    prev = m.at
  }
}

let done = 0
let lastWager = 0
let stalledAt: string | null = null
let peak = new Decimal(0)
let peakAt = 0
let automatorAt = 0
let studiesSeen = 0
let foliosSeen = 0

/** Where the exponent actually spends its time. A single number for the whole
 *  climb hides whether the curve is a wall or a slide. */
const RUNGS = [1, 10, 25, 50, 75, 100, 150, 200, 250, 280, 300, 308]
const rungAt = new Map<number, number>()

while (t < HOURS * 3600 && done < WAGERS) {
  advance()
  t += DT

  if (s.ink.gt(1)) {
    const e = s.ink.log10()
    for (const r of RUNGS) if (e >= r && !rungAt.has(r)) rungAt.set(r, t)
  }

  if (s.ink.gt(peak)) {
    peak = s.ink
    peakAt = t
  }

  // The automator is the whole point of the opening, so it is bought the
  // moment it can be, ahead of anything else.
  if (!s.autoRoll && P.canBuyAutomator(s)) {
    P.buyAutomator(s)
    automatorAt = t
    mark('automator')
  }

  P.maxAll(s)
  if (s.ink.lt(PUSH_AT)) {
    if (P.canBuyFolio(s)) {
      P.buyFolio(s)
      foliosSeen += 1
      mark(`folio ${foliosSeen}`)
    } else if (P.canBuyStudy(s)) {
      P.buyStudy(s)
      studiesSeen += 1
      if (studiesSeen <= SOLIDS.length - 1) mark(`study ${studiesSeen} (${SOLIDS[studiesSeen].short})`)
      else if (studiesSeen % 5 === 0) mark(`study ${studiesSeen}`)
    }
  }

  if (W.canWager(s)) {
    W.doWager(s)
    done += 1
    for (let pass = 0; pass < 12; pass++) {
      const next = (Object.keys(UPGRADES) as UpgradeId[])
        .filter((id) => canBuy(s, id))
        .sort((a, b) => UPGRADES[a].cost - UPGRADES[b].cost)[0]
      if (!next) break
      buyUpgrade(s, next)
    }
    console.log(
      `\nWAGER ${done}  after ${hms(t - lastWager)}  (total ${hms(t)})  ` +
        `points=${s.points}  upgrades=${s.pointUpgrades.length}/${Object.keys(UPGRADES).length}`,
    )
    dump()
    lastWager = t
    studiesSeen = 0
    foliosSeen = 0
    marks.length = 0
  }
}

if (!QUIET && marks.length) dump()

if (!QUIET) {
  console.log(`\n${'ink reaches'.padEnd(14)}${'at'.padStart(8)}${'gap'.padStart(9)}   orders/min`)
  let prev = 0
  let prevRung = 0
  for (const r of RUNGS) {
    const at = rungAt.get(r)
    if (at === undefined) continue
    const gap = at - prev
    const rate = gap > 0 ? ((r - prevRung) / gap) * 60 : Infinity
    console.log(
      `1e${String(r).padEnd(12)}${hms(at).padStart(8)}${hms(gap).padStart(9)}   ${rate.toFixed(1)}`,
    )
    prev = at
    prevRung = r
  }
}

if (done < WAGERS) {
  stalledAt = format(s.ink, 'scientific')
  const pct = (s.ink.log10() / WAGER_AT.log10()) * 100
  console.log(
    `\nSTALLED at ${stalledAt} after ${hms(t)}  ` +
      `(${pct.toFixed(1)}% of the way to the Wager, by exponent)`,
  )
  console.log(
    `  solids open: ${P.openSolids(s)}/${SOLIDS.length}   studies: ${s.studies}   folios: ${s.folios}   ` +
      `roll: ${s.rollUpgrades} (${(1 / P.rollInterval(s)).toFixed(1)}/s)`,
  )
  console.log(`  automator at ${automatorAt ? hms(automatorAt) : 'never'}`)
  console.log(`  peak ink ${format(peak, 'scientific')} at ${hms(peakAt)}`)
  console.log(`  last milestone ${hms(lastMark)}, so ${hms(t - lastMark)} with nothing to show`)
  console.log(`  (AUTOMATOR appears at ${AUTOMATOR_AT_STUDIES} studies)`)
}
