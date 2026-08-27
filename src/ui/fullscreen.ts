// The whole screen, on request.
//
// A manifest's `display` is read once when the app is installed and nothing
// can change it afterwards, so shipping `fullscreen` there makes it permanent:
// no setting, and no way back without reinstalling. The Fullscreen API is the
// runtime one, and it is a switch.
//
// It is not everywhere. iPhone Safari has never implemented it, on iPad and
// desktop it works, and on Android it hides the status and gesture bars, which
// is where it was wanted. The setting hides itself where the browser cannot
// honour it rather than offering a switch that does nothing.

type WithWebkit = HTMLElement & { webkitRequestFullscreen?: () => Promise<void> }
type DocWithWebkit = Document & {
  webkitExitFullscreen?: () => Promise<void>
  webkitFullscreenElement?: Element | null
}

export function fullscreenSupported(): boolean {
  const el = document.documentElement as WithWebkit
  return typeof el.requestFullscreen === 'function' || typeof el.webkitRequestFullscreen === 'function'
}

export function isFullscreen(): boolean {
  const d = document as DocWithWebkit
  return !!(document.fullscreenElement ?? d.webkitFullscreenElement)
}

/**
 * Asks for or drops fullscreen. The request has to come from a gesture, so
 * this is only ever called from the button in OPTIONS, never from the state
 * being restored on load.
 */
export async function setFullscreen(on: boolean): Promise<boolean> {
  const el = document.documentElement as WithWebkit
  const d = document as DocWithWebkit
  try {
    if (on) {
      if (isFullscreen()) return true
      await (el.requestFullscreen?.() ?? el.webkitRequestFullscreen?.())
    } else {
      if (!isFullscreen()) return false
      await (d.exitFullscreen?.() ?? d.webkitExitFullscreen?.())
    }
  } catch {
    // Refused, or the browser does not have it. The switch repaints from
    // isFullscreen() either way, so it never lies about the current state.
  }
  return isFullscreen()
}

/** Notifies when the browser leaves fullscreen on its own, which it does on
 *  Escape and on some navigations. */
export function onFullscreenChange(fn: () => void): void {
  document.addEventListener('fullscreenchange', fn)
  document.addEventListener('webkitfullscreenchange', fn)
}
