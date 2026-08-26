// The challenge ladder, ported from Antimatter Dimensions' normal challenges.
//
// Its shape: each challenge is a run under a restriction, completed by
// reaching the prestige threshold while it is active, and each one clears to
// award an autobuyer. That progression is the whole answer to "start slowly
// and then automate everything".
//
// Nine of the twelve restrictions below are AD's own. Three are adapted, and
// marked, because AD's remaining ones lean on machinery this game has not got.
import type { GameState } from '../state'
import { SOLIDS } from './solids'

export interface ChallengeDef {
  id: number
  /** The autobuyer clearing it unlocks. */
  awards: string
  label: string
  note: string
  /** True where the restriction is AD's rather than adapted. */
  faithful: boolean
}

export const CHALLENGES: ChallengeDef[] = [
  { id: 1, awards: 'solid1', label: `${SOLIDS[0].short} AUTO`, faithful: true,
    note: 'no restriction. Reach the Wager once.' },
  { id: 2, awards: 'solid2', label: `${SOLIDS[1].short} AUTO`, faithful: true,
    note: 'every purchase halts all production, recovering over three minutes' },
  { id: 3, awards: 'solid3', label: `${SOLIDS[2].short} AUTO`, faithful: true,
    note: 'buying a solid destroys every solid below it' },
  { id: 4, awards: 'solid4', label: `${SOLIDS[3].short} AUTO`, faithful: true,
    note: 'each roll rate upgrade is worth 1.080 instead of 1.1245' },
  { id: 5, awards: 'solid5', label: `${SOLIDS[4].short} AUTO`, faithful: true,
    note: 'ten of a solid multiplies it by 1.5 instead of 2' },
  { id: 6, awards: 'solid6', label: `${SOLIDS[5].short} AUTO`, faithful: true,
    note: 'studies give no multiplier and folios cannot be bound' },
  { id: 7, awards: 'solid7', label: `${SOLIDS[6].short} AUTO`, faithful: true,
    note: 'only the first six solids exist' },
  { id: 8, awards: 'solid8', label: `${SOLIDS[7].short} AUTO`, faithful: true,
    note: 'the first solid is weakened a thousandfold' },
  { id: 9, awards: 'solid9', label: `${SOLIDS[8].short} AUTO`, faithful: false,
    note: 'roll rate cannot be bought at all' },
  { id: 10, awards: 'rollRate', label: 'ROLL AUTO', faithful: false,
    note: 'studies cost twice as many solids' },
  { id: 11, awards: 'study', label: 'STUDY AUTO', faithful: false,
    note: 'folios cost twice as many solids' },
  { id: 12, awards: 'folio', label: 'FOLIO AUTO', faithful: true,
    note: 'each solid is bought with the solid two places below it' },
]

export function byId(id: number): ChallengeDef | undefined {
  return CHALLENGES.find((c) => c.id === id)
}

export function isComplete(s: GameState, id: number): boolean {
  return s.challengesDone.includes(id)
}

export function isRunning(s: GameState, id: number): boolean {
  return s.challengeRunning === id
}

/** Challenges open once the first Wager is behind you, as in AD. */
export function challengesUnlocked(s: GameState): boolean {
  return s.wagers > 0
}

/** Everything the engine needs to know about the active restriction. */
export interface Restrictions {
  /** Solids above this do not exist. */
  cap: number
  /** Overrides the x2 for every ten bought. */
  perTen: number | null
  /** Overrides the interval multiplier each roll rate upgrade is worth. */
  rollBase: number | null
  noStudyMultiplier: boolean
  noFolios: boolean
  noRollRate: boolean
  eraseLower: boolean
  /** Milliseconds production stays halted after any purchase. */
  haltMs: number
  /** Divides the first solid's multiplier. */
  weakenFirst: number
  studyCostFactor: number
  folioCostFactor: number
  /** Buy a solid with the solid this many places below it, instead of ink. */
  payWithOffset: number
}

const NONE: Restrictions = {
  cap: SOLIDS.length,
  perTen: null,
  rollBase: null,
  noStudyMultiplier: false,
  noFolios: false,
  noRollRate: false,
  eraseLower: false,
  haltMs: 0,
  weakenFirst: 1,
  studyCostFactor: 1,
  folioCostFactor: 1,
  payWithOffset: 0,
}

/** Entering resets layer 0, exactly as the Wager does. Leaving does too. */
export function enterChallenge(s: GameState, id: number, reset: (s: GameState) => void): boolean {
  if (!challengesUnlocked(s) || !byId(id)) return false
  s.challengeRunning = id
  s.haltMs = 0
  reset(s)
  return true
}

export function exitChallenge(s: GameState, reset: (s: GameState) => void): void {
  if (!s.challengeRunning) return
  s.challengeRunning = 0
  s.haltMs = 0
  reset(s)
}

export function restrictions(s: GameState): Restrictions {
  switch (s.challengeRunning) {
    case 2:
      return { ...NONE, haltMs: 3 * 60_000 }
    case 3:
      return { ...NONE, eraseLower: true }
    case 4:
      return { ...NONE, rollBase: 1 / 1.08 }
    case 5:
      return { ...NONE, perTen: 1.5 }
    case 6:
      return { ...NONE, noStudyMultiplier: true, noFolios: true }
    case 7:
      return { ...NONE, cap: 6 }
    case 8:
      return { ...NONE, weakenFirst: 1000 }
    case 9:
      return { ...NONE, noRollRate: true }
    case 10:
      return { ...NONE, studyCostFactor: 2 }
    case 11:
      return { ...NONE, folioCostFactor: 2 }
    case 12:
      return { ...NONE, payWithOffset: 2 }
    default:
      return NONE
  }
}
