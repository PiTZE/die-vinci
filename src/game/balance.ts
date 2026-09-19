// Every tunable constant. Nothing else in the codebase hardcodes a number
// that a balance pass would want to touch.
import Decimal from '../vendor/break-infinity'
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
export const SAVE_VERSION = 7
export const AUTOSAVE_MS = 10_000

/** Time away is credited up to this, then stops accruing. */
export const OFFLINE_CAP_S = 8 * 60 * 60

/** Gaps longer than this are simulated rather than run as a single tick. */
export const CATCHUP_AFTER_S = 1

/** And gaps longer than this are worth telling the player about. */
export const AWAY_NOTICE_S = 60

/** Tick budgets the player can pick between. More is finer and slower. */
export const OFFLINE_TICK_CHOICES = [500, 2000, 10000] as const

/**
 * How often the readouts are allowed to redraw, in milliseconds.
 *
 * The game ticks, the dice tumble and the ticker crawls at full frame rate
 * whatever this says. This is only about how often the numbers on screen are
 * rewritten, which is what Antimatter Dimensions offers the same setting for.
 */
export const UI_MS_CHOICES = [16, 50, 100, 250, 500] as const
/**
 * Ten times a second.
 *
 * It defaulted to every frame, which is fine for the first hour and wrong for
 * the rest of the game. Measured at ten studies and 6.6K rolls a second, on a
 * table of nine: at every frame the ninetieth-percentile frame took 35ms and
 * the worst 99ms, so the dice hitched roughly once every ten frames. At 100ms
 * the same state gives 20ms and 51ms. The numbers themselves are also past
 * reading at that speed, and a phone has less to spend than the box those were
 * measured on. Every frame is still a choice, one step away in OPTIONS.
 */
export const UI_MS_DEFAULT = 100
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
 * The first automator, which takes the roll off your finger.
 *
 * It arrives with the first Wager and costs a point, which makes the whole
 * first run manual: you hold ROLL, and holding gives exactly the roll rate
 * because a roll refuses to start while one is in the air. The automator buys
 * you your finger back, not throughput. That is the "start slowly and then
 * automate everything" arc, and it is where Antimatter Dimensions puts its
 * autobuyers too.
 */
/**
 * The dice a run starts with once the automator is owned.
 *
 * Ten, because ten is the group the x2 sits on and because the solid1 autobuyer
 * defaults to its ten mode, which will not buy until it can afford all ten. A
 * smaller seed leaves that autobuyer still waiting.
 */
export const AUTOMATOR_SEED = 10

export const AUTOMATOR_COST = 1

// -- auto-roll, one die at a time -----------------------------------------
//
// The first run used to be twenty-four minutes of holding one button, because
// the automator sits behind the Wager and holding is the only way to roll. AD
// never asks for that: its first Infinity is passive and the thing you are
// waiting on is a number, not your finger.
//
// So the finger comes back a die at a time. Buying auto-roll for a die means
// that die takes part in the roll whether or not you are pressing, and it
// unlocks when the die below it on the chain does: open the d6 and you can
// automate the d4, open the d8 and you can automate the d6. The d72 has no
// tenth solid under it, so it opens on itself, once the whole chain is on the
// table, and it costs more than the eight below it put together.
//
// It buys no throughput. Holding already gives exactly the roll rate, because
// a roll refuses to start while one is in the air, so what this changes is
// whether you have to be there. What it costs is ink that would otherwise be
// dice, which is the first real trade layer 0 has ever offered.
//
// The ladder is measured against when each study actually lands and what the
// ink curve is doing at the time: the eight unlocking studies come at 12s,
// 1m51s, 2m49s, 3m19s, 3m53s, 4m21s, 4m44s and 5m04s, and a study clears the
// ink, so each price is set against the rebuild rather than against the peak
// before it.
export const AUTO_ROLL_COSTS: Decimal[] = [
  new Decimal(1e4),
  new Decimal(1e7),
  new Decimal(1e11),
  new Decimal(1e16),
  new Decimal(1e22),
  new Decimal(1e30),
  new Decimal(1e40),
  new Decimal(1e52),
  // The d72. Past the eighth by the same step the ladder has been taking, and
  // the last thing ink ever buys you: after it there is nothing left on the
  // table that waits for a finger.
  new Decimal(1e66),
]

