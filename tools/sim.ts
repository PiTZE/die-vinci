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
import { WAGER_AT } from '../src/game/balance'
import { SOLIDS } from '../src/game/solids'
import { UPGRADES, buyUpgrade, canBuy, type UpgradeId } from '../src/game/upgrades'
import { ACHIEVEMENTS, achievementPower, checkAchievements } from '../src/game/achievements'
import { ARCANA, drawOffer, owned, takeCard } from '../src/game/tarot'
import * as B from '../src/game/breaks'
import * as C from '../src/game/codices'
import { AUTOBUYERS, isMaxed, upgrade as upgradeAuto, unlock as unlockAuto, upgradeCost }
  from '../src/game/autobuyers'
import { CHALLENGES } from '../src/game/challenges'
import { format } from '../src/format'

const HOURS = Number(process.argv[2] ?? 8)
const WAGERS = Number(process.env.WAGERS ?? 1)
// Where to stop resetting and push for the threshold. 1e200 was optimal when
// roll rate cost x10; at x20 it costs 55 minutes, because the run is slower and
// the last stretch is where a reset hurts most. Swept at 1e200, 1e240, 1e270,
// 1e285, 1e295, 1e300, 1e305 and 1e308, it is 1h33m, 59m, 38m09s, 38m03s,
// 38m12s, 38m27s, 38m34s and 38m32s: a flat plateau from 1e270 up and a cliff
// below it. Anything on the plateau is within ten seconds of the best.
const PUSH_AT = process.argv[3] ?? '1e285'
const DT = 0.25
const QUIET = process.env.QUIET === '1'
const TAROT = process.env.TAROT ?? 'draft'
const FORCE = process.env.FORCE ?? ''
/** Hands over the whole chip grid at the start. The question it answers is
 *  what a Wager costs once the grid is bought, which is the number the break
 *  grind is actually paced by and which no short run ever reaches. */
const FREE_GRID = process.env.FREE_GRID === '1'
/**
 * Starts on a broken save, which is the only way to look at the layer above the
 * wall in less than five hours of simulated time.
 *
 * Everything it hands over is something a real save reaching this point has
 * already earned: the chip grid, thirteen cleared challenges, every autobuyer
 * at its floor, and the break itself. Nothing that has to be bought past the
 * wall is granted, so the codices and the break grid are still played for.
 */
const BROKE = process.env.BROKE === '1'
/**
 * Play the payout threshold, which past the wall is the only lever on how deep
 * a run goes.
 *
 * A codex opens on depth, and depth is not something the table produces on its
 * own: the Wager autobuyer takes the run the moment the payout clears its
 * threshold, so a run ends a hair past 1.8e308 unless you tell it not to. The
 * AUTOMATION rule is what tells it. Left alone the sim never touched it and
 * never saw past the first rung, which says nothing about the ladder and
 * everything about the sim.
 *
 * The patience is the other half and it is a real cost: while a run is chasing
 * a depth it cannot reach, no Wager is called and no chips arrive at all.
 */
const AIM = process.env.AIM !== '0'
const AIM_PATIENCE_S = Number(process.env.PATIENCE ?? 600)

/**
 * Which arcana a greedy player would rather have, worst to best. Ranked by what
 * they do to production rather than by tier, so the greedy run measures the
 * ceiling the cards actually reach and not the one the draft weights suggest.
 */
const RANK = [
  'hermit', 'moon', 'stars', 'world', 'hierophant', 'lovers', 'chariot',
  'temperance', 'justice', 'hanged', 'wheel', 'magician', 'priestess',
  'emperor', 'empress', 'tower', 'devil', 'death', 'strength', 'judgement',
  'fool', 'sun',
] as const

/** A fixed stream, so two runs of the same settings are the same run. */
let seed = 12345
function rng(): number {
  seed = (seed * 1103515245 + 12345) & 0x7fffffff
  return seed / 0x7fffffff
}

