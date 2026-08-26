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
import type { GameState } from '../state'

export function canWager(s: GameState): boolean {
  return s.ink.gte(WAGER_AT)
}

export function pointsFromWager(): Decimal {
  return new Decimal(1)
}

/** How close this run is to the threshold, 0 to 1, on a log scale. */
export function wagerProgress(s: GameState): number {
  if (s.ink.lte(1)) return 0
  const p = s.ink.log10() / WAGER_AT.log10()
  return Math.max(0, Math.min(1, p))
}

/**
 * Resets everything layer 0 owns. Points, the upgrades they bought, and the
 * count of wagers survive, which is what makes the next run faster.
 */
export function doWager(s: GameState): boolean {
  if (!canWager(s)) return false

  s.points = s.points.plus(pointsFromWager())
  s.wagers += 1

  s.ink = new Decimal(START_INK)
  s.inkThisWager = new Decimal(0)
  s.studies = 0
  s.folios = 0
  s.rollUpgrades = 0
  for (const st of s.solids) {
    st.bought = 0
    st.amount = new Decimal(0)
  }
  s.stats.wagerMs = 0
  return true
}