/**
 * What the first Wager hands over, on the house.
 *
 * The automator used to be a purchase, one chip, and the point of it was your
 * hands back. The ladder sells that a die at a time now, so charging again for
 * the same thing at the prestige would be charging twice. A Wager grants the
 * whole ladder instead, for good, and it is the milestone it always was: the
 * run before it is played by hand, every run after it is not.
 *
 * The ink is the other half. A Wager clears the table, and a table that rolls
 * itself with one tetrahedron on it and ten ink is a table that takes a minute
 * to say anything. This is a running start, not a windfall: it buys into the
 * third tier and is gone inside the first few seconds of a run that ends at
 * 1.8e308.
 */
export const WAGER_INK_GIFT = new Decimal(1e6)

export const ROLLS_DRAWN_INDIVIDUALLY = 12

/**
 * Below this the dice are not merely too fast to read, they are too fast to
 * see at all: a digit changing twenty times a second is one grey smudge, and
 * the honest number to print in its place is the die's average.
 *
 * Above it the column shows real faces, changing as fast as the refresh rate
 * allows. It is a blur rather than a reading, but a blur is what the dice
 * themselves are doing and the two should agree.
 */
export const FACE_AVERAGE_S = 0.05

/**
 * Seconds for the printed number to travel from the last face it landed on to
 * the average, once it crosses that line.
 *
 * A d12 that landed on 9 reads 9, then walks down to 6 rather than cutting to
 * it. The snap was the tell that the number had stopped being a reading and
 * become a statistic, and it happened at the exact moment the table got fast.
 *
 * Long, and deliberately. At nine tenths of a second it was over before the
 * eye had found it, which reads as the number having jumped after all: the
 * whole point is that you watch it go.
 */
export const FACE_SETTLE_S = 2.6

/** Ink cost of the first roll-rate upgrade, then x10 each. */
export const ROLL_COST_BASE = new Decimal(1000)
/**
 * x10 a level, which is Antimatter Dimensions' own number for tickspeed.
 *
 * It was x20 for a long time and the reason was real: nine tiers taking faces
 * raw outrun x10, so roll rate could be bought forever. What made x20 wrong is
 * that the price stops being a round number. costAt works in log space, so a
 * multiplier of ten makes every level exactly one order of magnitude, and the
 * ladder reads 1e3, 1e4, 1e5 and on up to 1e130 with 1e131 next. At x20 those
 * became 2e3, 4e4, 8e5, and nothing in the column was a number anybody chose.
 * AD has the same base of 1000 and the same increase of 10 for exactly this.
 *
 * This is the only dial that sets how long a run lasts and the response is
 * exponential with no shock absorber. Measured with the study climb in:
 *
 *     x20  5h20m     x30  39h40m     x33  66h55m
 *
 * Ten on the dial is seven and a half times the run, which is worth
 * remembering before nudging it. Anything that changes the chain's output
 * changes what this should be, so re-run `npm run sim` after touching solids,
 * faces or studies.
 */
export const ROLL_COST_MULT = new Decimal(10)

/**
 * AD's curve, exactly as getTickSpeedMultiplier() draws it.
 *
 * Two regimes split on the galaxy count. Under three it is linear: a base that
 * improves slightly per galaxy, three hardcoded values its own source calls
 * magic numbers, minus a flat 0.02 each. From three on it is exponential,
 * 0.8 x 0.965^(n-4), which is what stops galaxies running away.
 */
function folioShape(folios: number): number {
  if (folios < 3) {
    const base = folios === 0 ? 1 / 1.1245 : folios === 1 ? 1 / 1.11888888 : 1 / 1.11267177
    return base - folios * 0.02
  }
  return Math.pow(0.965, folios - 4) * 0.8
}

const SHAPE_AT_ZERO = folioShape(0)

/**
 * What one roll-rate level is worth before any folio.
 *
 * AD's is 1/1.1245, an 11% cut to the interval a level. That is right for
 * eight dimensions and wrong for nine tiers taking faces raw: at x10 a level,
 * ten times the ink bought fourteen percent more rate, the chain paid it back
 * at once, and the first Wager fell to 45 minutes.
 *
 * The whole curve is re-based rather than this one number being swapped, so
 * every folio still helps in AD's proportion. Swapping only the first constant
 * would leave a flat 0.02 a folio being subtracted from 0.97 and the three-
 * folio regime dropping straight to 0.8, which is a cliff rather than a curve.
 *
 * It is a sharp dial and it is the one holding the pace, so the measurements
 * are worth keeping. Against the ten-a-study ladder and folios at ninety:
 *
 *     1.03   never finishes, the seventh study alone takes 25h
 *     1.09   folio 1 at 8h26m, Wager at 11h06m
 *     1.10   folio 1 at 3h52m, Wager at 4h56m
 *     1.11   folio 1 at 2h04m, Wager at 2h42m
 *
 * A hundredth either way roughly halves or doubles the run. Re-sim after
 * touching anything about the chain.
 */