const s = newGame(0)
if (FREE_GRID) {
  s.wagers = 1
  s.chipUpgrades = Object.keys(UPGRADES)
  s.autoRoll = true
}
if (BROKE) {
  s.wagers = 1
  s.chipUpgrades = Object.keys(UPGRADES)
  s.autoRoll = true
  s.autoRollOn = true
  s.challengesDone = CHALLENGES.map((c) => c.id)
  for (const a of AUTOBUYERS) {
    unlockAuto(s, a.id)
    const slot = s.autobuyers[a.id]
    if (slot) slot.level = 40
  }
  s.broke = true
  P.seedForAutomator(s)
}
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
 * Before the automator the player is holding the button, and cannot roll
 * faster than the roll rate however hard they hold it. So this rolls every
 * interval: a perfect hold, which is the right bound for asking how long the
 * opening asks someone to sit there.
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

/**
 * The archive pays x1.03 an entry and the entries are earned by playing, so a
 * run that never checks them is a run without a multiplier the real game hands
 * out for free. Nothing here chases them; they arrive on their own.
 */
function collect(): void {
  if (process.env.NO_ARCHIVE === '1') return
  checkAchievements(s)
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

/**
 * Chips, spent the way the game points you at spending them.
 *
 * The grid first because it is cheapest and gated, then the rebuyable
 * multiplier while it is cheaper than the next autobuyer level, then the
 * Wager's own autobuyer, which is the whole condition for breaking.
 */
let brokeAt = 0
let breakableAt = 0
function spendChips(): void {
  for (let pass = 0; pass < 60; pass++) {
    const next = (Object.keys(UPGRADES) as UpgradeId[])
      .filter((id) => canBuy(s, id))
      .sort((a, b) => UPGRADES[a].cost - UPGRADES[b].cost)[0]
    if (!next) break
    buyUpgrade(s, next)
  }
  // The Wager autobuyer needs the thirteenth challenge. The sim clears
  // challenges by reaching the threshold inside one, which doWager already
  // handles, so this only has to make sure it is entered.
  for (let pass = 0; pass < 200; pass++) {
    const auto = s.autobuyers[B.WAGER_AUTOBUYER]
    const canMult = B.canBuyChipMult(s)
    const wantAuto = auto?.unlocked && !isMaxed(s, B.WAGER_AUTOBUYER)
      && s.chips.gte(upgradeCost(s, B.WAGER_AUTOBUYER))
    if (!canMult && !wantAuto) break
    // Whichever is cheaper, which is what a player reading two prices does.
    if (wantAuto && (!canMult || upgradeCost(s, B.WAGER_AUTOBUYER).lte(B.chipMultCost(s)))) {
      upgradeAuto(s, B.WAGER_AUTOBUYER)
    } else {
      B.buyChipMult(s)
    }
  }
  if (!breakableAt && B.canBreak(s)) breakableAt = t
  if (!s.broke && B.canBreak(s)) {
    B.breakWager(s)
    brokeAt = t
  }

  // The break grid, cheapest first, which is what a player reading a row of
  // prices does. Without this the sim never bought SHORTER ODDS or CHEAPER
  // PLATES, and those are the two upgrades the wall exists to be pushed
  // against, so a broken run was being measured with its levers untouched.
  for (let pass = 0; pass < 200; pass++) {
    const next = B.BREAK_UPGRADES
      .map((d) => d.id)
      .filter((id) => B.canBuyBreak(s, id))
      .sort((x, y) => (B.breakCost(s, x).lt(B.breakCost(s, y)) ? -1 : 1))[0]
    if (!next) break
    B.buyBreak(s, next)
  }

  // And the codices, in AD's own order, which buyAllCodices carries.
  for (let pass = 0; pass < 20; pass++) if (!C.buyAllCodices(s)) break
  if (AIM) aimForNextCodex()
}

/** Sets the payout threshold to whatever a run reaching the next codex would
 *  pay, which is how a player reads that rule off this screen. */
function aimForNextCodex(): void {
  const a = s.autobuyers[B.WAGER_AUTOBUYER]
  if (!s.broke || !a) return
  const open = C.openCodices(s)
  const want = open >= C.CODEX_COUNT ? null : C.codexUnlockAt(open + 1)
  if (!want || s.deepestInk.gte(want)) {
    // Nothing left to chase. Back to the default, which rises on its own.
    a.riseWithMult = true
    return
  }
  const held = s.inkThisWager
  s.inkThisWager = want
  const pay = B.chipsFrom(s)
  s.inkThisWager = held
  // Aimed rather than climbing, so the chip multiplier does not double it out
  // from under the target on the next purchase.
  a.riseWithMult = false
  a.amount = pay.toString()
}

let done = 0
let seenWagers = 0
/** Runs that ran out of patience chasing a codex rather than paying out. */
let gaveUp = 0
let lastWager = 0
/** Seconds each Wager took, so the report can give a median rather than the
 *  one number the last run happened to land on. */
const wagerTimes: number[] = []
let lastLogged = 0
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
  collect()
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

  // Called by hand only while the ceiling holds. Past the wall a Wager is
  // worth what the run overshot by, so cashing out at the first opportunity is
  // simply the wrong play, and the autobuyer's own threshold is the thing that
  // decides. Calling it here regardless is what kept every measurement of the
  // broken layer pinned at 1.8e308: the sim was playing past the wall the way
  // you play before it.
  // Chasing a depth the run cannot reach is a run that never pays. A player
  // watching that happen takes the Wager and tries something else, so this
  // does too, and the report says how often it had to.
  if (AIM && s.broke && W.canWager(s) && s.stats.wagerMs > AIM_PATIENCE_S * 1000) {
    const a = s.autobuyers[B.WAGER_AUTOBUYER]
    if (a) {
      a.amount = '1'
      a.riseWithMult = true
      gaveUp += 1
    }
  }

  if (!s.broke && W.canWager(s)) {
    // Enter the next uncleared challenge before calling, because reaching the
    // threshold inside one is what clears it and what awards its autobuyer.
    if (!s.challengeRunning) {
      const next = CHALLENGES.find((c) => !s.challengesDone.includes(c.id))
      if (next && s.wagers > 0) s.challengeRunning = next.id
    }
    W.doWager(s)
  }

  // However it was called, by hand above or by the autobuyer inside the tick.
  if (s.wagers !== seenWagers) {
    seenWagers = s.wagers
    done += 1
    for (let pass = 0; pass < 12; pass++) {
      const next = (Object.keys(UPGRADES) as UpgradeId[])
        .filter((id) => canBuy(s, id))
        .sort((a, b) => UPGRADES[a].cost - UPGRADES[b].cost)[0]
      if (!next) break
      buyUpgrade(s, next)
    }
    // A draft a Wager. TAROT=off plays without them; TAROT=greedy takes the
    // strongest card on offer every time, which is the ceiling a real player
    // reaches for; anything else takes the first offered, which is the draft's
    // own weighting having its way and is closer to what most runs look like.
    // FORCE=<id> takes the same arcanum every time, so one card's effect can be
    // measured on its own rather than through whatever the draft happened to
    // hand out. That is the only way to ask whether any single card flattens
    // the curve.
    if (FORCE) {
      s.pendingDraft = [FORCE as never]
      takeCard(s, FORCE)
    } else if (TAROT !== 'off') {
      const offer = drawOffer(s, undefined, () => rng())
      if (offer.length) {
        const pick = TAROT === 'greedy'
          ? offer.slice().sort((a, b) => RANK.indexOf(b) - RANK.indexOf(a))[0]
          : offer[0]
        s.pendingDraft = offer
        takeCard(s, pick)
      }
    }
    // What a player does with chips, in the order the game makes obvious:
    // finish the grid, then buy the multiplier, then buy the Wager autobuyer
    // down toward its floor, which is the only thing breaking asks for.
    spendChips()
    if (BROKE && done > 5 && done % 250 !== 0) {
      lastWager = t
      studiesSeen = 0
      foliosSeen = 0
      marks.length = 0
      wagerTimes.push(t - lastLogged)
      lastLogged = t
      continue
    }
    wagerTimes.push(t - lastLogged)
    lastLogged = t
    console.log(
      `\nWAGER ${done}  after ${hms(t - lastWager)}  (total ${hms(t)})  ` +
        `chips=${s.chips}  upgrades=${s.chipUpgrades.length}/${Object.keys(UPGRADES).length}  ` +
        `chal=${s.challengesDone.length}/13 auto=${s.autobuyers.wager?.unlocked?"y":"n"}${s.autobuyers.wager?.level ?? 0} archive=${s.achievements.length}/${ACHIEVEMENTS.length} x${achievementPower(s).toNumber().toFixed(3)}  ` +
        `arcana=${owned(s)}`,
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

if (!QUIET) {
  console.log("\nbreak layer")
  console.log("  wager autobuyer awarded: " + (s.autobuyers.wager?.unlocked ? "yes" : "no"))
  console.log("  its interval: " + (s.autobuyers.wager ? Math.round(60000 * Math.pow(0.6, s.autobuyers.wager.level)) : "-") + "ms at level " + (s.autobuyers.wager?.level ?? 0))
  console.log("  chip multiplier: x" + B.chipMultiplier(s).toString() + " (" + s.chipMult + " bought)")
  console.log("  chips held: " + s.chips.toString())
  console.log("  breakable at: " + (breakableAt ? hms(breakableAt) : "never"))
  console.log("  broke at: " + (brokeAt ? hms(brokeAt) : "never"))
  console.log("  challenges cleared: " + s.challengesDone.length + "/13")
}

if (!QUIET && BROKE) {
  const sorted = wagerTimes.slice().sort((a, b) => a - b)
  const med = sorted.length ? sorted[Math.floor(sorted.length / 2)] : 0
  console.log('\npast the wall')
  console.log(`  Wagers called: ${done} in ${hms(t)}`)
  console.log(`  Wager time: first ${wagerTimes[0]?.toFixed(2) ?? '-'}s  ` +
    `median ${med.toFixed(2)}s  last ${wagerTimes[wagerTimes.length - 1]?.toFixed(2) ?? '-'}s`)
  console.log(`  chips held: ${format(s.chips, 'scientific')}   ` +
    `a Wager pays ${format(B.chipsFrom(s), 'scientific')}`)
  console.log(`  deepest a run has earned: ${format(s.deepestInk, 'scientific')}`)
  console.log(`  chip multiplier: x${B.chipMultiplier(s)} (${s.chipMult} bought)`)
  console.log(`  break grid: ${B.BREAK_UPGRADES.filter((u) => B.breakMaxed(s, u.id)).length}` +
    `/${B.BREAK_UPGRADES.length} full`)
  console.log(`  runs that gave up chasing a codex: ${gaveUp}` +
    (AIM ? '' : '   (AIM off)'))
  console.log(`  codices open: ${C.openCodices(s)}/${C.CODEX_COUNT}   ` +
    `esperienza ${format(s.esperienza, 'scientific')}`)
  for (const d of C.CODICES) {
    if (d.idx > C.openCodices(s)) break
    console.log(`    ${d.short}  bought ${s.codices[d.idx - 1].bought}   ` +
      `held ${format(s.codices[d.idx - 1].amount, 'scientific')}   ` +
      `next ${format(C.codexCost(s, d.idx), 'scientific')}`)
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
      `roll: ${s.rollUpgrades} (${P.rollRate(s).toExponential(1)}/s)`,
  )
  console.log(`  automator at ${automatorAt ? hms(automatorAt) : 'never'}`)
  console.log(`  peak ink ${format(peak, 'scientific')} at ${hms(peakAt)}`)
  console.log(`  last milestone ${hms(lastMark)}, so ${hms(t - lastMark)} with nothing to show`)
  console.log('  (the automator is a post-Wager purchase, so this run was all by hand)')
}
