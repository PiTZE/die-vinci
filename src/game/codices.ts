// The codices. Antimatter Dimensions calls these Infinity Dimensions, and the
// reason to have them is the reason AD has them.
//
// Everything below the wall resets at a Wager, so nothing compounds across the
// break. A broken run rebuilt its ladder, hit 1.8e308, cashed out and did it
// again: Wagers plateaued at 2.4 seconds and no amount of tuning moved that,
// because there was no quantity anywhere in the game that grew *while a run
// was happening* and survived the reset that ended it.
//
// AD's answer is a second chain bought with the prestige currency. From
// src/core/dimensions/infinity-dimension.js: eight tiers, each purchase gives
// ten, ID(n) feeds ID(n-1) and ID1 feeds Infinity Power, and
// antimatter-dimension.js line 15 spends it,
//
//   multiplier = multiplier.times(Currency.infinityPower.value.pow(
//     InfinityDimensions.powerConversionRate).max(1));
//
// with the rate at 7. The purchases persist through a crunch; the amounts and
// the power do not. So a run starts with the chain it bought and then grows it,
// and the longer the run goes the harder the whole table below it multiplies.
// That is the shape that was missing here.
//
// The other half of AD's design is the unlock schedule, and it is the half
// that actually fixes the plateau. Its eight thresholds are 1e1100, 1e1900,
// 1e2400, 1e10500, 1e30000, 1e45000, 1e54000 and 1e60000 of antimatter in a
// run, every one of them far past the 1.8e308 wall. That is why AD's broken
// runs go so far past it and ours did not: past the wall there was nothing
// there. Now there is a ladder.
//
// What they are here: Leonardo's actual notebooks, in rough order of size, so
// the deepest is the Atlanticus at its 1119 leaves. They produce esperienza,
// which is his own word. "La sapienza è figliola della sperienza" -- wisdom is
// the daughter of experience -- and experience for him is the thing that
// accumulates from doing the work and then makes every later piece of work
// better. That is what this quantity does, so it is what it is called.
import Decimal from 'break_infinity.js'
import { CODEX_CONVERSION } from './balance'
import type { GameState } from '../state'

export interface CodexDef {
  /** 1-based. 1 produces esperienza; the rest produce the tier below. */
  idx: number
  id: string
  short: string
  name: string
  /** The formal name and where the manuscript is now, for the tooltip. The
   *  row itself has width for the distinguishing word and nothing more. */
  full: string
  /** Chips for the first purchase. */
  baseCost: Decimal
  /** And what each one after it multiplies the price by. */
  costMult: Decimal
  /** What each purchase multiplies this codex's own output by. */
  power: number
  /** Ink a single run has to have earned, ever, before this one opens. */
  unlockAt: Decimal
}

/**
 * AD's own numbers, compressed onto our currency.
 *
 * Its power multipliers are [50, 30, 10, 5, 5, 5, 5, 5] and those are taken
 * unchanged, with a ninth 5 on the end the way solids.ts extends its own cost
 * table by one. Neither the costs nor the thresholds are AD's, and they could
 * not be: its Infinity Points reach 1e280 for ID8, and its first Infinity
 * Dimension wants 1e1100 antimatter in a run where a broken run here creeps to
 * 1e363 in three hours with the break grid barely started. Both columns are
 * measured onto this game instead. What is kept is the shape: a first rung
 * just past the wall, a base that climbs faster than the multiplier, and
 * thresholds spaced so depth gates the opening of the layer and chips gate the
 * rest of it.
 *
 * Where the first rung comes from, measured: a bare broken save plateaus at
 * 1e363 deep and about 3e4 chips, and stays there, because the payout
 * threshold only rises when the chip multiplier is bought and that costs
 * 10^(n+1). 1e340 and 1e4 chips both sit inside that plateau, so the first
 * codex is the thing that ends it rather than another thing behind it.
 */
const TABLE: [string, string, string, string, number, number, number, string][] = [
  // id, short, row name, the formal name and where it is, base cost, cost
  // multiplier, power per purchase, and the depth in one run that opens it.
  ['trivulzianus', 'TRIV', 'Trivulzianus', 'Codex Trivulzianus, Castello Sforzesco, Milan',
    1e4, 1e2, 50, '1e340'],
  ['forster', 'FORS', 'Forster', 'Codices Forster I-III, Victoria and Albert, London',
    1e6, 1e3, 30, '1e600'],
  ['ashburnham', 'ASHB', 'Ashburnham', 'Codex Ashburnham, Institut de France, Paris',
    1e9, 1e4, 10, '1e1100'],
  ['volo', 'VOLO', 'Volo degli uccelli', 'Codex on the Flight of Birds, Biblioteca Reale, Turin',
    1e13, 1e5, 5, '1e2500'],
  ['madrid', 'MADR', 'Madrid', 'Codices Madrid I and II, Biblioteca Nacional, Madrid',
    1e18, 1e6, 5, '1e6000'],
  ['arundel', 'ARUN', 'Arundel', 'Codex Arundel, British Library, London',
    1e24, 1e8, 5, '1e15000'],
  ['windsor', 'WIND', 'Windsor', 'The Windsor sheets, Royal Collection, Windsor',
    1e31, 1e10, 5, '1e40000'],
  ['leicester', 'LEIC', 'Leicester', 'Codex Leicester, privately held',
    1e39, 1e12, 5, '1e100000'],
  ['atlanticus', 'ATLA', 'Atlanticus', 'Codex Atlanticus, 1119 leaves, Biblioteca Ambrosiana, Milan',
    1e48, 1e15, 5, '1e250000'],
]

