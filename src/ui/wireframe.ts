// Rotating wireframe polyhedra, drawn as SVG paths.
//
// No three.js. A vertex list, a rotation matrix and an orthographic
// projection is the whole job, it costs nothing in the bundle, and thin
// strokes in currentColor look like an engraving instead of a shaded asset.
// The rhombicuboctahedron is not a three.js built-in anyway, so its vertices
// would have been hand-written either way.
import { SOLIDS, type SolidId, type SolidShape } from '../game/solids'

type V3 = [number, number, number]

function cyclic(a: number, b: number, c: number): V3[] {
  return [
    [a, b, c],
    [b, c, a],
    [c, a, b],
  ]
}

function signs(v: V3): V3[] {
  const out: V3[] = []
  for (const sx of [1, -1]) {
    for (const sy of [1, -1]) {
      for (const sz of [1, -1]) {
        out.push([v[0] * sx, v[1] * sy, v[2] * sz])
      }
    }
  }
  return out
}

function dedupe(vs: V3[]): V3[] {
  const out: V3[] = []
  for (const v of vs) {
    if (!out.some((w) => Math.abs(w[0] - v[0]) < 1e-9 && Math.abs(w[1] - v[1]) < 1e-9 && Math.abs(w[2] - v[2]) < 1e-9)) {
      out.push(v)
    }
  }
  return out
}

type Geo = { vs: V3[]; es: [number, number][] }

const PHI = (1 + Math.sqrt(5)) / 2
const SILVER = 1 + Math.sqrt(2)

/** Edges of a uniform polyhedron are its shortest vertex pairs. True for every
 *  solid here except the sphere, and it saves nine hand-written edge tables. */
function edgesByDistance(vs: V3[]): [number, number][] {
  let min = Infinity
  const d = (a: V3, b: V3) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2])
  for (let i = 0; i < vs.length; i++) {
    for (let j = i + 1; j < vs.length; j++) min = Math.min(min, d(vs[i], vs[j]))
  }
  const out: [number, number][] = []
  for (let i = 0; i < vs.length; i++) {
    for (let j = i + 1; j < vs.length; j++) {
      if (d(vs[i], vs[j]) < min * 1.0001) out.push([i, j])
    }
  }
  return out
}

/** Every permutation of a triple, with every sign combination. */
function allPermutations(a: number, b: number, c: number): V3[] {
  return dedupe([
    ...signs([a, b, c]),
    ...signs([a, c, b]),
    ...signs([b, a, c]),
    ...signs([b, c, a]),
    ...signs([c, a, b]),
    ...signs([c, b, a]),
  ])
}

/** Every cyclic permutation of a triple, with every sign combination. */
function cyclicSigns(a: number, b: number, c: number): V3[] {
  return dedupe(cyclic(a, b, c).flatMap((v) => signs(v)))
}

function uniformVertices(id: SolidId): V3[] {
  switch (id) {
    case 'tetra':
      return [
        [1, 1, 1],
        [1, -1, -1],
        [-1, 1, -1],
        [-1, -1, 1],
      ]
    case 'hexa':
      return signs([1, 1, 1])
    case 'octa':
      return cyclicSigns(1, 0, 0)
    case 'dodeca':
      return dedupe([...signs([1, 1, 1]), ...cyclicSigns(0, 1 / PHI, PHI)])
    case 'trunccube':
      // All permutations of (+-xi, +-1, +-1), where xi is sqrt(2) - 1.
      return allPermutations(Math.SQRT2 - 1, 1, 1)
    case 'icosa':
      return cyclicSigns(0, 1, PHI)
    case 'rhombi':
      return cyclicSigns(1, 1, SILVER)
    case 'icosidodeca':
      // (0, 0, +-PHI) cyclic, plus (+-1/2, +-PHI/2, +-PHI^2/2) cyclic. Thirty.
      return dedupe([
        ...cyclicSigns(0, 0, PHI),
        ...cyclicSigns(0.5, PHI / 2, (PHI * PHI) / 2),
      ])
    default:
      return []
  }
}

