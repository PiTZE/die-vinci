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

/**
 * The angle a die sits at when it is not rolling.
 *
 * One angle for every solid, and a fixed one. It used to be `Math.random()`
 * per die, which is what a tumbling die wants and the opposite of what a
 * still one does: nine solids at rest were nine arbitrary poses, and a couple
 * of them landed close enough to edge-on that vertices projected on top of
 * each other. Off-axis on purpose for the same reason.
 */
const REST_T = 0.6

/**
 * And the axes it is turned about, which the pose depends on just as much.
 *
 * `throw()` re-picks these on every throw so nine dice do not turn in
 * lockstep, so winding the angle back without them left a die at the right
 * angle about the wrong pair of axes: still a different picture every time it
 * stopped. These are the values a die is built with.
 */
const REST_WY = 1
const REST_WX = 0.42

class Wire {
  readonly el: SVGSVGElement
  private lines: SVGLineElement[] = []
  private paths: SVGPathElement[] = []
  private id: SolidId
  private t = REST_T
  /** Tumble axis weights, re-picked on every throw. A fixed pair made nine
   *  dice turn in lockstep like a row of gears, which is the one thing a
   *  handful of thrown dice never looks like. */
  private wy = REST_WY
  private wx = REST_WX
  /** Each die leaves the hand a little differently. */
  private speed = 1
  /** Revolutions this throw, picked against this solid's own ceiling. */
  private turns = 1
  /** Keeps the nine tumbles out of phase with each other. */
  private phase = Math.random() * Math.PI * 2
  /** And the nine bounces, so they do not all hit the table together. */
  private hopPhase = Math.random() * 0.4
  visible = true
  /** A row with no dice on it. It stays where it is. */
  rolls = true

  /**
   * Puts it back where it started, for when it stops taking part.
   *
   * Both halves. Clearing the transform drops the hop and the tilt, which is
   * what this used to do and all it used to do; the solid itself is drawn from
   * `t`, so without winding that back the die kept whatever orientation the
   * throw abandoned it in, and a table with one die automated was eight solids
   * frozen at eight arbitrary angles.
   */
  rest(): void {
    if (this.el.style.transform) this.el.style.transform = ''
    if (this.t === REST_T && this.wy === REST_WY && this.wx === REST_WX) return
    this.t = REST_T
    this.wy = REST_WY
    this.wx = REST_WX
    this.draw()
  }

