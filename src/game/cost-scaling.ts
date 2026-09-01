// The wall on the price, which is what stops a broken run running away.
//
// Straight out of Antimatter Dimensions, `ExponentialCostScaling` in
// src/core/math.js. Every antimatter dimension and tickspeed itself declare
// the same thing:
//
//   new ExponentialCostScaling({
//     baseCost: 1000, baseIncrease: 10,
//     costScale: Player.tickSpeedMultDecrease,
//     scalingCostThreshold: Number.MAX_VALUE })
//
// Below the threshold the price is plain geometric, `base x increase^n`. Above
// it the exponent gains a quadratic term, `0.5 e (e+1) log(scale)` with e the
// purchases past the threshold. That term is the brake. Without it a chain
// that feeds its own rate has nothing to push against: ink buys roll rate,
// roll rate makes ink, and three seconds of holding MAX took one save from a
// million roll upgrades to three billion.
//
// AD puts the threshold at `Number.MAX_VALUE`, which is our WAGER_AT, so the
// scaling begins exactly where the ceiling used to stop the run. That is not a
// coincidence: it is the same number doing the same job, on the price instead
// of on the wallet.
//
// All of it is done in log space with plain doubles. The only Decimals are
// `money.log10()` on the way in and `Decimal.pow10` on the way out, which is
// AD's arrangement and the reason MAX can be O(1).
import Decimal from '../vendor/break-infinity'

export interface CostScale {
  logBase: number
  logMult: number
  logScale: number
  /** Purchases made at the plain geometric price before the brake engages. */
  beforeScaling: number
  discriminant: number
  center: number
}

/**
 * @param baseCost      price of the first purchase
 * @param baseIncrease  the plain geometric ratio, below the threshold
 * @param scale         how much the ratio itself grows per purchase, above it
 * @param threshold     the price at which the brake engages
 */
export function costScale(
  baseCost: number,
  baseIncrease: number,
  scale: number,
  threshold: number,
): CostScale {
  const logBase = Math.log10(baseCost)
  const logMult = Math.log10(baseIncrease)
  const logScale = Math.log10(scale)
  const beforeScaling = Math.ceil((Math.log10(threshold) - logBase) / logMult)
  return {
    logBase,
    logMult,
    logScale,
    beforeScaling,
    discriminant:
      Math.pow(2 * logMult + logScale, 2) -
      8 * logScale * (beforeScaling * logMult + logBase),
    center: -logMult / logScale + beforeScaling + 0.5,
  }
}

/** What the next one costs, with `owned` already bought. AD's calculateCost. */
export function costAt(c: CostScale, owned: number): Decimal {
  const excess = owned - c.beforeScaling
  const log =
    excess > 0
      ? owned * c.logMult + c.logBase + 0.5 * excess * (excess + 1) * c.logScale
      : owned * c.logMult + c.logBase
  return Decimal.pow10(log)
}

export interface Bulk {
  /** How many more to buy. */
  quantity: number
  /** What they cost, together. */
  price: Decimal
}

/**
 * How many the money covers, and what to charge for them. AD's getMaxBought.
 *
 * The linear branch inverts `n logMult + logBase <= logMoney`. Past the
 * threshold the same inequality is quadratic in n, so it takes the positive
 * root, which is where the precomputed discriminant and centre come from.
 *
 * The charge is AD's, and it is an approximation AD flags itself: "this
 * assumes you only have to pay for the most expensive thing you get when you
 * buy in bulk." Below the threshold an exact sum exists and we used to take
 * it; above it there is no closed form for the sum of a quadratic exponent,
 * and a loop is the thing this whole file exists to avoid. Taking the last
 * price throughout keeps one rule rather than two, and the discount it hands
 * back is a fifth of a percent on solids, where the ratio is at least a
 * thousand, and about five percent on the roll rate at twenty.
 */
export function maxBought(
  c: CostScale,
  owned: number,
  money: Decimal,
  perSet: number,
): Bulk | null {
  // Divided so that ten dice are not bought on the price of one, which is what
  // AD's numberPerSet is for.
  const logMoney = money.div(perSet).log10()
  if (!Number.isFinite(logMoney)) return null

  // The 1 + is because the ratio is not applied to the first purchase.
  let total = Math.floor(1 + (logMoney - c.logBase) / c.logMult)
  if (total > c.beforeScaling) {
    const discriminant = c.discriminant + 8 * c.logScale * logMoney
    if (discriminant < 0) return null
    total = Math.floor(c.center + Math.sqrt(discriminant) / (2 * c.logScale))
  }
  if (!Number.isFinite(total) || total <= owned) return null

  // The narrow case AD calls out: the linear branch can land past the
  // threshold where the quadratic one lands short of it, so this is asked
  // again rather than inferred from which branch ran.
  const excess = total - c.beforeScaling
  const logPrice =
    total <= c.beforeScaling + 1
      ? (total - 1) * c.logMult + c.logBase
      : (total - 1) * c.logMult + c.logBase + 0.5 * excess * (excess - 1) * c.logScale

  return {
    quantity: total - owned,
    price: Decimal.pow10(logPrice + Math.log10(perSet)),
  }
}
