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

type Geo = {
  vs: V3[]
  es: [number, number][]
  /** The axis a throw turns this solid about, and how many times it maps onto
   *  itself in one turn about it. See SPIN_AXIS. */
  spin: V3
  fold: number
}

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
  // Its own pole, and a turn of one meridian puts it back where it was.
  return { vs, es, spin: [0, 1, 0], fold: meridians }
}

/**
 * The axis each solid rests pointing at you, and how far it is then spun about
 * that axis to sit upright.
 *
 * A die at rest should read as the shape it is named for: the d4 a triangle,
 * the d6 a square, the d20 a hexagon with a triangle in it. That is not what
 * "no rotation" gives you, because the vertex tables are written for
 * arithmetic rather than for looking at. The tetrahedron as written is four
 * corners of a cube, so straight on it projects to a square with an X through
 * it, which is a d6 with a mistake in it rather than a d4.
 *
 * So each one is turned once, here, to face you down its own signature
 * symmetry axis, and the rest pose is then genuinely no rotation. Every axis
 * below is a real symmetry axis of its solid, which is what makes the result
 * symmetrical rather than merely chosen:
 *
 *   tetra        a vertex toward you, so the far face draws the triangle
 *   dodeca       a pentagonal face, five-fold: a decagon around a pentagon
 *   icosa        a triangular face, three-fold: a hexagon with a triangle in it
 *   icosidodeca  a pentagonal face, five-fold: a decagon
 *
 * The other five already face you down a four-fold axis as written. The cube
 * is a square, the octahedron a diamond with a point at each compass mark,
 * which is how a d8 is drawn, the truncated cube a square with its corners
 * cut, the rhombicuboctahedron an octagon, and the sphere a globe with its
 * pole up.
 *
 * The roll is which way up, and it is one number a solid rather than a rule:
 * every one of these sits with a flat side along the bottom, which is what
 * puts the tetrahedron's apex at the top. The icosahedron's 7.8 is a fraction
 * of a degree because a hexagon's corner does not fall where the vertex table
 * happens to start. The tetrahedron's sixty is the screen's y axis pointing
 * down: flat-side-down in the arithmetic is a triangle standing on its head
 * in the picture, and a triangle is the one shape here with no half turn to
 * hide it.
 *
 * Getting an axis wrong is not obvious by eye and it was wrong once here. The
 * icosidodecahedron sat on (0, 1, phi), which is a two-fold axis rather than
 * the five-fold one, and what that draws is a pinwheel: symmetric enough to
 * pass a glance, with no mirror line anywhere in it, which is exactly the
 * "ugly and random" the straight-on pose was meant to end. What settles it is
 * asking the drawing whether it maps onto itself under a reflection and under
 * a turn, rather than asking whether it looks tidy.
 */
const REST_POSE: Partial<Record<SolidId, { axis: V3; roll: number }>> = {
  tetra: { axis: [1, 1, 1], roll: 60 },
  dodeca: { axis: [0, PHI, 1], roll: 0 },
  icosa: { axis: [1, 1, 1], roll: 7.8 },
  icosidodeca: { axis: [0, PHI, 1], roll: 0 },
}

/** Turns `axis` to face the viewer, then spins by `roll` about it. */
function orient(vs: V3[], axis: V3, roll: number): V3[] {
  const len = Math.hypot(...axis)
  const w: V3 = [axis[0] / len, axis[1] / len, axis[2] / len]
  // Any perpendicular will do for the first basis vector; the roll is what
  // decides which way up, and it is picked by looking.
  const seed: V3 = Math.abs(w[0]) < 0.9 ? [1, 0, 0] : [0, 1, 0]
  const cross = (a: V3, b: V3): V3 => [
    a[1] * b[2] - a[2] * b[1],
    a[2] * b[0] - a[0] * b[2],
    a[0] * b[1] - a[1] * b[0],
  ]
  const unit = (v: V3): V3 => {
    const n = Math.hypot(...v)
    return [v[0] / n, v[1] / n, v[2] / n]
  }
  const u = unit(cross(seed, w))
  const v = cross(w, u)
  const dot = (a: V3, b: V3) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2]
  const c = Math.cos((roll * Math.PI) / 180)
  const s = Math.sin((roll * Math.PI) / 180)
  return vs.map((p) => {
    const x = dot(p, u)
    const y = dot(p, v)
    return [x * c - y * s, x * s + y * c, dot(p, w)] as V3
  })
}

/**
 * The axis a throw turns each solid about, and its order about that axis.
 *
 * A throw used to pick two axes at random and turn about both at once, on the
 * reasoning that nine dice tumbling in lockstep would look mechanical. What it
 * actually produced was nine dice each wobbling its own arbitrary way, and a
 * die passing through poses that belong to no view of it: the same "random"
 * the resting pose had, except moving, where it is on screen for a second at a
 * time rather than a glance.
 *
 * Each one turns about one of its own symmetry axes now, so a third or a fifth
 * of the way through a throw it is in a pose identical to the one it rests in,
 * and it goes on passing through that pose all the way round. Nothing is
 * chosen here that the solid does not already have: these are its vertex,
 * face and pole axes.
 *
 * Written in the vertex table's own coordinates and turned along with it, so
 * the pair stays consistent when a resting pose changes.
 */
