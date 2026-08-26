// Rotating wireframe polyhedra, drawn as SVG paths.
//
// No three.js. A vertex list, a rotation matrix and an orthographic
// projection is the whole job, it costs nothing in the bundle, and thin
// strokes in currentColor look like an engraving instead of a shaded asset.
// The rhombicuboctahedron is not a three.js built-in anyway, so its vertices
// would have been hand-written either way.
import type { SolidId } from '../game/solids'

type V3 = [number, number, number]

const PHI = (1 + Math.sqrt(5)) / 2
const SILVER = 1 + Math.sqrt(2)

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

function permutations(a: number, b: number, c: number): V3[] {
  return dedupe([
    ...signs([a, b, c]),
    ...signs([a, c, b]),
    ...signs([b, a, c]),
    ...signs([b, c, a]),
    ...signs([c, a, b]),
    ...signs([c, b, a]),
  ])
}

function vertices(id: SolidId): V3[] {
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
      return dedupe([...cyclic(1, 0, 0), ...cyclic(-1, 0, 0)])
    case 'dodeca':
      return dedupe([
        ...signs([1, 1, 1]),
        ...cyclic(0, 1 / PHI, PHI).flatMap((v) => signs(v)),
      ])
    case 'icosa':
      return dedupe(cyclic(0, 1, PHI).flatMap((v) => signs(v)))
    case 'rhombi':
      return permutations(1, 1, SILVER)
  }
}

/** Edges are the pairs at the shortest distance in the set, which is true for
 *  every uniform polyhedron here and saves hand-listing six edge tables. */
function edges(vs: V3[]): [number, number][] {
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

function normalize(vs: V3[]): V3[] {
  const r = Math.max(...vs.map((v) => Math.hypot(v[0], v[1], v[2])))
  return vs.map((v) => [v[0] / r, v[1] / r, v[2] / r] as V3)
}

const CACHE = new Map<SolidId, { vs: V3[]; es: [number, number][] }>()

function geometry(id: SolidId) {
  let g = CACHE.get(id)
  if (!g) {
    const vs = normalize(vertices(id))
    g = { vs, es: edges(vs) }
    CACHE.set(id, g)
  }
  return g
}

const SVG_NS = 'http://www.w3.org/2000/svg'
const REDUCED = window.matchMedia('(prefers-reduced-motion: reduce)')

class Wire {
  readonly el: SVGSVGElement
  private near: SVGPathElement
  private far: SVGPathElement
  private id: SolidId
  private t = Math.random() * Math.PI * 2
  visible = true

  constructor(id: SolidId) {
    this.id = id
    this.el = document.createElementNS(SVG_NS, 'svg')
    this.el.setAttribute('viewBox', '-1.15 -1.15 2.3 2.3')
    this.el.setAttribute('aria-hidden', 'true')
    this.far = document.createElementNS(SVG_NS, 'path')
    this.near = document.createElementNS(SVG_NS, 'path')
    for (const p of [this.far, this.near]) {
      p.setAttribute('fill', 'none')
      p.setAttribute('stroke', 'currentColor')
      // non-scaling-stroke measures in screen pixels, not viewBox units.
      p.setAttribute('stroke-width', '1')
      p.setAttribute('vector-effect', 'non-scaling-stroke')
      this.el.appendChild(p)
    }
    this.far.setAttribute('opacity', '0.35')
    this.draw()
  }

  step(dt: number): void {
    this.t += dt * 0.5
    this.draw()
  }

  /** Edges behind the centre go on the dimmed path, which is enough depth cue
   *  to read a d20 at 38 pixels without any shading. */
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

    let near = ''
    let far = ''
    for (const [a, b] of es) {
      const seg = `M${px[a].toFixed(3)} ${py[a].toFixed(3)}L${px[b].toFixed(3)} ${py[b].toFixed(3)}`
      if (pz[a] + pz[b] < 0) far += seg
      else near += seg
    }
    this.near.setAttribute('d', near)
    this.far.setAttribute('d', far)
  }
}

// One loop drives every wireframe on the page, throttled to 20fps. Six solids
// at ~30 edges each is nothing, but there is no reason to run it while the tab
// is hidden or the row is scrolled away.
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

function frame(now: number): void {
  raf = requestAnimationFrame(frame)
  if (now - last < 50) return
  const dt = Math.min((now - last) / 1000, 0.25)
  last = now
  if (document.hidden) return
  for (const w of live) if (w.visible) w.step(dt)
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
