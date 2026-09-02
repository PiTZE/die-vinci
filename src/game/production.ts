// The engine. Solid N produces solid N-1, solid 1 produces Ink, and roll rate
// scales all of it. Antimatter Dimensions' math with Leonardo's geometry.
import Decimal from '../vendor/break-infinity'
import { SOLIDS } from './solids'
import {
  folioStrength,
  pairMultiplier,
  perTenMultiplier,
  requirementDiscount,
  runMultiplier,
  studyPower,
  timeMultiplier,
  unspentMultiplier,
} from './upgrades'
import {
  HALT_MS,
  AUTOMATOR_COST,
  AUTOMATOR_SEED,
  AUTO_ROLL_COSTS,
  ROLLS_DRAWN_INDIVIDUALLY,
  ROLL_COST_BASE,
  ROLL_COST_MULT,
  ROLL_INTERVAL_BASE,
  MELT_AT,
  START_INK,
  WAGER_AT,
  meltMultiplier,
  folioRequirement,
  rollIntervalMultiplier,
  studyRequirement,
  studyTier,
} from './balance'
import { unlockedSolids, type GameState } from '../state'
import { restrictions } from './challenges'
import { runAutobuyers } from './autobuyers'
import { levelOf, modifiers } from './tarot'
import { achievementPower } from './achievements'
import {
  autoWagerReady,
  autobuyerSpeedFactor,
  breakMultiplier,
  bulkResetsUnlocked,
  ceilingHolds,
  chipsPerSecond,
  folioStrengthBonus,
  rollCostScale,
  solidCostScale,
} from './breaks'
import { costAt, costScale, maxBought, type CostScale } from './cost-scaling'
import { esperienzaMultiplier, openEarnedCodices, tickCodices } from './codices'

/**
 * A study's multiplier reaches down the chain rather than across all of it.
 * With s studies, solid `tier` gets STUDY_POWER^(s + 1 - tier), never below 1,
 * so the first study doubles only the tetrahedra and the deep solids are the
 * last to benefit. AD's multiplierToNDTier does exactly this.
 */
export function studyBonus(s: GameState, tier: number): Decimal {
  if (restrictions(s).noStudyMultiplier) return new Decimal(1)
  return new Decimal(studyPower(s)).pow(Math.max(0, s.studies + 1 - tier))
}

/**
 * Every ten bought, this tier's study bonus, and whatever the chip grid adds:
 * a global multiplier from time played, one from time in this wager, one from
 * wagers completed for the solids that upgrade covers, and one on the first
 * solid from chips left unspent.
 */
/**
 * How much of its production the table is making, 0 to 1.
 *
 * The second challenge, and this is AD's own arrangement rather than the one
 * that was here. Its C2 keeps a number it calls chall2Pow, sets it to zero on
 * any dimension or tickspeed purchase, adds `diff / 100 / 1800` to it every
 * tick until it reaches one, and multiplies every dimension's production by
 * it. That is a linear ramp back to full over three minutes, and the game goes
 * on being played the whole way up: a second after a purchase you are making
 * about nothing, ninety seconds later you are making half.
 *
 * What was here instead was a wall. A purchase stopped production dead for the
 * full three minutes and refused to let you roll at all, so every purchase
 * bought three minutes of a game that could not be played. Same sentence in
 * the challenge list, an order of magnitude harsher in the hand.
 */
export function chargeBack(s: GameState): number {
  if (s.haltMs <= 0) return 1
  return Math.max(0, Math.min(1, 1 - s.haltMs / HALT_MS))
}

export function solidMultiplier(s: GameState, idx: number): Decimal {
  const st = s.solids[idx - 1]
  const r = restrictions(s)
  const m = modifiers(s)
  const perTen = r.perTen === null ? perTenMultiplier(s) : new Decimal(r.perTen)
  const weaken = idx === 1 && r.weakenFirst > 1 ? new Decimal(r.weakenFirst) : new Decimal(1)
  let out = perTen
    .pow(Math.floor(st.bought / 10))
    .div(weaken)
    .times(studyBonus(s, idx))
    .times(timeMultiplier(s))
    .times(runMultiplier(s))
    .times(pairMultiplier(s, idx))
    .times(unspentMultiplier(s, idx))
    // The archive pays, the way Antimatter Dimensions' achievements do.
    .times(achievementPower(s))
    // And whatever the break grid has bought, which is nothing until the wall
    // comes down.
    .times(breakMultiplier(s))
    // The codices, which is AD's line for AD's reason: infinity power lands on
    // every dimension separately, so it compounds through the whole chain.
    .times(esperienzaMultiplier(s))
  // XI Strength reshapes the multiplier rather than adding to it, so it
  // compounds with everything above instead of sitting beside it.
  if (m.solidExp !== 1) out = out.pow(m.solidExp)
  // IV The Emperor and whatever melting has left behind: the deep end, and
  // nothing else. Both land on the solid the whole chain is feeding.
  if (idx === openSolids(s)) out = out.times(m.topMult).times(s.meltPower)
  return out
}

// -- melt -----------------------------------------------------------------

/** XIII Death is the gate. Without the card there is nothing to melt with. */
export function meltUnlocked(s: GameState): boolean {
  return levelOf(s, 'death') > 0
}

/** What melting right now would be worth. */
export function meltGain(s: GameState): Decimal {
  return meltMultiplier(s.solids[0].amount, levelOf(s, 'death'))
}

export function canMelt(s: GameState): boolean {
  if (!meltUnlocked(s) || openSolids(s) < SOLIDS.length) return false
  if (s.solids[0].amount.lt(MELT_AT)) return false
  // Nothing to gain is nothing to offer. The multiplier replaces rather than
  // stacks, so melting for less than you already hold is a button that
  // destroys your table and thanks you for it.
  return meltGain(s).gt(s.meltPower)
}

/**
 * Destroys everything below the deepest solid and leaves a multiplier on it.
 * Antimatter Dimensions' Dimensional Sacrifice, gated behind a card instead of
 * a challenge.
 */
export function doMelt(s: GameState): boolean {
  if (!canMelt(s)) return false
  s.meltPower = meltGain(s)
  const top = openSolids(s)
  for (let i = 0; i < top - 1; i++) {
    s.solids[i].amount = new Decimal(0)
  }
  s.stats.melts += 1
  return true
}

/**
 * A solid's price curve. Geometric per group of ten up to the wall, and
 * steepening past it, which is what CHEAPER PLATES buys back.
 *
 * This is AD's dimension declaration with our numbers in it. The tarot cost
 * modifier stays outside the scale rather than folded into its base, because
 * the base is what fixes where the wall falls and a card must not move the
 * wall.
 */
function solidScale(s: GameState, idx: number): CostScale {
  const def = SOLIDS[idx - 1]
  return costScale(
    def.baseCost.toNumber(),
    def.costMult.toNumber(),
    solidCostScale(s),
    WAGER_AT.toNumber(),
  )
}