/**
 * A latitude and longitude sphere, meridians by bands. Pacioli's plate is
 * called a sphere of seventy-two bases and twelve meridians across six bands
 * is exactly seventy-two quadrilaterals. His actual construction is not
 * something I could source, so this matches the face count and the description
 * rather than claiming to reproduce the drawing.
 */
function sphere(meridians: number, bands: number): Geo {
  const vs: V3[] = []
  const ring: number[][] = []
  for (let b = 1; b < bands; b++) {
    const phi = (b / bands) * Math.PI
    const y = Math.cos(phi)
    const r = Math.sin(phi)
    const row: number[] = []
    for (let m = 0; m < meridians; m++) {
      const th = (m / meridians) * Math.PI * 2
      row.push(vs.push([r * Math.cos(th), y, r * Math.sin(th)]) - 1)
    }
    ring.push(row)
  }
  const north = vs.push([0, 1, 0]) - 1
  const south = vs.push([0, -1, 0]) - 1

  const es: [number, number][] = []
  for (const row of ring) {
    for (let m = 0; m < meridians; m++) es.push([row[m], row[(m + 1) % meridians]])
  }
  for (let b = 0; b + 1 < ring.length; b++) {
    for (let m = 0; m < meridians; m++) es.push([ring[b][m], ring[b + 1][m]])
  }
  for (let m = 0; m < meridians; m++) {
    es.push([north, ring[0][m]], [south, ring[ring.length - 1][m]])
  }
  return { vs, es }
}

function geometryFor(def: { id: SolidId; shape: SolidShape }): Geo {
  if (def.shape.kind === 'sphere') return sphere(def.shape.meridians, def.shape.bands)
  const vs = uniformVertices(def.id)
  return { vs, es: edgesByDistance(vs) }
}

function normalize(g: Geo): Geo {
  const r = Math.max(...g.vs.map((v) => Math.hypot(v[0], v[1], v[2])))
  return { vs: g.vs.map((v) => [v[0] / r, v[1] / r, v[2] / r] as V3), es: g.es }
}

const CACHE = new Map<SolidId, Geo>()

function geometry(id: SolidId): Geo {
  let g = CACHE.get(id)
  if (!g) {
    const def = SOLIDS.find((d) => d.id === id)
    if (!def) throw new Error(`no solid named ${id}`)
    g = normalize(geometryFor(def))
    CACHE.set(id, g)
  }
  return g
}

const SVG_NS = 'http://www.w3.org/2000/svg'
const REDUCED = window.matchMedia('(prefers-reduced-motion: reduce)')

/**
 * Two drawing modes, chosen by edge count.
 *
 * A simple solid gets one line element per edge, with opacity interpolated
 * continuously from depth. That is the smoothest, and on a tetrahedron any
 * banding would be obvious.
 *
 * A dense one would cost five attribute writes per edge per frame, and nine
 * rows of that measured as much as 22fps. Those sort their edges into a few
 * paths by depth instead: one write per bucket rather than per edge. The
 * banding that reintroduces is invisible once a solid has forty edges, and the
 * cost stops scaling with edge count.
 */
const LINES_UP_TO = 16
const BUCKETS = 10

/** Front edges bright, back edges falling away. Squared so the front holds. */
function depthOpacity(f: number): number {
  const c = Math.min(1, Math.max(0, f))
  return 0.22 + 0.78 * c * c
}

class Wire {
  readonly el: SVGSVGElement
  private lines: SVGLineElement[] = []
  private paths: SVGPathElement[] = []
  private id: SolidId
  private t = Math.random() * Math.PI * 2
  /** Tumble axis weights, re-picked on every throw. A fixed pair made nine
   *  dice turn in lockstep like a row of gears, which is the one thing a
   *  handful of thrown dice never looks like. */
  private wy = 1
  private wx = 0.42
  /** Each die leaves the hand a little differently. */
  private speed = 1
  /** Keeps the nine tumbles out of phase with each other. */
  private phase = Math.random() * Math.PI * 2
  /** And the nine bounces, so they do not all hit the table together. */
  private hopPhase = Math.random() * 0.4
  visible = true
  /** A row with no dice on it. It stays where it is. */
  rolls = true

