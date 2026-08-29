// Two constructions, drawn rather than traced.
//
// The nine dice are already sacred geometry: they are Leonardo's plates for
// Pacioli's De divina proportione, a book about the golden ratio. So these two
// are not decoration bolted onto the theme, they are the same subject arriving
// in the two places the theme had nothing to say.
//
// Both are built from circle centres and straight lines, the way you would
// build them with a compass, rather than from path data copied off a
// reference. That means they scale, they take `currentColor` in both themes,
// and the construction is legible in the source.

const NS = 'http://www.w3.org/2000/svg'

function svg(view: number): SVGSVGElement {
  const n = document.createElementNS(NS, 'svg')
  n.setAttribute('viewBox', `0 0 ${view} ${view}`)
  n.setAttribute('fill', 'none')
  n.setAttribute('stroke', 'currentColor')
  n.setAttribute('vector-effect', 'non-scaling-stroke')
  return n
}

function line(a: [number, number], b: [number, number], opacity: number): SVGLineElement {
  const n = document.createElementNS(NS, 'line')
  n.setAttribute('vector-effect', 'non-scaling-stroke')
  n.setAttribute('x1', a[0].toFixed(2))
  n.setAttribute('y1', a[1].toFixed(2))
  n.setAttribute('x2', b[0].toFixed(2))
  n.setAttribute('y2', b[1].toFixed(2))
  n.setAttribute('stroke-width', '1')
  n.setAttribute('opacity', opacity.toFixed(3))
  return n
}

function circle(c: [number, number], r: number, opacity: number): SVGCircleElement {
  const n = document.createElementNS(NS, 'circle')
  n.setAttribute('vector-effect', 'non-scaling-stroke')
  n.setAttribute('cx', c[0].toFixed(2))
  n.setAttribute('cy', c[1].toFixed(2))
  n.setAttribute('r', r.toFixed(2))
  n.setAttribute('stroke-width', '1')
  n.setAttribute('opacity', opacity.toFixed(3))
  return n
}

/**
 * Metatron's Cube: the thirteen circles of the Fruit of Life, and every chord
 * between the twelve that ring the middle.
 *
 * Measured off the reference at
 * commons.wikimedia.org/wiki/File:Metatrons_cube.svg rather than eyeballed.
 * Its circles have radius r and its centres sit at exactly two distances:
 * six at 2r and six more at 4r, all twelve on the same six bearings, 30
 * degrees off vertical. That makes every circle tangent to its neighbours and
 * none of them overlap.
 *
 * The first version here had the rings at r and 2r, which is the same
 * arrangement with the circles four times too big for it: they overlapped into
 * a flower and the figure read as the Flower of Life with some scribble on it.
 *
 * The chords run between the twelve ring centres and not to the middle one,
 * which is what the reference draws. All sixty-six of them, and the ones that
 * pass through a third centre simply lie on top of each other, as they do on
 * paper.
 *
 * It belongs on the break screen because its construction contains all five
 * Platonic solids in projection: the five Leonardo drew for Pacioli, and five
 * of the nine on the table.
 */
export function metatron(size = 240): SVGSVGElement {
  const root = svg(size)
  root.classList.add('geo', 'geo-metatron')
  const mid = size / 2
  // The figure is ten radii tall: a centre sits four out along the vertical
  // bearing and carries its own circle on top of that. It is only 8.93 wide,
  // because the widest centres sit at 4r*cos(30). At r = size/10 the top and
  // bottom circles landed exactly on the edge of the viewBox and lost the
  // outer half of their stroke to it, which reads as chopped and thinner than
  // the other eleven. A radius of size/11 leaves half a radius of air.
  const r = size / 11
  const centres: [number, number][] = []
  for (const ring of [2, 4]) {
    for (let i = 0; i < 6; i++) {
      // Thirty degrees off vertical, so the hexagon stands on a point the way
      // the reference does.
      const a = (Math.PI / 3) * i - Math.PI / 2
      centres.push([mid + Math.cos(a) * r * ring, mid + Math.sin(a) * r * ring])
    }
  }

  for (let i = 0; i < centres.length; i++) {
    for (let j = i + 1; j < centres.length; j++) {
      root.appendChild(line(centres[i], centres[j], 0.3))
    }
  }
  // The middle circle is drawn but nothing connects to it, which is how the
  // reference has it.
  for (const c of [[mid, mid] as [number, number], ...centres]) {
    root.appendChild(circle(c, r, 0.55))
  }
  return root
}