export function solidCost(s: GameState, idx: number): Decimal {
  const st = s.solids[idx - 1]
  return costAt(solidScale(s, idx), Math.floor(st.bought / 10)).times(modifiers(s).costFactor)
}

/** The roll rate's, which is AD's tickspeed declaration wearing our ratio. */
function rollScale(s: GameState): CostScale {
  return costScale(
    ROLL_COST_BASE.toNumber(),
    ROLL_COST_MULT.toNumber(),
    rollCostScale(s),
    WAGER_AT.toNumber(),
  )
}

/**
 * How many the buy button purchases. Cost only rises every ten, so it fills the
 * current group of ten and stops at the boundary rather than silently spending
 * across two price tiers. Early on you cannot afford ten, and one at a time is
 * the whole opening of the game, so it buys what the ink covers.
 */
export function buyCount(s: GameState, idx: number): number {
  const toTen = 10 - (s.solids[idx - 1].bought % 10)
  const r = restrictions(s)
  const wallet =
    r.payWithOffset > 0 ? (s.solids[idx - r.payWithOffset - 1]?.amount ?? new Decimal(0)) : s.ink
  const afford = wallet.div(solidCost(s, idx)).floor().toNumber()
  if (!Number.isFinite(afford)) return toTen
  return Math.max(1, Math.min(toTen, afford))
}

export function buyPrice(s: GameState, idx: number): Decimal {
  return solidCost(s, idx).times(buyCount(s, idx))
}

/**
 * A price past the threshold, while the threshold still holds.
 *
 * Antimatter Dimensions puts its wall here rather than on the wallet.
 * Tickspeed's `isAvailableForPurchase` reads `player.break || this.cost.lt(
 * Decimal.NUMBER_MAX_VALUE)`, and every dimension's `isAffordable` opens with
 * `if (!player.break && this.cost.gt(Decimal.NUMBER_MAX_VALUE)) return false`.
 *
 * It matters for one frame. Production lands at the end of a tick and the ink
 * is pulled back to the threshold at the start of the next one, so a click
 * placed between the two sees whatever the last roll paid. Pricing the wall
 * closes that gap without pretending the number is smaller than it is.
 */
function overThreshold(s: GameState, cost: Decimal): boolean {
  return ceilingHolds(s) && cost.gt(WAGER_AT)
}

/** Unlocked, and not cut off by a challenge that shortens the chain. */
export function openSolids(s: GameState): number {
  return Math.min(unlockedSolids(s), restrictions(s).cap)
}

/**
 * Whether the whole group of ten is affordable.
 *
 * The autobuyer's ten mode is meant to fill the group in one purchase, the way
 * Antimatter Dimensions' is. buyCount floors at one, so without this the mode
 * dribbled out single dice whenever the ink was short, which is most of the
 * time, and was indistinguishable from the single mode.
 */
export function canBuyGroup(s: GameState, idx: number): boolean {
  if (idx > openSolids(s)) return false
  const r = restrictions(s)
  const need = solidCost(s, idx).times(10 - (s.solids[idx - 1].bought % 10))
  if (overThreshold(s, need)) return false
  if (r.payWithOffset > 0) {
    const from = idx - r.payWithOffset
    if (from < 1) return false
    return s.solids[from - 1].amount.gte(need)
  }
  return s.ink.gte(need)
}

export function canBuySolid(s: GameState, idx: number): boolean {
  if (idx > openSolids(s)) return false
  // Priced once. This runs on every row of every UI update and again inside
  // MAX, and buyPrice is three Decimal multiplications and a division.
  const price = buyPrice(s, idx)
  if (overThreshold(s, price)) return false
  const r = restrictions(s)
  if (r.payWithOffset > 0) {
    const from = idx - r.payWithOffset
    if (from < 1) return false
    return s.solids[from - 1].amount.gte(price)
  }
  return s.ink.gte(price)
}

/** `one` is the shift-click path: a single die at the current tier price. */
export function buySolid(s: GameState, idx: number, one = false): boolean {
  if (idx > openSolids(s)) return false
  const r = restrictions(s)
  const n = one ? 1 : buyCount(s, idx)
  const price = solidCost(s, idx).times(n)
  if (overThreshold(s, price)) return false

  if (r.payWithOffset > 0) {
    const from = idx - r.payWithOffset
    if (from < 1) return false
    const wallet = s.solids[from - 1]
    if (wallet.amount.lt(price)) return false
    wallet.amount = wallet.amount.minus(price)
  } else {
    if (s.ink.lt(price)) return false
    s.ink = s.ink.minus(price)
  }

  const st = s.solids[idx - 1]
  st.bought += n
  st.amount = st.amount.plus(n)

  if (r.eraseLower) for (let i = 0; i < idx - 1; i++) s.solids[i].amount = new Decimal(0)
  if (r.haltMs > 0) s.haltMs = r.haltMs
  return true
}

// -- roll rate ------------------------------------------------------------

/** Folios push the per-upgrade interval multiplier down, so each one is worth more. */
export function rollPower(s: GameState): number {
  const forced = restrictions(s).rollBase
  if (forced !== null) return forced
  // A folio upgrade makes each one count double, the way AD's galaxyBoost does.
  return rollIntervalMultiplier(s.folios * folioStrength(s) * folioStrengthBonus(s))
}

/**
 * Seconds between rolls, as a Decimal, because a double cannot hold it.
 *
 * Nine folios put the per-upgrade multiplier at about 0.486, so the interval
 * halves every purchase. At 984 upgrades it falls below 5.6e-309, the smallest
 * double whose reciprocal is still finite, and `1 / interval` becomes
 * Infinity: the roll count overflows, `Decimal.times(Infinity)` returns a
 * malformed zero, and every row pays nothing on a save that cannot be undone
 * from the UI. That happened.
 *
 * Antimatter Dimensions never meets it because tickspeed is a Decimal the
 * whole way down. `Tickspeed.baseValue` is `DC.E3.times(mult.pow(upgrades))`
 * and `perSecond` is `Decimal.divide(1000, current)`, so its equivalent wall
 * sits around twenty million upgrades rather than a thousand.
 */
export function rollInterval(s: GameState): Decimal {
  const base = Decimal.pow(rollPower(s), s.rollUpgrades).times(ROLL_INTERVAL_BASE)
  // VII The Chariot speeds it up, XV The Devil slows it down. A multiplier on
  // the rate is a divisor on the interval.
  return base.div(modifiers(s).rollRateMult)
}

export function rollRate(s: GameState): Decimal {
  return new Decimal(1).div(rollInterval(s))
}

export function rollCost(s: GameState): Decimal {
  return costAt(rollScale(s), s.rollUpgrades).times(modifiers(s).rollCostFactor)
}

