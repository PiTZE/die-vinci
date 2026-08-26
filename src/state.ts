import Decimal from 'break_infinity.js'
import { SOLIDS, SOLID_COUNT } from './game/solids'
import {
  OFFLINE_TICKS_DEFAULT,
  SAVE_VERSION,
  SOLIDS_AT_START,
  START_INK,
  STUDIES_THAT_UNLOCK,
} from './game/balance'
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
  /** Ids of bought Points upgrades. See game/upgrades.ts. */
  pointUpgrades: string[]
  tarot: Record<string, number>

  options: {
    notation: NotationId
    tab: TabId
    /** Whether time away from the game is credited at all. */
    offline: boolean
    /** How many ticks a long absence is simulated in. */
    offlineTicks: number
  }
  stats: {
    started: number
    /** Milliseconds of game time, for the upgrade that scales with it. */
    playMs: number
    /** Milliseconds since the last Wager, for the upgrade that scales with it. */
    wagerMs: number
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
    pointUpgrades: [],
    tarot: {},
    options: {
      notation: 'mixed',
      tab: 'table',
      offline: true,
      offlineTicks: OFFLINE_TICKS_DEFAULT,
    },
    stats: { started: now, playMs: 0, wagerMs: 0 },
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
