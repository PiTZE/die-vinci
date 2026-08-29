// The Wager: Antimatter Dimensions' Infinity, named for Pacioli's interrupted
// game of dice.
//
// AD triggers at 1.7976931348623157e308, the largest finite double, and before
// Break Infinity pays exactly one Infinity Point per crunch:
//
//   let ip = player.break
//     ? Decimal.pow10(maxAM.log10() / div - 0.75)
//     : new Decimal(308 / div)          // div is 308, so this is 1
//
// Break Infinity does not exist here yet, so a Wager pays one Point, and the
// upgrade grid is priced for that: seven of its eleven cost a single Point.
import Decimal from 'break_infinity.js'
import { START_INK, WAGER_AT } from './balance'
import { unlock } from './autobuyers'
import { byId } from './challenges'
import { drawOffer } from './tarot'
import { chipsFrom } from './breaks'
import { startingFolios, startingStudies } from './upgrades'
import { registerWager, seedForAutomator } from './production'
import type { GameState } from '../state'

/**
 * Measured on what this run has earned, not on what it is holding.
 *
 * A study clears the ink, so progress toward the Wager used to be thrown away
 * with it. At 77% of the way there, with nothing left to buy, the only move was
 * a study that reset the bar to nothing: a stretch with no good play in it.
 * inkThisWager only accrues and only clears at a Wager, so a reset costs you
 * the table and the time, which is the point of a reset, but not the run.
 *
 * The halt is deliberately still measured on ink held, over in mustWager. The
 * table is full when the table is full; that is a different statement.
 */
export function canWager(s: GameState): boolean {
  return s.inkThisWager.gte(WAGER_AT)
}

/** What calling it right now pays. Flat one until the wall is broken. */
export function chipsFromWager(s: GameState): Decimal {
  return chipsFrom(s)
}

/** How close this run is to the threshold, 0 to 1, on a log scale. */
export function wagerProgress(s: GameState): number {
  if (s.inkThisWager.lte(1)) return 0
  const p = s.inkThisWager.log10() / WAGER_AT.log10()
  return Math.max(0, Math.min(1, p))
}

/**
 * Resets everything layer 0 owns. Points, the upgrades they bought, and the
 * count of wagers survive, which is what makes the next run faster.
 */
export function doWager(s: GameState): boolean {
  if (!canWager(s)) return false

  s.chips = s.chips.plus(chipsFromWager(s))
  s.wagers += 1
  // The fastest run yet, which two break upgrades read. Measured on wagerMs,
  // the clock doWager is about to reset.
  s.stats.bestWagerMs = Math.min(s.stats.bestWagerMs ?? Infinity, s.stats.wagerMs)

  // Reaching the threshold inside a challenge is what clears it, and clearing
  // it is what unlocks the autobuyer. AD's first challenge is simply reaching
  // Infinity once, so it clears on the first Wager whether or not it was
  // entered deliberately.
  const cleared = s.challengeRunning || 1
  if (!s.challengesDone.includes(cleared)) {
    s.challengesDone.push(cleared)
    const def = byId(cleared)
    if (def) unlock(s, def.awards)
  }
  s.challengeRunning = 0
  s.haltMs = 0

  s.ink = new Decimal(START_INK)
  s.inkThisWager = new Decimal(0)
  // ONE AHEAD and the two behind it, and ALREADY BOUND. AD's skipResets: the
  // next run opens further along than the last one did.
  s.studies = startingStudies(s)
  s.folios = startingFolios(s)
  s.rollUpgrades = 0
  for (const st of s.solids) {
    st.bought = 0
    st.amount = new Decimal(0)
  }
  // The automator survives, the way an Infinity upgrade does. Handing a
  // finished run back a button to press is not a prestige, it is a demotion.
  s.rollStartedAt = 0
  s.rollAccum = 0
  s.faces = s.faces.map(() => 0)
  // The automator leaves a run something to roll, or its own autobuyer waits
  // for ten times a price the empty table can never pay for.
  seedForAutomator(s)
  s.stats.wagerMs = 0
  s.stats.sinceResetMs = 0

  // One draft per Wager. It is offered rather than granted, and it waits in
  // the tarot tab unless it is the first, which interrupts: a player who has
  // never seen the mechanic will not go looking for it.
  s.draftProgress += 1
  if (!s.pendingDraft.length) s.pendingDraft = drawOffer(s)
  return true
}

// Closes the loop described in production.ts: the engine runs the autobuyer
// ladder and one rung of it is the prestige, which lives up here.
registerWager(doWager)