export function canBuyRollRate(s: GameState): boolean {
  if (restrictions(s).noRollRate) return false
  if (overThreshold(s, rollCost(s))) return false
  return s.ink.gte(rollCost(s))
}

export function buyRollRate(s: GameState): boolean {
  if (!canBuyRollRate(s)) return false
  s.ink = s.ink.minus(rollCost(s))
  s.rollUpgrades += 1
  return true
}

// -- studies and folios ---------------------------------------------------

/** Studies and folios are both paid in dice, not ink. */
/** As many rungs as one bulk reset will take, which is AD's own ceiling of
 *  nothing in particular: a bound so a bad extrapolation cannot spin. */
const BULK_RESET_CAP = 1e6

/** The requirement k studies ahead. k = 1 is the next one. */
function studyReqAt(s: GameState, k: number): { idx: number; need: Decimal } {
  const n = s.studies + k
  const r = restrictions(s)
  const need = Math.max(1, studyRequirement(n) - requirementDiscount(s)) * r.studyCostFactor
  return { idx: Math.min(studyTier(n), r.cap), need: new Decimal(need) }
}

export function studyReq(s: GameState): { idx: number; need: Decimal } {
  return studyReqAt(s, 1)
}

/** The same, k folios ahead. */
function folioReqAt(s: GameState, k: number): { idx: number; need: Decimal } {
  const r = restrictions(s)
  const need =
    Math.max(1, folioRequirement(s.folios + k - 1) - requirementDiscount(s)) * r.folioCostFactor
  return { idx: Math.min(SOLIDS.length, r.cap), need: new Decimal(need) }
}

export function canBuyStudy(s: GameState): boolean {
  const { idx, need } = studyReq(s)
  return s.solids[idx - 1].amount.gte(need)
}

/**
 * Both resets clear the ink too, the way an Antimatter Dimensions dimension
 * boost resets antimatter along with the dimensions. Without it a study was
 * free: you kept the pile and got the multiplier, so there was never a reason
 * not to take one the instant it was affordable.
 */
/**
 * What the automator leaves on the table so a run can start itself.
 *
 * Without this a reset hands back one solid and START_INK, and the solid1
 * autobuyer defaults to its ten mode, which waits for ten times the unit price.
 * A table with no dice makes no ink, so it waits forever: the automator you had
 * just paid a point for sat there doing nothing until you bought a die by hand.
 *
 * Only once the automator is owned, because before that the opening is supposed
 * to be a button you press.
 */
/**
 * The Wager, handed in rather than imported.
 *
 * doWager lives in wager.ts, which already imports seedForAutomator from here,
 * so importing it back would be a cycle. wager.ts registers itself at load
 * instead. Until it does, the Wager autobuyer does nothing, which is the right
 * answer for any caller that has not loaded the prestige at all.
 */
let callWager: ((s: GameState) => boolean) | null = null

export function registerWager(fn: (s: GameState) => boolean): void {
  callWager = fn
}

function autoWager(s: GameState): boolean {
  return callWager ? callWager(s) : false
}

export function seedForAutomator(s: GameState): void {
  if (!s.autoRoll) return
  const first = s.solids[0]
  if (first.amount.gte(AUTOMATOR_SEED)) return
  first.amount = new Decimal(AUTOMATOR_SEED)
  first.bought = Math.max(first.bought, AUTOMATOR_SEED)
}

function resetTable(s: GameState): void {
  // VIII Justice leaves some of every solid, V The Hierophant leaves ink.
  const m = modifiers(s)
  const open = openSolids(s)
  for (let i = 0; i < s.solids.length; i++) {
    const st = s.solids[i]
    st.bought = 0
    st.amount = new Decimal(m.keepSolids > 0 && i < open ? m.keepSolids : 0)
  }
  seedForAutomator(s)
  s.ink = Decimal.max(new Decimal(START_INK), m.keepInk)
  // And the run with it. A study or a folio starts the climb to the Wager
  // again, which is Antimatter Dimensions' own shape: a Dimension Boost
  // resets antimatter, and the progress to Infinity is the antimatter you are
  // holding. It works there for the reason it works here, that each reset
  // multiplies what the table produces, so the next cycle passes the last
  // one's peak rather than merely repeating it.
  //
  // It used to accrue across resets, on the reasoning that at 77% with
  // nothing left to buy the only move was a study that threw the bar away.
  // The cost of that was a bar that said 77% while the table it was measuring
  // had just been swept, which is a percentage of nothing.
  //
  // deepestInk keeps its own running maximum from the tick, so what the
  // codices open on is still the deepest a run has ever reached.
  s.inkThisWager = new Decimal(0)
  s.stats.sinceResetMs = 0
  // A spin in the air would otherwise land onto the fresh table and pay out
  // from the solids that were just cleared.
  s.rollStartedAt = 0
  s.rollAccum = 0
  s.handRollAt = 0
  s.faces = s.faces.map(() => 0)
}

/**
 * A study resets the table, the ink and the roll rate, and leaves folios.
 *
 * The roll rate part is not optional. Antimatter Dimensions' softReset, which
 * is what a dimension boost calls, does AntimatterDimensions.reset() and then
 * resetTickspeed(), which zeroes totalTickBought. Its galaxy is the same reset
 * with the boosts cleared first, which is why both wipe tickspeed there and
 * both wipe roll rate here.
 */
export function buyStudy(s: GameState): boolean {
  if (!canBuyStudy(s)) return false
  const kept = Math.floor(s.rollUpgrades * modifiers(s).keepRollFrac)
  s.studies += 1
  s.rollUpgrades = kept
  resetTable(s)
  return true
}

export function folioReq(s: GameState): { idx: number; need: Decimal } {
  return folioReqAt(s, 1)
}

/**
 * How many of a ladder the table already satisfies, in one step.
 *
 * Both schedules are linear once the chain is full, 20 + 15n for studies and
 * a flat climb for folios, so two samples give the slope and the count falls
 * out of one division. That is AD's maxBuyDimBoosts exactly: it reads
 * bulkRequirement(1) and bulkRequirement(2), extrapolates, and binary searches
 * only when the extrapolation overshoots, which here happens where the
 * schedule has not straightened out yet.
 */
function bulkCount(
  s: GameState,
  req: (k: number) => { idx: number; need: Decimal },
): number {
  const held = (k: number) => s.solids[req(k).idx - 1].amount
  if (held(1).lt(req(1).need)) return 0
  if (held(2).lt(req(2).need)) return 1
  const step = req(2).need.minus(req(1).need)
  if (step.lte(0)) return 1
  const guess = held(1).minus(req(1).need).div(step).floor().toNumber() + 1
  if (!Number.isFinite(guess) || guess < 2) return 1
  const cap = Math.min(guess, BULK_RESET_CAP)
  if (held(cap).gte(req(cap).need)) return cap
  let lo = 2
  let hi = cap
  while (hi !== lo + 1) {
    const mid = Math.floor((hi + lo) / 2)
    if (held(mid).gte(req(mid).need)) lo = mid
    else hi = mid
  }
  return lo
}

