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
  visible = true

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

  step(dt: number, rate: number): void {
    this.t += dt * rate
    this.draw()
  }

  private draw(): void {
    const { vs, es } = geometry(this.id)
    const ay = this.t
    const ax = this.t * 0.42
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
// air, which is what makes pressing ROLL feel like anything at all: before
// this the solids span forever and the button changed nothing you could see.
let spinRate = 0
let settling = 0

/** 0 stops the dice where they are. 1 is a roll in flight. */
export function setSpin(on: boolean): void {
  const want = on ? SPIN_ROLLING : 0
  if (want === spinRate) return
  // Coming to rest over a moment rather than in one frame, so a landing reads
  // as a die slowing down instead of the animation being switched off.
  if (!on) settling = SETTLE_S
  spinRate = want
  if (on) ensureLoop()
}

const SPIN_ROLLING = 3.2
const SETTLE_S = 0.22

function frame(now: number): void {
  raf = requestAnimationFrame(frame)
  const dt = Math.min((now - last) / 1000, 0.25)
  last = now
  if (document.hidden) return

  let rate = spinRate
  if (!rate && settling > 0) {
    settling = Math.max(0, settling - dt)
    rate = SPIN_ROLLING * (settling / SETTLE_S)
  }
  // Nothing is turning and nothing is coming to rest, so there is nothing to
  // draw. The loop keeps running because a roll can start on the next frame.
  if (rate <= 0) return

  // No throttle. It was capped at 20fps to save battery and the result was
  // visibly stepped. Offscreen and hidden solids are skipped instead, which is
  // where the real saving is.
  for (const w of live) if (w.visible) w.step(dt, rate)
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

export function wireframe(id: SolidId, cls = 'solid-icon'): SVGSVGElement {
  const w = new Wire(id)
  w.el.setAttribute('class', cls)
  live.add(w)
  byEl.set(w.el, w)
  observer?.observe(w.el)
  ensureLoop()
  return w.el
}
