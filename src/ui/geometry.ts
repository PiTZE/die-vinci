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
  n.setAttribute('cx', c[0].toFixed(2))
  n.setAttribute('cy', c[1].toFixed(2))
  n.setAttribute('r', r.toFixed(2))
  n.setAttribute('stroke-width', '1')
  n.setAttribute('opacity', opacity.toFixed(3))
  return n
}

/**
 * The thirteen circles of Metatron's Cube, and every chord between their
 * centres.
 *
 * The centres are one at the middle, six at radius r around it, and six more
 * at radius 2r on the same six bearings, which is the Fruit of Life. Joining
 * all seventy-eight pairs is the Cube, and the reason it belongs on this
 * screen in particular is that its construction contains all five Platonic
 * solids in projection: the same five Leonardo drew for Pacioli, and five of
 * the nine on the table.
 *
 * Drawn at 1px like everything else in this game. The chords carry most of the
 * ink, so they are dimmed hard and the circles sit just above them, which
 * keeps the figure readable at 160px on a phone.
 */
export function metatron(size = 240): SVGSVGElement {
  const root = svg(size)
  root.classList.add('geo', 'geo-metatron')
  const mid = size / 2
  // Six around one, then six more at twice the radius. r is chosen so the
  // outer circles' own edges just reach the viewBox.
  const r = size / 6
  const centres: [number, number][] = [[mid, mid]]
  for (const ring of [1, 2]) {
    for (let i = 0; i < 6; i++) {
      // Flat-topped, so the figure sits square in a rectangular panel rather
      // than balancing on a point.
      const a = (Math.PI / 3) * i
      centres.push([mid + Math.cos(a) * r * ring, mid + Math.sin(a) * r * ring])
    }
  }

  // Every pair, which is what makes it the Cube rather than the Fruit.
  for (let i = 0; i < centres.length; i++) {
    for (let j = i + 1; j < centres.length; j++) {
      root.appendChild(line(centres[i], centres[j], 0.18))
    }
  }
  for (const c of centres) root.appendChild(circle(c, r, 0.55))
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
    const n = circle(c, r, 0.5)
    root.appendChild(n)
  }
  const lens = document.createElementNS(NS, 'path')
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