  /** Puts it back square, for when it stops taking part mid-throw. */
  rest(): void {
    if (this.el.style.transform) this.el.style.transform = ''
  }

  /** A new throw. Fresh axis, fresh rate. */
  throw(): void {
    // Kept away from zero on both axes, or the solid spins flat about one axis
    // and reads as a wheel rather than a tumble.
    const a = Math.random() * Math.PI * 2
    this.wy = 0.55 + Math.abs(Math.cos(a)) * 0.75
    this.wx = 0.55 + Math.abs(Math.sin(a)) * 0.75
    if (Math.random() < 0.5) this.wx = -this.wx
    this.speed = 0.8 + Math.random() * 0.45
    this.phase = Math.random() * Math.PI * 2
    this.hopPhase = Math.random() * 0.4
  }

  constructor(id: SolidId) {
    this.id = id
    this.el = document.createElementNS(SVG_NS, 'svg')
    this.el.setAttribute('viewBox', '-1.15 -1.15 2.3 2.3')
    this.el.setAttribute('aria-hidden', 'true')

    const { es } = geometry(id)
    const paint = (n: SVGElement) => {
      n.setAttribute('stroke', 'currentColor')
      n.setAttribute('stroke-width', '1')
      n.setAttribute('stroke-linecap', 'round')
      n.setAttribute('vector-effect', 'non-scaling-stroke')
      n.setAttribute('fill', 'none')
      this.el.appendChild(n)
    }

    if (es.length <= LINES_UP_TO) {
      this.lines = es.map(() => {
        const ln = document.createElementNS(SVG_NS, 'line')
        paint(ln)
        return ln
      })
    } else {
      this.paths = Array.from({ length: BUCKETS }, (_, i) => {
        const p = document.createElementNS(SVG_NS, 'path')
        paint(p)
        p.setAttribute('stroke-opacity', depthOpacity((i + 0.5) / BUCKETS).toFixed(3))
        return p
      })
    }
    this.draw()
  }

  /**
   * `turns` is the absolute rotation this die should be at, in revolutions,
   * and `shake` is 0 to 1 for how much it is still bouncing.
   *
   * Absolute rather than accumulated: a throw is a curve from a start to a
   * finish, and integrating a rate towards it drifts, so a die that should
   * land square lands a few degrees off and the last frame snaps.
   */
  render(turns: number, progress: number): void {
    this.t = turns * Math.PI * 2 * this.speed + this.phase
    this.bounce(progress)
    this.draw()
  }

  step(dt: number, rate: number): void {
    this.t += dt * rate * this.speed
    // Rolling too fast to watch. A light constant wobble, no bounce: there is
    // no landing to settle onto.
    const j = Math.min(1, rate / MAX_SPIN)
    this.place(
      Math.sin(this.t * 0.6 + this.phase * 2) * 0.9 * j,
      Math.sin(this.t * 0.9 + this.phase) * 1.4 * j,
      Math.sin(this.t * 0.75 + this.phase) * 3.4 * j,
    )
    this.draw()
  }

  /**
   * A die does not vibrate on the spot, it hops and settles. Three diminishing
   * hops across the throw, driven by progress rather than by the tumble angle,
   * because tying them together gave a single slow heave over the whole roll
   * that read as the icon drifting.
   */
  private bounce(p: number): void {
    const fade = Math.pow(1 - p, 1.4)
    // Negative is up. abs() makes each half-cycle a hop rather than a dip.
    const hop = -Math.abs(Math.sin((p * BOUNCES + this.hopPhase) * Math.PI)) * 3.1 * fade
    const side = Math.sin((p * 2 + this.hopPhase) * Math.PI) * 1.5 * (1 - p)
    const tilt = Math.sin((p * 4 + this.hopPhase) * Math.PI) * 7 * fade
    this.place(side, hop, tilt)
  }

