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
import Decimal from 'break_infinity.js'
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
]

export interface AutobuyerState {
  unlocked: boolean
  on: boolean
  /** Points spent so far. Interval and cost are derived from it. */
  level: number
  /** Milliseconds since this one last fired. */
  since: number
}

export function newAutobuyers(): Record<string, AutobuyerState> {
  const out: Record<string, AutobuyerState> = {}
  for (const a of AUTOBUYERS) out[a.id] = { unlocked: false, on: true, level: 0, since: 0 }
  return out
}

function slot(s: GameState, id: AutobuyerId): AutobuyerState {
  const held = s.autobuyers[id]
  if (held) return held
  const fresh = { unlocked: false, on: true, level: 0, since: 0 }
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
  return slot(s, id).unlocked && !isMaxed(s, id) && s.points.gte(upgradeCost(s, id))
}

export function upgrade(s: GameState, id: AutobuyerId): boolean {
  if (!canUpgrade(s, id)) return false
  s.points = s.points.minus(upgradeCost(s, id))
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

export function anyUnlocked(s: GameState): boolean {
  return AUTOBUYERS.some((a) => slot(s, a.id).unlocked)
}

/** What each autobuyer does when its interval elapses. Wired up in production. */
export interface AutobuyerActions {
  buySolid: (idx: number) => boolean
  buyRollRate: () => boolean
  buyStudy: () => boolean
  buyFolio: () => boolean
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
      const ok = d.id.startsWith('solid')
        ? act.buySolid(Number(d.id.slice(5)))
        : d.id === 'rollRate'
          ? act.buyRollRate()
          : d.id === 'study'
            ? act.buyStudy()
            : act.buyFolio()
      if (!ok) break
    }
  }
}

export const SOLID_AUTOBUYER_IDS = SOLIDS.map((s) => `solid${s.idx}`)
export { SOLID_COUNT }