/**
 * Every study the table can pay for, on one reset.
 *
 * AD's autobuyMaxDimboosts, which is a break upgrade there too and buys the
 * boost autobuyer its bulk mode. It opens the same way AD's does: while a
 * study still unlocks a solid the chain has to fill in order, so those are
 * bought one at a time.
 */
export function maxBuyStudies(s: GameState): boolean {
  if (unlockedSolids(s) < SOLIDS.length) return buyStudy(s)
  const n = bulkCount(s, (k) => studyReqAt(s, k))
  if (n < 1) return false
  if (n === 1) return buyStudy(s)
  s.studies += n
  s.rollUpgrades = Math.floor(s.rollUpgrades * modifiers(s).keepRollFrac)
  resetTable(s)
  return true
}

/** The same for folios, which have no chain to fill first. */
export function maxBuyFolios(s: GameState): boolean {
  if (!folioUnlocked(s)) return false
  const n = bulkCount(s, (k) => folioReqAt(s, k))
  if (n < 1) return false
  if (n === 1) return buyFolio(s)
  const m = modifiers(s)
  s.folios += n
  s.stats.foliosEver += n
  s.studies = Math.min(s.studies, m.keepStudies)
  s.rollUpgrades = Math.floor(s.rollUpgrades * m.keepRollFrac)
  resetTable(s)
  return true
}

export function folioUnlocked(s: GameState): boolean {
  if (restrictions(s).noFolios) return false
  // Binding one opens it for good. A folio clears the studies that opened the
  // table, so the section that had just become the point of the game vanished
  // the moment you used it and did not come back until you had re-opened all
  // nine solids. The requirement still has to be met to press it; what is
  // permanent is knowing it is there.
  if (s.stats.foliosEver > 0) return true
  return unlockedSolids(s) >= SOLIDS.length
}

export function canBuyFolio(s: GameState): boolean {
  if (!folioUnlocked(s)) return false
  const { idx, need } = folioReq(s)
  return s.solids[idx - 1].amount.gte(need)
}

/**
 * A folio is a study that also clears the studies, exactly as an antimatter
 * galaxy is a dimension boost that clears the boosts. What you keep is a
 * permanently better roll power.
 */
export function buyFolio(s: GameState): boolean {
  if (!canBuyFolio(s)) return false
  const m = modifiers(s)
  s.folios += 1
  s.stats.foliosEver += 1
  // 0 The Fool: the chain resets and the ladder survives.
  s.studies = Math.min(s.studies, m.keepStudies)
  s.rollUpgrades = Math.floor(s.rollUpgrades * m.keepRollFrac)
  resetTable(s)
  return true
}

// -- max all --------------------------------------------------------------

/** A bound so a corrupt or infinite ink value cannot lock the main thread. */
/** 2^64 groups of ten. The loop exits on the first pass that buys nothing. */
const MAX_ALL_PASSES = 64

/**
 * Buys up to `groups` whole groups of ten, in one step, at the exact price.
 *
 * A group of ten costs `baseCost x costFactor x 10` times the per-ten
 * multiplier raised to the number of groups already owned, so the price of a
 * run of groups is a geometric series and both halves of it have a closed
 * form. `Decimal.affordGeometricSeries` gives how many the wallet covers and
 * `Decimal.sumGeometricSeries` gives what they cost, each in constant time.
 *
 * This is Antimatter Dimensions' `ExponentialCostScaling.getMaxBought`, which
 * `buyMaxDimension` calls once and applies once rather than counting up to.
 * AD works in log space with plain doubles and touches Decimal twice, at
 * `money.log10()` and `Decimal.pow10(logPrice)`; break_infinity ships the same
 * solution, so there is no reason to hand-roll the logarithms here.
 *
 * One deliberate departure. AD charges only the most expensive item in a bulk
 * purchase, and says so: "this assumes you only have to pay for the most
 * expensive thing you get when you buy in bulk." At our smallest per-ten
 * multiplier, a x1000 cut to about x17.8 by CHEAPER PLATES at full level, that
 * would hand back roughly 6% of every MAX. The exact sum costs the same one
 * call, so MAX pays what it has always paid and no balance moves.
 */
function buySolidGroups(s: GameState, idx: number, groups: number): boolean {
  if (idx > openSolids(s)) return false
  const r = restrictions(s)
  // A challenge that pays out of the solid two rungs up keeps the single-group
  // path. That wallet is a die count rather than ink, it never runs away, and
  // the series would have to be written against a different currency to no end.
  if (r.payWithOffset > 0) return canBuySolid(s, idx) && buySolid(s, idx)

  const st = s.solids[idx - 1]
  let did = false

  // Buy up to the next boundary first, at the current price, which is what
  // buyMaxDimension does before it bulk-buys. buySolid buys what the ink
  // covers and never crosses into the next price tier, so this one call is
  // both the top-up of a part-filled group and the whole of the early game,
  // where a group of ten is far out of reach and dice are bought one at a
  // time. Skipping it because the group was aligned left a new game unable to
  // buy its first tetrahedron.
  const startGroup = Math.floor(st.bought / 10)
  if (canBuySolid(s, idx) && buySolid(s, idx)) did = true
  // Ink ran out inside the group. There is nothing to bulk with.
  if (st.bought % 10 !== 0) return did

  const left = groups - (Math.floor(st.bought / 10) - startGroup)
  if (left < 1) return did

  const owned = st.bought / 10
  // The tarot cost modifier divides the wallet rather than shifting the base,
  // for the same reason solidScale keeps it out: the base fixes the wall.
  const factor = modifiers(s).costFactor
  const bulk = maxBought(solidScale(s, idx), owned, s.ink.div(factor), 10)
  if (!bulk) return did

  const n = Math.min(bulk.quantity, left)
  const price =
    n === bulk.quantity
      ? bulk.price.times(factor)
      : costAt(solidScale(s, idx), owned + n - 1).times(factor).times(10)
  if (overThreshold(s, price) || s.ink.lt(price)) return did

  s.ink = s.ink.minus(price)
  st.bought += n * 10
  st.amount = st.amount.plus(n * 10)
  if (r.eraseLower) for (let i = 0; i < idx - 1; i++) s.solids[i].amount = new Decimal(0)
  if (r.haltMs > 0) s.haltMs = r.haltMs
  return true
}

/** The same series, on the roll rate, which climbs by a fixed step a level. */
function buyRollRateBulk(s: GameState, levels: number): boolean {
  if (restrictions(s).noRollRate || levels < 1) return false
  const factor = modifiers(s).rollCostFactor
  const scale = rollScale(s)
  const bulk = maxBought(scale, s.rollUpgrades, s.ink.div(factor), 1)
  if (!bulk) return false

  const n = Math.min(bulk.quantity, levels)
  const price =
    n === bulk.quantity
      ? bulk.price.times(factor)
      : costAt(scale, s.rollUpgrades + n - 1).times(factor)
  if (overThreshold(s, price) || s.ink.lt(price)) return false

  s.ink = s.ink.minus(price)
  s.rollUpgrades += n
  return true
}

