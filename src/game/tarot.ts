// The twenty-two Major Arcana.
//
// Effects are taken from Isaac's versions and retargeted from combat to the
// chain: where his card acts on a room, this one acts on the table, and where
// his moves Isaac somewhere, this one moves the run somewhere. Teleports
// become resets, damage becomes multipliers, pickups become dice.
//
// Every effect is passive. Isaac's cards are used, and a used card would want
// a button, a cooldown and a place to live; a passive one is a number the tick
// already reads. Two of them, Death and the High Priestess, were written as
// actions in the design and are folded into resets and into production here
// for that reason.
//
// Every effect scales with the card's level, so a duplicate draw is never a
// wasted draw.
import Decimal from 'break_infinity.js'
import type { GameState } from '../state'

export type ArcanaId =
  | 'fool' | 'magician' | 'priestess' | 'empress' | 'emperor' | 'hierophant'
  | 'lovers' | 'chariot' | 'justice' | 'hermit' | 'wheel' | 'strength'
  | 'hanged' | 'death' | 'temperance' | 'devil' | 'tower' | 'stars'
  | 'moon' | 'sun' | 'judgement' | 'world'

/** When a card starts being worth anything, which is what the draft weights. */
export type Tier = 'early' | 'mid' | 'late'

export interface TarotDef {
  id: ArcanaId
  /** Roman, as Pacioli would have set it. */
  numeral: string
  name: string
  /** One line, shown under the name. Written for a player, not for me. */
  note: string
  tier: Tier
  /** Present and unused. Repentance gave every arcanum a reversed form, and
   *  that is where the physics theme picks up later: a card in superposition
   *  until observed. v1 ships upright only. */
  reversed?: string
}

const T = (
  id: ArcanaId,
  numeral: string,
  name: string,
  tier: Tier,
  note: string,
): TarotDef => ({ id, numeral, name, tier, note })

/** In order. The Fool's Journey is also roughly the order they matter in. */
export const ARCANA: TarotDef[] = [
  T('fool', '0', 'The Fool', 'mid',
    'a folio keeps your studies'),
  T('magician', 'I', 'The Magician', 'mid',
    'each solid also feeds the one two below it'),
  T('priestess', 'II', 'The High Priestess', 'late',
    'your largest solid pays ink of its own'),
  T('empress', 'III', 'The Empress', 'early',
    'a multiplier that is largest when your ink is smallest'),
  T('emperor', 'IV', 'The Emperor', 'mid',
    'the deepest solid you own is multiplied'),
  T('hierophant', 'V', 'The Hierophant', 'early',
    'a reset leaves you ink instead of nothing'),
  T('lovers', 'VI', 'The Lovers', 'mid',
    'dice showing the same face pay double'),
  T('chariot', 'VII', 'The Chariot', 'early',
    'roll rate surges for a while after every reset'),
  T('justice', 'VIII', 'Justice', 'early',
    'a reset leaves you some of every solid'),
  T('hermit', 'IX', 'The Hermit', 'early',
    'every solid costs less'),
  T('wheel', 'X', 'Wheel of Fortune', 'mid',
    'every die is rolled twice and keeps the better face'),
  T('strength', 'XI', 'Strength', 'mid',
    'solid multipliers gain an exponent'),
  T('hanged', 'XII', 'The Hanged Man', 'mid',
    'a study no longer clears your roll rate'),
  T('death', 'XIII', 'Death', 'late',
    'melt the chain into the solid at the top of it'),
  T('temperance', 'XIV', 'Temperance', 'mid',
    'roll rate costs less the more this run has earned'),
  T('devil', 'XV', 'The Devil', 'mid',
    'a large multiplier, paid for in roll rate'),
  T('tower', 'XVI', 'The Tower', 'late',
    'lightning strikes, and everything pays a hundredfold'),
  T('stars', 'XVII', 'The Stars', 'mid',
    'the draft offers more, and favours what you lack'),
  T('moon', 'XVIII', 'The Moon', 'late',
    'time away counts for longer'),
  T('sun', 'XIX', 'The Sun', 'late',
    'everything is multiplied, and nothing is asked'),
  T('judgement', 'XX', 'Judgement', 'late',
    'points you have not spent multiply production'),
  T('world', 'XXI', 'The World', 'late',
    'a run begins with more of the table already open'),
]

export const ARCANA_BY_ID: Record<string, TarotDef> = Object.fromEntries(
  ARCANA.map((a) => [a.id, a]),
)

export function levelOf(s: GameState, id: ArcanaId): number {
  return s.tarot[id] ?? 0
}