  private place(x: number, y: number, deg: number): void {
    if (Math.abs(x) < 0.02 && Math.abs(y) < 0.02 && Math.abs(deg) < 0.05) {
      // Square, and cleared rather than left at a hundredth of a degree.
      if (this.el.style.transform) this.el.style.transform = ''
      return
    }
    this.el.style.transform =
      `translate3d(${x.toFixed(2)}px, ${y.toFixed(2)}px, 0) rotate(${deg.toFixed(2)}deg)`
  }

  private draw(): void {
    const { vs, es } = geometry(this.id)
    const ay = this.t * this.wy
    const ax = this.t * this.wx
    const cy = Math.cos(ay)
    const sy = Math.sin(ay)
    const cx = Math.cos(ax)
    const sx = Math.sin(ax)

    const px: number[] = []
    const py: number[] = []
    const pz: number[] = []
    for (const v of vs) {
      const x1 = v[0] * cy + v[2] * sy
      const z1 = -v[0] * sy + v[2] * cy
      const y2 = v[1] * cx - z1 * sx
      const z2 = v[1] * sx + z1 * cx
      px.push(x1)
      py.push(y2)
      pz.push(z2)
    }

    if (this.lines.length) {
      for (let i = 0; i < es.length; i++) {
        const [a, b] = es[i]
        const ln = this.lines[i]
        ln.setAttribute('x1', px[a].toFixed(3))
        ln.setAttribute('y1', py[a].toFixed(3))
        ln.setAttribute('x2', px[b].toFixed(3))
        ln.setAttribute('y2', py[b].toFixed(3))
        ln.setAttribute('stroke-opacity', depthOpacity((pz[a] + pz[b]) / 4 + 0.5).toFixed(3))
      }
      return
    }

    const buckets: string[] = new Array(BUCKETS).fill('')
    for (const [a, b] of es) {
      const f = (pz[a] + pz[b]) / 4 + 0.5
      const slot = Math.min(BUCKETS - 1, Math.max(0, Math.floor(f * BUCKETS)))
      buckets[slot] +=
        `M${px[a].toFixed(3)} ${py[a].toFixed(3)}L${px[b].toFixed(3)} ${py[b].toFixed(3)}`
    }
    for (let i = 0; i < BUCKETS; i++) this.paths[i].setAttribute('d', buckets[i])
  }
}

// One loop drives every wireframe on the page. No reason to run it while the
// tab is hidden or the row is scrolled out of view.
const live = new Set<Wire>()
let raf = 0
let last = 0

const observer =
  'IntersectionObserver' in window
    ? new IntersectionObserver((entries) => {
        for (const e of entries) {
          const w = byEl.get(e.target as SVGSVGElement)
          if (w) w.visible = e.isIntersecting
        }
      })
    : null

const byEl = new Map<SVGSVGElement, Wire>()

// A die at rest is a die showing a face. It only turns while a roll is in the
// air, which is what makes pressing ROLL feel like anything at all.
//
// The throw is one curve from start to finish, not a constant spin with a stop
// bolted on the end. It leaves the hand fast and decelerates the whole way, so
// it is still slowing as it lands rather than being switched off. Everything
// written about dice animation says the same thing: one eased motion, a second
// or so long, arriving at a definite rest. The earlier version ran at a
// revolution and a half a second flat for the whole roll and then braked in a
// third of a second, which is why it read as frantic.
//
// Revolutions are per throw and per die, so nine solids do not arrive together
// like a row of gears.
const TURNS_MIN = 1.15
const TURNS_SPREAD = 0.7

/**
 * The ceiling on how fast a die turns, in radians a second. About 4.8
 * revolutions, which at 60fps is 29 degrees a frame.
 *
 * The limit is aliasing, not taste. A shape turning more than one symmetry
 * step per frame reads as turning backwards, or as standing still. The
 * tetrahedron's step is 120 degrees and the 72-face sphere's is 30, so the
 * sphere sets the bound, and this sits just under it.
 *
 * Everything below the ceiling scales with the roll rate: the same throw
 * inside a shorter interval is a faster throw. Above it the dice stop getting
 * faster and simply do not stop, which is what a roll rate too high to watch
 * should look like.
 */
