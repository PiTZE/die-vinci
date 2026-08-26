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
  AUTOMATOR_AT_STUDIES,
  AUTOMATOR_COST,
  ROLLS_DRAWN_INDIVIDUALLY,
  ROLL_COST_BASE,
  ROLL_COST_MULT,
  ROLL_INTERVAL_BASE,
  START_INK,
  folioRequirement,
  rollIntervalMultiplier,
  studyRequirement,
  studyTier,
} from './balance'
import { unlockedSolids, type GameState } from '../state'
import { restrictions } from './challenges'
import { runAutobuyers } from './autobuyers'

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
 * Every ten bought, this tier's study bonus, and whatever the Points grid adds:
 * a global multiplier from time played, one from time in this wager, one from
 * wagers completed for the solids that upgrade covers, and one on the first
 * solid from points left unspent.
 */
export function solidMultiplier(s: GameState, idx: number): Decimal {
  const st = s.solids[idx - 1]
  const r = restrictions(s)
  const perTen = r.perTen === null ? perTenMultiplier(s) : new Decimal(r.perTen)
  const weaken = idx === 1 && r.weakenFirst > 1 ? new Decimal(r.weakenFirst) : new Decimal(1)
  return perTen
    .pow(Math.floor(st.bought / 10))
    .div(weaken)
    .times(studyBonus(s, idx))
    .times(timeMultiplier(s))
    .times(runMultiplier(s))
    .times(pairMultiplier(s, idx))
    .times(unspentMultiplier(s, idx))
}

export function solidCost(s: GameState, idx: number): Decimal {
  const def = SOLIDS[idx - 1]
  const st = s.solids[idx - 1]
  return def.baseCost.times(def.costMult.pow(Math.floor(st.bought / 10)))
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
  return rollIntervalMultiplier(s.folios * folioStrength(s))
}

/** Seconds between rolls. */
export function rollInterval(s: GameState): number {
  return ROLL_INTERVAL_BASE * Math.pow(rollPower(s), s.rollUpgrades)
}

export function rollRate(s: GameState): number {
  return 1 / rollInterval(s)
}

