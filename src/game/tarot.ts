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
import { ARCANA_MAX_LEVEL, magicianBias } from './balance'
import { restrictions } from './challenges'

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
  /**
   * The last level that does anything, and it is nine on every card.
   *
   * Three of them used to carry their own number, derived from where the
   * effect stopped paying: the Magician's loading approaches MAGICIAN_BIAS_CAP
   * and the World cannot open more of the table than there is. Those clamps
   * are still in the formulas, so a card that runs out early still runs out
   * early; what changed is that the answer to "how far does this go" is now
   * the same on all twenty-two, and it is the same nine as the solids and the
   * archive rows.
   */
  max: number
  /** Present and unused. Repentance gave every arcanum a reversed form, and
   *  that is where the physics theme picks up later: a card in superposition
   *  until observed. v1 ships upright only. */
  reversed?: string
}

/** The cap lives in balance.ts with every other tunable number, and is named
 *  here so the cards read it under the name they always used. */
export const MAX_LEVEL = ARCANA_MAX_LEVEL

const T = (
  id: ArcanaId,
  numeral: string,
  name: string,
  tier: Tier,
  note: string,
  max: number = MAX_LEVEL,
): TarotDef => ({ id, numeral, name, tier, note, max })

/** In order. The Fool's Journey is also roughly the order they matter in. */
export const ARCANA: TarotDef[] = [
  T('fool', '0', 'The Fool', 'mid',
    'a folio keeps your studies'),
  T('magician', 'I', 'The Magician', 'mid',
    'the dice are loaded, and land high'),
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
    'chips you have not spent multiply production'),
  T('world', 'XXI', 'The World', 'late',
    'a run begins with more of the table already open'),
]

export const ARCANA_BY_ID: Record<string, TarotDef> = Object.fromEntries(
  ARCANA.map((a) => [a.id, a]),
)

/**
 * A card's effective level, never above its cap.
 *
 * Clamped at the read rather than at the write, so a save that already holds a
 * level past the cap cannot outrun it. That covers saves written before the
 * caps existed and anything LD.arcana handed out.
 */