const SPIN_AXIS: Record<string, { axis: V3; fold: number }> = {
  // A vertex not the one facing you, so the tetrahedron turns corner over
  // corner rather than spinning about the point it is resting on.
  tetra: { axis: [1, -1, -1], fold: 3 },
  // A body diagonal: the corner-over-corner turn a thrown cube makes.
  hexa: { axis: [1, 1, 1], fold: 3 },
  octa: { axis: [1, 1, 1], fold: 3 },
  dodeca: { axis: [1, 1, 1], fold: 3 },
  trunccube: { axis: [1, 1, 1], fold: 3 },
  // A vertex of the icosahedron, which is a five-fold axis.
  icosa: { axis: [0, 1, PHI], fold: 5 },
  rhombi: { axis: [1, 1, 1], fold: 3 },
  icosidodeca: { axis: [1, 1, 1], fold: 3 },
}

function geometryFor(def: { id: SolidId; shape: SolidShape }): Geo {
  if (def.shape.kind === 'sphere') return sphere(def.shape.meridians, def.shape.bands)
  let vs = uniformVertices(def.id)
  const pose = REST_POSE[def.id]
  const turn = SPIN_AXIS[def.id] ?? { axis: [0, 1, 0] as V3, fold: 1 }
  let spin = turn.axis
  // Edges before the turn or after it makes no difference: it is a rotation,
  // so it moves no vertex closer to any other. The spin axis goes through the
  // same turn as the vertices, because it is written in their coordinates.
  if (pose) {
    vs = orient(vs, pose.axis, pose.roll)
    spin = orient([spin], pose.axis, pose.roll)[0]
  }
  const len = Math.hypot(...spin)
  return {
    vs,
    es: edgesByDistance(vs),
    spin: [spin[0] / len, spin[1] / len, spin[2] / len],
    fold: turn.fold,
  }
}

function normalize(g: Geo): Geo {
  const r = Math.max(...g.vs.map((v) => Math.hypot(v[0], v[1], v[2])))
  return { ...g, vs: g.vs.map((v) => [v[0] / r, v[1] / r, v[2] / r] as V3) }
}

/**
 * How many vertices and edges a solid actually has, from the generated
 * geometry rather than from a picture of it.
 *
 * The suite used to count distinct points in the drawn SVG, which asks the
 * right question through the wrong window: at any pose down a symmetry axis
 * two vertices legitimately project onto one point, and at the resting pose
 * every solid is down a symmetry axis. It failed on four different solids in
 * one afternoon and each time the drawing was correct.
 */
export function solidFigure(id: SolidId): [number, number] {
  const g = geometry(id)
  return [g.vs.length, g.es.length]
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
 * No rotation at all: the solid as its vertices are written.
 *
 * Every one of these is authored about its own axes, so straight on is down a
 * symmetry axis and the projection comes out symmetric. A cube is a square, an
 * octahedron a diamond crossed through the middle, an icosahedron a regular
 * hexagon, the sphere a globe with its pole up. That is what a die sitting
 * still should look like.
 *
 * Two goes at a three-quarter view came first, on the reasoning that a die is
 * usually drawn tilted. It is, while it is being thrown. A still one wants to
 * be square to you, and any tilt away from that is a pose the eye reads as
 * arbitrary because it is: nothing distinguishes thirty-five degrees from
 * thirty-four.
 *
 * Straight on does mean vertices land on each other, a cube's eight projecting
 * to four. That is symmetry doing its job rather than a fault, and it is why
 * the suite counts the vertex and edge tables themselves rather than counting
 * points in a picture of them.
 */
const REST_T = 0


class Wire {
  readonly el: SVGSVGElement
  private lines: SVGLineElement[] = []
  private paths: SVGPathElement[] = []
  private id: SolidId
  private t = REST_T
  /** Tumble axis weights, re-picked on every throw. A fixed pair made nine
   *  dice turn in lockstep like a row of gears, which is the one thing a
   *  handful of thrown dice never looks like. */
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
    if (this.t === REST_T) return
    this.t = REST_T
    this.draw()
  }

  /** A new throw. Fresh rate, and it starts and lands square. */
  throw(duration: number): void {
    const { fold } = geometry(this.id)
    this.speed = 0.8 + Math.random() * 0.45
    // A whole number of the solid's own symmetry steps, so the pose it starts
    // from is one it could be resting in and so is the one it lands on. The
    // variance is still there; it is quantised rather than removed.
    this.phase = (Math.floor(Math.random() * fold) * Math.PI * 2) / fold
    this.hopPhase = Math.random() * 0.4
    // The variance rides inside the budget rather than on top of it, or a die
    // drawn at 1.25 speed would sit a quarter over its own ceiling.
    const wanted = turnsFor(this.id, duration) * this.speed
    // Rounded to a symmetry step as well, so the last frame of a throw is the
    // resting pose rather than a few degrees off it that then snaps.
    this.turns = Math.max(1, Math.round(wanted * fold)) / fold
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
    const { vs, es, spin } = geometry(this.id)
    // One turn about one axis, by Rodrigues. It used to be two turns about two
    // axes at a ratio picked at random, which is what made every throw a
    // different tumble and none of them a pose the solid has.
    const c = Math.cos(this.t)
    const s = Math.sin(this.t)
    const k = 1 - c
    const [kx, ky, kz] = spin

    const px: number[] = []
    const py: number[] = []
    const pz: number[] = []
    for (const v of vs) {
      const dot = kx * v[0] + ky * v[1] + kz * v[2]
      px.push(v[0] * c + (ky * v[2] - kz * v[1]) * s + kx * dot * k)
      py.push(v[1] * c + (kz * v[0] - kx * v[2]) * s + ky * dot * k)
      pz.push(v[2] * c + (kx * v[1] - ky * v[0]) * s + kz * dot * k)
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
