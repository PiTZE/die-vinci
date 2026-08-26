// Rolling save backups, modelled on Antimatter Dimensions' AutoBackupSlots.
//
// AD keeps eight independent copies in their own localStorage keys: four
// written while you play, at one minute, five minutes, twenty minutes and an
// hour, three written on load according to how long you were away, at ten
// minutes, an hour and five hours, and a reserve. Its answer to a lost save is
// not a stronger single copy, it is several copies of different ages.
//
// This keeps a smaller set of the same idea, plus one AD does not need: a copy
// of the untouched save taken before any migration runs. Migrations here have
// twice cleared layer 0 on purpose, and without this there was no way back.
import { SAVE_KEY } from './game/balance'

export interface SlotDef {
  id: string
  label: string
  /** Written this often while playing. Omitted for event-driven slots. */
  everyMs?: number
}

export const SLOTS: SlotDef[] = [
  { id: 'm5', label: '5 minutes', everyMs: 5 * 60_000 },
  { id: 'm30', label: '30 minutes', everyMs: 30 * 60_000 },
  { id: 'h4', label: '4 hours', everyMs: 4 * 3_600_000 },
  { id: 'away', label: 'on returning' },
  { id: 'premigration', label: 'before an update' },
  { id: 'undo', label: 'replaced by a restore' },
]

export interface BackupInfo {
  id: string
  label: string
  at: number
  /** Ink at the time, purely so the player can tell the copies apart. */
  ink: string
  version: number
}

const key = (id: string) => `${SAVE_KEY}-backup-${id}`
const written: Record<string, number> = {}

function wrap(raw: string): string {
  return JSON.stringify({ at: Date.now(), save: raw })
}

export function writeBackup(id: string, raw: string): void {
  try {
    localStorage.setItem(key(id), wrap(raw))
    written[id] = Date.now()
  } catch {
    // A full localStorage should never cost the player the live save, so a
    // failed backup is dropped rather than propagated.
  }
}

/** Writes whichever timed slots are due. Called on every save. */
export function rollBackups(raw: string): void {
  const now = Date.now()
  for (const slot of SLOTS) {
    if (!slot.everyMs) continue
    const last = written[slot.id] ?? readAt(slot.id)
    if (last === null || now - last >= slot.everyMs) writeBackup(slot.id, raw)
  }
}

function readAt(id: string): number | null {
  try {
    const held = localStorage.getItem(key(id))
    if (!held) return null
    const at = JSON.parse(held).at
    return typeof at === 'number' ? at : null
  } catch {
    return null
  }
}

export function readBackup(id: string): string | null {
  try {
    const held = localStorage.getItem(key(id))
    if (!held) return null
    const save = JSON.parse(held).save
    return typeof save === 'string' ? save : null
  } catch {
    return null
  }
}

export function listBackups(): BackupInfo[] {
  const out: BackupInfo[] = []
  for (const slot of SLOTS) {
    const at = readAt(slot.id)
    const save = readBackup(slot.id)
    if (at === null || !save) continue
    let ink = '?'
    let version = 0
    try {
      const parsed = JSON.parse(save)
      ink = String(parsed.ink ?? '?')
      version = Number(parsed.version ?? 0)
    } catch {
      // Unreadable, but still listed so it can be tried.
    }
    out.push({ id: slot.id, label: slot.label, at, ink, version })
  }
  return out.sort((a, b) => b.at - a.at)
}

/** Puts a backup back as the live save. The caller reloads. */
export function restoreBackup(id: string): boolean {
  const save = readBackup(id)
  if (!save) return false
  try {
    // The save being replaced becomes a backup itself, so a restore chosen by
    // mistake is not the end of it.
    const current = localStorage.getItem(SAVE_KEY)
    if (current) writeBackup('undo', current)
    localStorage.setItem(SAVE_KEY, save)
    return true
  } catch {
    return false
  }
}
