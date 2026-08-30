// Breaking the Wager. Antimatter Dimensions calls it Break Infinity.
//
// Everything here is AD's, from src/game.js, src/core/autobuyers/autobuyer.js
// and src/core/secret-formula/infinity/break-infinity-upgrades.js. Its shape:
//
//   1. A challenge awards the autobuyer for the prestige itself. In AD that is
//      Normal Challenge 12 and the Big Crunch autobuyer.
//   2. That autobuyer's interval is bought down, x0.6 a level, to a floor of
//      100ms. AD's own words, from BreakInfinityTab.vue: "Reduce the interval
//      of Automatic Big Crunch Autobuyer to 0.1 seconds to unlock Break
//      Infinity."
//   3. Breaking changes what the prestige pays. Before, a flat one. After,
//      a number that grows with how far past the wall the run got.
//   4. And it hands every other autobuyer its floor for nothing, because a
//      run that is over in a second cannot wait on a four second timer.
//
// The wall stays where it is. Breaking does not raise it; it stops the run
// ending there and starts paying for the overshoot.
import Decimal from 'break_infinity.js'
import type { GameState } from '../state'
import { AUTOBUYERS, INTERVAL_FLOOR, isMaxed, upgrade } from './autobuyers'
import { UPGRADES, chipsPerSecondFromGrid, wagerChipMultiplier } from './upgrades'

/** The autobuyer that calls the Wager for you. Challenge 13 awards it. */
export const WAGER_AUTOBUYER = 'wager'

/**
 * AD's exponent, unchanged: `10^(log10(maxAM)/308 - 0.75)`.
 *
 * 308 is where the wall is, so a run that stops exactly at it pays 10^0.25,
 * about 1.78. Double the exponent and it pays 17.8. Ten times it and it pays
 * 1.78e9. The 0.75 is AD's and it is what keeps the first broken Wager worth
 * only a little more than the flat one it replaces, so breaking is a change of
 * slope rather than a windfall.
 *
 * We measure on what the run earned rather than on the most it held at once,
 * which is the field the CALL button already gates on. AD reads
 * `records.thisInfinity.maxAM`, a peak; ink here is spent as it arrives, so a
 * peak would undercount a run that bought as it went.
 */
const DIVISOR = 308
const OFFSET = 0.75

/**
 * Where the price climb starts steepening from, with neither upgrade bought.
 * AD's is ten, in `Player.tickSpeedMultDecrease` and `dimensionMultDecrease`,
 * both written as `10 - Effects.sum(...)`.
 */
const SCALE_BASE = 10

export function chipsFrom(s: GameState): Decimal {
  const base = s.broke
    ? Decimal.pow10(Math.max(0, s.inkThisWager.log10()) / DIVISOR - OFFSET).floor().max(1)
    : new Decimal(1)
  return base.times(chipMultiplier(s)).times(wagerChipMultiplier(s)).floor().max(1)
}

/**
 * The rebuyable that doubles every chip you are paid, AD's `ipMult`.
 *
 * Its cost curve is AD's too: the nth purchase costs 10^(n+1). The multiplier
 * grows as 2^n against a cost of 10^n, so it is always affordable eventually
 * and never runs away, which is the shape of every good rebuyable in that game.
 */
export const CHIP_MULT_STEP = 2

export function chipMultCost(s: GameState): Decimal {
  return Decimal.pow10(s.chipMult + 1)
}

export function chipMultiplier(s: GameState): Decimal {
  return Decimal.pow(CHIP_MULT_STEP, s.chipMult)
}

export function canBuyChipMult(s: GameState): boolean {
  return chipMultUnlocked(s) && s.chips.gte(chipMultCost(s))
}

/**
 * Gated on owning the whole chip grid, which is AD's rule wearing our numbers:
 * its own is an achievement for buying sixteen Infinity Upgrades, and sixteen
 * is its whole grid.
 */
export function chipMultUnlocked(s: GameState): boolean {
  return s.wagers > 0 && s.chipUpgrades.length >= CHIP_GRID_SIZE
}

/** However many the grid holds, counted rather than remembered. */
export const CHIP_GRID_SIZE = Object.keys(UPGRADES).length

