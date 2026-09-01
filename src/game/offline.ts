// Time that passed while the game was not ticking.
//
// Three cases, one mechanism: a tab in the background, whose timers a browser
// throttles to roughly once a minute; a machine that slept; and the game being
// closed entirely. In all three the wall clock moved and the game did not, so
// the gap gets simulated rather than credited in a single step.
//
// One step would badly undercount, because the chain compounds: d26 makes d20
// which makes d12, and so on down to ink. Antimatter Dimensions splits the gap
// into a fixed number of ticks for the same reason, 1000 by default, so an
// hour away becomes 1000 ticks of 3.6 seconds each.
//
// This aims at the live tick rate instead and only falls back to a fixed budget
// once the gap is long enough to need it. A four second gap gets forty real
// ticks rather than a thousand pointless ones, and a twelve hour gap gets the
// budget.
import Decimal from '../vendor/break-infinity'
import { OFFLINE_CAP_S } from './balance'
import { tick } from './production'
import { modifiers } from './tarot'
import type { GameState } from '../state'

export interface AwaySummary {
  /** Seconds actually credited, after the cap. */
  seconds: number
  /** True when the absence was longer than the cap allows. */
  capped: boolean
  ticks: number
  ink: Decimal
}

/** Matches the live loop, so short gaps are simulated at full fidelity. */
const TICKS_PER_SECOND = 10

let pending: AwaySummary | null = null

export function simulateAway(
  s: GameState,
  elapsed: number,
  maxTicks: number,
): AwaySummary | null {
  // A clock that jumped backwards, or a corrupt lastTick.
  if (!Number.isFinite(elapsed) || elapsed <= 0) return null

  // XVIII The Moon raises the cap: the hours you were not looking.
  const cap = OFFLINE_CAP_S * modifiers(s).awayCapMult
  const capped = elapsed > cap
  const seconds = Math.min(elapsed, cap)
  const ticks = Math.max(1, Math.min(maxTicks, Math.ceil(seconds * TICKS_PER_SECOND)))
  const dt = seconds / ticks

  const before = s.ink
  // The simulated clock walks forward with the ticks, so a spin left in the
  // air when the game closed lands at the moment it would have.
  const startMs = Date.now() - seconds * 1000
  for (let i = 0; i < ticks; i++) tick(s, dt, startMs + (i + 1) * dt * 1000)

  return { seconds, capped, ticks, ink: s.ink.minus(before) }
}

/** Held for the table pane to show once, then forgotten. */
export function publishAway(summary: AwaySummary | null): void {
  pending = summary
}

export function consumeAway(): AwaySummary | null {
  const held = pending
  pending = null
  return held
}
