import Decimal from './vendor/break-infinity'
import { SOLIDS, SOLID_COUNT } from './game/solids'
import { CODICES } from './game/codices'
import {
  OFFLINE_TICKS_DEFAULT,
  UI_MS_DEFAULT,
  SAVE_VERSION,
  SOLIDS_AT_START,
  START_INK,
  STUDIES_THAT_UNLOCK,
  ARCANA_MAX_LEVEL,
} from './game/balance'
import type { NotationId } from './format'
import { newAutobuyers, type AutobuyerState } from './game/autobuyers'
import { defaultConfirms } from './ui/confirm'
import { THOUGHT_SPEED_DEFAULT } from './ui/thoughts'

/** One codex: purchases made, and how many exist right now. */
export interface CodexState {
  /** Purchases. Each one hands over ten and multiplies this codex's output. */
  bought: number
  /** How many exist, including the ones the codex above produced. */
  amount: Decimal
}

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
  | 'break'
  | 'codices'
  | 'automation'
  | 'archive'
  | 'stats'
  | 'options'
  | 'about'
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
  /**
   * ms epoch of the last time you asked for a roll.
   *
   * A roll thrown by hand throws the whole table; one nobody pressed for
   * throws only the dice that roll themselves. Which it is cannot be read off
   * rollStartedAt, because that is the animation clock and the automated path
   * sets it too. A timestamp rather than a flag because holding repeats every
   * 60ms and the roll interval gets shorter than that late in a run: a flag
   * cleared on the first landing would quietly stop crediting a held button
   * for the rolls after it.
   */
  handRollAt: number
  /** Seconds of elapsed time not yet spent on a roll. */
  rollAccum: number
  /**
   * How many of the shallow dice roll themselves.
   *
   * Bought one at a time, in order, and never lost. A die at index i is
   * automated when i < autoDice, so this is a count rather than a set: the
   * ladder only ever fills from the shallow end.
   */
  autoDice: number
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
  chips: Decimal
  wagers: number
  /** Ids of bought Points upgrades. See game/upgrades.ts. */
  chipUpgrades: string[]
  /** Which challenge is being run, or 0 for none. */
  challengeRunning: number
  challengesDone: number[]
  autobuyers: Record<string, AutobuyerState>
  /** Ids of met entries in the Conquestion Archive. */
  achievements: string[]
  /**
   * Panes with a mark on them, and the rules whose condition already held.
   *
   * Both on the save, as AD's are: a mark you have not looked at should still
   * be there tomorrow, and a rule that has already fired should not fire again
   * on the next reload. See game/marks.ts.
   */
  marks: string[]
  marksArmed: string[]
  /** Milliseconds of production still halted by a challenge restriction. */
  haltMs: number
  /** Arcanum id to level. Zero and absent are the same thing. */
  tarot: Record<string, number>
  /** Wagers called since the last draft was earned. */
  draftProgress: number
  /** A draft offered and not yet taken. Held in the save so closing the tab
   *  mid-choice does not lose it. */
  pendingDraft: string[]

  // Layer 1, broken. Antimatter Dimensions calls this Break Infinity: the
  // prestige stops paying a flat one and starts paying by how far past the old
  // wall the run got.
  /** Whether the ceiling is off. A toggle, as AD's is. */
  broke: boolean
  /** Times the chip multiplier has been bought. Each one doubles the payout. */
  chipMult: number
  /** Ids of bought break upgrades. See game/breaks.ts. */
  breakUpgrades: string[]
  /** Break upgrade id to times bought, for the rebuyable ones. */
  breakRebuyables: Record<string, number>

  // The codices: Antimatter Dimensions' Infinity Dimensions, bought with chips
  // and surviving the Wager that clears everything below them. See
  // game/codices.ts.
  codices: CodexState[]
  /** How many are open. They open in order, on how deep a run has gone. */
  codexOpen: number
  /** What the codices have made this run. Multiplies every solid. */
  esperienza: Decimal
  /**
   * The most ink any single run has ever earned, which is what opens the next
   * codex. AD's `records.thisEternity.maxAM`, kept for the whole save because
   * there is no eternity here to take it away again.
   */
  deepestInk: Decimal

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
    /** How often the readouts redraw. The game does not slow down with it. */
    uiMs: number
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
    /** The fastest Wager yet, in milliseconds. Infinity until one is called.
     *  Break upgrades that generate chips passively read it, the way AD's
     *  infinitiedGen reads bestInfinity.time. */
    bestWagerMs: number
    /** Folios bound over the whole save. Never reset, unlike s.folios. */
    foliosEver: number
    /**
     * The deepest solid ever opened, so the table keeps its shape.
     *
     * A study or a folio drops the chain back to one row, and the rows below it
     * used to vanish. The table you had spent twenty minutes building
     * disappeared every time you reset, which reads as losing the game rather
     * than as the reset you asked for. They stay, with what they need written
     * under them.
     */
    solidsEver: number
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
    handRollAt: 0,
    rollAccum: 0,
    autoDice: 0,
    autoRoll: false,
    autoRollOn: true,
    rollUpgrades: 0,
    meltPower: new Decimal(1),
    studies: 0,
    folios: 0,
    chips: new Decimal(0),
    wagers: 0,
    chipUpgrades: [],
    challengeRunning: 0,
    challengesDone: [],
    autobuyers: newAutobuyers(),
    achievements: [],
    marks: [],
    marksArmed: [],
    haltMs: 0,
    tarot: {},
    draftProgress: 0,
    pendingDraft: [],
    broke: false,
    chipMult: 0,
    breakUpgrades: [],
    breakRebuyables: {},
    codices: CODICES.map(() => ({ bought: 0, amount: new Decimal(0) })),
    codexOpen: 0,
    esperienza: new Decimal(1),
    deepestInk: new Decimal(0),
    options: {
      notation: 'mixed',
      tab: 'table',
      thoughtSpeed: THOUGHT_SPEED_DEFAULT,
      sound: true,
      fullscreen: false,
      offline: true,
      offlineTicks: OFFLINE_TICKS_DEFAULT,
      uiMs: UI_MS_DEFAULT,
      confirms: defaultConfirms(),
    },
    stats: { started: now, playMs: 0, wagerMs: 0, sinceResetMs: 0, melts: 0, foliosEver: 0,
      bestWagerMs: Infinity,
      solidsEver: SOLIDS_AT_START },
  }
}

/** How many solids are on the table. Studies unlock the rest. */
export function unlockedSolids(s: GameState): number {
  // XXI The World: a run begins with more of the table already open.
  // Through the same cap the cards themselves read, so a save holding a level
  // above it cannot open a solid the draft could never have paid for.
  const extra = Math.min(ARCANA_MAX_LEVEL, s.tarot?.world ?? 0)
  return Math.min(SOLID_COUNT, SOLIDS_AT_START + extra + Math.min(s.studies, STUDIES_THAT_UNLOCK))
}

/** The deepest solid the player can currently buy, 1-based. */
export function topSolid(s: GameState): number {
  return unlockedSolids(s)
}