export function rollCost(s: GameState): Decimal {
  return ROLL_COST_BASE.times(ROLL_COST_MULT.pow(s.rollUpgrades))
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
function resetTable(s: GameState): void {
  for (const st of s.solids) {
    st.bought = 0
    st.amount = new Decimal(0)
  }
  s.ink = new Decimal(START_INK)
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
  s.studies += 1
  s.rollUpgrades = 0
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
  s.folios += 1
  s.studies = 0
  s.rollUpgrades = 0
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
  for (let steps = 0; steps < MAX_ALL_STEPS; steps++) {
    let best: { price: Decimal; buy: () => boolean } | null = null

    if (canBuyRollRate(s)) best = { price: rollCost(s), buy: () => buyRollRate(s) }
    for (let idx = 1; idx <= open; idx++) {
      if (!canBuySolid(s, idx)) continue
      const price = buyPrice(s, idx)
      if (!best || price.gt(best.price)) best = { price, buy: () => buySolid(s, idx) }
    }

    if (!best || !best.buy()) return
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
 * What a face is worth, relative to the average face of that die.
 *
 * A d4 shows 1 to 4 and the player reads exactly that, but production is
 * scaled by face divided by 2.5, so the mean is exactly 1 and the balance
 * curve is the one already tuned. It has the neat property that every die
 * swings by the same relative amount, about 58%, whether it has four faces or
 * seventy-two: a uniform roll over 1..N has standard deviation N/sqrt(12)
 * against a mean of (N+1)/2. A d72 is not a wilder die than a d4, which is
 * what you want when the deep solids are already worth more by construction.
 */
export function faceFactor(face: number, faces: number): number {
  if (!face) return 1
  return face / ((faces + 1) / 2)
}

function rollFace(faces: number): number {
  return 1 + Math.floor(Math.random() * faces)
}

/** Seconds one roll takes. The dice spin for exactly this long. */
export function rollDuration(s: GameState): number {
  return rollInterval(s)
}

/** 0 to 1 through the current spin, or 1 when the dice are at rest. */
export function rollProgress(s: GameState, now: number): number {
  if (!s.rollStartedAt) return 1
  const d = rollDuration(s) * 1000
  if (d <= 0) return 1
  return Math.min(1, (now - s.rollStartedAt) / d)
}

export function rolling(s: GameState): boolean {
  return s.autoRoll || s.rollStartedAt > 0
}

/** Begins a spin. Refused while one is already in flight, which is the whole
 *  reason a hand cannot out-roll the roll rate: manual and automatic share one
 *  ceiling, and the hand is strictly the slower of the two. */
export function startRoll(s: GameState, now: number): boolean {
  if (s.autoRoll || s.rollStartedAt > 0 || s.haltMs > 0) return false
  s.rollStartedAt = now
  return true
}

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
  const n = unlockedSolids(s)
  const before = s.solids.map((d) => d.amount)

  const ink = before[0]
    .times(solidMultiplier(s, 1))
    .times(factors[0])
    .times(rolls)
  s.ink = s.ink.plus(ink)
  s.inkThisWager = s.inkThisWager.plus(ink)

  for (let i = 2; i <= n; i++) {
    const made = before[i - 1]
      .times(solidMultiplier(s, i))
      .times(factors[i - 1])
      .times(rolls)
    s.solids[i - 2].amount = s.solids[i - 2].amount.plus(made)
  }
}

/** Rolls every open die, records the faces, and produces from them. */
function resolveOneRoll(s: GameState): void {
  const n = unlockedSolids(s)
  const factors: number[] = []
  for (let i = 0; i < s.solids.length; i++) {
    if (i >= n) {
      s.faces[i] = 0
      factors.push(1)
      continue
    }
    const face = rollFace(SOLIDS[i].faces)
    s.faces[i] = face
    factors.push(faceFactor(face, SOLIDS[i].faces))
  }
  produce(s, 1, factors)
}

/**
 * Rolls landing faster than they can be read. The faces still change every
 * frame so the dice look alive, but production uses the mean, which is what a
 * thousand independent rolls a second converges to anyway.
 */
function resolveManyRolls(s: GameState, rolls: number): void {
  const n = unlockedSolids(s)
  for (let i = 0; i < s.solids.length; i++) {
    s.faces[i] = i < n ? rollFace(SOLIDS[i].faces) : 0
  }
  produce(s, rolls, s.solids.map(() => 1))
}

function applyRolls(s: GameState, rolls: number): void {
  if (rolls <= 0) return
  if (rolls <= ROLLS_DRAWN_INDIVIDUALLY) {
    for (let i = 0; i < rolls; i++) resolveOneRoll(s)
  } else {
    resolveManyRolls(s, rolls)
  }
}

// -- the automator --------------------------------------------------------

export function automatorUnlocked(s: GameState): boolean {
  return s.autoRoll || s.studies >= AUTOMATOR_AT_STUDIES
}

export function automatorCost(): Decimal {
  return AUTOMATOR_COST
}

export function canBuyAutomator(s: GameState): boolean {
  return !s.autoRoll && automatorUnlocked(s) && s.ink.gte(AUTOMATOR_COST)
}

export function buyAutomator(s: GameState): boolean {
  if (!canBuyAutomator(s)) return false
  s.ink = s.ink.minus(AUTOMATOR_COST)
  s.autoRoll = true
  s.rollStartedAt = 0
  return true
}

// -- the tick -------------------------------------------------------------

/**
 * What the chain pays per second at the current roll rate, if the dice keep
 * rolling. Before the automator that is a statement about how fast you press,
 * which is why the roll rate line reads in rolls per second as well.
 */
export function inkPerSecond(s: GameState): Decimal {
  return s.solids[0].amount.times(solidMultiplier(s, 1)).times(rollRate(s))
}

export function tick(s: GameState, dt: number, now: number): void {
  if (dt <= 0) return
  // Two Points upgrades scale with these, so they have to accrue from the same
  // clock the production does, offline catch-up included.
  s.stats.playMs += dt * 1000
  s.stats.wagerMs += dt * 1000

  // A challenge that halts production after a purchase, recovering over three
  // minutes, as AD's second challenge does.
  if (s.haltMs > 0) {
    s.haltMs = Math.max(0, s.haltMs - dt * 1000)
    s.rollStartedAt = 0
    return
  }

  runAutobuyers(s, dt * 1000, {
    buySolid: (idx, one) => buySolid(s, idx, one),
    buyRollRate: () => buyRollRate(s),
    buyStudy: () => buyStudy(s),
    buyFolio: () => buyFolio(s),
  })

  const interval = rollInterval(s)

  // By hand: nothing happens until a spin finishes, and the dice pay out when
  // they land rather than while they are in the air.
  if (!s.autoRoll) {
    s.rollAccum = 0
    if (s.rollStartedAt && now - s.rollStartedAt >= interval * 1000) {
      s.rollStartedAt = 0
      resolveOneRoll(s)
    }
    return
  }

  // Automated: rolls land back to back for as long as the elapsed time covers.
  s.rollStartedAt = 0
  s.rollAccum += dt
  if (interval <= 0) return
  const rolls = Math.floor(s.rollAccum / interval)
  if (rolls <= 0) return
  s.rollAccum -= rolls * interval
  applyRolls(s, rolls)
}
