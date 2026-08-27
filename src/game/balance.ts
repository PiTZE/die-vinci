// Every tunable constant. Nothing else in the codebase hardcodes a number
// that a balance pass would want to touch.
import Decimal from 'break_infinity.js'
import { SOLID_COUNT } from './solids'

export const TICK_MS = 100
/**
 * Dev keeps its own save. Both channels share one origin, so without this a dev
 * build experimenting with the save format would eat the real one.
 */
export const SAVE_KEY = __CHANNEL__ === 'dev' ? 'leonardos-die-save-dev' : 'leonardos-die-save'

/** Where each channel lives. The switcher navigates between them. */
export const CHANNEL_PATHS = { stable: '/', dev: '/dev/' } as const
export const THEME_KEY = 'leonardos-die-theme'
/** Inline tokens for a theme registered at runtime, so it survives a reload. */
export const THEME_VARS_KEY = 'leonardos-die-theme-vars'
export const SAVE_VERSION = 4
export const AUTOSAVE_MS = 10_000

/** Time away is credited up to this, then stops accruing. */
export const OFFLINE_CAP_S = 8 * 60 * 60

/** Gaps longer than this are simulated rather than run as a single tick. */
export const CATCHUP_AFTER_S = 1

/** And gaps longer than this are worth telling the player about. */
export const AWAY_NOTICE_S = 60

/** Tick budgets the player can pick between. More is finer and slower. */
export const OFFLINE_TICK_CHOICES = [500, 2000, 10000] as const
export const OFFLINE_TICKS_DEFAULT = 2000

/**
 * The Wager threshold: 2^1024, the largest finite double. Antimatter
 * Dimensions breaks at the same number for the same reason.
 */
export const WAGER_AT = new Decimal('1.7976931348623157e308')

/**
 * Exactly the price of one tetrahedron, and the entire bootstrap: buy the
 * first die, roll it, and the chain takes over from there.
 */
export const START_INK = 10

/** Every ten of a solid you buy doubles its multiplier. Straight from AD. */
export const PER_TEN_MULT = new Decimal(2)

// -- roll rate, the tickspeed analogue ------------------------------------
//
// Antimatter Dimensions' exact law, from getTickSpeedMultiplier() in
// src/core/tickspeed.js. The returned value multiplies the interval, so lower
// is faster. Under three galaxies it is a hand-picked base minus 0.02 per
// galaxy; from three it becomes 0.965 to the power of galaxies minus four,
// times 0.8. The magic numbers are theirs, and their own comment calls them
// that: they exist to preserve balance from an older version.

/** Seconds between rolls before any upgrade. */
export const ROLL_INTERVAL_BASE = 1

/**
 * The first automator, which takes the roll off your finger. Priced so it is
 * the thing the opening is for: reachable a few minutes after the second
 * study, and worth every ink, because past a few rolls a second no hand can
 * keep up with the roll rate anyway.
 */
export const AUTOMATOR_AT_STUDIES = 2
export const AUTOMATOR_COST = new Decimal(1e5)

/** A roll resolved by hand or by the automator is the same roll. Below this
 *  many in one frame each die rolls its own face; above it they are applied in
 *  one step at each die's mean face, because nobody can read a thousand dice a
 *  second and the mean is exact in the limit. */
export const ROLLS_DRAWN_INDIVIDUALLY = 12

/** Ink cost of the first roll-rate upgrade, then x10 each. */
export const ROLL_COST_BASE = new Decimal(1000)
/**
 * Antimatter Dimensions charges x10 a level for tickspeed and it holds there.
 * It does not hold here: this chain is nine tiers rather than eight and the
 * faces are taken raw, so ink outruns x10 easily and roll rate can be bought
 * forever. At x10 the whole first Wager was twelve and a half minutes.
 *
 * The response is exponential in this number and there is no shock absorber:
 * x16 is 23 minutes, x18 is 42, x20 is an hour and a half, x25 is most of a
 * day. Anything that changes the chain's output changes what this should be,
 * so re-run `npm run sim` after touching solids, faces or studies.
 */
export const ROLL_COST_MULT = new Decimal(20)

export function rollIntervalMultiplier(folios: number): number {
  if (folios < 3) {
    const base = folios === 0 ? 1 / 1.1245 : folios === 1 ? 1 / 1.11888888 : 1 / 1.11267177
    return Math.max(0.01, base - folios * 0.02)
  }
  return Math.pow(0.965, folios - 4) * 0.8
}

// -- studies, the dimension shift and boost analogue ----------------------
//
// From bulkRequirement() and multiplierToNDTier() in src/core/dimboost.js.
// AD starts with four of its eight dimensions and its first five boosts each
// cost a flat 20 of the highest unlocked one; only once the chain is full does
// the requirement climb, by 15 each. Nine solids with one free is the same
// shape stretched, with the opening four discounted. See EARLY_STUDIES.

/** Solids on the table before any study. Studies unlock the rest. */
export const SOLIDS_AT_START = 1
export const STUDIES_THAT_UNLOCK = SOLID_COUNT - SOLIDS_AT_START

/** The study at which the chain is full and requirements start climbing. */
const FIRST_CLIMBING_STUDY = STUDIES_THAT_UNLOCK + 1
const STUDY_CLIMB = 15

/**
 * The first study is cheaper than the rest.
 *
 * Antimatter Dimensions charges a flat 20 for every dimension shift, but it
 * hands you four dimensions to start with. Here the table opens with one die,
 * so that flat 20 sat between a new player and a chain that does anything at
 * all. Only the first one is discounted; from the second the schedule is AD's.
 */
const EARLY_STUDIES = 1
const EARLY_STUDY_REQUIREMENT = 10

/** Which solid the nth study is measured against. n is 1-based. */
export function studyTier(n: number): number {
  return Math.min(SOLIDS_AT_START + n - 1, SOLID_COUNT)
}

/** How many of that solid the nth study costs. */
export function studyRequirement(n: number): number {
  if (n <= EARLY_STUDIES) return EARLY_STUDY_REQUIREMENT
  if (n < FIRST_CLIMBING_STUDY) return 20
  return 20 + (n - FIRST_CLIMBING_STUDY) * STUDY_CLIMB
}

/**
 * A study's multiplier reaches down the chain, not across all of it. With s
 * studies, solid `tier` gets 2^(s + 1 - tier), never below 1. So the first
 * study doubles only the tetrahedra, and the deep solids are the last to
 * benefit. This is AD's multiplierToNDTier exactly.
 */
export const STUDY_POWER = 2

// -- folios, the antimatter galaxy analogue -------------------------------

/** From Galaxy.baseCost and Galaxy.costMult in src/core/galaxy.js. */
export const FOLIO_BASE = 80
export const FOLIO_COST_MULT = 60

export function folioRequirement(owned: number): number {
  return FOLIO_BASE + FOLIO_COST_MULT * owned
}