export function buyChipMult(s: GameState): boolean {
  if (!canBuyChipMult(s)) return false
  s.chips = s.chips.minus(chipMultCost(s))
  s.chipMult += 1
  // The payout just doubled, so what the autobuyer waits for doubles with it.
  // AD does this from infinity-upgrades.js on the same purchase.
  bumpWagerThreshold(s, CHIP_MULT_STEP)
  return true
}

// -- breaking -------------------------------------------------------------

/**
 * The only condition, and it is AD's exactly: the Wager's own autobuyer has to
 * be down at its floor of a tenth of a second.
 */
export function canBreak(s: GameState): boolean {
  return isMaxed(s, WAGER_AUTOBUYER) && !!s.autobuyers[WAGER_AUTOBUYER]?.unlocked
}

export function breakUnlocked(s: GameState): boolean {
  return s.broke || canBreak(s)
}

/**
 * One way, which is also AD's.
 *
 * Its `breakInfinity()` reads `player.break = !player.break`, and taking that
 * line on its own is how this arrived here as a toggle with a FIX IT AGAIN on
 * the other side of it. The button tells the real story. From
 * BreakInfinityButton.vue: the label is "INFINITY IS BROKEN" once it is, the
 * class is `--unclickable`, and the handler reads
 *
 *   else if (!this.isBroken && this.isUnlocked) Modal.breakInfinity.show()
 *
 * so a second press does nothing at all. The flag is a variable rather than a
 * one-way latch because Eternity clears it, with the comment "Fix infinity
 * because it can only break after big crunch autobuyer interval is maxed", and
 * Reality sets it back. Nothing a player can press ever un-breaks it.
 *
 * There is no reason to want to, here or there. Breaking does exactly three
 * things and all three are pure gain: production stops halting at the wall,
 * the payout becomes 10^(log10(ink)/308 - 0.75) floored at one, which is never
 * below the flat one it replaces, and the grid opens.
 */
export function breakWager(s: GameState): boolean {
  if (!canBreak(s) || s.broke) return false
  s.broke = true
  // Every other autobuyer takes its floor for free. A Wager that resolves in a
  // tenth of a second cannot wait twenty seconds for the folio timer, and AD
  // hands out the same gift on the same line.
  for (const a of AUTOBUYERS) {
    let guard = 0
    while (!isMaxed(s, a.id) && guard++ < 200) {
      const slot = s.autobuyers[a.id]
      if (!slot) break
      slot.level += 1
    }
  }
  return true
}

/** Whether production still stops at the wall. */
export function ceilingHolds(s: GameState): boolean {
  return !s.broke
}

// -- the break grid -------------------------------------------------------

export interface BreakUpgradeDef {
  id: string
  cost: number
  label: string
  note: string
  /** Rebuyable ones climb in cost and stop at a cap. */
  steps?: number
  costStep?: number
}

/**
 * AD's break grid, retargeted. Its one-off column measures things this game
 * also has; its rebuyable column reduces cost *scaling*, which is the only
 * lever the layer 0 balance work found that moves anything.
 *
 * AD reduces its tickspeed cost multiplier from x10 to x2 over eight buys and
 * its dimension cost multiplier from x10 to x3 over seven. Roll rate here
 * costs x20 a level, which is the number the whole first run is paced by, so
 * the same idea lands on the same place.
 */
export const BREAK_UPGRADES: BreakUpgradeDef[] = [
  { id: 'totalInk', cost: 1e4, label: 'LEDGER',
    note: 'every solid gains a multiplier from the ink this run has earned' },
  { id: 'currentInk', cost: 5e4, label: 'ON THE TABLE',
    note: 'every solid gains a multiplier from the ink you are holding' },
  { id: 'wagerMult', cost: 1e5, label: 'HOUSE EDGE',
    note: 'every solid gains a multiplier from Wagers called' },
  { id: 'archiveMult', cost: 1e6, label: 'PROVENANCE',
    note: 'every solid gains a multiplier from the archive' },
  { id: 'fastestMult', cost: 1e7, label: 'CLOCKED',
    note: 'every solid gains a multiplier from your fastest Wager' },
  { id: 'bulkResets', cost: 5e9, label: 'IN ONE MOTION',
    note: 'the study and folio autobuyers take every rung the table can pay for at once' },
  { id: 'foliosStronger', cost: 5e11, label: 'BINDING',
    note: 'folios are half again as strong' },
  { id: 'autoFaster', cost: 1e15, label: 'QUICK HANDS',
    note: 'every autobuyer a challenge awarded runs twice as fast' },
  // Rebuyable. The cost multiplier each level takes off, and where it stops.
  { id: 'rollCostDown', cost: 1e6, costStep: 5, steps: 8, label: 'SHORTER ODDS',
    note: 'roll rate costs less to climb' },
  { id: 'solidCostDown', cost: 1e7, costStep: 5e3, steps: 7, label: 'CHEAPER PLATES',
    note: 'solids cost less to climb' },
  { id: 'chipGen', cost: 1e7, costStep: 10, steps: 10, label: 'THE RAKE',
    note: 'chips arrive on their own, from your best run' },
]