const ROLL_LEVEL = 1 / 1.09

export function rollIntervalMultiplier(folios: number): number {
  return Math.max(0.01, (folioShape(folios) / SHAPE_AT_ZERO) * ROLL_LEVEL)
}

// -- studies, the dimension shift and boost analogue ----------------------
//
// From bulkRequirement() and multiplierToNDTier() in src/core/dimboost.js.
// AD starts with four of its eight dimensions and its first five boosts each
// cost a flat 20 of the highest unlocked one; only once the chain is full does
// the requirement climb, by 15 each. Nine solids with one free is the same
// shape stretched, with the opening one discounted. See EARLY_STUDIES.

/** Solids on the table before any study. Studies unlock the rest. */
export const SOLIDS_AT_START = 1
export const STUDIES_THAT_UNLOCK = SOLID_COUNT - SOLIDS_AT_START

/**
 * Ten more each, the whole way down and past the end of the chain.
 *
 *     d4 10, d6 20, d8 30, d12 40, d14 50, d20 60, d26 70, d32 80,
 *     then 90, 100, 110 and on, all measured against the d72.
 *
 * Antimatter Dimensions does not do this. It charges a flat 20 for every shift
 * that unlocks a dimension and only climbs, by 15, once the chain is full. A
 * flat number cannot work here because this chain compounds much harder than
 * AD's: nine tiers taking faces raw, so each solid opened makes the next
 * twenty cheaper than the last one was, and the whole table used to arrive
 * inside five minutes with the gaps shrinking the whole way.
 *
 * What was here before was that same fight fought with a geometric climb of
 * 1.25 rounded to fives, which worked and read as arbitrary. This is the same
 * shape drawn with a ruler, and it is strictly linear, which is worth more
 * than it looks: the reset autobuyers extrapolate how many they can take from
 * two samples of the ladder, and a straight line makes that exact instead of
 * approximate.
 */
const STUDY_STEP = 10

/** Which solid the nth study is measured against. n is 1-based. */
export function studyTier(n: number): number {
  return Math.min(SOLIDS_AT_START + n - 1, SOLID_COUNT)
}

/** How many of that solid the nth study costs. */
export function studyRequirement(n: number): number {
  return n * STUDY_STEP
}

export const STUDY_POWER = 2

// -- melt, the dimensional sacrifice analogue -----------------------------
//
// Antimatter Dimensions destroys dimensions one through seven and multiplies
// the eighth, gated behind a challenge. Here the gate is a card: XIII Death
// unlocks it, and the card's level is what makes it worth doing.
//
// The multiplier replaces rather than stacks, which is what makes when to melt
// a decision instead of a button to hold. Melting early for a small number
// costs you nothing but gains you nothing either.

/** Tetrahedra needed before a melt is worth offering. */
export const MELT_AT = new Decimal(1e6)

/** The multiplier from melting `d4` tetrahedra at Death level `level`. */
/**
 * Folios held before melting is offered at all.
 *
 * Antimatter Dimensions opens Dimensional Sacrifice on the fifth Dimension
 * Boost, `DimBoost.purchasedBoosts > 4`, which lands partway through a first
 * Infinity once the chain is complete. Ours used to sit behind XIII Death,
 * which is a card, which is behind the Wager, so a first run here had one
 * fewer mechanic than AD's does and nothing at all arrived between the chain
 * filling and the run ending.
 *
 * A folio is the closer gate in practice. Measured, the chain completes at
 * 6h25m and the first folio lands at 7h30m, which is the same beat AD puts
 * sacrifice on.
 */
export const MELT_AT_FOLIOS = 1

/** What melting is worth with no card at all, and what each level of XIII
 *  Death adds to it. The card makes melting stronger now rather than making
 *  it exist. */
const MELT_BASE = 0.3
const MELT_PER_LEVEL = 0.6

