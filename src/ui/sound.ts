// The dice, recorded.
//
// This was synthesised first: filtered noise, struck and damped, scattered in
// time. It sounded like static being switched on and off, because a die
// hitting a table is not a noise burst, it is a hard small object with a
// resonance that changes as it tumbles onto different faces. That is not
// something a bandpass filter approximates well.
//
// So these are real dice. Kenney's Casino Audio, CC0, three throws re-encoded
// to mono MP3, nineteen kilobytes for all of them. See public/sfx/CREDITS.txt.
//
// Played through Web Audio rather than <audio> elements: an <audio> tag has a
// start latency you can hear against a button press, will not overlap itself,
// and cannot be pitched. A decoded buffer can do all three.

const THROWS = ['throw-1', 'throw-2', 'throw-3']
const SHAKE = 'shake'

let ctx: AudioContext | null = null
let master: GainNode | null = null
const buffers: AudioBuffer[] = []
let shakeBuffer: AudioBuffer | null = null
let loading = false
let lastAt = 0
let lastPick = -1

/** Two throws inside this are one sound. Under the automator a clatter per
 *  roll would be a machine gun. */
const MIN_GAP_MS = 150

function base(): string {
  // The dev channel is served from a subdirectory, so this cannot be absolute.
  return import.meta.env.BASE_URL
}

/** Built on the first gesture, because an AudioContext cannot start without
 *  one, and the first roll is always one. */
function start(): boolean {
  if (ctx) {
    if (ctx.state === 'suspended') void ctx.resume()
    return true
  }
  try {
    const Ctor =
      window.AudioContext ??
      (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
    if (!Ctor) return false
    ctx = new Ctor()
    master = ctx.createGain()
    master.gain.value = 0.55
    master.connect(ctx.destination)
  } catch {
    // No audio on this device, or blocked. The game is silent and unbothered.
    ctx = null
    return false
  }
  void load()
  return true
}

async function grab(name: string): Promise<AudioBuffer> {
  const res = await fetch(`${base()}sfx/${name}.mp3`)
  return ctx!.decodeAudioData(await res.arrayBuffer())
}

async function load(): Promise<void> {
  if (loading || buffers.length || !ctx) return
  loading = true
  try {
    const [throws, shake] = await Promise.all([
      Promise.all(THROWS.map(grab)),
      grab(SHAKE),
    ])
    buffers.push(...throws)
    shakeBuffer = shake
  } catch {
    // Offline before the worker cached them, or a decode failure. Silent.
  } finally {
    loading = false
  }
}

/**
 * One throw. Three recordings would give themselves away inside a minute, so
 * each is pitched a little either way and never picked twice running: at a
 * roll a second you notice a repeat long before you notice a pitch shift.
 */
export function playThrow(): void {
  const now = Date.now()
  if (now - lastAt < MIN_GAP_MS) return
  lastAt = now
  if (!start() || !ctx || !master || !buffers.length) return

  let i = Math.floor(Math.random() * buffers.length)
  if (buffers.length > 1 && i === lastPick) i = (i + 1) % buffers.length
  lastPick = i

  const src = ctx.createBufferSource()
  src.buffer = buffers[i]
  src.playbackRate.value = 0.9 + Math.random() * 0.22

  const g = ctx.createGain()
  g.gain.value = 0.8 + Math.random() * 0.35

  src.connect(g)
  g.connect(master)
  src.start()
}

// ---------------------------------------------------------------------------
// The spin bed
//
// Once rolls come faster than the ear can pick apart, one throw per roll stops
// being a sound and becomes a machine gun. Underneath them instead is a loop
// of dice being shaken, pitched up with the roll rate, faded in as the
// discrete throws stop and faded out again as the rate climbs past the point
// where even a rattle is meaningful. What is left is silence and a blur, which
// is the honest picture of a thousand rolls a second.

/** Where the throws stop and the bed takes over, in seconds per roll. */
const BED_FROM = 0.3
/** And where the bed itself has faded away. */
const BED_TO = 0.015
const BED_PEAK = 0.42
/** Long, because every one of these was asked for slowly. */
const BED_GLIDE = 0.9

let bedSource: AudioBufferSourceNode | null = null
let bedGain: GainNode | null = null
let bedAt = -1
let bedRate = -1

function stopBed(): void {
  if (!bedSource || !bedGain || !ctx) return
  // Faded rather than cut. A loop stopping dead is a click.
  bedGain.gain.setTargetAtTime(0, ctx.currentTime, 0.25)
  const src = bedSource
  bedSource = null
  bedGain = null
  bedAt = -1
  bedRate = -1
  try {
    src.stop(ctx.currentTime + 1.5)
  } catch {
    // Already stopped.
  }
}

/**
 * `interval` is seconds per roll. Called every frame, so it only touches the
 * audio graph when the numbers have actually moved.
 */
export function setSpinBed(interval: number, on: boolean): void {
  if (!on || !Number.isFinite(interval) || interval >= BED_FROM || interval <= 0) {
    stopBed()
    return
  }
  if (!start() || !ctx || !master || !shakeBuffer) return

  // Position across the band, on a log scale, because roll rate climbs by
  // multiplying and a linear reading would spend the whole band at one end.
  const span = Math.log(BED_FROM / BED_TO)
  const x = Math.min(1, Math.max(0, Math.log(BED_FROM / interval) / span))
  // In, then out. Both halves are the same slow curve.
  const gain = Math.sin(x * Math.PI) * BED_PEAK
  const rate = 0.85 + x * 1.5

  if (!bedSource) {
    bedGain = ctx.createGain()
    bedGain.gain.value = 0
    bedGain.connect(master)
    bedSource = ctx.createBufferSource()
    bedSource.buffer = shakeBuffer
    bedSource.loop = true
    bedSource.connect(bedGain)
    bedSource.start()
  }

  const now = ctx.currentTime
  if (Math.abs(gain - bedAt) > 0.01) {
    bedGain!.gain.setTargetAtTime(gain, now, BED_GLIDE)
    bedAt = gain
  }
  if (Math.abs(rate - bedRate) > 0.01) {
    bedSource.playbackRate.setTargetAtTime(rate, now, BED_GLIDE)
    bedRate = rate
  }
}

/** Where a single throw is still its own event rather than part of the bed. */
export const THROW_ABOVE_S = BED_FROM

/** Lets the first press make a sound rather than only starting the download. */
export function warmSound(): void {
  start()
}

export function setVolume(v: number): void {
  if (master) master.gain.value = v
}
