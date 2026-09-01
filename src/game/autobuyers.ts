// The autobuyer ladder, ported from Antimatter Dimensions.
//
// Its numbers, from player.js and autobuyers/autobuyer.js: a dimension
// autobuyer starts at 500ms for the first tier and 100ms slower for each one
// after, tickspeed at 500, dimension boosts at 4000, galaxies at 20000. Each
// upgrade costs one Infinity Point to begin with and doubles, and multiplies
// the interval by 0.6 down to a floor of 100ms.
//
// Each is unlocked by clearing the challenge that awards it, which is what
// turns "start slowly" into "automate everything".
import Decimal from '../vendor/break-infinity'
import { SOLIDS, SOLID_COUNT } from './solids'
import type { GameState } from '../state'

export type AutobuyerId = string

export interface AutobuyerDef {
  id: AutobuyerId
  label: string
  /** Milliseconds between attempts before any upgrade. */
  baseInterval: number
}

export const INTERVAL_FLOOR = 100
export const INTERVAL_STEP = 0.6
export const UPGRADE_BASE_COST = 1

export const AUTOBUYERS: AutobuyerDef[] = [
  ...SOLIDS.map((s, i) => ({
    id: `solid${s.idx}`,
    label: s.short,
    baseInterval: 500 + i * 100,
  })),
  { id: 'rollRate', label: 'ROLL RATE', baseInterval: 500 },
  { id: 'study', label: 'STUDY', baseInterval: 4000 },
  { id: 'folio', label: 'FOLIO', baseInterval: 20000 },
  // The prestige itself, which is the one AD gates Break Infinity behind.
  // Its own Big Crunch autobuyer starts at 150 seconds; a Wager here is a
  // shorter run than an Infinity there, so this starts at sixty and reaches
  // the same 100ms floor in thirteen levels rather than fifteen.
  { id: 'wager', label: 'THE WAGER', baseInterval: 60000 },
]

/** AD's autobuyers carry a mode. Single buys one, ten fills the group of ten,
 *  max keeps going while the ink lasts. */
export type AutobuyerMode = 'single' | 'ten' | 'max'

export const MODES: { id: AutobuyerMode; label: string }[] = [
  { id: 'single', label: '1' },
  { id: 'ten', label: '10' },
  { id: 'max', label: 'MAX' },
]

export interface AutobuyerState {
  unlocked: boolean
  on: boolean
  mode: AutobuyerMode
  /** Points spent so far. Interval and cost are derived from it. */
  level: number
  /** Milliseconds since this one last fired. */
  since: number
  /**
   * The two reset autobuyers carry limits, which the dimension ones do not.
   *
   * Antimatter Dimensions' own settings, from dimboost-autobuyer.js and
   * galaxy-autobuyer.js: a cap on how many to take, and for the shallower of
   * the two a rule that lifts the cap once you hold enough of the deeper one.
   * Its defaults are off, at 1 and at 10.
   */
  limitOn?: boolean
  limitAt?: number
  /** Study only: take them freely again once this many folios are bound. */
  untilOn?: boolean
  untilFolios?: number
  /**
   * The Wager only, and only past the wall: what a Wager has to pay before
   * this calls it. AD's bigCrunch `amount`, with `increaseWithMult` beside
   * it; both default on, at one, which is AD's default too.
   *
   * A string, because it outgrows a double as fast as the payout does.
   */
  amount?: string
  riseWithMult?: boolean
}

export function newAutobuyers(): Record<string, AutobuyerState> {
  const out: Record<string, AutobuyerState> = {}
  for (const a of AUTOBUYERS) {
    out[a.id] = {
      unlocked: false, on: true, mode: 'ten', level: 0, since: 0,
      limitOn: false, limitAt: 1, untilOn: false, untilFolios: 10,
    }
  }
  return out
}

function slot(s: GameState, id: AutobuyerId): AutobuyerState {
  const held = s.autobuyers[id]
  if (held) return held
  const fresh: AutobuyerState = {
    unlocked: false, on: true, mode: 'ten', level: 0, since: 0,
    limitOn: false, limitAt: 1, untilOn: false, untilFolios: 10,
  }
  s.autobuyers[id] = fresh
  return fresh
}

export function def(id: AutobuyerId): AutobuyerDef | undefined {
  return AUTOBUYERS.find((a) => a.id === id)
}

export function interval(s: GameState, id: AutobuyerId): number {
  const d = def(id)
  if (!d) return Infinity
  return Math.max(INTERVAL_FLOOR, d.baseInterval * Math.pow(INTERVAL_STEP, slot(s, id).level))
}

export function isMaxed(s: GameState, id: AutobuyerId): boolean {
  return interval(s, id) <= INTERVAL_FLOOR
}

export function upgradeCost(s: GameState, id: AutobuyerId): Decimal {
  return new Decimal(UPGRADE_BASE_COST).times(Decimal.pow(2, slot(s, id).level))
}

export function canUpgrade(s: GameState, id: AutobuyerId): boolean {
  return slot(s, id).unlocked && !isMaxed(s, id) && s.chips.gte(upgradeCost(s, id))
}

export function upgrade(s: GameState, id: AutobuyerId): boolean {
  if (!canUpgrade(s, id)) return false
  s.chips = s.chips.minus(upgradeCost(s, id))
  slot(s, id).level += 1
  return true
}