  /** A new throw. Fresh axis, fresh rate. */
  throw(duration: number): void {
    // Kept away from zero on both axes, or the solid spins flat about one axis
    // and reads as a wheel rather than a tumble.
    const a = Math.random() * Math.PI * 2
    this.wy = 0.55 + Math.abs(Math.cos(a)) * 0.75
    this.wx = 0.55 + Math.abs(Math.sin(a)) * 0.75
    if (Math.random() < 0.5) this.wx = -this.wx
    this.speed = 0.8 + Math.random() * 0.45
    this.phase = Math.random() * Math.PI * 2
    this.hopPhase = Math.random() * 0.4
    // The variance rides inside the budget rather than on top of it, or a die
    // drawn at 1.25 speed would sit a quarter over its own ceiling.
    this.turns = turnsFor(this.id, duration) * this.speed
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
  render(eased: number, progress: number): void {
    this.t = eased * this.turns * Math.PI * 2 + this.phase
    this.bounce(progress)
    this.draw()
  }

  step(dt: number): void {
    // Its own ceiling, the same one its throws are budgeted against, so
    // crossing from a throw into the blur is a change of behaviour and not a
    // change of speed. One global number meant the tetrahedron blurred at the
    // rate the sphere needs, which is four times slower than it can manage.
    const rate = ceilingFor(this.id) * Math.PI * 2
    this.t += dt * rate * this.speed
    // Rolling too fast to watch. A light constant wobble, no bounce: there is
    // no landing to settle onto.
    const j = Math.min(1, rate / (MAX_SPIN * 2))
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
    if (p < LAND_AT) {
      // Still in the air. A little drift and tilt so the spin does not look
      // like it is happening on a pin, and nothing else.
      const k = p / LAND_AT
      const side = Math.sin((k + this.hopPhase) * Math.PI) * 1.2
      const tilt = Math.sin((k * 2 + this.hopPhase) * Math.PI) * 6
      this.place(side, -1.5 * Math.sin(k * Math.PI), tilt, 1, 1)
      return
    }

    // The landing. Two decaying hops and a squash on each contact, which is
    // the part that reads as weight.
    const q = (p - LAND_AT) / (1 - LAND_AT)
    const fade = Math.pow(1 - q, 1.6)
    const cycle = q * BOUNCES + this.hopPhase * 0.15
    const hop = -Math.abs(Math.sin(cycle * Math.PI)) * HOP_PX * fade
    // Flattest at the instant of contact, which is where the sine is zero.
    const contact = Math.pow(1 - Math.abs(Math.sin(cycle * Math.PI)), 3) * fade
    const sx = 1 + SQUASH * contact
    const sy = 1 - SQUASH * contact
    const tilt = Math.sin(cycle * 2 * Math.PI) * 5 * fade
    this.place(0, hop, tilt, sx, sy)
  }

  private place(x: number, y: number, deg: number, sx = 1, sy = 1): void {
    const flat = Math.abs(sx - 1) < 0.004 && Math.abs(sy - 1) < 0.004
    if (Math.abs(x) < 0.02 && Math.abs(y) < 0.02 && Math.abs(deg) < 0.05 && flat) {
      // Square, and cleared rather than left at a hundredth of a degree.
      if (this.el.style.transform) this.el.style.transform = ''
      return
    }
    this.el.style.transform =
      `translate3d(${x.toFixed(2)}px, ${y.toFixed(2)}px, 0) rotate(${deg.toFixed(2)}deg)` +
      (flat ? '' : ` scale(${sx.toFixed(3)}, ${sy.toFixed(3)})`)
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
/**
 * As far as the solid can honestly go, up to this.
 *
 * It used to be a flat 1.15 to 1.85 revolutions for all nine, which is a
 * number the sphere could just about survive and every other solid was bored
 * by. Each one now takes what its own geometry allows and stops here, so a
 * tetrahedron turns more than three times in a one second throw where it used
 * to turn one and a half.
 */
const TURNS_MAX = 3.2

/**
 * How far each solid can turn between two frames before it stops reading as
 * turning, in degrees.
 *
 * A shape carried through one of its own symmetry steps in a single frame
 * arrives looking exactly as it left, so the eye has nothing to tell it apart
 * from standing still, and a little past that it reads as turning backwards.
 * The step is the highest rotation order the solid has: three for the
 * tetrahedron, four for the cube and everything octahedral, five for
 * everything icosahedral, and one per meridian for the sphere.
 *
 * The tumble axis is picked at random on every throw rather than being one of
 * these symmetry axes, so the true repeat is a full turn and this is a floor
 * rather than the exact figure. It is the right floor to hold: a solid with
 * twelve near-identical meridians goes ambiguous long before a tetrahedron
 * does, and one global ceiling for all nine had to be set by the sphere.
 */
const SYMMETRY_STEP: Record<SolidId, number> = {
  tetra: 120,
  hexa: 90,
  octa: 90,
  dodeca: 72,
  trunccube: 90,
  icosa: 72,
  rhombi: 90,
  icosidodeca: 72,
  // Twelve meridians, so the sphere repeats every thirtieth of a turn. It is
  // four times as fussy as the tetrahedron and used to set the limit for it.
  sphaera: 30,
}

const FRAME_HZ = 60

/**
 * The fastest this solid can turn and still read as turning, in revolutions a
 * second: one symmetry step a frame, which is the rule the old global ceiling
 * was set by. Past it the shape arrives looking as it left.
 */
function ceilingFor(id: SolidId): number {
  return ((SYMMETRY_STEP[id] ?? 30) / 360) * FRAME_HZ
}

/**
 * The easing's steepest moment, as a multiple of its average.
 *
 * The ceiling used to be applied to the average rate, and the easing opens far
 * faster than its average, so the first frames of every short throw ran well
 * past the limit the comment above so carefully derived. That is the strobe,
 * and it was never only a blur-mode problem.
 */
const EASE_PEAK = 2

/**
 * The old global ceiling, in radians a second, kept only to scale the wobble
 * amplitude in the blur. Each solid has its own now; see ceilingFor.
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

/**
 * Where the throw stops being a spin and becomes a landing.
 *
 * The hops used to be spread across the whole roll, three of them at 3.1px on
 * a 32px icon, fading as it went. Nine percent of an icon, smeared over a
 * second, is not a bounce; it is a drift nobody could see at native size and
 * nobody could find at two and a half times it either. They are packed into
 * the last quarter now, where a die actually meets the table.
 */
const LAND_AT = 0.75

/** Hops in that last quarter. Two is a die landing; one is a drop. */
const BOUNCES = 2

/** How high, as a share of the icon. A fifth of it reads at 32px. */
const HOP_PX = 6.4

/** The squash on contact, and how long it holds before springing back. */
const SQUASH = 0.14

type Mode = 'rest' | 'throw' | 'blur'
let mode: Mode = 'rest'
let progress = 1
let lastProgress = 1

/**
 * Fast out, slow in. Quadratic.
 *
 * It was cubic, which spends 49% of the rotation in the first fifth of the
 * throw and 87% in the first half: a flick, and then most of a second of a
 * shape barely moving. Quadratic holds the average rate all the way to the
 * midpoint, so the part of the throw you actually watch is the part that
 * moves. It also opens at twice its average rather than three times, which
 * buys every solid more total revolutions under the same ceiling.
 *
 * Cubic was chosen over quartic because a hard stop at this size read as a
 * dropped frame. That reasoning held when the throw ended by simply arriving;
 * it ends on two hops and a squash now, which is something to stop against.
 */
function easeOut(p: number): number {
  return 1 - Math.pow(1 - p, 2)
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
function turnsFor(id: SolidId, duration: number): number {
  const wanted = TURNS_MAX
  if (duration <= 0) return wanted
  // Against the peak rather than the average, and against this solid's own
  // ceiling rather than the sphere's. A tetrahedron can honestly cover four
  // times the ground a sphere can in the same throw, and it now does.
  return Math.min(wanted, (ceilingFor(id) * duration) / EASE_PEAK)
}

export function setThrow(p: number, duration: number): void {
  const clamped = Math.max(0, Math.min(1, p))
  if (clamped < lastProgress - 0.02) {
    for (const w of live) w.throw(duration)
  }
  lastProgress = clamped
  progress = clamped
  const next: Mode = clamped >= 1 ? 'rest' : 'throw'
  if (next === 'rest' && mode !== 'rest') {
    // Coming to rest stops the loop, so the settled frame has to be drawn
    // here or the die keeps whatever tilt it happened to be at.
    for (const w of live) if (w.rolls) w.render(1, 1)
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
    for (const w of live) if (w.visible && w.rolls) w.render(e, progress)
    return
  }

  if (mode === 'blur') {
    for (const w of live) if (w.visible && w.rolls) w.step(dt)
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