export const BREAK_BY_ID: Record<string, BreakUpgradeDef> = Object.fromEntries(
  BREAK_UPGRADES.map((u) => [u.id, u]),
)

export function isRebuyable(id: string): boolean {
  return (BREAK_BY_ID[id]?.steps ?? 0) > 0
}

export function breakLevel(s: GameState, id: string): number {
  if (!isRebuyable(id)) return s.breakUpgrades.includes(id) ? 1 : 0
  return Math.min(s.breakRebuyables?.[id] ?? 0, BREAK_BY_ID[id]?.steps ?? 0)
}

export function breakCost(s: GameState, id: string): Decimal {
  const def = BREAK_BY_ID[id]
  if (!def) return new Decimal(Infinity)
  if (!isRebuyable(id)) return new Decimal(def.cost)
  return new Decimal(def.cost).times(Decimal.pow(def.costStep ?? 1, breakLevel(s, id)))
}

export function breakMaxed(s: GameState, id: string): boolean {
  const def = BREAK_BY_ID[id]
  if (!def) return true
  return breakLevel(s, id) >= (def.steps ?? 1)
}

export function canBuyBreak(s: GameState, id: string): boolean {
  return s.broke && !breakMaxed(s, id) && s.chips.gte(breakCost(s, id))
}

export function buyBreak(s: GameState, id: string): boolean {
  if (!canBuyBreak(s, id)) return false
  s.chips = s.chips.minus(breakCost(s, id))
  if (isRebuyable(id)) {
    s.breakRebuyables = { ...(s.breakRebuyables ?? {}), [id]: breakLevel(s, id) + 1 }
  } else {
    s.breakUpgrades.push(id)
  }
  return true
}

export function hasBreak(s: GameState, id: string): boolean {
  return breakLevel(s, id) > 0
}

// -- what the break grid does ---------------------------------------------

/** A multiplier on every solid, the product of whatever the grid has bought. */
export function breakMultiplier(s: GameState): Decimal {
  if (!s.broke && s.breakUpgrades.length === 0) return new Decimal(1)
  let out = new Decimal(1)
  // AD's own shapes: a square root of an exponent, so a hundred orders of
  // magnitude is worth ten rather than a hundred.
  if (hasBreak(s, 'totalInk')) {
    out = out.times(Math.sqrt(Math.max(0, s.inkThisWager.log10()) + 1))
  }
  // AD's currentAMMult, the one upgrade its break grid had and ours did not.
  // Same shape as the one above it, read off what you are holding rather than
  // what the run has earned.
  if (hasBreak(s, 'currentInk')) {
    out = out.times(Math.sqrt(Math.max(0, s.ink.log10()) + 1))
  }
  if (hasBreak(s, 'wagerMult')) {
    out = out.times(1 + Math.log10(Math.max(1, s.wagers)) * 10)
  }
  if (hasBreak(s, 'archiveMult')) {
    out = out.times(Math.max(1, Math.pow(Math.max(0, s.achievements.length - 18), 3) / 40))
  }
  if (hasBreak(s, 'fastestMult')) {
    // Faster is worth more, capped so a sub-second Wager is not unbounded.
    const best = Math.max(100, s.stats.bestWagerMs)
    out = out.times(Decimal.min(3e4, Math.max(1, 6e5 / best)))
  }
  return out
}

