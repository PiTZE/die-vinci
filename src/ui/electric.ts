// A border that will not sit still.
//
// The idea is React Bits' ElectricBorder, itself after a pen by
// @BalintFerenczy, written out here rather than taken: there is no React in
// this project and nothing about the effect needs one. A rounded rectangle is
// walked as a path, every point on it is displaced by two noise fields, and
// the result is stroked three times: wide and faint, then narrower, then thin
// and bright, which is a glow without a blur filter.
//
// The noise is the pen's: a hashed sine for the random, bilinear interpolation
// with a smoothstep for the 2D field, and ten octaves at a low lacunarity and
// a high gain, which is what keeps detail in the high frequencies and makes
// the line look struck rather than blown. The two fields are independent, one
// per axis, and that independence is the whole effect: displacing along the
// outward normal instead gives a ripple.
//
// One departure worth naming. The original animates by advancing a clock, so
// it draws whether or not anyone is looking. This runs only while the element
// is on screen and the tab is visible, because the game already spends its
// frame budget on nine tumbling solids and a border nobody can see is the
// easiest thing in the world to stop drawing.

const REDUCED = window.matchMedia('(prefers-reduced-motion: reduce)')

export interface ElectricOptions {
  /** Any CSS colour. Defaults to the theme's accent. */
  color?: string
  /** Higher is faster. */
  speed?: number
  /** How far the filament strays, as a fraction of the shorter side. The pen
   *  it comes from uses a flat 60px, which is most of a top-bar readout and a
   *  twentieth of a hero card: the same number cannot be right for both. */
  chaos?: number
  /** Corner radius, matching whatever the element itself has. */
  radius?: number
  /** The bright stroke's width. The glow is drawn from this. */
  thickness?: number
}

/** The pen's hash. Deterministic, and cheap enough to call per sample. */
function hash(x: number): number {
  return (Math.sin(x * 12.9898) * 43758.5453) % 1
}

/** Value noise: four corners of a cell, smoothstepped and interpolated. */
function noise2D(x: number, y: number): number {
  const i = Math.floor(x)
  const j = Math.floor(y)
  const fx = x - i
  const fy = y - j
  const a = hash(i + j * 57)
  const b = hash(i + 1 + j * 57)
  const c = hash(i + (j + 1) * 57)
  const d = hash(i + 1 + (j + 1) * 57)
  const ux = fx * fx * (3 - 2 * fx)
  const uy = fy * fy * (3 - 2 * fy)
  return a * (1 - ux) * (1 - uy) + b * ux * (1 - uy) + c * (1 - ux) * uy + d * ux * uy
}

// The pen's own numbers. Ten octaves at a low lacunarity and a high gain is
// what makes the line jagged rather than wavy: the high frequencies keep most
// of their amplitude, so the filament has detail all the way down.
const OCTAVES = 10
const LACUNARITY = 1.6
const GAIN = 0.7
const FREQUENCY = 10
/**
 * What ten octaves at this gain add up to, so the amplitude means something.
 *
 * Without it the sum reaches about 3.3 times the amplitude asked for, and
 * `chaos` is a number whose effect you find by trying it. Divided through, it
 * is the furthest the filament can stray, as a fraction of the shorter side,
 * which is a thing you can reason about before you look.
 */
const OCTAVE_SUM = (1 - Math.pow(GAIN, OCTAVES)) / (1 - GAIN)

function octaved(x: number, time: number, amplitude: number, seed: number): number {
  let sum = 0
  let a = amplitude
  let f = FREQUENCY
  for (let i = 0; i < OCTAVES; i++) {
    sum += a * noise2D(f * x + seed * 100, time * f * 0.3)
    f *= LACUNARITY
    a *= GAIN
  }
  return sum / OCTAVE_SUM
}

interface Point {
  x: number
  y: number
}

