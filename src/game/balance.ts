// Every tunable constant. Nothing else in the codebase hardcodes a number
// that a balance pass would want to touch.
import Decimal from 'break_infinity.js'

export const TICK_MS = 100
export const SAVE_KEY = 'leonardos-die-save'
export const THEME_KEY = 'leonardos-die-theme'
/** Inline tokens for a theme registered at runtime, so it survives a reload. */
export const THEME_VARS_KEY = 'leonardos-die-theme-vars'
export const SAVE_VERSION = 1
export const AUTOSAVE_MS = 10_000

/** Offline progress is granted up to this, then stops accruing. */
export const OFFLINE_CAP_S = 8 * 60 * 60

/**
 * The Wager threshold: 2^1024, the largest finite double. Antimatter
 * Dimensions breaks at the same number for the same reason.
 */
export const WAGER_AT = new Decimal('1.7976931348623157e308')

/**
 * Exactly the price of one tetrahedron. There is no click button, the same as
 * in Antimatter Dimensions, so this is the entire bootstrap: buy the first die
 * and the chain takes over.
 */
export const START_INK = 10

/** Every ten of a solid you buy doubles its multiplier. Straight from AD. */
export const PER_TEN_MULT = new Decimal(2)

// -- roll rate, the tickspeed analogue ------------------------------------

// Tuned against a perfect-play simulation: these reach the Wager in about 57
// simulated minutes, which lands a real first run somewhere near two hours.
// The curve is deliberately steep at the top. Layer 0 running out of road at
// 1e308 is the reason the Wager exists.

/** Seconds between rolls before any upgrade. */
export const ROLL_INTERVAL_BASE = 1
/** Each upgrade multiplies the interval by this. Folios push it lower. */
export const ROLL_POWER_BASE = 0.85
export const ROLL_POWER_PER_FOLIO = 0.008
export const ROLL_POWER_FLOOR = 0.6
/** Ink cost of the first roll-rate upgrade, then x10 each. */
export const ROLL_COST_BASE = new Decimal(1000)
export const ROLL_COST_MULT = new Decimal(10)

// -- studies, the dimension shift/boost analogue --------------------------

/**
 * You start with three solids on the table and studies unlock the other three,
 * which is the same half-and-half split AD uses across its eight dimensions.
 * Studies past that hand out flat multipliers instead.
 */
export const SOLIDS_AT_START = 3
export const STUDIES_THAT_UNLOCK = 3

/** How many of your highest solid the nth study costs. n is 1-based. */
export function studyRequirement(n: number): number {
  return 20 + 14 * (n - 1)
}
/** Multiplier to every solid, per study owned past the unlocking ones. */
export const STUDY_MULT = new Decimal(2)

// -- folios, the antimatter galaxy analogue -------------------------------

export function folioRequirement(owned: number): number {
  return 70 + 45 * owned
}
