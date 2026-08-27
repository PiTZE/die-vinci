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
import { newAutobuyers, type AutobuyerState } from './game/autobuyers'
import { defaultConfirms } from './ui/confirm'
import { THOUGHT_SPEED_DEFAULT } from './ui/thoughts'

export interface SolidState {
  /** Purchases since the last reset. Drives the doubling every ten. */
  bought: number
  /** How many exist, including the ones the solid above produced. */
  amount: Decimal
}

export type TabId =
  | 'table'
  | 'wager'
  | 'challenges'
  | 'tarot'
  | 'automation'
  | 'archive'
  | 'options'
  | 'help'

export interface GameState {
  version: number
  /** ms epoch of the last processed tick. Offline progress reads this. */
  lastTick: number

  ink: Decimal
  /** Ink earned since the last Wager. The prestige payout reads this. */
  inkThisWager: Decimal

  solids: SolidState[]
  /** The last face each solid landed on, 0 before the first roll. */
  faces: number[]
  /** ms epoch the current spin began, or 0 when the dice are at rest. */
  rollStartedAt: number
  /** Seconds of elapsed time not yet spent on a roll. */
  rollAccum: number
  /** The first automator. Once bought it is never lost, not even to a Wager. */
  autoRoll: boolean
  /** And whether it is switched on. */
  autoRollOn: boolean
  rollUpgrades: number
  /** The multiplier melting has left on the deepest solid. */
  meltPower: Decimal
  studies: number
  folios: number

  // Layer 1. Present from the first commit so the save never needs migrating
  // when the Wager lands.
  points: Decimal
  wagers: number
  /** Ids of bought Points upgrades. See game/upgrades.ts. */
  pointUpgrades: string[]
  /** Which challenge is being run, or 0 for none. */
  challengeRunning: number
  challengesDone: number[]
  autobuyers: Record<string, AutobuyerState>
  /** Ids of met entries in the Conquestion Archive. */
  achievements: string[]
  /** Milliseconds of production still halted by a challenge restriction. */
  haltMs: number
  /** Arcanum id to level. Zero and absent are the same thing. */
  tarot: Record<string, number>
  /** Wagers called since the last draft was earned. */
  draftProgress: number
  /** A draft offered and not yet taken. Held in the save so closing the tab
   *  mid-choice does not lose it. */
  pendingDraft: string[]

  options: {
    notation: NotationId
    tab: TabId
    /** Pixels a second the thoughts ticker crawls. 0 holds each line still. */
    thoughtSpeed: number
    /** The dice clatter. Synthesised, so there is nothing to download. */
    sound: boolean
    /** Whether to ask the browser for the whole screen. */
    fullscreen: boolean
    /** Whether time away from the game is credited at all. */
    offline: boolean
    /** How many ticks a long absence is simulated in. */
    offlineTicks: number
    /** One switch per destructive action. See ui/confirm.ts. */
    confirms: Record<string, boolean>
  }
  stats: {
    started: number
    /** Milliseconds of game time, for the upgrade that scales with it. */
    playMs: number
    /** Milliseconds since the last Wager, for the upgrade that scales with it. */
    wagerMs: number
    /** Milliseconds since the last study or folio, for the Chariot. */
    sinceResetMs: number
    /** How many times the chain has been melted. */
    melts: number
  }
}

export function newGame(now: number): GameState {
  return {
    version: SAVE_VERSION,
    lastTick: now,
    ink: new Decimal(START_INK),
    inkThisWager: new Decimal(0),
    solids: SOLIDS.map(() => ({ bought: 0, amount: new Decimal(0) })),
    faces: SOLIDS.map(() => 0),
    rollStartedAt: 0,
    rollAccum: 0,
    autoRoll: false,
    autoRollOn: true,
    rollUpgrades: 0,
    meltPower: new Decimal(1),
    studies: 0,
    folios: 0,
    points: new Decimal(0),
    wagers: 0,
    pointUpgrades: [],
    challengeRunning: 0,
    challengesDone: [],
    autobuyers: newAutobuyers(),
    achievements: [],
    haltMs: 0,
    tarot: {},
    draftProgress: 0,
    pendingDraft: [],
    options: {
      notation: 'mixed',
      tab: 'table',
      thoughtSpeed: THOUGHT_SPEED_DEFAULT,
      sound: true,
      fullscreen: false,
      offline: true,
      offlineTicks: OFFLINE_TICKS_DEFAULT,
      confirms: defaultConfirms(),
    },
    stats: { started: now, playMs: 0, wagerMs: 0, sinceResetMs: 0, melts: 0 },
  }
}

/** How many solids are on the table. Studies unlock the rest. */
export function unlockedSolids(s: GameState): number {
  // XXI The World: a run begins with more of the table already open.
  const extra = s.tarot?.world ?? 0
  return Math.min(SOLID_COUNT, SOLIDS_AT_START + extra + Math.min(s.studies, STUDIES_THAT_UNLOCK))
}

/** The deepest solid the player can currently buy, 1-based. */
export function topSolid(s: GameState): number {
  return unlockedSolids(s)
}