export function meltMultiplier(d4: Decimal, level: number): Decimal {
  if (d4.lte(1)) return new Decimal(1)
  // The log keeps it from running away with the chain: a thousand times the
  // tetrahedra is a little over twice the multiplier, not a thousand times it.
  const reach = Math.pow(Math.max(0, d4.log10()), 1.4)
  return new Decimal(1).plus(reach * (MELT_BASE + level * MELT_PER_LEVEL))
}

// -- folios, the antimatter galaxy analogue -------------------------------

/**
 * Ninety more each: 90 of the d72, then 180, then 270.
 *
 * AD's own are Galaxy.baseCost 80 and Galaxy.costMult 60, so 80 + 60n, and it
 * stays linear only to its hundredth galaxy. Past that requirementAt adds
 * n^2 + n for distant galaxies and multiplies by 1.002^n for remote ones.
 * Neither of those is here, so this is linear the whole way, which is the part
 * of AD's shape a run this length actually reaches.
 */
export const FOLIO_BASE = 90
export const FOLIO_COST_MULT = 90

export function folioRequirement(owned: number): number {
  return FOLIO_BASE + FOLIO_COST_MULT * owned
}

/**
 * Every arcanum caps here, and none of them carries its own number any more.
 *
 * A uniform cap is a thing a player can hold in their head: nine levels, nine
 * solids, nine to a row in the archive. It used to be ten with three cards
 * carrying their own lower number, which meant the answer to "how far does
 * this go" was "look it up".
 */
export const ARCANA_MAX_LEVEL = 9

// -- I The Magician, which loads the dice ---------------------------------
//
// `rollFace` has taken a bias since it was written, and nothing moved it until
// this card. A uniform draw raised to the power 1 - b: at 0 every face is
// equally likely, and as b approaches 1 the die always shows its maximum.
//
// The level curve saturates rather than stepping, which is the one place a
// card here departs from the plain `1 + L x k` every other one uses. A
// multiplier has no ceiling and a bias does: it cannot pass 1, and at 1 the
// die is not a die. A linear step either wastes the last levels against the
// cap or wastes the first ones being imperceptible, so this closes a fixed
// share of the gap to the cap per level. Every level is worth taking and none
// of them reaches the end.
//
// What it is worth measured: six Wagers in 1h25m against 1h29m taking no card
// at all, which puts it beside The Fool and Wheel of Fortune, the other two
// mid-tier cards. The effect it replaced was worth one minute in the same
// test, at any magnitude.

/** Share of the remaining gap to the cap that one level closes. */
export const MAGICIAN_BIAS_RATE = 0.25

/** Where the loading stops. Nine levels reach 0.79 of it. */
export const MAGICIAN_BIAS_CAP = 0.85

export function magicianBias(level: number): number {
  if (level <= 0) return 0
  return MAGICIAN_BIAS_CAP * (1 - Math.pow(1 - MAGICIAN_BIAS_RATE, level))
}

// -- the codices, which are Infinity Dimensions ---------------------------

/**
 * The exponent esperienza is raised to before it multiplies a solid.
 *
 * Antimatter Dimensions' `InfinityDimensions.powerConversionRate`, which is 7
 * before any glyph touches it, applied per dimension so it compounds through
 * the chain. See codices.ts for the rest of it.
 */
export const CODEX_CONVERSION = 7

/**
 * How far into a run the study and folio autobuyers stop resetting it.
 *
 * A reset clears what the run has earned as well as the table, so one taken
 * in the last stretch throws away the climb rather than shortening it. The
 * simulation's own player stops at 1e285, which on the log scale the run bar
 * uses is 0.925, and AD players stop taking galaxies and push for Infinity
 * for the same reason. This is that rule, given to the two autobuyers that
 * would otherwise keep pressing.
 *
 * Only applies while the ceiling holds. Past the wall a run overshoots on
 * purpose and lives most of its life above this line, and these two are how
 * the ladder gets rebuilt at all.
 */
export const RESET_HOLD_AT = 0.925

/**
 * How long the second challenge takes to come back to full after a purchase.
 *
 * AD's own number, and its own shape: chall2Pow goes to zero on a purchase and
 * climbs by diff / 100 / 1800 a tick until it reaches one, which is a linear
 * three minutes, with production multiplied by it the whole way.
 */
export const HALT_MS = 3 * 60_000
