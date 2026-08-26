import Decimal from 'break_infinity.js'
import { SAVE_KEY, SAVE_VERSION } from './game/balance'
import { newGame, type GameState } from './state'

// Decimals do not survive JSON, so every one of them goes out as a string and
// comes back through the constructor. The field lists below are the contract.
const DECIMAL_FIELDS = ['ink', 'inkThisWager', 'points'] as const

type Raw = Record<string, any>

function encode(s: GameState): Raw {
  const out: Raw = { ...s }
  for (const f of DECIMAL_FIELDS) out[f] = (s as any)[f].toString()
  out.solids = s.solids.map((d) => ({ bought: d.bought, amount: d.amount.toString() }))
  return out
}

/**
 * Migrations run in order from the save's version up to the current one. There
 * is only one version so far, so this is a scaffold, but adding the reversed
 * tarot field later should not cost anyone their save.
 */
const MIGRATIONS: Record<number, (r: Raw) => Raw> = {
  // 1 -> 2: the chain went from six solids to nine and the solids themselves
  // changed. Carrying the old amounts over by position would silently hand a
  // player a pile of d9 they never bought, so layer 0 starts again. Options,
  // and everything above layer 0, are kept.
  // 2 -> 3: same reasoning, the chain changed again.
  2: (r) => ({
    ...r,
    solids: [],
    studies: 0,
    folios: 0,
    rollUpgrades: 0,
    ink: '10',
    inkThisWager: '0',
  }),
  1: (r) => ({
    ...r,
    solids: [],
    studies: 0,
    folios: 0,
    rollUpgrades: 0,
    ink: '10',
    inkThisWager: '0',
  }),
}

function migrate(raw: Raw): Raw {
  let v = typeof raw.version === 'number' ? raw.version : 1
  while (v < SAVE_VERSION) {
    const step = MIGRATIONS[v]
    if (!step) break
    raw = step(raw)
    v += 1
  }
  raw.version = SAVE_VERSION
  return raw
}

/**
 * Decoding merges onto a fresh game rather than trusting the blob, so a save
 * written by an older build is missing fields instead of being broken.
 */
function decode(raw: Raw, now: number): GameState {
  const base = newGame(now)
  const m = migrate(raw)
  const s: GameState = {
    ...base,
    ...m,
    options: { ...base.options, ...(m.options ?? {}) },
    stats: { ...base.stats, ...(m.stats ?? {}) },
    tarot: { ...(m.tarot ?? {}) },
    pointUpgrades: Array.isArray(m.pointUpgrades) ? [...m.pointUpgrades] : [],
  }
  for (const f of DECIMAL_FIELDS) {
    (s as any)[f] = new Decimal(m[f] ?? 0)
  }
  s.solids = base.solids.map((d, i) => {
    const got = Array.isArray(m.solids) ? m.solids[i] : undefined
    if (!got) return d
    return { bought: Number(got.bought) || 0, amount: new Decimal(got.amount ?? 0) }
  })
  s.lastTick = Number(m.lastTick) || now
  return s
}

export function saveGame(s: GameState): void {
  try {
    localStorage.setItem(SAVE_KEY, JSON.stringify(encode(s)))
  } catch {
    // A full or blocked localStorage should not take the game down mid-tick.
  }
}

export function loadGame(now: number): GameState {
  try {
    const raw = localStorage.getItem(SAVE_KEY)
    if (!raw) return newGame(now)
    return decode(JSON.parse(raw), now)
  } catch {
    return newGame(now)
  }
}

export function exportSave(s: GameState): string {
  return btoa(unescape(encodeURIComponent(JSON.stringify(encode(s)))))
}

export function importSave(blob: string, now: number): GameState | null {
  try {
    const json = decodeURIComponent(escape(atob(blob.trim())))
    return decode(JSON.parse(json), now)
  } catch {
    return null
  }
}

export function wipeSave(): void {
  try {
    localStorage.removeItem(SAVE_KEY)
  } catch {
    // Nothing to do. The caller reloads either way.
  }
}
