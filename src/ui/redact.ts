// Redaction, animated.
//
// The usual text-scramble effect cycles random glyphs and resolves into the
// real words. This is the opposite: it never resolves, because the words are
// the thing being kept back.
//
// What makes it more than a grey bar is that the pattern is derived from the
// text it covers. Each character picks a block density from its own code, so
// "THE WAGER" always redacts to the same texture and a different phrase
// redacts to a different one. The shape of the sentence shows through, its
// rhythm and its word lengths, and not one letter of it is ever written to the
// DOM. A bar drawn over the text in CSS would leave the words sitting there
// for anyone who selected the page or opened the source.
//
// It ripples rather than marches. A uniform shift along the string reads as a
// loading bar; a slow wave reads as ink not quite settling.

const GLYPHS = ['░', '▒', '▓', '█']

const REDUCED = window.matchMedia('(prefers-reduced-motion: reduce)')

/** How dark this character sits, before the ripple. */
function baseFor(code: number): number {
  return 1 + (code % (GLYPHS.length - 1))
}

/**
 * The redacted form of `text` at a point in the animation. Spaces survive, so
 * word lengths are visible; everything else becomes a block.
 */
export function redactAt(text: string, phase: number): string {
  let out = ''
  for (let i = 0; i < text.length; i++) {
    const ch = text[i]
    if (ch === ' ' || ch === '\n' || ch === '\t') {
      out += ' '
      continue
    }
    const wave = Math.sin(phase * 0.5 + i * 0.8)
    const lift = wave > 0.72 ? 1 : wave < -0.72 ? -1 : 0
    const at = Math.min(GLYPHS.length - 1, Math.max(0, baseFor(ch.charCodeAt(0)) + lift))
    out += GLYPHS[at]
  }
  return out
}

/** The still version, for a reader who has asked for no motion. */
export function redact(text: string): string {
  return redactAt(text, 0)
}

// -- the shared driver ----------------------------------------------------

const live = new Map<HTMLElement, string>()
let timer = 0
let phase = 0

/** Slow enough to read as ink rather than static, cheap enough to ignore. */
const STEP_MS = 220

function tick(): void {
  if (document.hidden) return
  phase += 1
  for (const [el, text] of live) {
    const next = redactAt(text, phase)
    if (el.textContent !== next) el.textContent = next
  }
}

function ensureTimer(): void {
  if (timer || REDUCED.matches) return
  timer = window.setInterval(tick, STEP_MS)
}

/**
 * Covers `el` with the redacted form of `text` and keeps it moving. Calling it
 * again with the same text is free.
 */
export function seal(el: HTMLElement, text: string): void {
  if (live.get(el) === text) return
  live.set(el, text)
  el.textContent = redactAt(text, phase)
  ensureTimer()
}

/** Uncovers `el`, writing the real text for the first time. */
export function unseal(el: HTMLElement, text: string): void {
  live.delete(el)
  if (el.textContent !== text) el.textContent = text
  if (!live.size && timer) {
    window.clearInterval(timer)
    timer = 0
  }
}
