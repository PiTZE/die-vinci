// THE BOX.
//
// Not a mechanic. It pays nothing, unlocks nothing, is counted by nothing, and
// no other part of the game mentions it. It is here for one person.
//
// Found by pressing ABOUT nine times in a row, which puts a button in OPTIONS.
// The button opens this. Nine cubes turn in a grid; touching them in the right
// order makes a box appear; opening the box fills the screen with blue flowers
// and one line of text.
//
// Two departures from the rest of the game, both deliberate.
//
// It is a popup, and confirm.ts opens by saying this game has no modals and
// does not want any. That still stands where it was written: it is about
// destructive resets, where a modal is a thing standing between you and your
// own game. This is not that. There is nothing behind it to get back to.
//
// And it only opens in the light. A game with two themes that insists on one
// of them is being difficult on purpose, which is the point: it is a box that
// does not open in the dark.
import { el } from './shell'
import { currentTheme } from './theme'

/**
 * Numbered the way you read, left to right and top to bottom.
 *
 *     1 2 3
 *     4 5 6
 *     7 8 9
 */
const CODE = [1, 8, 3]

/**
 * Three lines, broken where they are broken on purpose rather than wherever
 * the width happens to wrap them. Written out exactly as it was given, down to
 * the capitals and the apostrophe that is not there.
 */
const MESSAGE = 'Its ok Elina\nYou are too Beautiful\nTo be Sad'

/** How long the cubes take to go. Slow, because they are being dismissed. */
const FADE_MS = 1400
/** How many flowers grow out of it. */

/** Petals a head. Six reads as a flower and stays legible at 40px. */

// -- one cube, drawn the way every other solid in this game is drawn ---------
//
// Eight vertices, twelve edges, a rotation and a flat projection. Not
// wireframe(), which is welded to the table's roll clock and would leave nine
// cubes sitting perfectly still.

const V: [number, number, number][] = [
  [-1, -1, -1], [1, -1, -1], [1, 1, -1], [-1, 1, -1],
  [-1, -1, 1], [1, -1, 1], [1, 1, 1], [-1, 1, 1],
]

const E: [number, number][] = [
  [0, 1], [1, 2], [2, 3], [3, 0],
  [4, 5], [5, 6], [6, 7], [7, 4],
  [0, 4], [1, 5], [2, 6], [3, 7],
]

/** Leaned toward you by a fixed amount, so a cube reads as a cube rather than
 *  as a square that occasionally becomes a hexagon. */
const TILT = 0.62

const SVG_NS = 'http://www.w3.org/2000/svg'

function cubeSvg(): { node: SVGSVGElement; draw: (t: number) => void } {
  const node = document.createElementNS(SVG_NS, 'svg')
  node.setAttribute('viewBox', '-1.9 -1.9 3.8 3.8')
  node.setAttribute('aria-hidden', 'true')
  const lines = E.map(() => {
    const ln = document.createElementNS(SVG_NS, 'line')
    ln.setAttribute('stroke', 'currentColor')
    ln.setAttribute('stroke-width', '1')
    ln.setAttribute('stroke-linecap', 'round')
    ln.setAttribute('vector-effect', 'non-scaling-stroke')
    node.appendChild(ln)
    return ln
  })
  const draw = (t: number): void => {
    const cy = Math.cos(t)
    const sy = Math.sin(t)
    const cx = Math.cos(TILT)
    const sx = Math.sin(TILT)
    const p = V.map(([x, y, z]) => {
      const x1 = x * cy + z * sy
      const z1 = -x * sy + z * cy
      return [x1, y * cx - z1 * sx] as [number, number]
    })
    for (let i = 0; i < E.length; i++) {
      const [a, b] = E[i]
      lines[i].setAttribute('x1', p[a][0].toFixed(3))
      lines[i].setAttribute('y1', p[a][1].toFixed(3))
      lines[i].setAttribute('x2', p[b][0].toFixed(3))
      lines[i].setAttribute('y2', p[b][1].toFixed(3))
    }
  }
  return { node, draw }
}

// -- the box, and the flowers ----------------------------------------------

