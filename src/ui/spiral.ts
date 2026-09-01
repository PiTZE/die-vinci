// The draft, as a turn of cards rather than a row of them.
//
// The arrangement is React Bits' InfiniteSpiral, written out here rather than
// taken, and cut down to what a three-card draw needs. Each card sits at its
// own angle around a vertical axis, the whole ring turns, and the card facing
// you is scaled up and sharp while the ones behind fall back and blur.
//
// What is kept is the shape of the maths: a card's offset from the centre in
// card-widths, wrapped so the ring has no ends, an angle from that offset, a
// position from the angle, and a scale from the perspective divide. What is
// dropped is everything that assumed a long gallery on a scrolling page. There
// is no page scroll here, no lazy loading, no helix: with three cards a
// vertical rise turns a spread into a staircase, so the ring stays level.
//
// The three departures worth naming, and all three are because this is a
// choice rather than a decoration.
//
// It turns a card at a time and rests on each, where the original drifts
// continuously. A drift never leaves a card square to you, which is a strange
// thing to ask someone to choose from.
//
// It stops for good the moment a finger arrives, and letting go snaps to
// whichever card is nearest rather than stopping wherever the finger came off.
// The original pauses on hover, and a phone has no hover to pause with.
//
// And it draws only while it is on screen and the tab is visible.

const REDUCED = window.matchMedia('(prefers-reduced-motion: reduce)')

export interface SpiralOptions {
  /** Seconds a card rests facing you before the ring turns to the next. */
  dwell?: number
  /** Depth of the ring in pixels. */
  radius?: number
  /** How many cards make one full turn. Three, for a three-card draw. */
  cardsPerTurn?: number
  /** How far a card rises per step. Zero is a ring, more is a helix. */
  rise?: number
  perspective?: number
  /** Scale of the card facing you. */
  centreScale?: number
  /** Blur on the card furthest from the front, in pixels. */
  edgeBlur?: number
  /** Told whenever a different card comes round to face you. */
  onFacing?: (index: number) => void
}

const clamp = (v: number, min: number, max: number): number => Math.min(Math.max(v, min), max)
const wrap = (v: number, n: number): number => ((v % n) + n) % n
const smoothstep = (a: number, b: number, v: number): number => {
  const x = clamp((v - a) / (b - a || 1), 0, 1)
  return x * x * (3 - 2 * x)
}

export interface Spiral {
  /** Which card is facing you, which is the one a choice acts on. */
  facing(): number
  /** Turns the ring so that card comes round to the front. */
  bring(index: number): void
  destroy(): void
}

/**
 * Lays `cards` out around a ring inside `stage` and turns it.
 *
 * The transform goes on the card's own wrapper, never on the card: the cards
 * carry a tilt of their own that follows the pointer, and two things writing
 * one transform is one of them winning.
 */
