// The engine. Solid N produces solid N-1, solid 1 produces Ink, and roll rate
// scales all of it. Antimatter Dimensions' math with Leonardo's geometry.
import Decimal from 'break_infinity.js'
import { SOLIDS } from './solids'
import {
  MANUAL_ROLL_SECONDS,
  PER_TEN_MULT,
  ROLL_COST_BASE,
  ROLL_COST_MULT,
  ROLL_INTERVAL_BASE,
  ROLL_POWER_BASE,
  ROLL_POWER_FLOOR,
  ROLL_POWER_PER_FOLIO,
  STUDIES_THAT_UNLOCK,
  STUDY_MULT,
  folioRequirement,
  studyRequirement,
} from './balance'
import { unlockedSolids, type GameState } from '../state'

/** Studies past the ones that unlock solids turn into a flat multiplier. */
export function studyBonus(s: GameState): Decimal {
  const extra = Math.max(0, s.studies - STUDIES_THAT_UNLOCK)
  return STUDY_MULT.pow(extra)
}

/** idx is 1-based. Doubles every ten bought, times the study bonus. */
export function solidMultiplier(s: GameState, idx: number): Decimal {
  const st = s.solids[idx - 1]
  return PER_TEN_MULT.pow(Math.floor(st.bought / 10)).times(studyBonus(s))
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
  const afford = s.ink.div(solidCost(s, idx)).floor().toNumber()
  if (!Number.isFinite(afford)) return toTen
  return Math.max(1, Math.min(toTen, afford))
}

export function buyPrice(s: GameState, idx: number): Decimal {
  return solidCost(s, idx).times(buyCount(s, idx))
}

export function canBuySolid(s: GameState, idx: number): boolean {
  if (idx > unlockedSolids(s)) return false
  return s.ink.gte(buyPrice(s, idx))
}

export function buySolid(s: GameState, idx: number): boolean {
  if (!canBuySolid(s, idx)) return false
  const n = buyCount(s, idx)
  s.ink = s.ink.minus(buyPrice(s, idx))
  const st = s.solids[idx - 1]
  st.bought += n
  st.amount = st.amount.plus(n)
  return true
}

// -- roll rate ------------------------------------------------------------

/** Folios push the per-upgrade interval multiplier down, so each one is worth more. */
export function rollPower(s: GameState): number {
  return Math.max(ROLL_POWER_FLOOR, ROLL_POWER_BASE - s.folios * ROLL_POWER_PER_FOLIO)
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
  const idx = unlockedSolids(s)
  return { idx, need: new Decimal(studyRequirement(s.studies + 1)) }
}

export function canBuyStudy(s: GameState): boolean {
  const { idx, need } = studyReq(s)
  return s.solids[idx - 1].amount.gte(need)
}

function resetSolids(s: GameState): void {
  for (const st of s.solids) {
    st.bought = 0
    st.amount = new Decimal(0)
  }
}

/** A study resets the table but leaves ink, roll rate and folios alone. */
export function buyStudy(s: GameState): boolean {
  if (!canBuyStudy(s)) return false
  s.studies += 1
  resetSolids(s)
  return true
}

export function folioReq(s: GameState): { idx: number; need: Decimal } {
  return { idx: SOLIDS.length, need: new Decimal(folioRequirement(s.folios)) }
}

export function folioUnlocked(s: GameState): boolean {
  return unlockedSolids(s) >= SOLIDS.length
}

export function canBuyFolio(s: GameState): boolean {
  if (!folioUnlocked(s)) return false
  const { idx, need } = folioReq(s)
  return s.solids[idx - 1].amount.gte(need)
}

/**
 * A folio resets studies and roll rate as well as the table, exactly as an
 * antimatter galaxy does. What you keep is a permanently better roll power.
 */
export function buyFolio(s: GameState): boolean {
  if (!canBuyFolio(s)) return false
  s.folios += 1
  s.studies = 0
  s.rollUpgrades = 0
  resetSolids(s)
  return true
}

// -- rolling by hand ------------------------------------------------------

/**
 * The whole game before the first autobuyer. It pays a couple of seconds of
 * production, so it starts the game moving and becomes irrelevant without ever
 * needing to be taken away.
 */
export function manualRollYield(s: GameState): Decimal {
  return inkPerSecond(s).times(MANUAL_ROLL_SECONDS).max(1)
}

export function manualRoll(s: GameState): Decimal {
  const got = manualRollYield(s)
  s.ink = s.ink.plus(got)
  s.inkThisWager = s.inkThisWager.plus(got)
  s.stats.manualRolls += 1
  return got
}

// -- the tick -------------------------------------------------------------

export function inkPerSecond(s: GameState): Decimal {
  return s.solids[0].amount.times(solidMultiplier(s, 1)).times(rollRate(s))
}

/**
 * Every delta is computed from the amounts at the start of the tick, then
 * applied. Producing in place would let a solid spend dice it only received
 * this same tick, which quietly inflates the whole chain.
 */
export function tick(s: GameState, dt: number): void {
  if (dt <= 0) return
  const rate = rollRate(s)
  const n = unlockedSolids(s)
  const before = s.solids.map((d) => d.amount)

  const ink = before[0].times(solidMultiplier(s, 1)).times(rate).times(dt)
  s.ink = s.ink.plus(ink)
  s.inkThisWager = s.inkThisWager.plus(ink)

  for (let i = 2; i <= n; i++) {
    const made = before[i - 1].times(solidMultiplier(s, i)).times(rate).times(dt)
    s.solids[i - 2].amount = s.solids[i - 2].amount.plus(made)
  }
}
