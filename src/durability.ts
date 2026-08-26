// Keeping a save alive when the browser will not promise to.
//
// localStorage is best-effort storage. Chrome evicts whole origins, least
// recently used first, when the device runs short of space, and that is how a
// save disappears after a few weeks away with nobody touching anything.
//
// navigator.storage.persist() asks for an exemption. Chrome answers it silently
// from an undocumented heuristic and cannot be made to explain itself, so the
// only honest strategy is two-sided: keep asking from every moment that might
// change the answer, and keep a copy somewhere eviction cannot reach.
import { SAVE_KEY } from './game/balance'

type Listener = () => void

const listeners = new Set<Listener>()
export function onDurabilityChange(fn: Listener): void {
  listeners.add(fn)
}
function announce(): void {
  for (const fn of listeners) fn()
}

// ---------------------------------------------------------------------------
// Persistence, pursued rather than asked once

let granted = false
let asking = false
let attempts = 0
let lastAsk = 0

/** Chrome's site engagement score climbs with time spent and interactions, so
 *  a request refused on the first second of the first visit is not a final
 *  answer. These are the moments where the answer plausibly differs: a real
 *  gesture, coming back to the tab, and simply having been here a while. */
const RETRY_MS = 60_000
const MAX_ATTEMPTS = 60

export function persistedNow(): boolean {
  return granted
}

export async function askForPersistence(force = false): Promise<boolean> {
  if (granted || asking) return granted
  if (!navigator.storage?.persist) return false
  if (!force && attempts >= MAX_ATTEMPTS) return false
  if (!force && Date.now() - lastAsk < RETRY_MS) return false
  asking = true
  lastAsk = Date.now()
  attempts++
  try {
    if (await navigator.storage.persisted()) {
      granted = true
    } else {
      granted = await navigator.storage.persist()
    }
  } catch {
    // Unsupported or refused. Both mean the file mirror below is the fallback.
  } finally {
    asking = false
  }
  if (granted) announce()
  return granted
}

/**
 * Chrome grants persistence to origins it considers important, and the signals
 * every source names are site engagement, being installed, being bookmarked,
 * and holding notification permission. None of them is a guarantee. This hooks
 * every one it can observe and asks again each time one fires.
 */
export function pursuePersistence(): void {
  void askForPersistence(true)
  const retry = () => void askForPersistence()
  // The first real gesture skips the throttle. Firefox only ever prompts from
  // one, and the boot request seconds earlier would otherwise eat the window.
  let gestureAsked = false
  const gesture = () => {
    void askForPersistence(!gestureAsked)
    gestureAsked = true
  }
  window.addEventListener('pointerdown', gesture, { passive: true })
  window.addEventListener('keydown', gesture, { passive: true })
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden) retry()
  })
  window.addEventListener('appinstalled', () => void askForPersistence(true))
  window.setInterval(retry, RETRY_MS)
}

/**
 * Notification permission is one of the signals Chrome is documented to weigh,
 * and the only one a page can ask for directly. Offered as its own button
 * rather than fired at boot, because taking a notification permission the game
 * has no intention of using, without saying so, is not a trade to make on
 * someone's behalf.
 */
export async function askForNotifications(): Promise<boolean> {
  try {
    if (!('Notification' in window)) return false
    if (Notification.permission === 'granted') return true
    const res = await Notification.requestPermission()
    if (res !== 'granted') return false
  } catch {
    return false
  }
  await askForPersistence(true)
  return true
}

export function notificationsGranted(): boolean {
  return 'Notification' in window && Notification.permission === 'granted'
}

// ---------------------------------------------------------------------------
// The file mirror, which eviction cannot touch

const DB = 'die-vinci-durability'
const STORE = 'handles'
const HANDLE_KEY = 'save-file'
const MIRROR_MS = 30_000

type Handle = FileSystemFileHandle

export function fileMirrorSupported(): boolean {
  return typeof (window as { showSaveFilePicker?: unknown }).showSaveFilePicker === 'function'
}

function idb(): Promise<IDBDatabase | null> {
  return new Promise((resolve) => {
    try {
      const req = indexedDB.open(DB, 1)
      req.onupgradeneeded = () => req.result.createObjectStore(STORE)
      req.onsuccess = () => resolve(req.result)
      req.onerror = () => resolve(null)
    } catch {
      resolve(null)
    }
  })
}

// A handle survives a reload only through IndexedDB. It cannot be serialised,
// which is why this is not just another localStorage key.
async function readHandle(): Promise<Handle | null> {
  const db = await idb()
  if (!db) return null
  return new Promise((resolve) => {
    try {
      const req = db.transaction(STORE, 'readonly').objectStore(STORE).get(HANDLE_KEY)
      req.onsuccess = () => resolve((req.result as Handle) ?? null)
      req.onerror = () => resolve(null)
    } catch {
      resolve(null)
    }
  })
}