export function spiral(stage: HTMLElement, cards: HTMLElement[], opts: SpiralOptions = {}): Spiral {
  const dwell = opts.dwell ?? 2.8
  const radius = opts.radius ?? 150
  const perTurn = Math.max(1, opts.cardsPerTurn ?? cards.length)
  const rise = opts.rise ?? 0
  const perspective = opts.perspective ?? 900
  const centreScale = opts.centreScale ?? 1.18
  const edgeBlur = opts.edgeBlur ?? 3
  const onFacing = opts.onFacing

  const n = cards.length
  const half = n / 2
  let progress = 0
  let target = 0
  /** Off for good once a finger or a pointer has arrived. */
  let turning = !REDUCED.matches
  /** How long the current card has been facing you. */
  let held = 0
  let onScreen = true
  let raf = 0
  let last = 0
  let width = stage.clientWidth || 1

  const place = (): void => {
    // Everything scales with the narrowest the stage gets, so a ring built for
    // a desktop does not walk off the sides of a phone.
    const fit = clamp(width / 460, 0.52, 1)
    const r = radius * fit
    for (let i = 0; i < n; i++) {
      const card = cards[i]
      const off = wrap(i - progress + half, n) - half
      const angle = (off * 360) / perTurn
      const rad = (angle * Math.PI) / 180
      const x = Math.sin(rad) * r
      const z = Math.cos(rad) * r
      const y = off * rise * fit
      // How far round the back it is, 0 at the front and 1 at the rear.
      const back = (1 - z / (r || 1)) / 2
      const depth = clamp(perspective / Math.max(perspective - z, 1), 0.72, 1.45)
      const scale = (1 + (centreScale - 1) * (1 - back)) * fit * depth
      card.style.transform =
        `translate(-50%, -50%) translate3d(${x.toFixed(1)}px, ${y.toFixed(1)}px, 0) ` +
        `scale(${scale.toFixed(3)})`
      card.style.opacity = (1 - smoothstep(0.55, 1, back) * 0.55).toFixed(3)
      const blur = edgeBlur * smoothstep(0.25, 1, back)
      card.style.filter = blur > 0.05 ? `blur(${blur.toFixed(2)}px)` : ''
      card.style.zIndex = String(Math.round((1 - back) * 1000))
      // The one at the back is not a target. Reaching past a card in front of
      // it to press it is not something anyone means to do.
      card.style.pointerEvents = back > 0.62 ? 'none' : 'auto'
    }
  }

  /** The card nearest the front, which is the one the choice acts on. */
  const facing = (): number => wrap(Math.round(progress), n)
  let told = -1

  const frame = (ts: number): void => {
    const dt = last ? Math.min((ts - last) / 1000, 0.05) : 1 / 60
    last = ts
    // A card at a time, resting on each, rather than a continuous drift.
    // Drifting never leaves a card square to you, which is a strange thing to
    // ask someone to choose from and undoes the snapping the moment you let
    // go of it.
    if (turning) {
      held += dt
      if (held >= dwell) {
        held = 0
        target += 1
      }
    }
    // Eased rather than set, so letting go of a drag coasts to a stop instead
    // of stopping under your finger.
    progress += (target - progress) * (1 - Math.exp(-dt * 11))
    place()
    const at = facing()
    if (at !== told) {
      told = at
      onFacing?.(at)
    }
    raf = requestAnimationFrame(frame)
  }

  const run = (on: boolean): void => {
    if (on === !!raf) return
    if (on) {
      last = 0
      raf = requestAnimationFrame(frame)
    } else {
      cancelAnimationFrame(raf)
      raf = 0
    }
  }

  /**
   * How a swipe becomes a card, which is Swiper's model and Android's numbers.
   *
   * The web carousel everyone uses follows the finger one to one, advances on
   * a slow drag once it has covered half a slide (longSwipesRatio: 0.5), and
   * advances on a gesture shorter than 300ms whatever distance it covered
   * (shortSwipes, longSwipesMs: 300). Android draws the line between a tap and
   * a drag at 8dp of travel, from ViewConfiguration's touch slop.
   *
   * All three are here. One to one is the card's own width per card, measured
   * rather than guessed so it holds at both sizes; the half-a-slide threshold
   * falls out of rounding to the nearest; and a quick flick counts even when
   * it barely moved. It was forty pixels a card with a velocity term bolted
   * on, which is four times finger speed: the card changed before the gesture
   * felt like a swipe.
   */
  const SLOP = 8
  const FLICK_MS = 300
  /** One card per card-width of travel. */
  const travel = (): number => Math.max(60, cards[0]?.offsetWidth || 160)

  // Dragged up and down, which is the axis the cards travel on. A drag that
  // moved is not a tap, so the click it would otherwise fire is swallowed.
  let dragging = false
  let lastY = 0
  /** Where and when the gesture began, which is what decides a flick. */
  let fromY = 0
  let fromT = 0
  let fromProgress = 0
  let moved = false
  const onDown = (e: PointerEvent): void => {
    turning = false
    dragging = true
    moved = false
    lastY = e.clientY
    fromY = e.clientY
    fromT = performance.now()
    fromProgress = progress
    target = progress
    stage.setPointerCapture?.(e.pointerId)
  }
  const onMove = (e: PointerEvent): void => {
    if (!dragging) return
    const dy = e.clientY - lastY
    lastY = e.clientY
    // Android's touch slop: under this the gesture is still a tap.
    if (Math.abs(e.clientY - fromY) > SLOP) moved = true
    // Down brings the next card round to you, up sends it back. It was the
    // other way, on the reasoning that a list follows your finger, and this is
    // not a list: the cards travel around a ring rather than along a column,
    // and the one you are reaching for is the one you pull toward you.
    target += dy / travel()
  }

  const onUp = (): void => {
    if (!dragging) return
    dragging = false
    // A quick gesture counts as one card whatever distance it covered, and a
    // slow one counts once it has passed halfway, which is what rounding to
    // the nearest does. Either way the ring settles with a card square to you.
    const quick = performance.now() - fromT < FLICK_MS
    if (quick && moved) target = Math.round(fromProgress) + Math.sign(lastY - fromY)
    else target = Math.round(target)
  }
  const onClick = (e: MouseEvent): void => {
    if (!moved) return
    // Only a click a pointer made. A click with no detail came from a key or
    // from assistive technology, and never from the tail of a drag: without
    // this, pressing Enter on a card after turning the ring did nothing,
    // because the guard was still holding the drag that ended long before.
    if (e.detail === 0) return
    e.preventDefault()
    e.stopPropagation()
    moved = false
  }
  stage.addEventListener('pointerdown', onDown)
  stage.addEventListener('pointermove', onMove)
  stage.addEventListener('pointerup', onUp)
  stage.addEventListener('pointercancel', onUp)
  stage.addEventListener('click', onClick, true)

  const ro = new ResizeObserver(() => {
    width = stage.clientWidth || 1
    place()
  })
  ro.observe(stage)
  const io = new IntersectionObserver((entries) => {
    onScreen = entries.some((e) => e.isIntersecting)
    run(onScreen && !document.hidden)
  })
  io.observe(stage)
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
    if (document.hidden) {
      run(false)
      return
    }
    const r = stage.getBoundingClientRect()
    onScreen = r.bottom > 0 && r.top < innerHeight && r.width > 0
    run(onScreen)
  }
  document.addEventListener('visibilitychange', onVisible)

  place()
  run(true)

  return {
    facing,
    /** Turns the ring so `index` comes round to the front, the short way. */
    bring(index) {
      turning = false
      const here = Math.round(target)
      target = here + (wrap(index - wrap(here, n) + half, n) - half)
    },
    destroy() {
      run(false)
      ro.disconnect()
      io.disconnect()
      document.removeEventListener('visibilitychange', onVisible)
      stage.removeEventListener('pointerdown', onDown)
      stage.removeEventListener('pointermove', onMove)
      stage.removeEventListener('pointerup', onUp)
      stage.removeEventListener('pointercancel', onUp)
      stage.removeEventListener('click', onClick, true)
    },
  }
}
