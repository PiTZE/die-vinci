import { NOTATIONS } from '../format'
import type { GameState } from '../state'
import { el, type Actions, type Pane } from './shell'
import { applyTheme, currentTheme, themes } from './theme'
import { installState, manualHint, onInstallChange, promptInstall } from '../install'
import { CHANNEL_PATHS, OFFLINE_TICK_CHOICES } from '../game/balance'
import { listBackups } from '../backup'
import { THOUGHT_SPEEDS } from './thoughts'
import { fullscreenSupported, isFullscreen, onFullscreenChange } from './fullscreen'
import {
  askForNotifications,
  askForPersistence,
  bindFileMirror,
  fileMirrorState,
  fileMirrorSupported,
  notificationsGranted,
  onDurabilityChange,
  reconnectFileMirror,
  unbindFileMirror,
} from '../durability'
import { SLOT_COUNT, currentSlot, slotSummary } from '../save'
import { CONFIRM_KEYS } from './confirm'
import { formatTime } from '../format'

/**
 * Clipboard, falling back to the box.
 *
 * writeText needs a secure context and a gesture; both hold here, and it is
 * refused often enough on locked-down browsers that the box has to stay.
 */
async function copy(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text)
    return true
  } catch {
    return false
  }
}

/** Whatever is in the box, or the clipboard if the box is empty. Reading the
 *  clipboard prompts for permission on some browsers and is refused outright
 *  on others, so the box wins when it has something in it. */
async function paste(inBox: string): Promise<string> {
  if (inBox.trim()) return inBox
  try {
    return await navigator.clipboard.readText()
  } catch {
    return ''
  }
}

function setText(n: HTMLElement, v: string): void {
  if (n.textContent !== v) n.textContent = v
}

interface Cycle {
  root: HTMLButtonElement
  sync(s: GameState): void
}

/**
 * One setting, one button. Its name sits above its current value, and a press
 * moves to the next value.
 *
 * Antimatter Dimensions' options screen is built this way, and it is why twenty
 * settings fit on a phone. A row of buttons per setting, one per choice, is
 * honest about what the choices are and costs a whole band of screen each.
 * THEME alone was 1500px by 80px to hold two words. Thirteen of those is a
 * screen you scroll through looking for the one you wanted.
 */
function cycler<T>(
  name: string,
  choices: readonly { id: T; label: string }[],
  read: (s: GameState) => T,
  write: (v: T) => void,
): Cycle {
  const root = el('button', 'opt') as HTMLButtonElement
  root.type = 'button'
  const value = el('span', 'opt-value', '')
  root.append(el('span', 'opt-name', name), value)
  let at: T | undefined
  root.addEventListener('click', () => {
    if (root.disabled) return
    const i = choices.findIndex((c) => c.id === at)
    write(choices[(i + 1) % choices.length].id)
  })
  return {
    root,
    sync(s) {
      at = read(s)
      const c = choices.find((x) => x.id === at)
      setText(value, c ? c.label : '?')
    },
  }
}

