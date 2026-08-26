// Confirm-once for the actions that throw a run away.
//
// Antimatter Dimensions puts a modal in front of every destructive reset:
// confirmation-types.js lists Dimension Boost, Antimatter Galaxy, Big Crunch,
// entering a Challenge and leaving one, each with its own toggle. This game has
// no modals and does not want any, so the button arms itself instead: the first
// press turns it into SURE?, the second within four seconds goes through.
//
// It matters more here than in AD, because the study and folio buttons sit in
// the action bar under a resting thumb.
const WINDOW_MS = 4000

/** One switch per action, the way AD's confirmation-types.js does it. */
export const CONFIRM_KEYS = [
  { key: 'study', label: 'STUDY' },
  { key: 'folio', label: 'FOLIO' },
  { key: 'wager', label: 'THE WAGER' },
  { key: 'enterChallenge', label: 'ENTER A CHALLENGE' },
  { key: 'exitChallenge', label: 'LEAVE A CHALLENGE' },
] as const

export type ConfirmKey = (typeof CONFIRM_KEYS)[number]['key']

export function defaultConfirms(): Record<string, boolean> {
  const out: Record<string, boolean> = {}
  for (const c of CONFIRM_KEYS) out[c.key] = true
  return out
}

export class Confirmer {
  private armed = new Map<string, number>()

  constructor(private enabled: (key: string) => boolean) {}

  /** True when the caller should go ahead. False means it just armed. */
  request(key: string): boolean {
    if (!this.enabled(key)) return true
    const now = Date.now()
    const at = this.armed.get(key)
    if (at !== undefined && now - at < WINDOW_MS) {
      this.armed.delete(key)
      return true
    }
    this.armed.set(key, now)
    return false
  }

  isArmed(key: string): boolean {
    const at = this.armed.get(key)
    if (at === undefined) return false
    if (Date.now() - at >= WINDOW_MS) {
      this.armed.delete(key)
      return false
    }
    return true
  }

  clear(key: string): void {
    this.armed.delete(key)
  }
}