/**
 * The flowers, as markup.
 *
 * From github.com/Redemple332/Flowers-HTML-CSS, by Md Usman Ansari. All three
 * of them, copied rather than rewritten on the owner's instruction, with
 * nothing changed but the colours. The class names are the original's so the
 * stylesheet beside it is the original's too, and the structure is what that
 * CSS expects: four petals and a white circle in each head, eight lights
 * around it, and leaves up each stem.
 */
const FLOWER = `
<div class="flowers">
      <div class="flower flower--1">
        <div class="flower__leafs flower__leafs--1">
          <div class="flower__leaf flower__leaf--1"></div>
          <div class="flower__leaf flower__leaf--2"></div>
          <div class="flower__leaf flower__leaf--3"></div>
          <div class="flower__leaf flower__leaf--4"></div>
          <div class="flower__white-circle"></div>
          <div class="flower__light flower__light--1"></div>
          <div class="flower__light flower__light--2"></div>
          <div class="flower__light flower__light--3"></div>
          <div class="flower__light flower__light--4"></div>
          <div class="flower__light flower__light--5"></div>
          <div class="flower__light flower__light--6"></div>
          <div class="flower__light flower__light--7"></div>
          <div class="flower__light flower__light--8"></div>
        </div>
        <div class="flower__line">
          <div class="flower__line__leaf flower__line__leaf--1"></div>
          <div class="flower__line__leaf flower__line__leaf--2"></div>
          <div class="flower__line__leaf flower__line__leaf--3"></div>
          <div class="flower__line__leaf flower__line__leaf--4"></div>
          <div class="flower__line__leaf flower__line__leaf--5"></div>
          <div class="flower__line__leaf flower__line__leaf--6"></div>
        </div>
      </div>
      <div class="flower flower--2">
        <div class="flower__leafs flower__leafs--2">
          <div class="flower__leaf flower__leaf--1"></div>
          <div class="flower__leaf flower__leaf--2"></div>
          <div class="flower__leaf flower__leaf--3"></div>
          <div class="flower__leaf flower__leaf--4"></div>
          <div class="flower__white-circle"></div>
          <div class="flower__light flower__light--1"></div>
          <div class="flower__light flower__light--2"></div>
          <div class="flower__light flower__light--3"></div>
          <div class="flower__light flower__light--4"></div>
          <div class="flower__light flower__light--5"></div>
          <div class="flower__light flower__light--6"></div>
          <div class="flower__light flower__light--7"></div>
          <div class="flower__light flower__light--8"></div>
        </div>
        <div class="flower__line">
          <div class="flower__line__leaf flower__line__leaf--1"></div>
          <div class="flower__line__leaf flower__line__leaf--2"></div>
          <div class="flower__line__leaf flower__line__leaf--3"></div>
          <div class="flower__line__leaf flower__line__leaf--4"></div>
        </div>
      </div>
      <div class="flower flower--3">
        <div class="flower__leafs flower__leafs--3">
          <div class="flower__leaf flower__leaf--1"></div>
          <div class="flower__leaf flower__leaf--2"></div>
          <div class="flower__leaf flower__leaf--3"></div>
          <div class="flower__leaf flower__leaf--4"></div>
          <div class="flower__white-circle"></div>
          <div class="flower__light flower__light--1"></div>
          <div class="flower__light flower__light--2"></div>
          <div class="flower__light flower__light--3"></div>
          <div class="flower__light flower__light--4"></div>
          <div class="flower__light flower__light--5"></div>
          <div class="flower__light flower__light--6"></div>
          <div class="flower__light flower__light--7"></div>
          <div class="flower__light flower__light--8"></div>
        </div>
        <div class="flower__line">
          <div class="flower__line__leaf flower__line__leaf--1"></div>
          <div class="flower__line__leaf flower__line__leaf--2"></div>
          <div class="flower__line__leaf flower__line__leaf--3"></div>
          <div class="flower__line__leaf flower__line__leaf--4"></div>
        </div>
      </div>
      <div class="grow-ans" style="--d:0.42s">
      </div>
      <div class="grow-ans" style="--d:0.42s">
      </div>
      <div class="grow-ans" style="--d:0.42s">
      </div>
      <div class="grow-ans" style="--d:0.42s">
        <div class="flower__g-front">
          <div class="flower__g-front__leaf-wrapper flower__g-front__leaf-wrapper--1">
            <div class="flower__g-front__leaf"></div>
          </div>
          <div class="flower__g-front__leaf-wrapper flower__g-front__leaf-wrapper--2">
            <div class="flower__g-front__leaf"></div>
          </div>
          <div class="flower__g-front__leaf-wrapper flower__g-front__leaf-wrapper--3">
            <div class="flower__g-front__leaf"></div>
          </div>
          <div class="flower__g-front__leaf-wrapper flower__g-front__leaf-wrapper--4">
            <div class="flower__g-front__leaf"></div>
          </div>
          <div class="flower__g-front__leaf-wrapper flower__g-front__leaf-wrapper--5">
            <div class="flower__g-front__leaf"></div>
          </div>
          <div class="flower__g-front__leaf-wrapper flower__g-front__leaf-wrapper--6">
            <div class="flower__g-front__leaf"></div>
          </div>
          <div class="flower__g-front__leaf-wrapper flower__g-front__leaf-wrapper--7">
            <div class="flower__g-front__leaf"></div>
          </div>
          <div class="flower__g-front__leaf-wrapper flower__g-front__leaf-wrapper--8">
            <div class="flower__g-front__leaf"></div>
          </div>
          <div class="flower__g-front__line"></div>
        </div>
      </div>
      <div class="grow-ans" style="--d:0.42s">
        <div class="flower__g-fr">
          <div class="leaf"></div>
          <div class="flower__g-fr__leaf flower__g-fr__leaf--1"></div>
          <div class="flower__g-fr__leaf flower__g-fr__leaf--2"></div>
          <div class="flower__g-fr__leaf flower__g-fr__leaf--3"></div>
          <div class="flower__g-fr__leaf flower__g-fr__leaf--4"></div>
          <div class="flower__g-fr__leaf flower__g-fr__leaf--5"></div>
          <div class="flower__g-fr__leaf flower__g-fr__leaf--6"></div>
          <div class="flower__g-fr__leaf flower__g-fr__leaf--7"></div>
          <div class="flower__g-fr__leaf flower__g-fr__leaf--8"></div>
        </div>
      </div>
</div>`

