// Keeps the app exactly as tall as the visible viewport.
//
// It used to be 100dvh with overflow hidden. On a phone, dvh can resolve
// against a stale viewport after the app has been backgrounded and brought
// back, and when it resolves too large the bottom of the grid is clipped away
// with nothing to scroll: the action bar and the tabs simply vanish.
//
// So the height comes from a measurement instead. visualViewport reports what
// is actually on screen, including whatever the browser chrome is currently
// doing, and the CSS falls back to svh, the smallest viewport unit, which can
// never exceed the visible area even if this never runs.
function apply(): void {
  const h = window.visualViewport?.height ?? window.innerHeight
  if (!h || !Number.isFinite(h)) return
  document.documentElement.style.setProperty('--app-h', `${Math.round(h)}px`)
}

export function trackViewport(): void {
  apply()
  // Every route back into the page. Which of these a platform sends after an
  // app switch varies, and measuring twice costs nothing.
  window.addEventListener('resize', apply)
  window.addEventListener('orientationchange', apply)
  window.addEventListener('pageshow', apply)
  window.addEventListener('focus', apply)
  document.addEventListener('visibilitychange', apply)
  window.visualViewport?.addEventListener('resize', apply)
  window.visualViewport?.addEventListener('scroll', apply)
  // A late one, because some platforms report the old size for a frame or two
  // after coming back.
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden) {
      setTimeout(apply, 60)
      setTimeout(apply, 400)
    }
  })
}