export function canMaxAll(s: GameState): boolean {
  if (canBuyRollRate(s)) return true
  for (let idx = 1; idx <= unlockedSolids(s); idx++) {
    if (canBuySolid(s, idx)) return true
  }
  return false
}

/**
 * Buys the most expensive thing you can afford, then re-checks and does it
 * again, until nothing is affordable.
 *
 * This is a deliberate departure from Antimatter Dimensions, which buys max
 * tickspeed and then walks D1 upward. Cheapest-first spends the ink on the
 * shallow end of the chain and often leaves nothing for the deep solids, and
 * the deep solids are the ones that compound all the way down. The cost is
 * that a press now buys fewer, larger things, so the shallow rows fill in
 * more slowly right after a reset.
 */
export function maxAll(s: GameState): void {
  const open = openSolids(s)

  // Each pass hands every tier the same allowance, and the allowance doubles.
  //
  // The round robin is the whole point and it stays. Deepest first, because a
  // doubling on a deep solid compounds through every tier below it, and the
  // same ink at the shallow end only multiplies the last step. Letting one
  // tier take everything it can afford is exactly the bug this loop was
  // written against: at 1e7 ink with four solids open it bought ten d12 and
  // left d4, d6 and d8 at zero, so nothing made ink at all.
  //
  // What changed is the number of passes. One group of ten per tier per pass
  // meant fifty thousand dice took five thousand passes, which measured at
  // 295ms against a 60ms hold repeat, so holding M queued calls faster than
  // they finished. Doubling turns a million groups into twenty passes.
  let allowance = 1
  for (let pass = 0; pass < MAX_ALL_PASSES; pass++) {
    let did = false

    for (let idx = open; idx >= 1; idx--) {
      if (buySolidGroups(s, idx, allowance)) did = true
    }

    // Roll rate last, after the chain, which is where AD buys tickspeed. And
    // never onto an empty table: roll rate multiplies what the dice pay, so
    // with no dice it multiplies nothing, and ink can only come from a die.
    const canProduce = s.solids.slice(0, open).some((d) => d.amount.gt(0))
    if (canProduce && buyRollRateBulk(s, allowance)) did = true

    if (!did) return
    allowance *= 2
  }
}

/** Entering or leaving a challenge clears layer 0, the way the Wager does. */
export function resetForChallenge(s: GameState): void {
  s.studies = 0
  s.folios = 0
  s.rollUpgrades = 0
  resetTable(s)
}

// -- the roll ------------------------------------------------------------

/**
 * What a face is worth. Four d4 landing on 4 make sixteen, and every
 * multiplier the game has stacks on top of that.
 *
 * Taking the face raw rather than against the die's average means a deep solid
 * carries its own size as a multiplier: a d72 averages 36.5 where a d4
 * averages 2.5. The spread is the same either way, about 58% of the mean at
 * every die size, so a d72 is no more erratic than a d4. It is simply worth
 * more, which is what having seventy-two faces ought to mean.
 */
export function faceFactor(face: number, faces: number): number {
  return face || meanFace(faces)
}

/**
 * What a die pays on average, which is what a batch of rolls converges to and
 * what the table shows once the dice are turning too fast to read.
 *
 * At b = 0 this is the (N+1)/2 every schoolchild knows. Above it, the chance
 * of landing on face k is (k/N)^p minus ((k-1)/N)^p with p = 1/(1-b), and the
 * mean is that summed against k. Seventy-two terms at worst, and it is only
 * called when the bias or the die changes.
 */
export function meanFace(faces: number, bias = 0): number {
  if (bias <= 0) return (faces + 1) / 2
  if (bias >= 1) return faces
  const key = `${faces}:${bias}`
  const held = meanCache.get(key)
  if (held !== undefined) return held
  const p = 1 / (1 - bias)
  let sum = 0
  let below = 0
  for (let k = 1; k <= faces; k++) {
    const upTo = Math.pow(k / faces, p)
    sum += k * (upTo - below)
    below = upTo
  }
  meanCache.set(key, sum)
  return sum
}

const meanCache = new Map<string, number>()

/**
 * How far the dice are loaded, 0 to 1. Zero is a fair die. One always lands on
 * its highest face.
 *
 * I The Magician is the only thing that moves it. Isaac's Magician grants
 * homing tears for the room: your shots find what you are aiming at. Here the
 * dice do, and that is the whole card.
 *
 * The bias was written before anything used it, on the grounds that a fair die
 * is the b = 0 case of a loaded one and the two should not need separate code
 * paths. That turned out to be the right bet: the card is a number in the
 * modifier bundle, and `test:roll` was already sampling the machinery at four
 * bias levels against meanFace's prediction.
 *
 * Read through modifiers rather than off the card, so the challenge that runs
 * with the deck face down takes the loading away with everything else.
 */
export function faceBias(s: GameState): number {
  return modifiers(s).faceBias
}

/**
 * A uniform draw pushed towards the top by raising it to a power. At b = 0 the
 * exponent is 1 and every face is equally likely; as b approaches 1 the
 * exponent goes to zero, the draw is pinned at the top of the range, and the
 * die always shows its maximum.
 */
export function rollFace(faces: number, bias = 0): number {
  if (bias >= 1) return faces
  const u = Math.pow(Math.random(), 1 - bias)
  return Math.min(faces, 1 + Math.floor(u * faces))
}

/**
 * Seconds one roll takes, as a plain number, for the animation and the sound.
 *
 * The engine works in Decimal; a tumble does not. Anything the UI cares about
 * happens above FACE_READABLE_S, and everything below it is a blur, so
 * flattening to a double here loses nothing that could be seen. Past the point
 * where a double underflows this reads zero, and every caller already treats
 * zero as "too fast to draw".
 */
export function rollDuration(s: GameState): number {
  return rollInterval(s).toNumber()
}

/**
 * 0 to 1 through the current roll, or 1 when the dice are at rest.
 *
 * Both paths read the same field, because the automator records when its
 * current roll began too. Deriving it from the leftover accumulator instead
 * would step at the tick rate, ten times a second against sixty frames, and a
 * revolution in ten visible steps is not an animation.
 */
export function rollProgress(s: GameState, now: number): number {
  if (mustWager(s) || !s.rollStartedAt) return 1
  const d = rollDuration(s) * 1000
  if (d <= 0) return 1
  return Math.max(0, Math.min(1, (now - s.rollStartedAt) / d))
}

export function rolling(s: GameState): boolean {
  return rollingItself(s) || s.rollStartedAt > 0
}