export const CODICES: CodexDef[] = TABLE.map(
  ([id, short, name, full, baseCost, costMult, power, unlockAt], i) => ({
    idx: i + 1,
    id,
    short,
    name,
    full,
    baseCost: new Decimal(baseCost),
    costMult: new Decimal(costMult),
    power,
    unlockAt: new Decimal(unlockAt),
  }),
)

export const CODEX_COUNT = CODICES.length

/** Each purchase hands over ten, which is AD's rule and the reason for the
 *  power multiplier being per purchase rather than per ten owned. */
export const PER_PURCHASE = 10

// -- unlocking ------------------------------------------------------------

/**
 * How deep a run has to go before the next one opens.
 *
 * Read against the deepest a single run has ever earned, which is our
 * `records.thisEternity.maxAM`. AD measures within an eternity because an
 * eternity is what takes the unlocks away again; nothing here does, so the
 * high-water mark is the whole save's.
 */
export function codexUnlockAt(idx: number): Decimal {
  return CODICES[idx - 1]?.unlockAt ?? new Decimal(Infinity)
}

/** How many are open. They open in order, as AD's unlockNext does. */
export function openCodices(s: GameState): number {
  return Math.min(CODEX_COUNT, s.codexOpen ?? 0)
}

export function codicesUnlocked(s: GameState): boolean {
  return openCodices(s) > 0
}

/**
 * Opens whatever the run has now earned the right to, and says how many.
 *
 * Called from the tick rather than from a button. AD asks for a click on the
 * first few and then hands out `autoUnlockID` at an eternity milestone; there
 * is no eternity here to hang that on, and a button whose only state is "press
 * me" is not a decision.
 */
export function openEarnedCodices(s: GameState): number {
  if (!s.broke) return 0
  let opened = 0
  while (openCodices(s) < CODEX_COUNT && s.deepestInk.gte(codexUnlockAt(openCodices(s) + 1))) {
    s.codexOpen = openCodices(s) + 1
    opened += 1
  }
  return opened
}

// -- buying ---------------------------------------------------------------

export function codexCost(s: GameState, idx: number): Decimal {
  const def = CODICES[idx - 1]
  if (!def) return new Decimal(Infinity)
  return def.baseCost.times(Decimal.pow(def.costMult, s.codices[idx - 1]?.bought ?? 0))
}

export function canBuyCodex(s: GameState, idx: number): boolean {
  if (idx > openCodices(s)) return false
  return s.chips.gte(codexCost(s, idx))
}

export function buyCodex(s: GameState, idx: number): boolean {
  if (!canBuyCodex(s, idx)) return false
  s.chips = s.chips.minus(codexCost(s, idx))
  const c = s.codices[idx - 1]
  c.bought += 1
  c.amount = c.amount.plus(PER_PURCHASE)
  return true
}

/**
 * Every one the chips cover, in one step.
 *
 * The price of a run of purchases is a plain geometric series, so both halves
 * of it are closed form and break_infinity ships them. AD does the same thing
 * through its own LinearCostScaling in `buyMax`, and unlike the solids there
 * is no quadratic term here to spoil it.
 */
export function buyCodexMax(s: GameState, idx: number): boolean {
  if (idx > openCodices(s)) return false
  const def = CODICES[idx - 1]
  const c = s.codices[idx - 1]
  let n = Decimal.affordGeometricSeries(s.chips, def.baseCost, def.costMult, c.bought).toNumber()
  if (!Number.isFinite(n) || n < 1) return false
  let price = Decimal.sumGeometricSeries(n, def.baseCost, def.costMult, c.bought)
  // The two calls disagree by a rounding at the boundary often enough to
  // matter, and disagreeing the wrong way means MAX quietly buys nothing at
  // the exact moment it can afford one.
  if (s.chips.lt(price) && n > 1) {
    n -= 1
    price = Decimal.sumGeometricSeries(n, def.baseCost, def.costMult, c.bought)
  }
  if (s.chips.lt(price)) return false
  s.chips = s.chips.minus(price)
  c.bought += n
  c.amount = c.amount.plus(n * PER_PURCHASE)
  return true
}