const MAX_SPIN = 30

/** Hops per throw. Three is a die landing; one is a heave. */
const BOUNCES = 3

type Mode = 'rest' | 'throw' | 'blur'
let mode: Mode = 'rest'
let progress = 1
let lastProgress = 1
let turns = TURNS_MIN

/** Fast out, slow in. Cubic: gentler than the quartic a die's last bounce
 *  really has, and a hard brake at this size reads as a dropped frame. */
function easeOut(p: number): number {
  return 1 - Math.pow(1 - p, 3)
}

/**
 * Where the current throw is, 0 to 1. Called every frame. Going backwards is
 * how a new throw announces itself, which covers both a fresh press and the
 * automator rolling continuously.
 */
/**
 * How far a die turns during one throw of `duration` seconds.
 *
 * A fixed number of revolutions was right at a roll a second and wrong
 * everywhere else: the same 1.5 turns crammed into a fifth of a second is a
 * strobe. Past the point where the ceiling binds, the throw covers less ground
 * instead of turning faster, so it stays a legible flick.
 */
function turnsFor(duration: number): number {
  const wanted = TURNS_MIN + Math.random() * TURNS_SPREAD
  if (duration <= 0) return wanted
  return Math.min(wanted, (MAX_SPIN * duration) / (Math.PI * 2))
}

export function setThrow(p: number, duration: number): void {
  const clamped = Math.max(0, Math.min(1, p))
  if (clamped < lastProgress - 0.02) {
    turns = turnsFor(duration)
    for (const w of live) w.throw()
  }
  lastProgress = clamped
  progress = clamped
  const next: Mode = clamped >= 1 ? 'rest' : 'throw'
  if (next === 'rest' && mode !== 'rest') {
    // Coming to rest stops the loop, so the settled frame has to be drawn
    // here or the die keeps whatever tilt it happened to be at.
    for (const w of live) if (w.rolls) w.render(turns, 1)
  }
  mode = next
  if (mode === 'throw') ensureLoop()
}

/** Rolls too fast to watch. One continuous turn at the ceiling, no per-roll
 *  easing: restarting a curve every 30ms is a stutter, not an animation. The
 *  ceiling is also what the fastest readable throw reaches, so crossing into
 *  this does not visibly change speed. */
export function setBlur(on: boolean): void {
  if (on) {
    mode = 'blur'
    ensureLoop()
  } else if (mode === 'blur') {
    mode = 'rest'
    lastProgress = 1
    progress = 1
  }
}

function frame(now: number): void {
  raf = requestAnimationFrame(frame)
  const dt = Math.min((now - last) / 1000, 0.25)
  last = now
  if (document.hidden) return

  if (mode === 'throw') {
    const e = easeOut(progress)
    for (const w of live) if (w.visible && w.rolls) w.render(turns * e, progress)
    return
  }

  if (mode === 'blur') {
    for (const w of live) if (w.visible && w.rolls) w.step(dt, MAX_SPIN)
    return
  }

  // At rest. The loop keeps running because a throw can start on any frame.
}

function ensureLoop(): void {
  if (raf || REDUCED.matches) return
  last = performance.now()
  raf = requestAnimationFrame(frame)
}

function stopLoop(): void {
  if (!raf) return
  cancelAnimationFrame(raf)
  raf = 0
}

REDUCED.addEventListener('change', () => (REDUCED.matches ? stopLoop() : ensureLoop()))

/**
 * Whether this die takes part in a throw. A row you own none of does not:
 * it has nothing to land, and a solid tumbling to no effect is noise.
 */
export function setDieRolling(el: SVGSVGElement, on: boolean): void {
  const w = byEl.get(el)
  if (!w || w.rolls === on) return
  w.rolls = on
  if (!on) w.rest()
}

export function wireframe(id: SolidId, cls = 'solid-icon'): SVGSVGElement {
  const w = new Wire(id)
  w.el.setAttribute('class', cls)
  live.add(w)
  byEl.set(w.el, w)
  observer?.observe(w.el)
  ensureLoop()
  return w.el
}
