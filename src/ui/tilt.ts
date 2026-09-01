// A card that leans toward the pointer, and catches the light while it does.
//
// The technique is the one React Bits' ProfileCard uses, written out here
// rather than taken: a pointer position published as custom properties, a
// rotation driven off it, and two blended layers over the face that move with
// the same numbers. There is no React in this project and no reason to add a
// dependency for forty lines of arithmetic.
//
// What is kept is the part that makes it feel like a physical card rather than
// a div that rotates. The pointer does not drive the rotation directly: it
// sets a target and the card eases toward it, so a fast flick does not snap
// and a card left alone drifts back to square. That easing is a time constant
// rather than a per-frame fraction, so it behaves the same at 30fps as at 120.
//
// What is dropped is everything that assumed a photograph: the avatar, the
// blur panel, the drop shadow. This game has no shadows and no photographs.
const REDUCED = window.matchMedia('(prefers-reduced-motion: reduce)')

/** Where the ease settles, and how fast. Seconds to close 63% of the gap. */
const TAU = 0.14
/** Close enough to square to stop the loop and drop the lit state. */
const SETTLED = 0.6

const clamp = (v: number, min = 0, max = 100): number => Math.min(Math.max(v, min), max)

/**
 * Wires one card. The element publishes its own pointer state, so a grid of
 * twenty-two of them costs nothing until one is actually pointed at: the loop
 * starts on enter and stops itself once the card has settled back to square.
 */
export function tiltable(card: HTMLElement): void {
  if (REDUCED.matches) return

  let stop: (() => void) | null = null
  let cx = 0
  let cy = 0
  let tx = 0
  let ty = 0

  const publish = (x: number, y: number): void => {
    const w = card.clientWidth || 1
    const h = card.clientHeight || 1
    const px = clamp((100 / w) * x)
    const py = clamp((100 / h) * y)
    card.style.setProperty('--px', `${px}%`)
    card.style.setProperty('--py', `${py}%`)
    // How far out from the middle, 0 to 1, which is what the foil reads to
    // decide how hard to catch the light.
    card.style.setProperty(
      '--from-centre',
      String(clamp(Math.hypot(py - 50, px - 50) / 50, 0, 1)),
    )
    // Rotation is the pointer's offset from the middle, and the two axes are
    // crossed: the pointer moving right tips the card about its vertical.
    card.style.setProperty('--rx', `${(-(px - 50) / 6).toFixed(2)}deg`)
    card.style.setProperty('--ry', `${((py - 50) / 8).toFixed(2)}deg`)
  }

  const centre = (): void => {
    tx = card.clientWidth / 2
    ty = card.clientHeight / 2
  }

  const run = (): void => {
    if (stop) return
    let raf = 0
    let last = 0
    const frame = (ts: number): void => {
      const dt = last ? Math.min((ts - last) / 1000, 0.1) : 1 / 60
      last = ts
      // A time constant rather than a fraction of the gap per frame, so a
      // slow frame does not become a slow card.
      const k = 1 - Math.exp(-dt / TAU)
      cx += (tx - cx) * k
      cy += (ty - cy) * k
      publish(cx, cy)
      if (Math.hypot(tx - cx, ty - cy) < SETTLED && !card.classList.contains('lit')) {
        stop?.()
        return
      }
      raf = requestAnimationFrame(frame)
    }
    stop = () => {
      cancelAnimationFrame(raf)
      stop = null
    }
    raf = requestAnimationFrame(frame)
  }

  // A finger is not a pointer you can follow: it arrives already on the card,
  // covers the thing it would be lighting, and leaves as soon as it lands. So
  // the effect answers to a mouse or a pen and a touch is left alone, which is
  // also what a card lying on a table does.
  //
  // Asked of the event rather than of a hover media query, which is what this
  // used to do. Headless Chrome reports (hover: none) on a desktop-sized
  // window, so the effect was off in every screenshot taken of it, and a
  // browser that reports the same on real hardware would have turned it off
  // for that person too.
  const touch = (e: PointerEvent): boolean => e.pointerType === 'touch'

  card.addEventListener('pointerenter', (e) => {
    if (touch(e)) return
    const r = card.getBoundingClientRect()
    cx = e.clientX - r.left
    cy = e.clientY - r.top
    tx = cx
    ty = cy
    card.classList.add('lit')
    publish(cx, cy)
    run()
  })

  card.addEventListener('pointermove', (e) => {
    if (touch(e)) return
    const r = card.getBoundingClientRect()
    tx = e.clientX - r.left
    ty = e.clientY - r.top
    run()
  })

  card.addEventListener('pointerleave', () => {
    card.classList.remove('lit')
    centre()
    run()
  })
}