async function writeHandle(h: Handle | null): Promise<void> {
  const db = await idb()
  if (!db) return
  try {
    const store = db.transaction(STORE, 'readwrite').objectStore(STORE)
    if (h) store.put(h, HANDLE_KEY)
    else store.delete(HANDLE_KEY)
  } catch {
    // Private mode, or IndexedDB blocked. The mirror is simply unavailable.
  }
}

let handle: Handle | null = null
let mirrorState: 'off' | 'ready' | 'needs-permission' = 'off'
let lastMirror = 0
let mirrorName = ''

export function fileMirrorState(): { state: typeof mirrorState; name: string } {
  return { state: mirrorState, name: mirrorName }
}

type Permissioned = Handle & {
  queryPermission?: (d: { mode: string }) => Promise<PermissionState>
  requestPermission?: (d: { mode: string }) => Promise<PermissionState>
}

async function permission(h: Handle, ask: boolean): Promise<boolean> {
  const p = h as Permissioned
  try {
    const mode = { mode: 'readwrite' }
    if ((await p.queryPermission?.(mode)) === 'granted') return true
    if (!ask) return false
    return (await p.requestPermission?.(mode)) === 'granted'
  } catch {
    return false
  }
}

/** Reconnects a file bound in an earlier session. The handle survives, but the
 *  permission on it does not, and re-granting needs a gesture, so a reload can
 *  only discover that the file is there and wait to be asked. */
export async function restoreFileMirror(): Promise<void> {
  if (!fileMirrorSupported()) return
  const h = await readHandle()
  if (!h) return
  handle = h
  mirrorName = h.name
  mirrorState = (await permission(h, false)) ? 'ready' : 'needs-permission'
  announce()
}

export async function reconnectFileMirror(): Promise<boolean> {
  if (!handle) return false
  const ok = await permission(handle, true)
  mirrorState = ok ? 'ready' : 'needs-permission'
  announce()
  return ok
}

export async function bindFileMirror(): Promise<boolean> {
  if (!fileMirrorSupported()) return false
  type Picker = (o: unknown) => Promise<Handle>
  const pick = (window as unknown as { showSaveFilePicker: Picker }).showSaveFilePicker
  try {
    const h = await pick({
      suggestedName: 'die-vinci-save.txt',
      types: [{ description: 'die Vinci save', accept: { 'text/plain': ['.txt'] } }],
    })
    handle = h
    mirrorName = h.name
    await writeHandle(h)
    mirrorState = (await permission(h, true)) ? 'ready' : 'needs-permission'
    announce()
    return mirrorState === 'ready'
  } catch {
    // The picker was dismissed. Not an error worth reporting.
    return false
  }
}

export async function unbindFileMirror(): Promise<void> {
  handle = null
  mirrorName = ''
  mirrorState = 'off'
  await writeHandle(null)
  announce()
}

/**
 * Writes the save through to the bound file. Throttled, because a save lands
 * every quarter second while MAX is held and a file write is not free, and
 * forced on the way out so the last state gets there. Takes a producer rather
 * than a string so an unbound game never pays to serialise one.
 */
export async function mirrorToFile(produce: () => string, force = false): Promise<void> {
  if (mirrorState !== 'ready' || !handle) return
  if (!force && Date.now() - lastMirror < MIRROR_MS) return
  lastMirror = Date.now()
  try {
    const w = await handle.createWritable()
    await w.write(produce())
    await w.close()
  } catch {
    mirrorState = 'needs-permission'
    announce()
  }
}

/** Reads the mirrored file back, for when the origin was evicted and the save
 *  in localStorage is gone but the file on disk is not. */
export async function readFileMirror(): Promise<string | null> {
  if (!handle) return null
  if (!(await permission(handle, true))) return null
  try {
    return await (await handle.getFile()).text()
  } catch {
    return null
  }
}

// ---------------------------------------------------------------------------
// When the save was last written somewhere outside this origin

const EXPORT_KEY = `${SAVE_KEY}-last-export`

export function markExported(): void {
  try {
    localStorage.setItem(EXPORT_KEY, String(Date.now()))
  } catch {
    // Nothing to record it in, which is itself the problem being reported.
  }
  announce()
}

export function lastExportedAt(): number | null {
  try {
    const v = Number(localStorage.getItem(EXPORT_KEY))
    return Number.isFinite(v) && v > 0 ? v : null
  } catch {
    return null
  }
}