export function owned(s: GameState): number {
  return ARCANA.filter((a) => levelOf(s, a.id) > 0).length
}

// -- the draft ------------------------------------------------------------

/** Base weight by tier. An early card is worth five of a late one. */
const BASE: Record<Tier, number> = { early: 5, mid: 3, late: 1 }

/**
 * How much a card steps aside per level held. 0.55 finishes the collection
 * faster and leaves a favourite at level 4.2 over forty drafts; 0.85 gets a
 * favourite to 6.1 and a quarter of runs never see all twenty-two. The
 * decision is meant to be what to take first and how far to push one card, and
 * a decay that makes pushing pointless deletes half of it.
 */
const DECAY = 0.65

/** A card never drawn is worth this much more, so the longer one goes unseen
 *  the more it stands out against a pool that is all stepping aside. */
const UNSEEN = 2

/** How many are offered. The Stars adds to this. */
export const OFFER = 3

export function weightOf(s: GameState, id: ArcanaId): number {
  const def = ARCANA_BY_ID[id]
  if (!def) return 0
  const level = levelOf(s, id)
  const unseen = unseenBonus(s)
  return BASE[def.tier] * (level === 0 ? unseen : Math.pow(DECAY, level))
}

/**
 * Draws `count` distinct arcana, weighted.
 *
 * `roll` is injected so a test can assert the weighting over ten thousand
 * draws rather than eyeball it, and so a pending draft could be made
 * reproducible later without touching this.
 */
export function drawOffer(
  s: GameState,
  count = offerSize(s),
  roll: () => number = Math.random,
): ArcanaId[] {
  const pool = ARCANA.map((a) => ({ id: a.id, w: weightOf(s, a.id) })).filter((p) => p.w > 0)
  const picked: ArcanaId[] = []
  for (let n = 0; n < count && pool.length; n++) {
    const total = pool.reduce((a, p) => a + p.w, 0)
    let r = roll() * total
    let at = 0
    while (at < pool.length - 1 && (r -= pool[at].w) > 0) at++
    picked.push(pool[at].id)
    pool.splice(at, 1)
  }
  return picked
}

// -- what the cards do ----------------------------------------------------
//
// Read once per tick into a single bundle rather than each system asking every
// card. Two dozen cards each answering "do I apply" on every solid on every
// roll is a lot of nothing for the ninety per cent of the game where the
// answer is no.

export interface Modifiers {
  /** Multiplies everything the chain makes. */
  globalMult: Decimal
  /** An exponent on each solid's own multiplier. */
  solidExp: number
  /** Extra on the deepest unlocked solid alone. */
  topMult: Decimal
  /** The share each solid also sends two tiers down instead of one. */
  skip: number
  /** Extra face rolls, keeping the best. */
  rerolls: number
  /** What matching faces are worth, beyond the one they already pay. */
  pairBonus: number
  /** Multiplies solid prices. */
  costFactor: number
  /** Multiplies roll rate upgrade prices. */
  rollCostFactor: number
  /** Multiplies the roll rate itself. */
  rollRateMult: number
  /** Studies a folio leaves behind. */
  keepStudies: number
  /** Ink a reset leaves behind, in place of the usual ten. */
  keepInk: Decimal
  /** How many of each unlocked solid a reset leaves behind. */
  keepSolids: number
  /** The share of roll rate upgrades a study leaves behind. */
  keepRollFrac: number
  /** Multiplies the eight hour away cap. */
  awayCapMult: number
  /** Solids open before the first study. */
  extraTiers: number
}

const NONE: Modifiers = {
  globalMult: new Decimal(1),
  solidExp: 1,
  topMult: new Decimal(1),
  skip: 0,
  rerolls: 0,
  pairBonus: 0,
  costFactor: 1,
  rollCostFactor: 1,
  rollRateMult: 1,
  keepStudies: 0,
  keepInk: new Decimal(0),
  keepSolids: 0,
  keepRollFrac: 0,
  awayCapMult: 1,
  extraTiers: 0,
}

/** How long after a reset the Chariot is still surging, in seconds. */
const CHARIOT_WINDOW_S = 20

/** The Tower strikes on this cycle, for this long. */
const TOWER_CYCLE_S = 90
const TOWER_HOLD_S = 3
const TOWER_MULT = 100

export function offerSize(s: GameState): number {
  return OFFER + (levelOf(s, 'stars') > 0 ? 1 : 0)
}

function unseenBonus(s: GameState): number {
  // The Stars weights an unowned arcanum higher on top of offering a fourth.
  return UNSEEN + levelOf(s, 'stars') * 0.5
}