export function optionsPane(): Pane {
  const cycles: Cycle[] = []
  let fullCycle: Cycle
  let tickCycle: Cycle
  /** The last state update() saw, so paintTheme can resync outside the loop. */
  let shown: GameState
  let io: HTMLTextAreaElement
  let status: HTMLElement

  return {
    id: 'options',
    label: 'OPTIONS',

    mount(root, actions: Actions) {
      // Every setting that is a choice between a handful of values, one
      // button each, in a grid. What used to be thirteen stacked bands of
      // full-width buttons is now one screen you can read.
      const settings = el('div', 'section')
      const setHead = el('div', 'section-head')
      setHead.appendChild(el('span', 'grow', 'SETTINGS'))
      settings.appendChild(setHead)
      const grid = el('div', 'opt-grid')
      settings.appendChild(grid)

      const add = (c: Cycle) => {
        cycles.push(c)
        grid.appendChild(c.root)
        return c
      }

      // Theme lives outside the save, so it reads from the registry rather
      // than from the state the other settings come from.
      add(cycler(
        'THEME',
        themes().map((t) => ({ id: t.id, label: t.label })),
        () => currentTheme().id,
        (id) => {
          applyTheme(id)
          paintTheme()
        },
      ))
      add(cycler('NOTATION', NOTATIONS, (s) => s.options.notation, (id) => actions.setNotation(id)))
      add(cycler(
        'THOUGHTS',
        THOUGHT_SPEEDS,
        (s) => s.options.thoughtSpeed,
        (id) => actions.setThoughtSpeed(id),
      ))
      add(cycler(
        'SOUND',
        [{ id: true, label: 'ON' }, { id: false, label: 'OFF' }],
        (s) => s.options.sound,
        (on) => actions.setSound(on),
      ))
      // Hidden where the browser has no Fullscreen API, which is every iPhone.
      // A switch that cannot do anything is worse than no switch.
      fullCycle = add(cycler(
        'FULLSCREEN',
        [{ id: true, label: 'ON' }, { id: false, label: 'OFF' }],
        (s) => s.options.fullscreen,
        (on) => actions.setFullscreen(on),
      ))
      fullCycle.root.hidden = !fullscreenSupported()
      // Escape and some navigations drop out of fullscreen without asking, so
      // the switch follows the browser rather than the saved preference.
      onFullscreenChange(() => actions.setFullscreen(isFullscreen(), true))

      add(cycler(
        'AWAY PROGRESS',
        [{ id: true, label: 'ON' }, { id: false, label: 'OFF' }],
        (s) => s.options.offline,
        (on) => actions.setOffline(on),
      ))
      tickCycle = add(cycler(
        'AWAY TICKS',
        OFFLINE_TICK_CHOICES.map((n) => ({ id: n, label: `${n}` })),
        (s) => s.options.offlineTicks,
        (n) => actions.setOfflineTicks(n),
      ))

      // Each channel keeps its own save, so this navigates rather than setting
      // anything. Pressing it moves to the other build.
      add(cycler(
        'CHANNEL',
        Object.keys(CHANNEL_PATHS).map((name) => ({ id: name, label: name.toUpperCase() })),
        () => __CHANNEL__,
        (name) => {
          if (name !== __CHANNEL__) location.href = CHANNEL_PATHS[name as keyof typeof CHANNEL_PATHS]
        },
      ))

      for (const c of CONFIRM_KEYS) {
        add(cycler(
          c.label.toUpperCase(),
          [{ id: true, label: 'CONFIRM' }, { id: false, label: 'STRAIGHT' }],
          (s) => s.options.confirms[c.key] !== false,
          (on) => actions.setConfirm(c.key, on),
        ))
      }

      const save = el('div', 'section')
      const sh = el('div', 'section-head')
      sh.appendChild(el('span', 'grow', 'SAVE'))
      save.appendChild(sh)

      io = document.createElement('textarea')
      io.rows = 4
      io.spellcheck = false
      io.setAttribute('aria-label', 'Save data')
      // No keyboard, ever. Nothing here is typed by hand: EXPORT writes the
      // save and IMPORT reads it, both through the clipboard. Tapping the box
      // still gets the paste menu, which is the only reason to touch it.
      // Safari ignores a change to this after the fact, so it is set once.
      io.setAttribute('inputmode', 'none')
      io.setAttribute('autocomplete', 'off')
      io.setAttribute('autocapitalize', 'off')
      io.setAttribute('autocorrect', 'off')
      io.style.cssText =
        'width:100%;background:transparent;color:inherit;font:inherit;font-size:0.7rem;border:1px solid var(--border-faint);padding:8px;resize:vertical'
      const ioWrap = el('div', 'row')
      ioWrap.appendChild(io)
      save.appendChild(ioWrap)

      const btns = el('div', 'row')
      const exp = el('button', 'action', 'EXPORT')
      exp.type = 'button'
      // The save goes to the clipboard, and to the box as a fallback. It used
      // to call io.select(), which focuses the textarea, which on a phone
      // throws the keyboard over half the screen for a box nobody was going
      // to type into.
      exp.addEventListener('click', () => {
        const blob = actions.exportSave()
        io.value = blob
        void copy(blob).then((ok) => say(ok ? 'copied to the clipboard' : 'copied to the box'))
      })
      const imp = el('button', 'action', 'IMPORT')
      imp.type = 'button'
      imp.addEventListener('click', () => {
        void paste(io.value).then((blob) => {
          if (!blob.trim()) return say('paste a save into the box first')
          if (blob !== io.value) io.value = blob
          say(actions.importSave(blob) ? 'imported' : 'that is not a save')
        })
      })
      btns.append(exp, imp)
      save.appendChild(btns)

      // Whether the browser has agreed not to evict this origin, and what can
      // still be done about it when it has not. A refused request is why a save
      // vanishes after a long absence, so it is shown rather than guessed at.
      const storageRow = el('div', 'row')
      storageRow.appendChild(el('span', 'grow dim', 'STORAGE'))
      const storageState = el('span', 'num dim', 'checking')
      storageRow.appendChild(storageState)
      save.appendChild(storageRow)

      // Chrome answers persist() silently from an undocumented heuristic and
      // can refuse an installed app. Asking again later genuinely can flip it,
      // because its site engagement score climbs the longer you play, and
      // Firefox only prompts from a real gesture. So the row is tappable.
      const storageAsk = el('button', 'backup-restore', 'ASK AGAIN')
      storageAsk.type = 'button'
      storageAsk.hidden = true
      storageRow.appendChild(storageAsk)
      storageAsk.addEventListener('click', async () => {
        storageAsk.textContent = 'ASKING'
        const ok = await askForPersistence(true)
        say(ok ? 'the browser agreed' : 'the browser refused, bind a file below')
        void paintStorage()
      })

      // Notification permission is one of the signals Chrome weighs, and the
      // only one a page can ask for. Offered with the reason attached rather
      // than taken quietly at boot, since the game sends no notifications.
      const notifyRow = el('div', 'row')
      notifyRow.hidden = true
      const notifyText = el('span', 'grow backup-note',
        'granting notifications is one of the few signals Chrome accepts')
      notifyRow.appendChild(notifyText)
      const notifyBtn = el('button', 'backup-restore', 'ALLOW')
      notifyBtn.type = 'button'
      notifyRow.appendChild(notifyBtn)
      save.appendChild(notifyRow)
      notifyBtn.addEventListener('click', async () => {
        const ok = await askForNotifications()
        say(ok ? 'asked again with that granted' : 'not granted')
        void paintStorage()
      })

      // The only copy eviction cannot reach. Chrome and Edge on a desktop have
      // the picker; Android has no equivalent, so the row hides itself there
      // and EXPORT stays the answer.
      const fileRow = el('div', 'row')
      fileRow.hidden = !fileMirrorSupported()
      const fileText = el('span', 'grow dim', 'SAVE FILE')
      fileRow.appendChild(fileText)
      const fileBtn = el('button', 'backup-restore', 'BIND')
      fileBtn.type = 'button'
      fileRow.appendChild(fileBtn)
      save.appendChild(fileRow)
      fileBtn.addEventListener('click', async () => {
        const { state: st } = fileMirrorState()
        if (st === 'ready') {
          await unbindFileMirror()
          say('the file is no longer written to')
        } else if (st === 'needs-permission') {
          say((await reconnectFileMirror()) ? 'reconnected' : 'permission refused')
        } else {
          say((await bindFileMirror()) ? 'every save now writes there too' : 'no file chosen')
        }
        void paintStorage()
      })

      const paintStorage = async () => {
        let persisted = false
        try {
          persisted = (await navigator.storage?.persisted?.()) ?? false
        } catch {
          // Unsupported. Treated the same as refused, which it effectively is.
        }
        const supported = !!navigator.storage?.persisted
        const mirror = fileMirrorState()
        storageState.textContent = !supported ? 'unknown' : persisted ? 'protected' : 'evictable'
        storageAsk.hidden = persisted || !supported
        storageAsk.textContent = 'ASK AGAIN'
        notifyRow.hidden = persisted || !supported || notificationsGranted()
        if (mirror.state === 'ready') {
          fileText.textContent = mirror.name
          fileText.className = 'grow num'
          fileBtn.textContent = 'UNBIND'
        } else if (mirror.state === 'needs-permission') {
          fileText.textContent = `${mirror.name} needs permission again`
          fileText.className = 'grow backup-note'
          fileBtn.textContent = 'RECONNECT'
        } else {
          fileText.textContent = 'SAVE FILE'
          fileText.className = 'grow dim'
          fileBtn.textContent = 'BIND'
        }
      }
      void paintStorage()
      onDurabilityChange(() => void paintStorage())
      setInterval(paintStorage, 30_000)

      status = el('div', 'empty', '')
      // Nothing to say yet, and an empty div still reserves its padding.
      status.hidden = true
      save.appendChild(status)

      const wipeRow = el('div', 'row')
      const wipe = el('button', 'action', 'WIPE SAVE')
      wipe.type = 'button'
      let armed = false
      wipe.addEventListener('click', () => {
        if (!armed) {
          armed = true
          wipe.textContent = 'WIPE SAVE / SURE?'
          setTimeout(() => {
            armed = false
            wipe.textContent = 'WIPE SAVE'
          }, 4000)
          return
        }
        actions.wipe()
      })
      wipeRow.appendChild(wipe)
      save.appendChild(wipeRow)

      const install = el('div', 'section')
      const ih = el('div', 'section-head')
      ih.appendChild(el('span', 'grow', 'INSTALL'))
      install.appendChild(ih)
      const iRow = el('div', 'row')
      const installBtn = el('button', 'action', 'INSTALL')
      installBtn.type = 'button'
      installBtn.addEventListener('click', async () => {
        installBtn.disabled = true
        await promptInstall()
        paintInstall()
      })
      const installNote = el('div', 'empty', '')
      iRow.appendChild(installBtn)
      install.append(iRow, installNote)

      function paintInstall() {
        const state = installState()
        installBtn.hidden = state !== 'ready'
        // The row keeps its padding even when the only thing in it is hidden.
        iRow.hidden = state !== 'ready'
        installBtn.disabled = false
        installBtn.classList.toggle('buyable', state === 'ready')
        installNote.hidden = state === 'ready'
        installNote.textContent = state === 'installed' ? 'installed' : manualHint()
      }
      paintInstall()
      onInstallChange(paintInstall)

      // Three slots, as AD has. Switching saves the one you are on first.
      const slots = el('div', 'section')
      const slh = el('div', 'section-head')
      slh.appendChild(el('span', 'grow', 'SAVE SLOT'))
      slots.appendChild(slh)
      const slotRow = el('div', 'row')
      for (let n = 0; n < SLOT_COUNT; n++) {
        const info = slotSummary(n)
        const b = el('button', 'action', `${n + 1}`)
        b.type = 'button'
        b.title = info.used ? `ink ${info.ink}, ${info.wagers} wagers` : 'empty'
        b.classList.toggle('buyable', n === currentSlot())
        b.addEventListener('click', () => {
          if (n !== currentSlot()) actions.useSlot(n)
        })
        slotRow.appendChild(b)
      }
      slots.appendChild(slotRow)
      slots.appendChild(el('div', 'empty', 'each slot keeps its own save and backups'))

      // Several copies of different ages, the way Antimatter Dimensions keeps
      // its eight. A single well-guarded save is no help once something has
      // already gone wrong with it.
      const backups = el('div', 'section')
      const bh = el('div', 'section-head')
      bh.appendChild(el('span', 'grow', 'BACKUPS'))
      backups.appendChild(bh)
      const backupList = el('div', 'backup-list')
      backups.appendChild(backupList)

      let armedBackup = ''
      function paintBackups() {
        const found = listBackups()
        backupList.replaceChildren()
        if (!found.length) {
          backupList.appendChild(el('div', 'empty', 'none yet'))
          return
        }
        for (const b of found) {
          const row = el('div', 'row')
          const age = formatTime((Date.now() - b.at) / 1000)
          // Age first, because it is the only thing that matters when choosing which
          // copy to go back to. The label says when it is next rewritten.
          const left = el('span', 'grow')
          left.appendChild(el('span', 'num', `${age} old`))
          left.appendChild(el('span', 'backup-note', b.label))
          row.appendChild(left)
          const btn = el('button', 'backup-restore', armedBackup === b.id ? 'SURE?' : 'RESTORE')
          btn.type = 'button'
          btn.addEventListener('click', () => {
            if (armedBackup !== b.id) {
              armedBackup = b.id
              paintBackups()
              setTimeout(() => {
                if (armedBackup === b.id) {
                  armedBackup = ''
                  paintBackups()
                }
              }, 4000)
              return
            }
            actions.restoreBackup(b.id)
          })
          row.appendChild(btn)
          backupList.appendChild(row)
        }
      }
      paintBackups()
      setInterval(paintBackups, 5_000)

      root.append(settings, install, slots, save, backups)
      paintTheme()

      function say(msg: string) {
        status.textContent = msg
        status.hidden = !msg
      }
      // The theme cycler reads the registry rather than the save, so applying
      // one has to push the new value back into the button itself.
      function paintTheme() {
        // Guarded, because mount calls this before the first update. There is
        // no state to read yet and the next tick syncs everything anyway.
        if (shown) for (const c of cycles) c.sync(shown)
      }
    },

    update(s: GameState) {
      shown = s
      for (const c of cycles) c.sync(s)
      // The tick count only means anything while away progress is on.
      tickCycle.root.disabled = !s.options.offline
    },
  }
}