/** Begins a spin. Refused while one is already in flight, which is the whole
 *  reason a hand cannot out-roll the roll rate: manual and automatic share one
 *  ceiling, and the hand is strictly the slower of the two. */
/**
 * The table is full. 1.7976931348623157e308 is where a double stops being able
 * to count, and Antimatter Dimensions stops there too: production halts and
 * the only thing left to do is crunch. Nothing here grows past it either. The
 * run is over and it is waiting on you.
 *
 * Measured on what the run has earned, the same field canWager reads. It used
 * to halt on ink held, and the two are only the same while ink never runs
 * ahead of the run's total. The Hierophant breaks that: a reset hands you up
 * to 1e21 of ink without crediting the run for it, so ink reached the
 * threshold first and production stopped a hair short of the gate. The bar
 * read full, the CALL button stayed dead, and nothing produced. It cleared
 * itself on the next study, but there was no way to know that from the screen.
 */
export function mustWager(s: GameState): boolean {
  // Broken, nothing stops. That is the whole of it: the wall stays where it
  // is and the run simply runs past it, which is what the payout then reads.
  return ceilingHolds(s) && s.inkThisWager.gte(WAGER_AT)
}

/**
 * How long after a press a roll still counts as one you asked for.
 *
 * The hold repeat is 60ms. This has to be longer than that so a held button
 * marks every roll, and short enough that letting go hands the table back to
 * the automated dice within a frame or two.
 */
export const HAND_GRACE_MS = 250

/**
 * Whether the roll landing now is one you asked for, and throws everything.
 *
 * A press stays outstanding until a roll spends it, so a single click always
 * lands a full throw however slow the interval is. What the grace is for is
 * the other end: while the button is held the press is renewed every 60ms, so
 * a roll landing within the grace leaves it standing and the next roll is a
 * hand roll too. Without that, an interval shorter than the hold repeat would
 * quietly credit one roll in four to your finger and the rest to nobody.
 */
export function handRolling(s: GameState): boolean {
  return s.handRollAt > 0
}

/** Spends the press, unless the button is plainly still down. */
function spendHandRoll(s: GameState, now: number): void {
  if (now - s.handRollAt >= HAND_GRACE_MS) s.handRollAt = 0
}

export function startRoll(s: GameState, now: number): boolean {
  if (mustWager(s)) return false
  if (rollingItself(s)) return false
  // Marked even when a spin is already in the air, because that is what makes
  // holding cover every roll rather than every other one.
  s.handRollAt = now
  if (s.rollStartedAt > 0) return false
  s.rollStartedAt = now
  return true
}

/**
 * Below this a roll is over before it can be read, so the dice just blur and
 * the numbers are left off. Roughly the point where a changing digit stops
 * being information and starts being flicker.
 */
export const FACE_READABLE_S = 0.18

/**
 * One roll's worth of production, applied to every open solid at once.
 *
 * Deltas are computed from the amounts at the start, then applied. Producing
 * in place would let a solid spend dice it only received in the same roll,
 * which quietly inflates the whole chain.
 *
 * `rolls` above one is the batched path: many rolls in a single frame, where
 * the faces average to 1 and applying them separately would cost a Decimal
 * pass each for no visible difference.
 */
function produce(s: GameState, rolls: Decimal, factors: number[]): void {
  // openSolids, not unlockedSolids: a challenge that shortens the chain takes
  // the deep solids off the table, and off the table means out of the roll.
  const n = openSolids(s)
  const before = s.solids.map((d) => d.amount)

  const m = modifiers(s)
  // Every tier, the way AD multiplies every dimension by chall2Pow. One is the
  // ordinary case and costs a multiplication by a Decimal one.
  const charge = chargeBack(s)
  const ink = before[0]
    .times(solidMultiplier(s, 1))
    .times(factors[0])
    .times(rolls)
    .times(m.globalMult)
    .times(charge)
  s.ink = s.ink.plus(ink)
  s.inkThisWager = s.inkThisWager.plus(ink)

  // The global multiplier lands on every tier, not only on the ink. Applied to
  // ink alone it would leave the chain above it untouched, so a card that says
  // it multiplies everything would in fact multiply the last step of nine.
  for (let i = 2; i <= n; i++) {
    const made = before[i - 1]
      .times(solidMultiplier(s, i))
      .times(factors[i - 1])
      .times(rolls)
      .times(m.globalMult)
      .times(charge)
    s.solids[i - 2].amount = s.solids[i - 2].amount.plus(made)
  }
}

/**
 * A die is thrown when there is a die to throw. Locked solids are not on the
 * table, and a solid you own none of has nothing to land: showing a face on an
 * empty row said a number and then paid nothing, which reads as a bug.
 *
 * `hand` is whether this roll is one you asked for. A hand roll throws the
 * whole table; a roll nobody pressed for throws only the dice that have been
 * bought their own auto-roll. The ones sitting it out show no face, which is
 * how the table says which half of it is still waiting on you.
 */
function rolls(s: GameState, i: number, hand: boolean): boolean {
  if (i >= openSolids(s) || s.solids[i].amount.lte(0)) return false
  return hand || dieRollsItself(s, i + 1)
}

/** Rolls every die on the table, records the faces, and produces from them. */
function resolveOneRoll(s: GameState, hand: boolean): void {
  const m = modifiers(s)
  const bias = faceBias(s)
  const factors: number[] = []
  for (let i = 0; i < s.solids.length; i++) {
    if (!rolls(s, i, hand)) {
      s.faces[i] = 0
      factors.push(0)
      continue
    }
    // X Wheel of Fortune: rolled again, keeping the better face.
    let face = rollFace(SOLIDS[i].faces, bias)
    for (let r = 0; r < m.rerolls; r++) {
      face = Math.max(face, rollFace(SOLIDS[i].faces, bias))
    }
    s.faces[i] = face
    factors.push(faceFactor(face, SOLIDS[i].faces))
  }

  // VI The Lovers: dice showing the same face pay double. The only card that
  // reads the faces against each other rather than one at a time.
  if (m.pairBonus > 0) {
    const seen = new Map<number, number[]>()
    for (let i = 0; i < s.faces.length; i++) {
      if (!s.faces[i]) continue
      const at = seen.get(s.faces[i])
      if (at) at.push(i)
      else seen.set(s.faces[i], [i])
    }
    for (const group of seen.values()) {
      if (group.length < 2) continue
      // A pair doubles. Higher levels pay for three of a kind and beyond.
      const matched = Math.min(group.length, 1 + m.pairBonus)
      for (const i of group) factors[i] *= matched
    }
  }

  produce(s, new Decimal(1), factors)
}

/**
 * Rolls landing faster than they can be read. The faces still change every
 * frame so the dice look alive, but production uses the mean, which is what a
 * thousand independent rolls a second converges to anyway.
 */