/** True while the Tower is mid-strike. Exported so the UI can say so. */
export function towerStriking(s: GameState): boolean {
  if (levelOf(s, 'tower') <= 0) return false
  const cycle = TOWER_CYCLE_S / (1 + (levelOf(s, 'tower') - 1) * 0.15)
  return s.stats.wagerMs / 1000 % cycle < TOWER_HOLD_S * (1 + (levelOf(s, 'tower') - 1) * 0.2)
}

export function modifiers(s: GameState): Modifiers {
  if (!s.tarot || owned(s) === 0) return NONE
  const L = (id: ArcanaId) => levelOf(s, id)
  const m: Modifiers = { ...NONE, globalMult: new Decimal(1), topMult: new Decimal(1), keepInk: new Decimal(0) }

  // XIX The Sun: a flat multiplier, asking nothing.
  if (L('sun')) m.globalMult = m.globalMult.times(2 + L('sun'))

  // III The Empress: largest when the ink is smallest, fading as it grows.
  // Strongest in the seconds after a reset, which is when a reset feels worst.
  if (L('empress')) {
    const e = Math.max(0, 12 - Math.max(0, s.ink.log10())) / 12
    m.globalMult = m.globalMult.times(1 + e * L('empress') * 4)
  }

  // XV The Devil: a large multiplier, paid for in roll rate.
  if (L('devil')) {
    m.globalMult = m.globalMult.times(1 + L('devil') * 3)
    m.rollRateMult *= Math.max(0.25, 1 - L('devil') * 0.08)
  }

  // XX Judgement: points held rather than spent.
  if (L('judgement') && s.points.gt(0)) {
    m.globalMult = m.globalMult.times(s.points.times(L('judgement') * 0.5).plus(1))
  }

  // XVI The Tower: lightning, and nothing falls down.
  if (towerStriking(s)) m.globalMult = m.globalMult.times(TOWER_MULT)

  // XIII Death does not multiply anything itself. It unlocks melting, and its
  // level is what makes a melt worth taking; see meltMultiplier in balance.

  // II The High Priestess: the largest solid pays ink of its own.
  if (L('priestess')) m.globalMult = m.globalMult.times(1 + L('priestess') * 0.5)

  // XI Strength: a differently shaped multiplier, not a bigger one.
  if (L('strength')) m.solidExp = 1 + L('strength') * 0.02

  // IV The Emperor: the deep end.
  if (L('emperor')) m.topMult = new Decimal(1 + L('emperor') * 5)

  // I The Magician: the chain reaches further.
  if (L('magician')) m.skip = Math.min(0.8, L('magician') * 0.1)

  // X Wheel of Fortune, VI The Lovers: the two that are about dice.
  m.rerolls = L('wheel')
  m.pairBonus = L('lovers')

  // IX The Hermit, XIV Temperance: prices.
  if (L('hermit')) m.costFactor = Math.max(0.2, 1 - L('hermit') * 0.08)
  if (L('temperance')) {
    const earned = Math.max(0, s.inkThisWager.log10())
    m.rollCostFactor = Math.max(0.1, 1 - Math.min(0.9, (earned / 300) * L('temperance') * 0.5))
  }

  // VII The Chariot: a charge out of the gate.
  if (L('chariot') && s.stats.sinceResetMs / 1000 < CHARIOT_WINDOW_S * L('chariot')) {
    m.rollRateMult *= 1 + L('chariot')
  }

  // 0 The Fool, V The Hierophant, VIII Justice, XII The Hanged Man: resets.
  m.keepStudies = L('fool')
  if (L('hierophant')) m.keepInk = new Decimal(10).pow(1 + L('hierophant') * 2)
  m.keepSolids = L('justice') * 2
  m.keepRollFrac = Math.min(1, L('hanged') * 0.1)

  // XVIII The Moon, XXI The World.
  if (L('moon')) m.awayCapMult = 1 + L('moon')
  m.extraTiers = L('world')

  return m
}

// -- taking a card --------------------------------------------------------

/** True when a choice is waiting. */
export function draftPending(s: GameState): boolean {
  return s.pendingDraft.length > 0
}

/**
 * The very first draft interrupts and the rest wait. Someone who has never
 * seen the mechanic will not open a tab they have no reason to know about.
 */
export function draftInterrupts(s: GameState): boolean {
  return draftPending(s) && owned(s) === 0
}

export function takeCard(s: GameState, id: string): boolean {
  if (!s.pendingDraft.includes(id)) return false
  if (!ARCANA_BY_ID[id]) return false
  s.tarot[id] = (s.tarot[id] ?? 0) + 1
  s.pendingDraft = []
  return true
}