/**
 * AD's own order, and it is not the order the table downstairs uses.
 *
 * From InfinityDimensions.buyMax:
 *
 *   // Try to buy single from the highest affordable new dimensions
 *   unlockedDimensions.slice().reverse().forEach(dimension => {
 *     if (dimension.purchases === 0) dimension.buySingle();
 *   });
 *   // Try to buy max from the lowest dimension (since lower dimensions have
 *   // bigger multiplier per purchase)
 *   unlockedDimensions.forEach(dimension => dimension.buyMax(false));
 *
 * Both halves earn their place. Deepest-first alone is what maxAll does, and
 * here it is wrong: run against nine open codices and a full wallet it bought
 * three Atlanticus and nothing else, leaving every rung between it and the
 * esperienza empty, so the output had to cascade nine tiers from a single
 * source and arrived at 0.0000000005 a second. One of each first fills the
 * chain; max from the shallowest then spends the rest where a purchase is
 * worth the most, because the first codex multiplies its own output by fifty
 * and the deepest by five.
 */
export function buyAllCodices(s: GameState): boolean {
  const open = openCodices(s)
  let did = false
  for (let idx = open; idx >= 1; idx--) {
    if (s.codices[idx - 1].bought === 0 && buyCodex(s, idx)) did = true
  }
  for (let idx = 1; idx <= open; idx++) {
    if (buyCodexMax(s, idx)) did = true
  }
  return did
}

export function canBuyAnyCodex(s: GameState): boolean {
  for (let idx = 1; idx <= openCodices(s); idx++) if (canBuyCodex(s, idx)) return true
  return false
}

// -- what they produce ----------------------------------------------------

/** One codex's own multiplier, which is AD's `power^floor(baseAmount/10)`. */
export function codexMultiplier(s: GameState, idx: number): Decimal {
  const def = CODICES[idx - 1]
  if (!def) return new Decimal(1)
  return Decimal.pow(def.power, s.codices[idx - 1]?.bought ?? 0)
}

export function codexPerSecond(s: GameState, idx: number): Decimal {
  if (idx > openCodices(s)) return new Decimal(0)
  return (s.codices[idx - 1]?.amount ?? new Decimal(0)).times(codexMultiplier(s, idx))
}

/**
 * AD's tick, at AD's rates: the chain feeds itself on a ten-second clock and
 * only the last step, into the currency, runs per second.
 *
 *   for (let tier = 8; tier > 1; tier--)
 *     InfinityDimension(tier).produceDimensions(InfinityDimension(tier - 1), diff / 10);
 *   InfinityDimension(1).produceCurrency(Currency.infinityPower, diff);
 *
 * The ten is what keeps a nine-deep chain from going vertical in the first
 * minute, and it is the only reason the ladder of unlock thresholds above is
 * a climb rather than a formality.
 */
export function tickCodices(s: GameState, dt: number): void {
  const open = openCodices(s)
  if (open < 1) return
  // Deltas off the amounts at the start, as produce() does downstairs, so a
  // codex cannot spend what it only received this same tick.
  const before = s.codices.map((c) => c.amount)
  for (let idx = open; idx >= 2; idx--) {
    const made = before[idx - 1].times(codexMultiplier(s, idx)).times(dt / 10)
    s.codices[idx - 2].amount = s.codices[idx - 2].amount.plus(made)
  }
  s.esperienza = s.esperienza.plus(before[0].times(codexMultiplier(s, 1)).times(dt))
}

/**
 * What the codices are worth to every solid on the table.
 *
 * AD's line, AD's exponent. `powerConversionRate` is 7 before any glyph
 * touches it, and it is applied to each antimatter dimension separately, so it
 * compounds through the whole chain exactly as it does here.
 */
export function esperienzaMultiplier(s: GameState): Decimal {
  if (s.esperienza.lte(1)) return new Decimal(1)
  return s.esperienza.pow(CODEX_CONVERSION).max(1)
}

/**
 * A Wager keeps the purchases and takes back everything they made.
 *
 * AD's `InfinityDimensions.resetAmount`, called from big-crunch.js: the power
 * is reset and every dimension drops to its baseAmount, which is the ten per
 * purchase and nothing else. This is the whole reason the chain is a
 * progression rather than a one-off: what you bought is permanent, what it
 * grew into is not.
 */
export function resetCodices(s: GameState): void {
  for (let i = 0; i < s.codices.length; i++) {
    s.codices[i].amount = new Decimal(s.codices[i].bought * PER_PURCHASE)
  }
  s.esperienza = new Decimal(1)
}
