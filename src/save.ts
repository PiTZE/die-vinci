import Decimal from 'break_infinity.js'
import { rollBackups, writeBackup } from './backup'
import { SAVE_KEY, SAVE_VERSION, UI_MS_DEFAULT } from './game/balance'

// Three save slots, as Antimatter Dimensions has. Each is its own key, and the
// chosen one is remembered separately. A save written before slots existed is
// adopted as slot 0 the first time this runs, so nobody loses anything.
export const SLOT_COUNT = 3
const SLOT_CHOICE_KEY = `${SAVE_KEY}-slot`

export function currentSlot(): number {
  try {
    const n = Number(localStorage.getItem(SLOT_CHOICE_KEY) ?? 0)
    return Number.isInteger(n) && n >= 0 && n < SLOT_COUNT ? n : 0
  } catch {
    return 0
  }
}

export function slotKey(n = currentSlot()): string {
  return n === 0 ? SAVE_KEY : `${SAVE_KEY}-${n}`
}

export function switchSlot(n: number): void {
  try {
    localStorage.setItem(SLOT_CHOICE_KEY, String(n))
  } catch {
    // Nothing to do; the caller reloads either way.
  }
}

/** Enough to label a slot in the picker without loading it. */
export function slotSummary(n: number): { used: boolean; ink: string; wagers: number } {
  try {
    const raw = localStorage.getItem(slotKey(n))
    if (!raw) return { used: false, ink: '0', wagers: 0 }
    const p = JSON.parse(raw)
    return { used: true, ink: String(p.ink ?? '0'), wagers: Number(p.wagers ?? 0) }
  } catch {
    return { used: false, ink: '0', wagers: 0 }
  }
}
import { newGame, type GameState } from './state'

