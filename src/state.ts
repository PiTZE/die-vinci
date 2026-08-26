import Decimal from 'break_infinity.js'
import { SOLIDS, SOLID_COUNT } from './game/solids'
import { SAVE_VERSION, SOLIDS_AT_START, START_INK, STUDIES_THAT_UNLOCK } from './game/balance'
import type { NotationId } from './format'

export interface SolidState {
  /** Purchases since the last reset. Drives the doubling every ten. */
  bought: number
  /** How many exist, including the ones the solid above produced. */
  amount: Decimal
}

export type TabId = 'table' | 'wager' | 'challenges' | 'tarot' | 'automation' | 'options'

export interface GameState {
  version: number
  /** ms epoch of the last processed tick. Offline progress reads this. */
  lastTick: number

  ink: Decimal
  /** Ink earned since the last Wager. The prestige payout reads this. */
  inkThisWager: Decimal

  solids: SolidState[]
  rollUpgrades: number
  studies: number
  folios: number

  // Layer 1. Present from the first commit so the save never needs migrating
  // when the Wager lands.
  points: Decimal
  wagers: number
  tarot: Record<string, number>

  options: {
    notation: NotationId
    tab: TabId
  }
  stats: {
    started: number
    manualRolls: number
  }
}

export function newGame(now: number): GameState {
  return {
    version: SAVE_VERSION,
    lastTick: now,
    ink: new Decimal(START_INK),
    inkThisWager: new Decimal(0),
    solids: SOLIDS.map(() => ({ bought: 0, amount: new Decimal(0) })),
    rollUpgrades: 0,
    studies: 0,
    folios: 0,
    points: new Decimal(0),
    wagers: 0,
    tarot: {},
    options: { notation: 'scientific', tab: 'table' },
    stats: { started: now, manualRolls: 0 },
  }
}

/** How many solids are on the table. Studies unlock the rest. */
export function unlockedSolids(s: GameState): number {
  return Math.min(SOLID_COUNT, SOLIDS_AT_START + Math.min(s.studies, STUDIES_THAT_UNLOCK))
}

/** The deepest solid the player can currently buy, 1-based. */
export function topSolid(s: GameState): number {
  return unlockedSolids(s)
}
