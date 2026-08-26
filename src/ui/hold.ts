// Press-and-hold, for pointers and for the keyboard.
//
// Antimatter Dimensions leans on the operating system's key repeat, which
// gives no repeat at all on a touchscreen and a machine-dependent rate on a
// desktop. This runs its own repeat so a finger and a held key behave the same
// everywhere: fire once on press, pause, then repeat until release.
//
// Releasing is the part that has to be airtight. AD has a known bug, the "H
// trick", where opening a menu swallows the keyup and the game keeps buying as
// though the key were still down. Every path out of a hold is covered here:
// pointerup, pointercancel, lost capture, keyup, window blur, and the tab
// going hidden.

/** Time before a hold starts repeating, then the gap between repeats. */
const DELAY_MS = 350
const INTERVAL_MS = 60

export interface Mods {
  shift: boolean
}

interface Repeater {
  stop(): void
}

function repeat(fn: () => void): Repeater {
  fn()
  let timer = window.setTimeout(function again() {
    fn()
    // A chain of timeouts rather than an interval, so a slow frame cannot
    // queue up a backlog of purchases that all land at once.
    timer = window.setTimeout(again, INTERVAL_MS)
  }, DELAY_MS)
  return { stop: () => window.clearTimeout(timer) }
}

// -- pointers -------------------------------------------------------------

/**
 * Wires a button so holding it repeats. Click is left intact as the keyboard
 * and assistive-technology path, and suppressed when a pointer already
 * handled the press.
 */
export function holdable(el: HTMLElement, action: (mods: Mods) => void): void {
  let active: Repeater | null = null
  let fromPointer = false

  const stop = () => {
    active?.stop()
    active = null
    el.classList.remove('held')
  }

  el.addEventListener('pointerdown', (e) => {
    if (e.button !== 0 && e.pointerType === 'mouse') return
    if ((el as HTMLButtonElement).disabled) return
    fromPointer = true
    // Capture means a finger sliding off the button still delivers pointerup
    // here. Without it the repeat never stops.
    try {
      el.setPointerCapture(e.pointerId)
    } catch {
      // Capture is a nicety; the window-level fallbacks still cover release.
    }
    el.classList.add('held')
    active = repeat(() => action({ shift: e.shiftKey }))
  })

  for (const ev of ['pointerup', 'pointercancel', 'lostpointercapture'] as const) {
    el.addEventListener(ev, stop)
  }

  el.addEventListener('click', (e) => {
    // The pointer path already fired this press.
    if (fromPointer) {
      fromPointer = false
      return
    }
    action({ shift: e.shiftKey })
  })

  releasers.add(stop)
}

// -- keyboard -------------------------------------------------------------

const bindings = new Map<string, (mods: Mods) => void>()
const heldKeys = new Map<string, Repeater>()
const releasers = new Set<() => void>()

/**
 * Digits are read from the physical key, so shift+1 does not arrive as "!".
 * Letters are read from the character, so the mnemonic survives a non-QWERTY
 * layout.
 */
function keyOf(e: KeyboardEvent): string {
  if (/^Digit[0-9]$/.test(e.code)) return e.code.slice(5)
  if (e.code === 'Space') return 'space'
  return e.key.toLowerCase()
}

function isTyping(target: EventTarget | null): boolean {
  const n = target as HTMLElement | null
  if (!n) return false
  const tag = n.tagName
  return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || n.isContentEditable
}

export function bindKey(key: string, action: (mods: Mods) => void): void {
  bindings.set(key, action)
}

function releaseAll(): void {
  for (const r of heldKeys.values()) r.stop()
  heldKeys.clear()
  for (const r of releasers) r()
}

window.addEventListener('keydown', (e) => {
  if (e.ctrlKey || e.metaKey || e.altKey) return
  if (isTyping(e.target)) return
  const key = keyOf(e)
  const fn = bindings.get(key)
  if (!fn) return
  e.preventDefault()
  // The OS repeat would run alongside ours and double the rate.
  if (e.repeat || heldKeys.has(key)) return
  heldKeys.set(key, repeat(() => fn({ shift: e.shiftKey })))
})

window.addEventListener('keyup', (e) => {
  const key = keyOf(e)
  heldKeys.get(key)?.stop()
  heldKeys.delete(key)
})

// Alt-tabbing away mid-hold must not leave the key stuck down.
window.addEventListener('blur', releaseAll)
document.addEventListener('visibilitychange', () => {
  if (document.hidden) releaseAll()
})
