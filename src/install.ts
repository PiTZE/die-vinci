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
  // Offered means not installed, whatever this browser was told before.
  remember(false)
  announce()
})

/**
 * Remembered, because a browser tab cannot see it otherwise.
 *
 * Inside the installed app the display-mode query answers the question. In the
 * tab you installed it from, it does not: the prompt event is spent, nothing
 * replaces it, and the pane fell back to telling you to add to your home
 * screen the thing you had just added. So the fact is written down.
 *
 * It self-corrects. Chrome fires beforeinstallprompt only while the app is not
 * installed, so the next one of those clears the flag, and someone who
 * uninstalls is told the truth again the moment their browser offers.
 */
const INSTALLED_KEY = 'ld:installed'

function remember(on: boolean): void {
  try {
    if (on) localStorage.setItem(INSTALLED_KEY, '1')
    else localStorage.removeItem(INSTALLED_KEY)
  } catch {
    // A browser with storage switched off still plays; it just forgets this.
  }
}

function remembered(): boolean {
  try {
    return localStorage.getItem(INSTALLED_KEY) === '1'
  } catch {
    return false
  }
}

window.addEventListener('appinstalled', () => {
  deferred = null
  remember(true)
  announce()
})

export function isInstalled(): boolean {
  return (
    window.matchMedia('(display-mode: standalone)').matches ||
    window.matchMedia('(display-mode: fullscreen)').matches ||
    window.matchMedia('(display-mode: minimal-ui)').matches ||
    // iOS predates the media query and uses this instead.
    (navigator as unknown as { standalone?: boolean }).standalone === true ||
    remembered()
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