function resolveManyRolls(s: GameState, count: Decimal, hand: boolean): void {
  for (let i = 0; i < s.solids.length; i++) {
    s.faces[i] = rolls(s, i, hand) ? rollFace(SOLIDS[i].faces, faceBias(s)) : 0
  }
  // The mean, per die, not a flat one. A d72 averages 36.5 and a d4 averages
  // 2.5, so a flat factor here would make the automator pay a fraction of what
  // the same rolls pay by hand.
  const bias = faceBias(s)
  produce(s, count, s.solids.map((_, i) => (rolls(s, i, hand) ? meanFace(SOLIDS[i].faces, bias) : 0)))
}

function applyRolls(s: GameState, count: Decimal, hand: boolean): void {
  if (count.lte(0)) return
  if (count.lte(ROLLS_DRAWN_INDIVIDUALLY)) {
    const n = count.toNumber()
    for (let i = 0; i < n; i++) resolveOneRoll(s, hand)
  } else {
    resolveManyRolls(s, count, hand)
  }
}

// -- the automator --------------------------------------------------------

/** The automator is offered from the first Wager, and never before it. */
export function automatorUnlocked(s: GameState): boolean {
  return s.autoRoll || s.wagers > 0
}

export function automatorCost(): number {
  return AUTOMATOR_COST
}

export function canBuyAutomator(s: GameState): boolean {
  return !s.autoRoll && automatorUnlocked(s) && s.chips.gte(AUTOMATOR_COST)
}

export function buyAutomator(s: GameState): boolean {
  if (!canBuyAutomator(s)) return false
  s.chips = s.chips.minus(AUTOMATOR_COST)
  s.autoRoll = true
  s.autoRollOn = true
  s.rollStartedAt = 0
  // Bought straight after a Wager, onto a table that was just cleared. Without
  // this the thing you spent your only point on has nothing to roll, and its
  // own autobuyer waits for a price an empty table can never pay.
  seedForAutomator(s)
  return true
}

/** Bought and switched on. Switched off, the dice wait for your finger again,
 *  which is the only way to see a roll land one at a time once you own it. */
export function rollingItself(s: GameState): boolean {
  return s.autoRoll && s.autoRollOn
}

// -- auto-roll, one die at a time -----------------------------------------

/** Whether a die that could roll itself has been left switched on. */
export function dieOn(s: GameState, idx: number): boolean {
  return !(s.autoDiceOff ?? []).includes(idx)
}

/** Whether anything at all would roll this die without your finger, which is
 *  what decides whether it is worth offering a switch for. */
export function dieCanRollItself(s: GameState, idx: number): boolean {
  return s.autoRoll || idx <= s.autoDice
}

/**
 * Whether die `idx` takes part in a roll nobody is pressing for.
 *
 * Three switches, and all of them have to be on. The Wager's grant is what
 * makes the deepest die automatic at all; `autoRollOn` is the master over the
 * lot, which is the switch the automator has always carried and which would
 * have gone inert the moment the grant filled the ladder; and `dieOn` is this
 * die's own.
 */
export function dieRollsItself(s: GameState, idx: number): boolean {
  if (!dieOn(s, idx)) return false
  // The master switch, and it is a master over the ladder as well as over the
  // automator now. It only ever gated the automator, which meant that for the
  // whole of a first run, where the ladder is the only automation there is,
  // the one switch labelled EVERY DIE was the one switch that did nothing.
  if (!s.autoRollOn) return false
  return dieCanRollItself(s, idx)
}

/** Whether the whole table rolls itself, which is when a ROLL button has
 *  nothing left to do. Switch one die back to your finger and it returns. */
export function allRollThemselves(s: GameState): boolean {
  for (let i = 1; i <= openSolids(s); i++) if (!dieRollsItself(s, i)) return false
  return openSolids(s) > 0
}

/**
 * Hands one die back to your finger, or takes it away again.
 *
 * The same switch the automator has always had, a rung down. Its reason is
 * the automator's reason: with it on there is no way to watch a single die
 * land, and watching one land is most of what the table is for.
 */
export function toggleDie(s: GameState, idx: number): void {
  const off = s.autoDiceOff ?? []
  s.autoDiceOff = off.includes(idx) ? off.filter((i) => i !== idx) : [...off, idx]
}

/** Every die on the table, the deepest included. */
export const AUTO_ROLL_MAX = SOLIDS.length

/**
 * The next die whose auto-roll is for sale, 1-based, or 0 for none.
 *
 * A die opens for automation when the die below it on the chain opens for
 * buying, so the d4 waits on the d6 and the d32 waits on the d72. They fill
 * from the shallow end in order, which is why the state is a count.
 *
 * The d72 has nothing under it to wait for, so it waits on itself: it opens
 * once the whole chain is on the table, which is the same sentence one solid
 * further along.
 */
export function nextAutoRoll(s: GameState): number {
  const next = s.autoDice + 1
  if (next > AUTO_ROLL_MAX) return 0
  return unlockedSolids(s) >= Math.min(next + 1, SOLIDS.length) ? next : 0
}

export function autoRollCost(s: GameState): Decimal {
  return AUTO_ROLL_COSTS[s.autoDice] ?? new Decimal(Infinity)
}

export function canBuyAutoRoll(s: GameState): boolean {
  return nextAutoRoll(s) > 0 && s.ink.gte(autoRollCost(s))
}

export function buyAutoRoll(s: GameState): boolean {
  if (!canBuyAutoRoll(s)) return false
  s.ink = s.ink.minus(autoRollCost(s))
  s.autoDice += 1
  return true
}

/**
 * The whole ladder, handed over by the first Wager and never taken back.
 *
 * The automator used to be a purchase here, one chip, and what it bought was
 * your hands back. The ladder sells that a die at a time now, so charging for
 * it again at the prestige would be charging twice for the same thing.
 */
export function grantAutoRoll(s: GameState): void {
  s.autoDice = AUTO_ROLL_MAX
  s.autoRoll = true
  s.autoRollOn = true
}

// -- the tick -------------------------------------------------------------

/**
 * What the chain pays per second at the current roll rate, if the dice keep
 * rolling. Before the automator that is a statement about how fast you press,
 * which is why the roll rate line reads in rolls per second as well.
 */
export function inkPerSecond(s: GameState): Decimal {
  return inkPerRoll(s).times(rollRate(s))
}

/**
 * What one roll pays. This is the honest figure before the automator: a rate
 * per second assumes the dice keep rolling, and until something else is
 * rolling them that is a claim about how fast you press rather than about the
 * game. A per-roll number is true either way.
 */
export function inkPerRoll(s: GameState): Decimal {
  return s.solids[0].amount
    .times(solidMultiplier(s, 1))
    .times(meanFace(SOLIDS[0].faces, faceBias(s)))
    .times(modifiers(s).globalMult)
}