// Decimals do not survive JSON, so every one of them goes out as a string and
// comes back through the constructor. The field lists below are the contract.
const DECIMAL_FIELDS = ['ink', 'inkThisWager', 'chips', 'meltPower'] as const

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
  // 6 -> 7: Points became Chips, and the grid they buy went with them. The
  // Wager is a bet, so what it pays is what a table pays. Pacioli's problem of
  // points keeps its name where the history is what is being referred to: the
  // archive entry and the ticker line still say points, because that is what
  // he called it in 1494.
  6: (r) => {
    const out = { ...r }
    if (out.points !== undefined) {
      out.chips = out.points
      delete out.points
    }
    if (out.pointUpgrades !== undefined) {
      out.chipUpgrades = out.pointUpgrades
      delete out.pointUpgrades
    }
    return out
  },
  // 5 -> 6: the refresh rate defaulted to every frame, which at a late-game
  // roll rate is a table of digits nobody can read and a frame budget the dice
  // then have to share. The default is 100ms now, and a save sitting on 16
  // moves with it. The setting does not record whether 16 was chosen or
  // inherited, so this does move someone who picked it deliberately; the
  // setting is one step away in OPTIONS and every other rate is left alone.
  5: (r) => {
    const o = (r as { options?: Record<string, unknown> }).options
    if (!o || o.uiMs !== 16) return r
    return { ...r, options: { ...o, uiMs: UI_MS_DEFAULT } }
  },
  // 4 -> 5: repairs a meltPower of 0. Melting multiplies up from 1 and can
  // never legitimately land on zero, so any save holding one got it from the
  // decode bug above rather than from playing.
  4: (r) => ({
    ...r,
    meltPower: !r.meltPower || new Decimal(r.meltPower).lte(0) ? '1' : r.meltPower,
  }),
  // 1 -> 2: the chain went from six solids to nine and the solids themselves
  // changed. Carrying the old amounts over by position would silently hand a
  // player a pile of d9 they never bought, so layer 0 starts again. Options,
  // and everything above layer 0, are kept.
  // 2 -> 3: same reasoning, the chain changed again.
  // 3 -> 4: rolling became a thing you do rather than a timer, and the table
  // now opens with one solid instead of four, so a study unlocks a different
  // tier than it used to. Layer 0 starts again for the same reason it did
  // twice before. Anyone already past the point where the automator appears
  // keeps it, because dropping a finished run back onto a button to press is
  // not an introduction, it is a punishment.
  3: (r) => ({
    ...r,
    solids: [],
    studies: 0,
    folios: 0,
    rollUpgrades: 0,
    ink: '10',
    inkThisWager: '0',
    // The automator is a post-Wager purchase now, so only a save that had
    // already called one keeps it.
    autoRoll: (Number(r.wagers) || 0) > 0,
  }),
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
    options: {
      ...base.options,
      ...(m.options ?? {}),
      confirms: { ...base.options.confirms, ...(m.options?.confirms ?? {}) },
    },
    stats: { ...base.stats, ...(m.stats ?? {}) },
    tarot: { ...(m.tarot ?? {}) },
    pendingDraft: Array.isArray(m.pendingDraft) ? [...m.pendingDraft] : [],
    chipUpgrades: Array.isArray(m.chipUpgrades) ? [...m.chipUpgrades] : [],
    challengesDone: Array.isArray(m.challengesDone) ? [...m.challengesDone] : [],
    autobuyers: { ...base.autobuyers, ...(m.autobuyers ?? {}) },
    achievements: Array.isArray(m.achievements) ? [...m.achievements] : [],
  }
  // Falls back to the fresh game's value, not to zero. Three of these four
  // start at zero and one starts at one, and the blanket `?? 0` handed a save
  // written before meltPower existed a meltPower of 0. That multiplies the
  // deepest solid by nothing. Before a Wager the deepest solid only feeds the
  // tier below it, so the loss hid; after one it is also the solid that makes
  // the ink, and the whole chain produced zero however the dice landed.
  for (const f of DECIMAL_FIELDS) {
    (s as any)[f] = new Decimal(m[f] ?? (base as any)[f])
  }
  s.solids = base.solids.map((d, i) => {
    const got = Array.isArray(m.solids) ? m.solids[i] : undefined
    if (!got) return d
    return { bought: Number(got.bought) || 0, amount: new Decimal(got.amount ?? 0) }
  })
  s.lastTick = Number(m.lastTick) || now
  // JSON cannot hold Infinity, so a save written before any Wager was called
  // brings this back as null. Left alone, "your fastest Wager" would read as
  // zero milliseconds and pay the cap for a run nobody has made.
  if (!Number.isFinite(s.stats.bestWagerMs)) s.stats.bestWagerMs = Infinity
  // Same reason, opposite direction. A roll count used to overflow once the
  // interval underflowed a double, which left rollAccum at -Infinity and
  // rollStartedAt at +Infinity, and JSON writes both of those as null. The
  // overflow is gone, but a save written while it was there still carries it,
  // and a null accumulator would never resolve another roll.
  if (!Number.isFinite(s.rollAccum)) s.rollAccum = 0
  if (!Number.isFinite(s.rollStartedAt)) s.rollStartedAt = 0
  return s
}

export function saveGame(s: GameState): void {
  try {
    const raw = JSON.stringify(encode(s))
    localStorage.setItem(slotKey(), raw)
    rollBackups(raw)
  } catch {
    // A full or blocked localStorage should not take the game down mid-tick.
  }
}

/** Long enough away that the save is worth a copy before anything touches it. */
const AWAY_BACKUP_MS = 30 * 60_000

export function loadGame(now: number): GameState {
  try {
    const raw = localStorage.getItem(slotKey())
    if (!raw) return newGame(now)
    const parsed = JSON.parse(raw)

    // Both copies are taken from the untouched text, before decode runs.
    // A migration that clears layer 0, which two of them do on purpose, is
    // otherwise unrecoverable, and a long absence is when a load is most
    // likely to go wrong.
    if (Number(parsed.version ?? 1) < SAVE_VERSION) writeBackup('premigration', raw)
    const last = Number(parsed.lastTick)
    if (Number.isFinite(last) && now - last > AWAY_BACKUP_MS) writeBackup('away', raw)

    return decode(parsed, now)
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
    localStorage.removeItem(slotKey())
  } catch {
    // Nothing to do. The caller reloads either way.
  }
}
