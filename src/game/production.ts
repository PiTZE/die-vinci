// The engine. Solid N produces solid N-1, solid 1 produces Ink, and roll rate
// scales all of it. Antimatter Dimensions' math with Leonardo's geometry.
import Decimal from 'break_infinity.js'
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
  AUTOMATOR_COST,
  AUTOMATOR_SEED,
  ROLLS_DRAWN_INDIVIDUALLY,
  ROLL_COST_BASE,
  ROLL_COST_MULT,
  CATCHUP_AFTER_S,
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
  autobuyerSpeedFactor,
  breakMultiplier,
  ceilingHolds,
  chipsPerSecond,
  folioStrengthBonus,
  rollCostStep,
  solidCostRelief,
} from './breaks'

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

export function solidCost(s: GameState, idx: number): Decimal {
  const def = SOLIDS[idx - 1]
  const st = s.solids[idx - 1]
  // CHEAPER PLATES takes the edge off the per-ten climb, which is AD's
  // dimCostMult doing the same job on the same curve.
  return def.baseCost
    .times(def.costMult.div(solidCostRelief(s)).pow(Math.floor(st.bought / 10)))
    .times(modifiers(s).costFactor)
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
  if (r.payWithOffset > 0) {
    const from = idx - r.payWithOffset
    if (from < 1) return false
    return s.solids[from - 1].amount.gte(need)
  }
  return s.ink.gte(need)
}

export function canBuySolid(s: GameState, idx: number): boolean {
  if (idx > openSolids(s)) return false
  const r = restrictions(s)
  if (r.payWithOffset > 0) {
    const from = idx - r.payWithOffset
    if (from < 1) return false
    return s.solids[from - 1].amount.gte(buyPrice(s, idx))
  }
  return s.ink.gte(buyPrice(s, idx))
}