/**
 * A point at `t` around a rounded rectangle, 0 to 1, with the outward normal
 * there. Walked by arc length rather than by angle, so the samples are evenly
 * spaced along the path and the corners are not denser than the edges.
 */
function perimeterPoint(t: number, w: number, h: number, r: number): Point {
  const sw = Math.max(0, w - 2 * r)
  const sh = Math.max(0, h - 2 * r)
  const arc = (Math.PI * r) / 2
  const total = 2 * sw + 2 * sh + 4 * arc
  let d = ((t % 1) + 1) % 1 * total

  const corner = (cx: number, cy: number, from: number, k: number): Point => {
    const a = from + k * (Math.PI / 2)
    return { x: cx + r * Math.cos(a), y: cy + r * Math.sin(a) }
  }

  if (d <= sw) return { x: r + d, y: 0 }
  d -= sw
  if (d <= arc) return corner(w - r, r, -Math.PI / 2, d / arc)
  d -= arc
  if (d <= sh) return { x: w, y: r + d }
  d -= sh
  if (d <= arc) return corner(w - r, h - r, 0, d / arc)
  d -= arc
  if (d <= sw) return { x: w - r - d, y: h }
  d -= sw
  if (d <= arc) return corner(r, h - r, Math.PI / 2, d / arc)
  d -= arc
  if (d <= sh) return { x: 0, y: h - r - d }
  d -= sh
  return corner(r, r, Math.PI, Math.min(1, d / arc))
}

/** A sample every two pixels of perimeter, which is the pen's own rate: enough
 *  that the filament reads as a line rather than as a polygon. */
function samplesFor(w: number, h: number, r: number): number {
  return Math.max(64, Math.floor((2 * (w + h) + 2 * Math.PI * r) / 2))
}

/**
 * Draws the border over `host` and returns a function that takes it away.
 *
 * The canvas sits outside the element's box by `bleed`, because the glow is
 * wider than the border it belongs to and a glow clipped at the border is a
 * hard edge, which is the one thing it must not have.
 */