export function levelOf(s: GameState, id: ArcanaId): number {
  const held = s.tarot[id] ?? 0
  const def = ARCANA_BY_ID[id]
  return def ? Math.min(held, def.max) : held
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

/** True once a card has nothing left to give. */
export function isFull(s: GameState, id: ArcanaId): boolean {
  const def = ARCANA_BY_ID[id]
  return !!def && levelOf(s, id) >= def.max
}

export function weightOf(s: GameState, id: ArcanaId): number {
  const def = ARCANA_BY_ID[id]
  if (!def) return 0
  const level = levelOf(s, id)
  // A full card is not offered. Drafting one was a Wager spent on a level that
  // changed nothing, and the draft already declines to offer what it cannot
  // improve: drawOffer filters on this weight being above zero.
  if (level >= def.max) return 0
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
  /**
   * How far the dice are loaded, 0 to 1. Zero is a fair die.
   *
   * In the bundle rather than read off the card, so the challenge that runs
   * with the deck face down takes it away with everything else.
   */
  faceBias: number
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
}

const NONE: Modifiers = {
  globalMult: new Decimal(1),
  solidExp: 1,
  topMult: new Decimal(1),
  faceBias: 0,
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
  // The thirteenth challenge is a run with the deck face down. Reading it here
  // rather than at each call site means a card cannot leak in through one
  // effect that forgot to ask.
  if (restrictions(s).noArcana) return NONE
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
  //
  // The bill has to be real. At 1 + 3L against a penalty that only reached
  // 0.92 at level one, the trade was a gift: the Devil finished six Wagers in
  // 1h16m where the next best card of its tier took 1h31m, and it beat every
  // early card in the game while being three times likelier to appear than the
  // Sun, which it also nearly matched. Smaller bonus, penalty biting from the
  // first level, and it lands at 1h31m alongside Strength.
  //
  // The floor stays, and it is not decoration. Priced without one, at
  // 1/(1 + L), the card is worse than not holding it: six Wagers took 2h08m
  // against 1h50m with no cards at all, and every level made it worse. Roll
  // rate multiplies the whole chain, so a linear cost on it swamps a linear
  // bonus. What the floor buys past level 5 is small: the last five levels are
  // worth about three minutes across six Wagers.
  if (L('devil')) {
    m.globalMult = m.globalMult.times(1 + L('devil') * 1.6)
    m.rollRateMult *= Math.max(0.7, 1 - L('devil') * 0.05)
  }

  // XX Judgement: chips held rather than spent.
  if (L('judgement') && s.chips.gt(0)) {
    m.globalMult = m.globalMult.times(s.chips.times(L('judgement') * 0.5).plus(1))
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

  // I The Magician: the dice find their mark.
  //
  // Isaac's Magician grants homing tears for the room, and homing is the whole
  // idea: what you throw goes where you want it. Here that is a loaded die,
  // which the engine has been able to roll since rollFace was written and
  // nothing had yet asked it to.
  //
  // The effect it replaces could not matter at any magnitude. It fed each
  // solid a share of its output two rungs down, and the chain's own step
  // between rungs is orders of magnitude larger than anything a neighbour can
  // donate: swept at 0.1, 0.5, 2 and 10, six Wagers took 1h49m at every single
  // value, against 1h50m with no card at all. That was a design problem, not a
  // tuning one.
  //
  // Loading the dice is not. The face is taken raw, so it multiplies every
  // tier at once and compounds nine deep. At level nine a d72 averages 59.8
  // rather than 36.5 and a d4 averages 3.4 rather than 2.5; see magicianBias
  // in balance.ts for the curve and what it is worth measured.
  if (L('magician')) m.faceBias = magicianBias(L('magician'))

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
  //
  // The window is fixed and the level raises the surge, which is the opposite
  // of how this was written. It used to do both: 20 seconds a level at a
  // multiplier of 1 + L, which at level five is a hundred-second window on a
  // run that resets every minute or two, so the surge never lapsed. That made
  // an early-tier card, the commonest thing in the draft, the strongest card
  // in the game: six Wagers in 1h11m against 1h50m with nothing, ahead of the
  // Sun's 1h14m.
  //
  // Fixing the window alone was not the fix. It only moved 1h11m to 1h13m,
  // because the surge is on roll rate and roll rate multiplies the entire
  // chain. The multiplier itself was the whole story, and 0.3 a level puts it
  // at 1h31m, in among the other early cards: Justice 1h27m, the Empress
  // 1h33m, the Hierophant 1h36m.
  if (L('chariot') && s.stats.sinceResetMs / 1000 < CHARIOT_WINDOW_S) {
    m.rollRateMult *= 1 + L('chariot') * 0.3
  }

  // 0 The Fool, V The Hierophant, VIII Justice, XII The Hanged Man: resets.
  m.keepStudies = L('fool')
  if (L('hierophant')) m.keepInk = new Decimal(10).pow(1 + L('hierophant') * 2)
  m.keepSolids = L('justice')
  m.keepRollFrac = Math.min(1, L('hanged') * 0.1)

  // XVIII The Moon. The World is read straight from the card level over in
  // unlockedSolids, so there is nothing to put on the modifiers here; there
  // used to be a second copy of it that nothing read.
  if (L('moon')) m.awayCapMult = 1 + L('moon')

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
  const def = ARCANA_BY_ID[id]
  if (!def) return false
  // Guarded here too, not only in the weighting. A draft written to the save
  // before a card's cap existed could still be offering a full one.
  if ((s.tarot[id] ?? 0) >= def.max) return false
  s.tarot[id] = (s.tarot[id] ?? 0) + 1
  s.pendingDraft = []
  return true
}