/**
 * How fast the price climb itself steepens past the wall, which is the only
 * thing these two upgrades touch.
 *
 * Both are AD's, down to the cost and the step count: SHORTER ODDS is
 * `tickspeedCostMult`, 1e6 at x5 over eight levels, and CHEAPER PLATES is
 * `dimCostMult`, 1e7 at x5e3 over seven. AD's description says what they are
 * for in as many words, "Reduce post-infinity Tickspeed Upgrade cost
 * multiplier scaling", and its effect is a flat `10 - level` on the scale.
 *
 * They used to reduce the plain geometric ratio here instead, because there
 * was no scaling for them to reduce. There is now, so they do what AD's do.
 * Below the wall the price climb is untouched by either, which is also AD:
 * `Player.tickSpeedMultDecrease` only ever reaches `costScale`, and
 * `costScale` only ever reaches the term past `scalingCostThreshold`.
 */
export function rollCostScale(s: GameState): number {
  return SCALE_BASE - breakLevel(s, 'rollCostDown')
}

export function solidCostScale(s: GameState): number {
  return SCALE_BASE - breakLevel(s, 'solidCostDown')
}

export function folioStrengthBonus(s: GameState): number {
  return hasBreak(s, 'foliosStronger') ? 1.5 : 1
}

export function autobuyerSpeedFactor(s: GameState): number {
  return hasBreak(s, 'autoFaster') ? 0.5 : 1
}

/** IN ONE MOTION, which is AD's autobuyMaxDimboosts. */
export function bulkResetsUnlocked(s: GameState): boolean {
  return hasBreak(s, 'bulkResets')
}

/**
 * What a Wager has to be worth before the autobuyer calls it.
 *
 * Before the wall comes down this is nothing: a Wager pays exactly one chip
 * whenever it is called, so waiting buys nothing and AD agrees. Its
 * `willInfinity` opens `if (!player.break ...) return true`, crunching the
 * moment it can. Past the wall it switches to comparing the payout against a
 * threshold, `gainedInfinityPoints().gte(this.amount)`, and that is the whole
 * reason AD's post-break antimatter runs far past 1.8e308: the run is banking
 * an overshoot rather than cashing out at the first opportunity.
 *
 * Ours did not, so every Wager after the break paid the same 1.78 chips it
 * paid before it and the grid stayed out of reach forever.
 */
export function wagerThreshold(s: GameState): Decimal {
  const raw = s.autobuyers[WAGER_AUTOBUYER]?.amount
  return new Decimal(raw == null ? 1 : raw).max(1)
}

export function autoWagerReady(s: GameState): boolean {
  if (!s.broke) return true
  return chipsFrom(s).gte(wagerThreshold(s))
}

/**
 * The threshold climbs with the payout, so it does not have to be retyped
 * every time the multiplier doubles. AD's `increaseWithMult`, bumped from
 * `infinity-upgrades.js` on exactly the same event: buying the chip
 * multiplier, `Autobuyer.bigCrunch.bumpAmount(DC.D2.pow(amount))`.
 */
export function bumpWagerThreshold(s: GameState, mult: number): void {
  const a = s.autobuyers[WAGER_AUTOBUYER]
  if (!a || a.riseWithMult === false) return
  a.amount = wagerThreshold(s).times(mult).toString()
}

/** Chips a second from THE RAKE, AD's ipGen wearing our clock. */
export function chipsPerSecond(s: GameState): Decimal {
  const perWager = chipsFrom(s)
  // THE FLOAT, from the chip grid, and THE RAKE, from the break grid. AD keeps
  // both too: passiveGen at a tenth of your best rate, then ipGen at five
  // percent of it a level on top.
  let out = chipsPerSecondFromGrid(s, perWager)
  const n = breakLevel(s, 'chipGen')
  if (n > 0 && Number.isFinite(s.stats.bestWagerMs)) {
    const wagersPerSecond = 1000 / Math.max(INTERVAL_FLOOR, s.stats.bestWagerMs)
    out = out.plus(perWager.times(wagersPerSecond).times(n * 0.05))
  }
  return out
}

/** Used by the automation pane so the wager autobuyer can be levelled. */
export function upgradeWagerAutobuyer(s: GameState): boolean {
  return upgrade(s, WAGER_AUTOBUYER)
}
