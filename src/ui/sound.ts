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

const SOURCES = ['throw-1', 'throw-2', 'throw-3']

let ctx: AudioContext | null = null
let master: GainNode | null = null
const buffers: AudioBuffer[] = []
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

async function load(): Promise<void> {
  if (loading || buffers.length || !ctx) return
  loading = true
  try {
    const decoded = await Promise.all(
      SOURCES.map(async (name) => {
        const res = await fetch(`${base()}sfx/${name}.mp3`)
        return ctx!.decodeAudioData(await res.arrayBuffer())
      }),
    )
    buffers.push(...decoded)
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

/** Lets the first press make a sound rather than only starting the download. */
export function warmSound(): void {
  start()
}

export function setVolume(v: number): void {
  if (master) master.gain.value = v
}
