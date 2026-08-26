import { NOTATIONS } from '../format'
import type { GameState } from '../state'
import { el, type Actions, type Pane } from './shell'
import { applyTheme, currentTheme, themes } from './theme'

export function optionsPane(): Pane {
  let notationBtns: { id: string; btn: HTMLButtonElement }[] = []
  let themeBtns: { id: string; btn: HTMLButtonElement }[] = []
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

      status = el('div', 'empty', '')
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

      const about = el('div', 'section')
      const ah = el('div', 'section-head')
      ah.appendChild(el('span', 'grow', 'BUILD'))
      ah.appendChild(el('span', 'num dim', __BUILD_ID__))
      about.appendChild(ah)

      root.append(theme, notation, save, about)
      paintTheme()

      function say(msg: string) {
        status.textContent = msg
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
    },
  }
}
