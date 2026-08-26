// Interaction tests for press-and-hold, over the DevTools protocol.
//
// Screenshots cannot tell you whether a held button repeats or whether it
// stops when the finger comes up, so this drives a real Chrome. Node 22 has a
// global WebSocket, so it needs no dependencies.
//
//   npm run test:ui              desktop, keyboard paths
//   npm run test:ui -- mobile    adds touch emulation and the touch paths
//
// The dev server must already be running.
import { spawn } from 'node:child_process'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const args = process.argv.slice(2)
const MOBILE = args.includes('mobile')
const URL_ = args.find((a) => a.startsWith('http')) ?? 'http://127.0.0.1:5173/'
const profile = mkdtempSync(join(tmpdir(), 'ld-cdp-'))
const chrome = spawn('google-chrome', [
  '--headless=new', '--no-sandbox', '--disable-gpu', '--remote-debugging-port=9333',
  `--user-data-dir=${profile}`, `--window-size=${MOBILE ? '390,844' : '1280,800'}`, 'about:blank',
], { stdio: 'ignore' })

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
let ws, id = 0
const pending = new Map()

async function connect() {
  for (let i = 0; i < 60; i++) {
    try {
      const list = await (await fetch('http://127.0.0.1:9333/json')).json()
      const page = list.find((t) => t.type === 'page')
      if (page) {
        ws = new WebSocket(page.webSocketDebuggerUrl)
        await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej })
        ws.onmessage = (m) => {
          const msg = JSON.parse(m.data)
          const p = pending.get(msg.id)
          if (p) { pending.delete(msg.id); msg.error ? p.rej(new Error(msg.error.message)) : p.res(msg.result) }
        }
        return
      }
    } catch {}
    await sleep(250)
  }
  throw new Error('chrome did not come up')
}

const send = (method, params = {}) =>
  new Promise((res, rej) => { const n = ++id; pending.set(n, { res, rej }); ws.send(JSON.stringify({ id: n, method, params })) })

const evaluate = async (expr) => {
  const r = await send('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: true })
  if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description ?? 'eval failed')
  return r.result.value
}

async function key(text, type) {
  const code = /^[0-9]$/.test(text) ? `Digit${text}` : `Key${text.toUpperCase()}`
  await send('Input.dispatchKeyEvent', {
    type, key: text, code, windowsVirtualKeyCode: text.toUpperCase().charCodeAt(0), nativeVirtualKeyCode: text.toUpperCase().charCodeAt(0),
  })
}

async function tap(sel, holdMs) {
  const box = await evaluate(`(() => { const e = document.querySelector('${sel}'); const r = e.getBoundingClientRect();
    return { x: r.left + r.width/2, y: r.top + r.height/2 } })()`)
  const pt = [{ x: box.x, y: box.y, radiusX: 8, radiusY: 8, force: 1, id: 1 }]
  await send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: pt })
  await sleep(holdMs)
  await send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] })
}