export function unlock(s: GameState, id: AutobuyerId): void {
  slot(s, id).unlocked = true
}

export function isUnlocked(s: GameState, id: AutobuyerId): boolean {
  return slot(s, id).unlocked
}

export function toggle(s: GameState, id: AutobuyerId): void {
  const a = slot(s, id)
  a.on = !a.on
}

export function mode(s: GameState, id: AutobuyerId): AutobuyerMode {
  return slot(s, id).mode ?? 'ten'
}

export function cycleMode(s: GameState, id: AutobuyerId): void {
  const a = slot(s, id)
  const i = MODES.findIndex((m) => m.id === (a.mode ?? 'ten'))
  a.mode = MODES[(i + 1) % MODES.length].id
}

/** Which autobuyers take a limit. AD gives them to its two reset autobuyers
 *  and to nothing else, for the same reason: a reset is the only purchase you
 *  can want to stop making. */
export const LIMITED = ['study', 'folio'] as const

export function hasLimit(id: AutobuyerId): boolean {
  return (LIMITED as readonly string[]).includes(id)
}

export function limitOn(s: GameState, id: AutobuyerId): boolean {
  return slot(s, id).limitOn === true
}

export function limitAt(s: GameState, id: AutobuyerId): number {
  return Math.max(0, Math.floor(slot(s, id).limitAt ?? 1))
}

export function setLimit(s: GameState, id: AutobuyerId, on: boolean, at?: number): void {
  const a = slot(s, id)
  a.limitOn = on
  if (at !== undefined && Number.isFinite(at)) a.limitAt = Math.max(0, Math.floor(at))
}

export function untilOn(s: GameState, id: AutobuyerId): boolean {
  return slot(s, id).untilOn === true
}

export function untilFolios(s: GameState, id: AutobuyerId): number {
  return Math.max(0, Math.floor(slot(s, id).untilFolios ?? 10))
}

export function setUntil(s: GameState, id: AutobuyerId, on: boolean, at?: number): void {
  const a = slot(s, id)
  a.untilOn = on
  if (at !== undefined && Number.isFinite(at)) a.untilFolios = Math.max(0, Math.floor(at))
}

/**
 * Whether a limited autobuyer may fire, which is AD's condition exactly:
 *
 *   const limitCondition = !limitDimBoosts || purchasedBoosts < maxDimBoosts
 *   const galaxyCondition = limitUntilGalaxies && galaxies >= this.galaxies
 *   if (limitCondition || galaxyCondition) requestDimensionBoost(false)
 *
 * The two are an OR, so the second lifts the first rather than narrowing it:
 * hold enough folios and the cap on studies stops applying at all. That is
 * what makes it useful, because early in a run you want the cap and late in
 * one you want it gone.
 */
export function allowed(s: GameState, id: AutobuyerId): boolean {
  if (!hasLimit(id)) return true
  const held = id === 'study' ? s.studies : s.folios
  const under = !limitOn(s, id) || held < limitAt(s, id)
  const lifted = id === 'study' && untilOn(s, id) && s.folios >= untilFolios(s, id)
  return under || lifted
}

export function anyUnlocked(s: GameState): boolean {
  return AUTOBUYERS.some((a) => slot(s, a.id).unlocked)
}

/** What each autobuyer does when its interval elapses. Wired up in production. */
export interface AutobuyerActions {
  /** Whether the whole group of ten is affordable, for the ten mode. */
  canBuyGroup(idx: number): boolean
  buySolid: (idx: number, one: boolean) => boolean
  buyRollRate: () => boolean
  buyStudy: () => boolean
  buyFolio: () => boolean
  /** Calls the Wager when it can. Awarded by the thirteenth challenge. */
  wager: () => boolean
}

export function runAutobuyers(s: GameState, dtMs: number, act: AutobuyerActions): void {
  for (const d of AUTOBUYERS) {
    const a = slot(s, d.id)
    if (!a.unlocked || !a.on) continue
    a.since += dtMs
    const every = interval(s, d.id)
    if (a.since < every) continue
    // One purchase per elapsed interval, capped so a long catch-up cannot
    // spend an unbounded amount of time here.
    let fires = Math.min(Math.floor(a.since / every), 200)
    a.since -= fires * every
    while (fires-- > 0) {
      const m = mode(s, d.id)
      // Ten means ten. It waits for the whole group rather than buying one at
      // a time whenever the ink is short, which made it the single mode
      // wearing a different label for most of the game.
      if (m === 'ten' && d.id.startsWith('solid') && !act.canBuyGroup(Number(d.id.slice(5)))) break
      if (!allowed(s, d.id)) break
      const ok = d.id.startsWith('solid')
        ? act.buySolid(Number(d.id.slice(5)), m === 'single')
        : d.id === 'rollRate'
          ? act.buyRollRate()
          : d.id === 'study'
            ? act.buyStudy()
            : d.id === 'folio'
              ? act.buyFolio()
              : act.wager()
      if (!ok) break
      // Max keeps buying within the same tick until the ink runs out.
      if (m === 'max' && d.id.startsWith('solid')) {
        for (let n = 0; n < 60; n++) if (!act.buySolid(Number(d.id.slice(5)), false)) break
      }
    }
  }
}

export const SOLID_AUTOBUYER_IDS = SOLIDS.map((s) => `solid${s.idx}`)
export { SOLID_COUNT }