/**
 * The Vesica Piscis: two circles, each through the other's centre.
 *
 * Euclid opens the Elements with it. Book I, Proposition 1 is the construction
 * of an equilateral triangle, and the first thing it does is draw these two
 * circles; the lens where they cross is where the third vertex comes from.
 * Every polyhedron on the table descends from that, so it is a fair thing for
 * the run's own progress to be measured against.
 *
 * The lens fills from the bottom as the run climbs. `setVesica` moves it.
 */
export interface Vesica {
  root: SVGSVGElement
  set(p: number): void
}

export function vesica(w = 200): Vesica {
  const h = Math.round(w * 0.62)
  const root = document.createElementNS(NS, 'svg')
  root.setAttribute('viewBox', `0 0 ${w} ${h}`)
  root.setAttribute('fill', 'none')
  root.setAttribute('stroke', 'currentColor')
  root.classList.add('geo', 'geo-vesica')

  // Each circle passes through the other's centre, which is what makes the
  // lens a vesica rather than any old overlap.
  const r = h * 0.44
  const cy = h / 2
  const left: [number, number] = [w / 2 - r / 2, cy]
  const right: [number, number] = [w / 2 + r / 2, cy]

  // The lens itself, as a clip. Two arcs of the same radius meeting at the two
  // crossing points, which sit directly above and below the midpoint.
  const dy = Math.sqrt(Math.max(0, r * r - (r / 2) * (r / 2)))
  const top = `${w / 2} ${cy - dy}`
  const bottom = `${w / 2} ${cy + dy}`
  const lensPath = `M ${top} A ${r} ${r} 0 0 0 ${bottom} A ${r} ${r} 0 0 0 ${top} Z`

  const defs = document.createElementNS(NS, 'defs')
  const clip = document.createElementNS(NS, 'clipPath')
  const clipId = `vesica-${Math.floor(performance.now() * 1000) % 1e9}`
  clip.setAttribute('id', clipId)
  const clipShape = document.createElementNS(NS, 'path')
  clipShape.setAttribute('d', lensPath)
  clip.appendChild(clipShape)
  defs.appendChild(clip)
  root.appendChild(defs)

  // The fill rises inside the lens.
  const fill = document.createElementNS(NS, 'rect')
  fill.setAttribute('x', '0')
  fill.setAttribute('width', String(w))
  fill.setAttribute('fill', 'currentColor')
  fill.setAttribute('stroke', 'none')
  fill.setAttribute('opacity', '0.4')
  fill.setAttribute('clip-path', `url(#${clipId})`)
  root.appendChild(fill)

  for (const c of [left, right]) {
    const n = circle(c, r, 0.78)
    root.appendChild(n)
  }
  const lens = document.createElementNS(NS, 'path')
  lens.setAttribute('vector-effect', 'non-scaling-stroke')
  lens.setAttribute('d', lensPath)
  lens.setAttribute('stroke-width', '1')
  lens.setAttribute('opacity', '0.9')
  root.appendChild(lens)

  const lensTop = cy - dy
  const lensH = dy * 2
  return {
    root,
    set(p: number) {
      const clamped = Math.max(0, Math.min(1, p))
      const height = lensH * clamped
      fill.setAttribute('y', (lensTop + lensH - height).toFixed(2))
      fill.setAttribute('height', height.toFixed(2))
    },
  }
}