export function electricBorder(host: HTMLElement, opts: ElectricOptions = {}): () => void {
  const speed = opts.speed ?? 1
  const chaos = opts.chaos ?? 0.055
  const radius = opts.radius ?? 0
  const thickness = opts.thickness ?? 1
  /** How far the filament can stray, and the room the canvas leaves for it. */
  let reach = 0
  let bleed = 0

  const canvas = document.createElement('canvas')
  canvas.className = 'electric'
  canvas.setAttribute('aria-hidden', 'true')
  const ctx = canvas.getContext('2d')
  host.appendChild(canvas)

  let w = 0
  let h = 0
  let dpr = 1
  const size = (): void => {
    // The laid-out size, not the drawn one. getBoundingClientRect returns the
    // box after every transform on the element and its ancestors, and this now
    // draws around a card sitting on a ring that scales it every frame: the
    // canvas resized on each of those frames and the border pulsed with the
    // card instead of staying on it.
    const bw = host.offsetWidth
    const bh = host.offsetHeight
    if (!bw || !bh) return
    dpr = Math.min(window.devicePixelRatio || 1, 2)
    w = bw
    h = bh
    reach = Math.min(w, h) * chaos
    bleed = Math.ceil(reach + thickness * 5)
    // Here, not at construction. The canvas is bigger than the element by
    // `bleed` on every side and the drawing is translated by the same, so an
    // inset that does not match puts the whole border out by that much: it
    // was set once before the element had been measured, when bleed was
    // still zero, and every border in the game sat twenty pixels down and to
    // the right of the thing it belonged to.
    canvas.style.inset = `${-bleed}px`
    canvas.width = Math.ceil((w + bleed * 2) * dpr)
    canvas.height = Math.ceil((h + bleed * 2) * dpr)
    canvas.style.width = `${w + bleed * 2}px`
    canvas.style.height = `${h + bleed * 2}px`
  }

  // The accent, read once from the element rather than passed in, so a theme
  // change is a colour change here too.
  const colour = (): string =>
    opts.color ?? (getComputedStyle(host).getPropertyValue('--accent').trim() || '#fff')

  const draw = (time: number): void => {
    if (!ctx || !w || !h) return
    ctx.setTransform(dpr, 0, 0, dpr, bleed * dpr, bleed * dpr)
    ctx.clearRect(-bleed, -bleed, w + bleed * 2, h + bleed * 2)
    const n = samplesFor(w, h, radius)
    ctx.beginPath()
    for (let i = 0; i <= n; i++) {
      const t = i / n
      const p = perimeterPoint(t, w, h, radius)
      // Two noise fields, one per axis, off the same position around the path
      // and two different seeds. Pushing along the outward normal instead
      // gives a ripple: it is the independence of the two that makes a line
      // look struck rather than blown.
      const dx = octaved(t * 8, time * speed, 1, 0) * reach
      const dy = octaved(t * 8, time * speed, 1, 1) * reach
      const x = p.x + dx
      const y = p.y + dy
      if (i === 0) ctx.moveTo(x, y)
      else ctx.lineTo(x, y)
    }
    ctx.closePath()
    const c = colour()
    ctx.lineJoin = 'round'
    ctx.lineCap = 'round'
    // Wide and faint first, thin and bright over it. Two passes of the same
    // path is what makes a stroke read as something glowing rather than as a
    // thick line: no blur filter, which costs a full-canvas convolution every
    // frame for a shape that is mostly empty.
    ctx.globalAlpha = 0.16
    ctx.lineWidth = thickness * 5
    ctx.strokeStyle = c
    ctx.stroke()
    ctx.globalAlpha = 0.34
    ctx.lineWidth = thickness * 2.5
    ctx.stroke()
    ctx.globalAlpha = 1
    ctx.lineWidth = thickness
    ctx.stroke()
  }

  let raf = 0
  let start = 0
  let running = false
  const frame = (ts: number): void => {
    if (!start) start = ts
    draw((ts - start) / 1000)
    raf = requestAnimationFrame(frame)
  }
  const run = (on: boolean): void => {
    if (on === running) return
    running = on
    if (on) raf = requestAnimationFrame(frame)
    else cancelAnimationFrame(raf)
  }

  size()
  // Still, but drawn: the border is part of the thing's shape, so it exists
  // whether or not it is allowed to move.
  if (REDUCED.matches) draw(0)

  const ro = new ResizeObserver(() => {
    size()
    if (REDUCED.matches) draw(0)
  })
  ro.observe(host)

  // Only while it is on screen. A draft sitting behind another tab is three
  // canvases redrawing a border nobody is looking at.
  let onScreen = true
  const io = new IntersectionObserver((entries) => {
    if (REDUCED.matches) return
    onScreen = entries.some((e) => e.isIntersecting)
    run(onScreen && !document.hidden)
  })
  io.observe(host)

  /**
   * Back from another app, and drawing again.
   *
   * The flag this used to read is set by the observer, and a page that goes
   * away can leave it false with no callback to put it right: coming back,
   * this asked "is it on screen" of a stale answer, said no, and left the
   * loop stopped. The pointer handlers went on working and nothing moved,
   * which reads as the whole thing having died until you change tabs and it
   * is built again. Reported from a phone.
   *
   * So it measures rather than remembers.
   */
  const onVisible = (): void => {
    if (REDUCED.matches) return
    if (document.hidden) {
      run(false)
      return
    }
    const r = host.getBoundingClientRect()
    onScreen = r.bottom > 0 && r.top < innerHeight && r.width > 0
    run(onScreen)
  }
  document.addEventListener('visibilitychange', onVisible)

  return () => {
    run(false)
    ro.disconnect()
    io.disconnect()
    document.removeEventListener('visibilitychange', onVisible)
    canvas.remove()
  }
}