// -- the thing itself -------------------------------------------------------

export interface BoxOptions {
  /** Whether the code has been entered before. It is not asked for twice. */
  solved: boolean
  /** Called the first time the code comes out right. */
  onSolved: () => void
}

let open = false

export function openTheBox(opts: BoxOptions): void {
  // One at a time. A second press while it is up should do nothing rather than
  // stack another veil on the first.
  if (open) return
  open = true

  const veil = el('div', 'box-veil')
  const stage = el('div', 'box-stage')
  veil.appendChild(stage)

  const close = el('button', 'box-close', 'CLOSE') as HTMLButtonElement
  close.type = 'button'
  veil.appendChild(close)

  let raf = 0
  let solved = opts.solved

  const shut = (): void => {
    if (!open) return
    open = false
    if (raf) cancelAnimationFrame(raf)
    document.removeEventListener('keydown', onKey)
    themeWatch?.disconnect()
    veil.remove()
  }
  const onKey = (e: KeyboardEvent): void => {
    if (e.key === 'Escape') shut()
  }
  close.addEventListener('click', shut)
  document.addEventListener('keydown', onKey)

  // -- the dark, and the light ---------------------------------------------

  const lit = (): boolean => currentTheme().scheme === 'light'

  const onTheme = (): void => {
    // Changed the theme while it was open. If the light came on, get on with
    // it; if it went out, the box shuts itself the way it refuses to open.
    if (lit()) {
      if (stage.dataset.state === 'dark') showCubes()
    } else if (stage.dataset.state !== 'dark') {
      showDark()
    }
  }
  // The theme is written onto the document element, so that attribute is what
  // is watched. There is no event for a theme change, and adding one to
  // theme.ts for this would be the secret reaching into the game.
  const themeWatch = new MutationObserver(onTheme)
  themeWatch.observe(document.documentElement, {
    attributes: true,
    attributeFilter: ['data-theme'],
  })

  function showDark(): void {
    stage.dataset.state = 'dark'
    stage.innerHTML = ''
    const note = el('div', 'box-note')
    note.appendChild(el('p', 'box-note-big', 'THE BOX DOES NOT OPEN IN THE DARK'))
    note.appendChild(el('p', 'box-note-small', 'Change the theme to a light one in OPTIONS, then try again.'))
    stage.appendChild(note)
  }

  // -- nine cubes ----------------------------------------------------------

  function showCubes(): void {
    stage.dataset.state = 'cubes'
    stage.innerHTML = ''
    const grid = el('div', 'box-grid')
    const drawers: ((t: number) => void)[] = []
    const cells: HTMLButtonElement[] = []
    let progress = 0

    for (let i = 1; i <= 9; i++) {
      const cell = el('button', 'box-cube') as HTMLButtonElement
      cell.type = 'button'
      cell.setAttribute('aria-label', String(i))
      const { node, draw } = cubeSvg()
      cell.appendChild(node)
      drawers.push(draw)
      cells.push(cell)
      cell.addEventListener('click', () => {
        if (stage.dataset.state !== 'cubes') return
        if (i === CODE[progress]) {
          cell.classList.add('on')
          progress += 1
          if (progress === CODE.length) done()
          return
        }
        // Wrong. Everything goes back and the row starts again. There is no
        // message and no count: a code you can lock yourself out of is a
        // worse thing than a code you can retry forever.
        progress = 0
        for (const c of cells) c.classList.remove('on')
        if (i === CODE[0]) {
          cell.classList.add('on')
          progress = 1
        }
      })
      grid.appendChild(cell)
    }
    stage.appendChild(grid)

    // All nine on one angle, turning together. Nine cubes at nine random
    // speeds is a table of dice; nine turning as one is a made thing, and the
    // brief asked for the second.
    let t0 = 0
    const spin = (now: number): void => {
      if (!t0) t0 = now
      const t = ((now - t0) / 1000) * 0.55
      for (const d of drawers) d(t)
      raf = requestAnimationFrame(spin)
    }
    if (raf) cancelAnimationFrame(raf)
    raf = requestAnimationFrame(spin)

    function done(): void {
      stage.dataset.state = 'fading'
      if (!solved) {
        solved = true
        opts.onSolved()
      }
      // Slowly, and not all at once. They are being dismissed, not switched
      // off, so each one takes its leave a little after the one before it.
      cells.forEach((c, n) => {
        c.style.transitionDelay = `${n * 70}ms`
        c.classList.add('gone')
      })
      window.setTimeout(showBox, FADE_MS)
    }
  }

  // -- the box -------------------------------------------------------------

  /** Solved. One button, in the middle, and nothing else on the screen. */
  function showBox(): void {
    if (!open) return
    if (raf) cancelAnimationFrame(raf)
    raf = 0
    stage.dataset.state = 'box'
    stage.innerHTML = ''

    const btn = el('button', 'box-open', 'OPEN') as HTMLButtonElement
    btn.type = 'button'
    stage.appendChild(btn)

    btn.addEventListener(
      'click',
      () => {
        stage.dataset.state = 'opening'
        btn.remove()

        const garden = el('div', 'box-garden')
        garden.innerHTML = FLOWER
        stage.appendChild(garden)

        // Up straight away and completely transparent, with the whole length
        // of the growing to come in over, so it is faintest while there is
        // nothing but a stem and fully there by the time the flower is open.
        const words = el('div', 'box-words')
        // Written exactly as it was given, line breaks and capitals and all.
        words.textContent = MESSAGE
        stage.appendChild(words)
        // The starting style has to be flushed before the class that
        // transitions away from it, or the browser coalesces the two and the
        // text is simply opaque from the first frame.
        void words.offsetWidth
        words.classList.add('in')
      },
      { once: true },
    )
  }

  document.body.appendChild(veil)
  if (!lit()) showDark()
  else if (solved) showBox()
  else showCubes()
}