export function tick(s: GameState, dt: number, now: number): void {
  if (dt <= 0) return
  // Two Points upgrades scale with these, so they have to accrue from the same
  // clock the production does, offline catch-up included.
  s.stats.playMs += dt * 1000
  s.stats.wagerMs += dt * 1000
  s.stats.sinceResetMs += dt * 1000
  // The high-water mark the table keeps its shape by. Raised here rather than
  // where a study is bought, so a save written before this field existed picks
  // up its real value on the first tick instead of claiming one solid.
  s.stats.solidsEver = Math.max(s.stats.solidsEver ?? 0, unlockedSolids(s))

  // Ink is held to the threshold only while the threshold is a threshold.
  //
  // Unconditional, this was a bug with two faces. The clamp runs at the top of
  // the tick and the dice pay out at the bottom, so the autobuyers, which run
  // in between, never saw more than 1.8e308 and stalled at roll upgrade 236
  // for the rest of the game, while a button press, which runs between ticks,
  // saw the real number and bought as far as it liked. The only thing that
  // worked after breaking was holding FASTER by hand, and holding FASTER by
  // hand is what walked one save off the end of a double.
  //
  // Antimatter Dimensions gates the same thing on `player.break`, and it never
  // caps antimatter at all: its currency setter has no ceiling, the Infinity
  // you see before breaking is the notation rule `ui.formatPreBreak &&
  // gte(NUMBER_MAX_VALUE)`, and what it actually enforces is on prices.
  // See overThreshold below, which is that.
  //
  // What ends the run is the line after this, which asks what the run earned.
  if (ceilingHolds(s) && s.ink.gt(WAGER_AT)) s.ink = WAGER_AT

  // Everything stops at the threshold, dice included. Letting the chain run on
  // past it would only be counting into a number the game has already declared
  // the end of the run.
  if (mustWager(s)) {
    s.ink = WAGER_AT
    s.rollStartedAt = 0
    s.rollAccum = 0
    return
  }

  // The second challenge's recovery, which is a ramp rather than a wall: the
  // clock runs down and chargeBack turns it into the fraction of production
  // the table is making. Nothing stops here.
  if (s.haltMs > 0) s.haltMs = Math.max(0, s.haltMs - dt * 1000)

  // The high-water mark the codices open on, and the codices themselves.
  //
  // Raised from the tick rather than at a Wager, because AD's ID unlocks are
  // checked against `records.thisEternity.maxAM` continuously and open in the
  // middle of a run. Waiting for the cash-out would mean a run that earned the
  // next codex could not spend it until the run after.
  if (s.inkThisWager.gt(s.deepestInk)) s.deepestInk = s.inkThisWager
  openEarnedCodices(s)
  tickCodices(s, dt)

  // THE RAKE, which is AD's ipGen: a share of your best run, arriving on its
  // own. QUICK HANDS is handed to the ladder as a speed factor rather than
  // written into each interval.
  const rake = chipsPerSecond(s)
  if (rake.gt(0)) s.chips = s.chips.plus(rake.times(dt))

  runAutobuyers(s, (dt * 1000) / autobuyerSpeedFactor(s), {
    buySolid: (idx, one) => buySolid(s, idx, one),
    canBuyGroup: (idx) => canBuyGroup(s, idx),
    buyRollRate: () => buyRollRate(s),
    // IN ONE MOTION turns both reset autobuyers bulk, which is what AD's
    // autobuyMaxDimboosts does to its boost autobuyer. Rebuilding the ladder
    // one rung an interval is the floor on how fast a Wager can be, and no
    // price change touches it.
    buyStudy: () => (bulkResetsUnlocked(s) ? maxBuyStudies(s) : buyStudy(s)),
    buyFolio: () => (bulkResetsUnlocked(s) ? maxBuyFolios(s) : buyFolio(s)),
    wager: () => autoWagerReady(s) && autoWager(s),
  })

  // Seconds per roll for the bookkeeping below, which only needs a double
  // while a roll is slow enough to be watched. Everything faster is settled in
  // Decimal, so an interval a double cannot represent reads zero here and
  // takes the continuous path, which is where it belongs anyway.
  const interval = rollDuration(s)

  // One roll clock, shared.
  //
  // There used to be two: a hand branch that resolved when a spin landed, and
  // an automated branch with its own accumulator. Per-die auto-roll broke that
  // apart, because the automated branch sets rollStartedAt for the animation
  // and the hand branch reads rollStartedAt to decide a roll happened, so an
  // automated roll came back round as a hand roll and threw the whole table.
  //
  // So there is one accumulator and one question asked when a roll lands: did
  // you ask for this one. Yes throws everything; no throws only the dice that
  // roll themselves.
  const hand = handRolling(s)
  const anyAuto = rollingItself(s) || s.autoDice > 0
  if (!hand && !anyAuto) {
    // Nothing is rolling, so nothing is in the air either. A spin that was
    // asked for keeps `hand` true until it lands, so this cannot cut one off.
    s.rollAccum = 0
    s.rollStartedAt = 0
    return
  }

  s.rollAccum += dt

  // Few enough in the window to draw one at a time, which is the boundary
  // applyRolls already drew and the one the cards that read faces against each
  // other depend on. The leftover carries, so the tumble stays in phase with
  // the faces it lands on.
  if (interval > 0 && s.rollAccum / interval <= ROLLS_DRAWN_INDIVIDUALLY) {
    const rolls = Math.floor(s.rollAccum / interval)
    // When the current roll began, so the animation runs off the same clock
    // whoever started it. Written once at the head of a spin and left alone
    // until the next one: rewritten every tick, the tumble's progress stepped
    // at the tick rate instead of flowing with real time, which flattened the
    // deceleration the throw is eased on.
    if (!s.rollStartedAt) s.rollStartedAt = now - Math.min(s.rollAccum, interval) * 1000
    if (rolls <= 0) return
    s.rollAccum -= rolls * interval
    spendHandRoll(s, now)
    // Cleared rather than pointed at the next spin. Whether there is a next
    // spin is the gate's question, asked on the next tick, and answering it
    // here started a throw that nothing was going to finish: the die snapped
    // back to the top of its arc for a frame after every hand roll.
    s.rollStartedAt = 0
    applyRolls(s, new Decimal(rolls), hand)
    return
  }

  // Past that the faces were already being averaged, so nothing is lost by
  // dropping the count entirely and taking a rate times elapsed time instead.
  //
  // This is how Antimatter Dimensions runs its entire loop. Dimension.
  // productionForDiff is productionPerSecond.times(diff / 1000) and there is no
  // tick count in the engine at all. A count is a JS integer, and no JS integer
  // holds 1e310 of anything; floor(accum / interval) came back Infinity, which
  // poisoned rollAccum to -Infinity and made every Decimal it touched a zero.
  s.rollAccum = 0
  s.rollStartedAt = now
  spendHandRoll(s, now)
  resolveManyRolls(s, rollRate(s).times(dt), hand)
}
