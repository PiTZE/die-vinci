// The dice, synthesised.
//
// No audio files. A clatter is filtered noise with a fast decay, and five of
// them at scattered pitches over a fifth of a second is a handful of dice
// hitting a table. Sampling that would have cost more bytes than the whole
// rest of the bundle and would still only ever be one throw, played again.
//
// An AudioContext cannot start without a gesture, which is exactly what a roll
// is, so it is built on the first one and reused.

let ctx: AudioContext | null = null
let master: GainNode | null = null
let noise: AudioBuffer | null = null
let lastRollAt = 0
let lastLandAt = 0

/** Two throws inside this are one sound. Under the automator a clatter per
 *  roll would be a machine gun. */
const MIN_GAP_MS = 140

function ready(): boolean {
  if (ctx) {
    // Suspended by the tab going away, or by the browser before a gesture.
    if (ctx.state === 'suspended') void ctx.resume()
    return true
  }
  try {
    const Ctor =
      window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
    if (!Ctor) return false
    ctx = new Ctor()
    master = ctx.createGain()
    master.gain.value = 0.5
    master.connect(ctx.destination)

    // Half a second of white noise, reused for every hit at different rates.
    const n = Math.floor(ctx.sampleRate * 0.5)
    noise = ctx.createBuffer(1, n, ctx.sampleRate)
    const d = noise.getChannelData(0)
    for (let i = 0; i < n; i++) d[i] = Math.random() * 2 - 1
    return true
  } catch {
    // No audio on this device, or blocked. The game is silent and unbothered.
    ctx = null
    return false
  }
}

/**
 * One die striking something. Filtered noise, struck and damped: a bandpass
 * gives it a pitch, the fast gain decay gives it the edge, and a short one
 * with a high centre is bone on wood.
 */
function hit(at: number, gain: number, hz: number, decay: number): void {
  if (!ctx || !master || !noise) return
  const src = ctx.createBufferSource()
  src.buffer = noise
  src.playbackRate.value = 0.7 + Math.random() * 0.9

  const band = ctx.createBiquadFilter()
  band.type = 'bandpass'
  band.frequency.value = hz
  band.Q.value = 1.6

  // Takes the low rumble off, which is what made it sound like static rather
  // than something small and hard.
  const hp = ctx.createBiquadFilter()
  hp.type = 'highpass'
  hp.frequency.value = 700

  const g = ctx.createGain()
  g.gain.setValueAtTime(0, at)
  g.gain.linearRampToValueAtTime(gain, at + 0.004)
  g.gain.exponentialRampToValueAtTime(0.0001, at + decay)

  src.connect(band)
  band.connect(hp)
  hp.connect(g)
  g.connect(master)
  src.start(at)
  src.stop(at + decay + 0.02)
}

/** The throw: dice leaving the hand and knocking about. */
export function playRoll(dice: number): void {
  const now = Date.now()
  if (now - lastRollAt < MIN_GAP_MS) return
  lastRollAt = now
  if (!ready() || !ctx) return

  const t = ctx.currentTime
  // More dice, more clatter, but it stops growing early: nine solids rolling
  // should sound busier than one, not nine times louder.
  const hits = Math.min(7, 2 + Math.round(Math.sqrt(dice) * 1.6))
  for (let i = 0; i < hits; i++) {
    // Scattered rather than evenly spaced. An even train is a drum roll.
    const at = t + Math.random() * 0.19
    hit(at, 0.16 + Math.random() * 0.12, 1300 + Math.random() * 2100, 0.05 + Math.random() * 0.05)
  }
}

/** The landing: one last, lower knock as they settle. */
export function playLand(): void {
  const now = Date.now()
  if (now - lastLandAt < MIN_GAP_MS) return
  lastLandAt = now
  if (!ready() || !ctx) return
  const t = ctx.currentTime
  hit(t, 0.2, 900 + Math.random() * 500, 0.09)
}

export function setVolume(v: number): void {
  if (master) master.gain.value = v
}