const results = []
const check = (name, ok, detail = '') => { results.push({ name, ok, detail }); console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? '  ' + detail : ''}`) }

try {
  await connect()
  await send('Page.enable'); await send('Runtime.enable')
  if (MOBILE) await send('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 5 })

  await send('Page.navigate', { url: URL_ }); await sleep(2500)

  // Mutate the live state rather than seeding localStorage and reloading. The
  // game autosaves on pagehide, so a navigation would write the fresh state
  // straight over the seed.
  const reset = `(() => { const s = window.LD.state, D = window.LD.Decimal;
    s.ink = new D('1e40'); s.inkThisWager = new D('1e40'); s.rollUpgrades = 0;
    s.solids.forEach(d => { d.bought = 0; d.amount = new D(0) });
    return s.ink.toString() })()`
  await evaluate(reset)

  // MAX buys the dearest row first, so a single row is no longer a reliable
  // counter. Count every purchase the game has made instead.
  const TOTAL = `window.LD.state.solids.reduce((a, d) => a + d.bought, 0) + window.LD.state.rollUpgrades`

  check('max button exists', await evaluate(`!!document.querySelector('.max')`))

  const before = await evaluate(TOTAL)
  await key('m', 'rawKeyDown'); await sleep(900); await key('m', 'keyUp')
  const afterHold = await evaluate(TOTAL)
  check('holding m repeats', afterHold > before + 10, `bought ${before} -> ${afterHold}`)

  await sleep(600)
  const afterRelease = await evaluate(TOTAL)
  check('keyup stops the repeat', afterRelease === afterHold, `${afterHold} -> ${afterRelease}`)

  // Exactly 10000 ink. Roll rate is 1000, ten d4 is 100, ten d6 is 1000, and
  // one d8 is 10000. Only the d8 should be bought, and it should spend the lot.
  // Two studies, so the d8 is on the table at all: the game opens with one die.
  await evaluate(`(() => { const s = window.LD.state, D = window.LD.Decimal;
    s.studies = 2; s.ink = new D(10000); s.rollUpgrades = 0;
    s.solids.forEach(d => { d.bought = 0; d.amount = new D(0) }) })()`)
  await key('m', 'rawKeyDown'); await sleep(80); await key('m', 'keyUp')
  const picked = await evaluate(`({ d4: window.LD.state.solids[0].bought,
    d8: window.LD.state.solids[2].bought, roll: window.LD.state.rollUpgrades })`)
  check('buys the dearest option first', picked.d8 === 1 && picked.d4 === 0 && picked.roll === 0,
    `d8=${picked.d8} d4=${picked.d4} roll=${picked.roll}`)

  // MAX buys dice and roll rate. It must never spend a study or a folio, both
  // of which reset the table, which would be a catastrophic thing to do to
  // someone holding a button down.
  await evaluate(`(() => { const s = window.LD.state, D = window.LD.Decimal
    s.ink = new D('1e40'); s.studies = 5; s.folios = 0
    s.solids.forEach(d => { d.bought = 0; d.amount = new D(0) })
    s.solids[8].amount = new D(300) })()`)
  await key('m', 'rawKeyDown'); await sleep(600); await key('m', 'keyUp')
  const resets = await evaluate(`({ studies: window.LD.state.studies, folios: window.LD.state.folios,
    bought: window.LD.state.solids.reduce((a, d) => a + d.bought, 0) })`)
  check('max never spends a study or a folio',
    resets.studies === 5 && resets.folios === 0 && resets.bought > 0,
    `studies=${resets.studies} folios=${resets.folios} dice bought=${resets.bought}`)

  // Shift+1 must buy exactly one, not a group of ten.
  await evaluate(reset)
  const b1 = await evaluate(`window.LD.state.solids[0].bought`)
  await send('Input.dispatchKeyEvent', { type: 'rawKeyDown', key: '1', code: 'Digit1', modifiers: 8, windowsVirtualKeyCode: 49 })
  await sleep(80)
  await send('Input.dispatchKeyEvent', { type: 'keyUp', key: '1', code: 'Digit1', modifiers: 8, windowsVirtualKeyCode: 49 })
  check('shift+1 buys one', (await evaluate(`window.LD.state.solids[0].bought`)) === b1 + 1)

  // A hold interrupted by the window losing focus must not stay stuck.
  await evaluate(reset)
  const b2 = await evaluate(TOTAL)
  await key('m', 'rawKeyDown'); await sleep(700)
  await evaluate(`window.dispatchEvent(new Event('blur'))`)
  const atBlur = await evaluate(TOTAL)
  await sleep(500)
  check('blur releases a held key', (await evaluate(TOTAL)) === atBlur, `${b2} -> ${atBlur} -> steady`)
  await key('m', 'keyUp')

  if (MOBILE) {
    await evaluate(reset)
    const t0 = await evaluate(TOTAL)
    await tap('.max', 900)
    const t1 = await evaluate(TOTAL)
    check('touch-hold repeats', t1 > t0 + 10, `bought ${t0} -> ${t1}`)
    await sleep(500)
    check('touchend stops the repeat', (await evaluate(TOTAL)) === t1)

    // MAX exhausts whatever it can afford on the first press, so testing a
    // sustained hold needs income that outruns spending. A vast pile of d4
    // gives prices something to keep climbing against.
    const flowing = `(() => { const s = window.LD.state, D = window.LD.Decimal;
      s.rollUpgrades = 0; s.ink = new D(0);
      s.solids.forEach(d => { d.bought = 0; d.amount = new D(0) });
      s.solids[0].amount = new D('1e200') })()`

    const box = await evaluate(`(() => { const r = document.querySelector('.max').getBoundingClientRect();
      return { x: r.left + r.width/2, y: r.top + r.height/2 } })()`)
    const pt = (x, y) => [{ x, y, radiusX: 8, radiusY: 8, force: 1, id: 1 }]

    // Dragging off the button must not end the hold. Only lifting should.
    await evaluate(flowing)
    // MAX disables itself at zero ink, and a disabled button does not start a
    // hold. Let production put something in the pile first.
    await sleep(250)
    await send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: pt(box.x, box.y) })
    await sleep(500)
    await send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: pt(20, 200) })
    const atMove = await evaluate(TOTAL)
    await sleep(700)
    const whileOff = await evaluate(TOTAL)
    check('keeps firing with the finger off it', whileOff > atMove, `${atMove} -> ${whileOff} while away`)

    await send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] })
    await sleep(120)
    const atLift = await evaluate(TOTAL)
    await sleep(700)
    check('lifting away from the button stops it', (await evaluate(TOTAL)) === atLift, `settled at ${atLift}`)
  }

  const shot = await send('Page.captureScreenshot', { format: 'png' })
  const { writeFileSync } = await import('node:fs')
  writeFileSync(MOBILE ? 'interaction-mobile.png' : 'interaction-desktop.png', Buffer.from(shot.data, 'base64'))
} finally {
  ws?.close()
  chrome.kill()
  await sleep(400)
  try { rmSync(profile, { recursive: true, force: true }) } catch {}
}
const failed = results.filter((r) => !r.ok).length
console.log(`\n${results.length - failed}/${results.length} passed`)
process.exit(failed ? 1 : 0)
