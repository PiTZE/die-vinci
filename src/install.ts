// Home-screen install.
//
// Chrome fires beforeinstallprompt once it decides the page is installable,
// and it can fire before any pane exists, so the event is captured at module
// load and held. Calling prompt() later is only allowed because the browser
// handed us the event; there is no way to open that dialog unprompted.
//
// Safari never fires it. There is no API there, only the Share sheet, so that
// case gets a sentence instead of a button.

interface InstallPromptEvent extends Event {
  prompt(): Promise<void>
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>
}

export type InstallState = 'installed' | 'ready' | 'manual'

let deferred: InstallPromptEvent | null = null
const listeners = new Set<() => void>()

function announce(): void {
  for (const fn of listeners) fn()
}

window.addEventListener('beforeinstallprompt', (e) => {
  // Without this the browser shows its own bar and never gives us the event.
  e.preventDefault()
  deferred = e as InstallPromptEvent
  announce()
})

window.addEventListener('appinstalled', () => {
  deferred = null
  announce()
})

export function isInstalled(): boolean {
  return (
    window.matchMedia('(display-mode: standalone)').matches ||
    window.matchMedia('(display-mode: fullscreen)').matches ||
    // iOS predates the media query and uses this instead.
    (navigator as unknown as { standalone?: boolean }).standalone === true
  )
}

export function installState(): InstallState {
  if (isInstalled()) return 'installed'
  return deferred ? 'ready' : 'manual'
}

export function onInstallChange(fn: () => void): void {
  listeners.add(fn)
}

/** Resolves true if the player accepted. The event is single use either way. */
export async function promptInstall(): Promise<boolean> {
  if (!deferred) return false
  const event = deferred
  deferred = null
  try {
    await event.prompt()
    const { outcome } = await event.userChoice
    announce()
    return outcome === 'accepted'
  } catch {
    announce()
    return false
  }
}

/** Shown when there is no prompt to offer, which in practice means Safari. */
export function manualHint(): string {
  const ua = navigator.userAgent
  if (/iPhone|iPad|iPod/.test(ua)) return 'share, then add to home screen'
  if (/Android/.test(ua)) return 'browser menu, then add to home screen'
  return 'use your browser menu to install'
}
