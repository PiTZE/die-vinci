// Redaction, the way Bitburner does it.
//
// Its CorruptibleText picks a random character every so often, swaps it for
// another from the same class, and puts the original back half a second later.
// Letters become letters, digits become digits, and a spoiler goes further:
// three times in four a character becomes punctuation instead. The result
// reads as a signal that will not quite resolve, which is a better fit for
// something being withheld than a solid bar.
//
// Two departures, both deliberate.
//
// The flicker here runs over an already-obfuscated string and restores to the
// obfuscated character, never to the real one. Bitburner corrupts the true
// text and lets it show through; a spoiler in this game must not be in the
// document at all, because select-all or a look at the page source would give
// it away.
//
// And one shared timer drives every sealed element. Bitburner mounts an
// interval per component, which is right for React and wasteful for thirty
// entries in an archive.
//
// https://github.com/bitburner-official/bitburner-src
//   src/ui/React/CorruptibleText.tsx

const CLASSES = [
  'abcdefghijklmnopqrstuvwxyz',
  'ABCDEFGHIJKLMNOPQRSTUVWXYZ',
  '1234567890',
  ' _',
  '()[]{}<>',
]

const OTHER = '!@#$%^&*()_+|\\\';"/.,?`~'

const REDUCED = window.matchMedia('(prefers-reduced-motion: reduce)')

function randFrom(s: string): string {
  return s[Math.floor(Math.random() * s.length)]
}

/** Bitburner's randomize(). Same class where there is one, punctuation
 *  otherwise, and three times in four when obfuscating outright. */
function randomize(ch: string, obfuscate: boolean): string {
  if (obfuscate && Math.random() < 0.75) return randFrom(OTHER)
  for (const c of CLASSES) if (c.includes(ch)) return randFrom(c)
  return randFrom(OTHER)
}

/** The garbled stand-in. Word lengths survive; a space may become an
 *  underscore, which blurs where one word ends and the next begins. */
export function redact(text: string): string {
  let out = ''
  for (const ch of text) out += randomize(ch, true)
  return out
}

function swap(s: string, i: number, ch: string): string {
  return s.slice(0, i) + ch + s.slice(i + 1)
}

// -- the shared driver ----------------------------------------------------

interface Sealed {
  /** The real text, held in memory only so a repeat call can be recognised.
   *  It is never written to the element or to an attribute. */
  key: string
  /** The obfuscated string. */
  base: string
  /** What is on screen, which is `base` with a character or two disturbed. */
  shown: string
  /** Bitburner's countdown, in ticks, before another character is disturbed. */
  counter: number
}

/** Bitburner's numbers. Faster and it is static, slower and it stops reading
 *  as a live signal. */
const TICK_MS = 20
const RESTORE_MS = 500

/**
 * Bitburner disturbs one character every 50ms whatever the string, which for
 * its long augmentation names is a light shimmer and for a nine letter tab
 * heading is most of the word at once. With a 500ms restore that is ten
 * characters disturbed at any instant, so a short label reads as static rather
 * than as a flicker.
 *
 * The rate scales with length instead, so about a quarter of any string is
 * disturbed. At forty characters that works out to Bitburner's own 50ms.
 */
const CALM_AT = 40

const live = new Map<HTMLElement, Sealed>()
let timer = 0

function tick(): void {
  if (document.hidden) return
  for (const [el, s] of live) {
    s.counter -= 1
    if (s.counter > 0) continue
    const spread = CALM_AT / Math.max(8, s.base.length)
    s.counter = Math.random() * 5 * spread

    const i = Math.floor(Math.random() * s.base.length)
    const settled = s.base.charAt(i)
    s.shown = swap(s.shown, i, randomize(settled, false))
    el.textContent = s.shown

    window.setTimeout(() => {
      const still = live.get(el)
      if (still !== s) return
      still.shown = swap(still.shown, i, settled)
      el.textContent = still.shown
    }, RESTORE_MS)
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
  live.set(el, { key: text, base, shown: base, counter: 5 })
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
