// Redaction: the real words, with their letters rolled.
//
// THE WAGER becomes HET GRAWE. Every letter is the true one and not one of
// them is where it belongs, so the text is plainly made of the thing it hides
// without being the thing it hides. For a game about dice, letters that have
// not settled is the right kind of unreadable.
//
// It started as Bitburner's CorruptibleText, which swaps a character for
// another of its own class and puts the original back half a second later. The
// mechanic here is the same shape, a shared timer disturbing a few positions
// at a time, but the disturbance is a transposition rather than a substitution:
// nothing is invented and nothing is lost, the letters just keep moving.
//
// Word lengths and word breaks survive, which is the point. So does the case.
//
// The honest caveat: an anagram holds every letter of the answer, so a reader
// who wants to work it out can. That is the trade, and it was asked for. It
// reads as a puzzle rather than a wall, which for a help topic you have not
// unlocked is a better feeling than a censored bar.

const REDUCED = window.matchMedia('(prefers-reduced-motion: reduce)')

/** Fisher-Yates, in place. */
function shuffled(chars: string[]): string[] {
  const a = chars.slice()
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    const t = a[i]
    a[i] = a[j]
    a[j] = t
  }
  return a
}

/**
 * The letters of `text`, rolled within each word. Spaces stay put, so the
 * shape of the phrase is intact.
 *
 * A short word can shuffle back to itself, so it tries again a few times. THE
 * landing on THE would quietly hand over a third of the answer.
 */
export function redact(text: string): string {
  return text
    .split(' ')
    .map((word) => {
      if (word.length < 2) return word
      for (let tries = 0; tries < 12; tries++) {
        const out = shuffled([...word]).join('')
        if (out !== word) return out
      }
      return word
    })
    .join(' ')
}

// -- the shared driver ----------------------------------------------------

interface Sealed {
  /** The real text, held in memory only so a repeat call can be recognised.
   *  It is never written to the element or to an attribute. */
  key: string
  /** What is on screen: the same letters, out of order. */
  shown: string
  /** Ticks to wait before the letters move again. */
  counter: number
}

/** Bitburner's tick. Faster and it is a strobe, slower and it stops moving. */
const TICK_MS = 20

/** Ticks between one letter and another trading places. */
const GAP_TICKS_MIN = 3
const GAP_TICKS_SPREAD = 5

/** Transpositions per burst. One is a twitch; the whole word is a re-roll and
 *  reads as static. A few keeps it restless. */
const SWAPS = 2

const live = new Map<HTMLElement, Sealed>()
let timer = 0

/** The [start, end) bounds of the word covering index `i`. */
function wordAround(s: string, i: number): [number, number] {
  let a = i
  let b = i
  while (a > 0 && s[a - 1] !== ' ') a--
  while (b < s.length - 1 && s[b + 1] !== ' ') b++
  return [a, b + 1]
}

/** Trades two letters within one word, so the anagram stays an anagram of
 *  that word rather than drifting across the whole phrase. */
function transpose(s: string): string {
  const at = Math.floor(Math.random() * s.length)
  if (s[at] === ' ') return s
  const [a, b] = wordAround(s, at)
  if (b - a < 2) return s
  const i = a + Math.floor(Math.random() * (b - a))
  const j = a + Math.floor(Math.random() * (b - a))
  if (i === j) return s
  const out = [...s]
  const t = out[i]
  out[i] = out[j]
  out[j] = t
  return out.join('')
}

/** True if any word of `shown` has settled back onto the real one. Words of
 *  one or two letters are exempt: there is nowhere for AT or A to hide, and
 *  refusing every move that lands on them would freeze the line. */
function leaks(shown: string, real: string): boolean {
  const a = shown.split(' ')
  const b = real.split(' ')
  for (let i = 0; i < a.length; i++) {
    if (b[i] !== undefined && b[i].length > 2 && a[i] === b[i]) return true
  }
  return false
}

function tick(): void {
  if (document.hidden) return
  for (const [el, s] of live) {
    s.counter -= 1
    if (s.counter > 0) continue
    s.counter = GAP_TICKS_MIN + Math.random() * GAP_TICKS_SPREAD

    let next = s.shown
    for (let n = 0; n < SWAPS; n++) next = transpose(next)
    // Checked word by word, not on the whole phrase. Transposing inside one
    // word can land it back on the truth while the rest stays scrambled, and
    // "HTE WAGER" hands over the half that matters.
    if (leaks(next, s.key)) continue
    s.shown = next
    el.textContent = next
  }
}

function ensureTimer(): void {
  if (timer || REDUCED.matches) return
  timer = window.setInterval(tick, TICK_MS)
}

/**
 * Covers `el` with a garbled stand-in for `text` and keeps it twitching. The
 * real text is never written to the element.
 */
export function seal(el: HTMLElement, text: string): void {
  // update() runs every frame, so this has to recognise a repeat call. An
  // earlier version compared against an attribute it never set, which
  // re-rolled the whole string sixty times a second: static, not a flicker.
  const held = live.get(el)
  if (held && held.key === text) return
  const base = redact(text)
  live.set(el, { key: text, shown: base, counter: 5 })
  el.textContent = base
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
