import { NOTATIONS } from '../format'
import type { GameState } from '../state'
import { el, type Actions, type Pane } from './shell'
import { applyTheme, currentTheme, themes } from './theme'
import { installState, manualHint, onInstallChange, promptInstall } from '../install'
import { CHANNEL_PATHS, OFFLINE_TICK_CHOICES } from '../game/balance'
import { listBackups } from '../backup'
import { formatTime } from '../format'

export function optionsPane(): Pane {
  let notationBtns: { id: string; btn: HTMLButtonElement }[] = []
  let themeBtns: { id: string; btn: HTMLButtonElement }[] = []
  let confirmBtns: { on: boolean; btn: HTMLButtonElement }[] = []
  let tickBtns: { n: number; btn: HTMLButtonElement }[] = []
  let offlineBtns: { on: boolean; btn: HTMLButtonElement }[] = []
  let io: HTMLTextAreaElement
  let status: HTMLElement

  return {
    id: 'options',
    label: 'OPTIONS',

    mount(root, actions: Actions) {
      const theme = el('div', 'section')
      const th = el('div', 'section-head')
      th.appendChild(el('span', 'grow', 'THEME'))
      theme.appendChild(th)
      const themeRow = el('div', 'row')
      for (const t of themes()) {
        const b = el('button', 'action', t.label)
        b.type = 'button'
        b.addEventListener('click', () => {
          applyTheme(t.id)
          paintTheme()
        })
        themeBtns.push({ id: t.id, btn: b })
        themeRow.appendChild(b)
      }
      theme.appendChild(themeRow)

      const notation = el('div', 'section')
      const nh = el('div', 'section-head')
      nh.appendChild(el('span', 'grow', 'NOTATION'))
      notation.appendChild(nh)
      const nRow = el('div', 'row')
      for (const n of NOTATIONS) {
        const b = el('button', 'action', n.label)
        b.type = 'button'
        b.addEventListener('click', () => actions.setNotation(n.id))
        notationBtns.push({ id: n.id, btn: b })
        nRow.appendChild(b)
      }
      notation.appendChild(nRow)

      const save = el('div', 'section')
      const sh = el('div', 'section-head')
      sh.appendChild(el('span', 'grow', 'SAVE'))
      save.appendChild(sh)

      io = document.createElement('textarea')
      io.rows = 4
      io.spellcheck = false
      io.setAttribute('aria-label', 'Save data')
      io.style.cssText =
        'width:100%;background:transparent;color:inherit;font:inherit;font-size:0.7rem;border:1px solid var(--border-faint);padding:8px;resize:vertical'
      const ioWrap = el('div', 'row')
      ioWrap.appendChild(io)
      save.appendChild(ioWrap)

      const btns = el('div', 'row')
      const exp = el('button', 'action', 'EXPORT')
      exp.type = 'button'
      exp.addEventListener('click', () => {
        io.value = actions.exportSave()
        io.select()
        say('copied to the box')
      })
      const imp = el('button', 'action', 'IMPORT')
      imp.type = 'button'
      imp.addEventListener('click', () => {
        if (!io.value.trim()) return say('paste a save first')
        say(actions.importSave(io.value) ? 'imported' : 'that is not a save')
      })
      btns.append(exp, imp)
      save.appendChild(btns)

      // Whether the browser has agreed not to evict this origin. A refused
      // request is why a save can vanish after a long absence, so it is worth
      // being able to see rather than guess at.
      const storageRow = el('div', 'row')
      storageRow.appendChild(el('span', 'grow dim', 'STORAGE'))
      const storageState = el('span', 'num dim', 'checking')
      storageRow.appendChild(storageState)
      save.appendChild(storageRow)
      const paintStorage = async () => {
        try {
          if (!navigator.storage?.persisted) {
            storageState.textContent = 'unknown'
            return
          }
          storageState.textContent = (await navigator.storage.persisted())
            ? 'protected'
            : 'evictable'
        } catch {
          storageState.textContent = 'unknown'
        }
      }
      void paintStorage()
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

      const offline = el('div', 'section')
      const oh = el('div', 'section-head')
      oh.appendChild(el('span', 'grow', 'AWAY PROGRESS'))
      offline.appendChild(oh)
      const onRow = el('div', 'row')
      const onBtn = el('button', 'action', 'ON')
      const offBtn = el('button', 'action', 'OFF')
      for (const [b, on] of [[onBtn, true], [offBtn, false]] as const) {
        b.type = 'button'
        b.addEventListener('click', () => actions.setOffline(on))
        offlineBtns.push({ on, btn: b })
        onRow.appendChild(b)
      }
      offline.appendChild(onRow)
      const tickRow = el('div', 'row')
      for (const n of OFFLINE_TICK_CHOICES) {
        const b = el('button', 'action', `${n}`)
        b.type = 'button'
        b.addEventListener('click', () => actions.setOfflineTicks(n))
        tickBtns.push({ n, btn: b })
        tickRow.appendChild(b)
      }
      offline.appendChild(tickRow)
      offline.appendChild(el('div', 'empty', 'ticks to simulate a long absence in'))

      // AD asks before every destructive reset, with a toggle for each. One
      // toggle here, because there are no modals to configure.
      const confirmSec = el('div', 'section')
      const cfh = el('div', 'section-head')
      cfh.appendChild(el('span', 'grow', 'CONFIRM RESETS'))
      confirmSec.appendChild(cfh)
      const cfRow = el('div', 'row')
      for (const [label, on] of [['ON', true], ['OFF', false]] as const) {
        const b = el('button', 'action', label)
        b.type = 'button'
        b.addEventListener('click', () => actions.setConfirmResets(on))
        confirmBtns.push({ on, btn: b })
        cfRow.appendChild(b)
      }
      confirmSec.appendChild(cfRow)
      confirmSec.appendChild(
        el('div', 'empty', 'study, folio, the wager and challenges ask twice'),
      )

      const channel = el('div', 'section')
      const ch = el('div', 'section-head')
      ch.appendChild(el('span', 'grow', 'CHANNEL'))
      channel.appendChild(ch)
      const chRow = el('div', 'row')
      for (const [name, path] of Object.entries(CHANNEL_PATHS)) {
        const b = el('button', 'action', name.toUpperCase())
        b.type = 'button'
        b.classList.toggle('buyable', name === __CHANNEL__)
        b.addEventListener('click', () => {
          if (name === __CHANNEL__) return
          location.href = path
        })
        chRow.appendChild(b)
      }
      channel.appendChild(chRow)
      channel.appendChild(
        el('div', 'empty', 'each channel keeps its own save'),
      )

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
          row.appendChild(el('span', 'grow dim', `${b.label}`))
          row.appendChild(el('span', 'num dim', `${age} ago`))
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
      setInterval(paintBackups, 20_000)

      const about = el('div', 'section')
      const ah = el('div', 'section-head')
      ah.appendChild(el('span', 'grow', 'VERSION'))
      ah.appendChild(el('span', 'num', __VERSION__))
      about.appendChild(ah)
      const buildRow = el('div', 'row')
      buildRow.appendChild(el('span', 'grow dim', 'BUILD'))
      buildRow.appendChild(el('span', 'num dim', __BUILD_ID__))
      about.appendChild(buildRow)

      root.append(theme, notation, install, offline, confirmSec, channel, save, backups, about)
      paintTheme()

      function say(msg: string) {
        status.textContent = msg
        status.hidden = !msg
      }
      function paintTheme() {
        const now = currentTheme().id
        for (const t of themeBtns) t.btn.classList.toggle('buyable', t.id === now)
      }
    },

    update(s: GameState) {
      for (const n of notationBtns) {
        n.btn.classList.toggle('buyable', n.id === s.options.notation)
      }
      for (const o of offlineBtns) o.btn.classList.toggle('buyable', o.on === s.options.offline)
      for (const c of confirmBtns) c.btn.classList.toggle('buyable', c.on === s.options.confirmResets)
      for (const t of tickBtns) {
        t.btn.classList.toggle('buyable', t.n === s.options.offlineTicks)
        t.btn.disabled = !s.options.offline
      }
    },
  }
}