/** `one` is the shift-click path: a single die at the current tier price. */
export function buySolid(s: GameState, idx: number, one = false): boolean {
  if (idx > openSolids(s)) return false
  const r = restrictions(s)
  const n = one ? 1 : buyCount(s, idx)
  const price = solidCost(s, idx).times(n)

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

/** Seconds between rolls. */
export function rollInterval(s: GameState): number {
  const base = ROLL_INTERVAL_BASE * Math.pow(rollPower(s), s.rollUpgrades)
  // VII The Chariot speeds it up, XV The Devil slows it down. A multiplier on
  // the rate is a divisor on the interval.
  return base / modifiers(s).rollRateMult
}

export function rollRate(s: GameState): number {
  return 1 / rollInterval(s)
}

export function rollCost(s: GameState): Decimal {
  // SHORTER ODDS walks the x20 a level down toward x2, which is AD's own
  // tickspeedCostMult doing the same thing to the same number.
  const step = rollCostStep(s, ROLL_COST_MULT.toNumber())
  return ROLL_COST_BASE.times(Decimal.pow(step, s.rollUpgrades)).times(
    modifiers(s).rollCostFactor,
  )
}

export function canBuyRollRate(s: GameState): boolean {
  if (restrictions(s).noRollRate) return false
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
export function studyReq(s: GameState): { idx: number; need: Decimal } {
  const n = s.studies + 1
  const r = restrictions(s)
  const need = Math.max(1, studyRequirement(n) - requirementDiscount(s)) * r.studyCostFactor
  return { idx: Math.min(studyTier(n), r.cap), need: new Decimal(need) }
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
  s.stats.sinceResetMs = 0
  // A spin in the air would otherwise land onto the fresh table and pay out
  // from the solids that were just cleared.
  s.rollStartedAt = 0
  s.rollAccum = 0
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
  const r = restrictions(s)
  const need = Math.max(1, folioRequirement(s.folios) - requirementDiscount(s)) * r.folioCostFactor
  return { idx: Math.min(SOLIDS.length, r.cap), need: new Decimal(need) }
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
const MAX_ALL_STEPS = 5000

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
  for (let pass = 0; pass < MAX_ALL_STEPS; pass++) {
    let did = false

    // Deepest first. A doubling on a deep solid compounds through every tier
    // below it; the same ink at the shallow end only multiplies the last step.
    //
    // Each tier takes only what fills its current group of ten, because that is
    // where the x2 is, and then the pass moves on. Antimatter Dimensions does
    // the same in buyMaxDimension: buy until ten, then consider bulk. Picking
    // the single most expensive affordable row instead was what emptied the
    // wallet into one tier: at 1e7 ink with four solids open it bought ten d12
    // and left d4, d6 and d8 at zero, so nothing made ink at all.
    for (let idx = open; idx >= 1; idx--) {
      if (!canBuySolid(s, idx)) continue
      if (buySolid(s, idx)) did = true
    }

    // Roll rate last, after the chain, which is where AD buys tickspeed. And
    // never onto an empty table: roll rate multiplies what the dice pay, so
    // with no dice it multiplies nothing, and ink can only come from a die.
    const canProduce = s.solids.slice(0, open).some((d) => d.amount.gt(0))
    if (canProduce && canBuyRollRate(s) && buyRollRate(s)) did = true

    if (!did) return
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
 * Nothing moves this yet. It is here because the upgrade that does is coming,
 * and a fair die is just the b = 0 case of a loaded one, so the two do not
 * need separate code paths.
 */
export function faceBias(_s: GameState): number {
  return 0
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

/** Seconds one roll takes. The dice spin for exactly this long. */
export function rollDuration(s: GameState): number {
  return rollInterval(s)
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

export function startRoll(s: GameState, now: number): boolean {
  if (mustWager(s)) return false
  if (rollingItself(s) || s.rollStartedAt > 0 || s.haltMs > 0) return false
  s.rollStartedAt = now
  // The faces go with the throw. A die in the air is not still showing you
  // what it landed on last time.
  for (let i = 0; i < s.faces.length; i++) s.faces[i] = 0
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
function produce(s: GameState, rolls: number, factors: number[]): void {
  // openSolids, not unlockedSolids: a challenge that shortens the chain takes
  // the deep solids off the table, and off the table means out of the roll.
  const n = openSolids(s)
  const before = s.solids.map((d) => d.amount)

  const m = modifiers(s)
  const ink = before[0]
    .times(solidMultiplier(s, 1))
    .times(factors[0])
    .times(rolls)
    .times(m.globalMult)
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
    s.solids[i - 2].amount = s.solids[i - 2].amount.plus(made)
    // I The Magician: a share also lands two tiers down, skipping a rung.
    if (m.skip > 0 && i >= 3) {
      s.solids[i - 3].amount = s.solids[i - 3].amount.plus(made.times(m.skip))
    }
  }
}

/**
 * A die is thrown when there is a die to throw. Locked solids are not on the
 * table, and a solid you own none of has nothing to land: showing a face on an
 * empty row said a number and then paid nothing, which reads as a bug.
 */
function rolls(s: GameState, i: number): boolean {
  return i < openSolids(s) && s.solids[i].amount.gt(0)
}

/** Rolls every die on the table, records the faces, and produces from them. */
function resolveOneRoll(s: GameState): void {
  const m = modifiers(s)
  const bias = faceBias(s)
  const factors: number[] = []
  for (let i = 0; i < s.solids.length; i++) {
    if (!rolls(s, i)) {
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

  produce(s, 1, factors)
}

/**
 * Rolls landing faster than they can be read. The faces still change every
 * frame so the dice look alive, but production uses the mean, which is what a
 * thousand independent rolls a second converges to anyway.
 */
function resolveManyRolls(s: GameState, count: number): void {
  for (let i = 0; i < s.solids.length; i++) {
    s.faces[i] = rolls(s, i) ? rollFace(SOLIDS[i].faces, faceBias(s)) : 0
  }
  // The mean, per die, not a flat one. A d72 averages 36.5 and a d4 averages
  // 2.5, so a flat factor here would make the automator pay a fraction of what
  // the same rolls pay by hand.
  const bias = faceBias(s)
  produce(s, count, s.solids.map((_, i) => (rolls(s, i) ? meanFace(SOLIDS[i].faces, bias) : 0)))
}

function applyRolls(s: GameState, count: number): void {
  if (count <= 0) return
  if (count <= ROLLS_DRAWN_INDIVIDUALLY) {
    for (let i = 0; i < count; i++) resolveOneRoll(s)
  } else {
    resolveManyRolls(s, count)
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

  // Ink held is clamped whether or not the run is over, because ink held can
  // exceed what the run has earned and a double has nowhere left to put it.
  // The clamp is a clamp and nothing more; what ends the run is the line
  // below, which asks what the run earned.
  if (s.ink.gt(WAGER_AT)) s.ink = WAGER_AT

  // Everything stops at the threshold, dice included. Letting the chain run on
  // past it would only be counting into a number the game has already declared
  // the end of the run.
  if (mustWager(s)) {
    s.ink = WAGER_AT
    s.rollStartedAt = 0
    s.rollAccum = 0
    return
  }

  // A challenge that halts production after a purchase, recovering over three
  // minutes, as AD's second challenge does.
  if (s.haltMs > 0) {
    s.haltMs = Math.max(0, s.haltMs - dt * 1000)
    s.rollStartedAt = 0
    return
  }

  // THE RAKE, which is AD's ipGen: a share of your best run, arriving on its
  // own. QUICK HANDS is handed to the ladder as a speed factor rather than
  // written into each interval.
  const rake = chipsPerSecond(s)
  if (rake.gt(0)) s.chips = s.chips.plus(rake.times(dt))

  runAutobuyers(s, (dt * 1000) / autobuyerSpeedFactor(s), {
    buySolid: (idx, one) => buySolid(s, idx, one),
    canBuyGroup: (idx) => canBuyGroup(s, idx),
    buyRollRate: () => buyRollRate(s),
    buyStudy: () => buyStudy(s),
    buyFolio: () => buyFolio(s),
    wager: () => autoWager(s),
  })

  const interval = rollInterval(s)

  // By hand: nothing happens until a spin finishes, and the dice pay out when
  // they land rather than while they are in the air.
  if (!rollingItself(s)) {
    s.rollAccum = 0
    if (s.rollStartedAt && now - s.rollStartedAt >= interval * 1000) {
      // The time in the air, not one roll, and not a count of them.
      //
      // One roll per tick capped a held button at ten a second, because the
      // tick is 100ms, however fast the roll rate had become. With the
      // automator behind the first Wager that made the first Wager
      // unreachable by hand. Capping the roll count instead was the same
      // mistake wearing a bigger number: at a million rolls a second a
      // thousand per tick is still a throttle.
      //
      // So the bound is on elapsed time. Anything longer than a tick's worth
      // of catch-up belongs to the away path, which has its own budget.
      const held = Math.min(CATCHUP_AFTER_S, (now - s.rollStartedAt) / 1000)
      s.rollStartedAt = 0
      applyRolls(s, Math.max(1, Math.floor(held / interval)))
    }
    return
  }

  // Automated: rolls land back to back for as long as the elapsed time covers.
  s.rollAccum += dt
  if (interval <= 0) return
  const rolls = Math.floor(s.rollAccum / interval)
  // When the current roll began, so the animation can run off the same clock
  // the manual one does and stay in phase with the faces it lands on.
  s.rollStartedAt = now - Math.min(s.rollAccum, interval) * 1000
  if (rolls <= 0) return
  s.rollAccum -= rolls * interval
  s.rollStartedAt = now - s.rollAccum * 1000
  applyRolls(s, rolls)
}
