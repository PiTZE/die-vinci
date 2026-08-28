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
import { appReady, guard, sweepStale } from './harness.mjs'
import { mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const args = process.argv.slice(2)
const MOBILE = args.includes('mobile')
const URL_ = args.find((a) => a.startsWith('http')) ?? 'http://127.0.0.1:5173/'
const profile = mkdtempSync(join(tmpdir(), 'ld-cdp-'))
const chrome = spawn('google-chrome', [
  '--headless=new', '--no-sandbox', '--disable-gpu','--disable-dev-shm-usage','--disk-cache-size=1','--media-cache-size=1', '--remote-debugging-port=0',
  `--user-data-dir=${profile}`, `--window-size=${MOBILE ? '390,844' : '1280,800'}`, 'about:blank',
], { stdio: 'ignore' })
guard(chrome, profile, () => ws)
sweepStale()

// Chrome picks the port and writes it into the profile. Fixed ports meant a
// leftover browser from an earlier run answered instead of the one just
// spawned, and the suite then tested a page it never loaded. That cost three
// false failures before anyone noticed the pattern.
function devtoolsPort(dir) {
  try {
    return readFileSync(join(dir, 'DevToolsActivePort'), 'utf8').split('\n')[0].trim()
  } catch {
    return '0'
  }
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
let ws, id = 0
const pending = new Map()

async function connect() {
  for (let i = 0; i < 60; i++) {
    try {
      const list = await (await fetch(`http://127.0.0.1:${devtoolsPort(profile)}/json`)).json()
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
    await sleep(150)
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

  await send('Page.navigate', { url: URL_ })
 await appReady(evaluate)

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
  await key('m', 'rawKeyDown'); await sleep(150); await key('m', 'keyUp')
  const afterHold = await evaluate(TOTAL)
  check('holding m repeats', afterHold > before + 10, `bought ${before} -> ${afterHold}`)

  await sleep(150)
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
  await key('m', 'rawKeyDown'); await sleep(150); await key('m', 'keyUp')
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
  await key('m', 'rawKeyDown'); await sleep(150)
  await evaluate(`window.dispatchEvent(new Event('blur'))`)
  const atBlur = await evaluate(TOTAL)
  await sleep(150)
  check('blur releases a held key', (await evaluate(TOTAL)) === atBlur, `${b2} -> ${atBlur} -> steady`)
  await key('m', 'keyUp')

  if (MOBILE) {
    await evaluate(reset)
    const t0 = await evaluate(TOTAL)
    await tap('.max', 900)
    const t1 = await evaluate(TOTAL)
    check('touch-hold repeats', t1 > t0 + 10, `bought ${t0} -> ${t1}`)
    await sleep(150)
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
    await sleep(150)
    await send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: pt(box.x, box.y) })
    await sleep(150)
    await send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: pt(20, 200) })
    const atMove = await evaluate(TOTAL)
    await sleep(150)
    const whileOff = await evaluate(TOTAL)
    check('keeps firing with the finger off it', whileOff > atMove, `${atMove} -> ${whileOff} while away`)

    await send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] })
    await sleep(120)
    const atLift = await evaluate(TOTAL)
    await sleep(150)
    check('lifting away from the button stops it', (await evaluate(TOTAL)) === atLift, `settled at ${atLift}`)
  }

  // Two fingers, two held buttons. The window release listener used to stop on
  // any pointerup anywhere, which is right for one finger and wrong for two:
  // holding ROLL and MAX together, lifting either one killed both.
  await send('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 2, mobile: true })
  await send('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 5 })
  await sleep(700)
  // The table is cleared first: the checks above buy hundreds of dice, and
  // against those prices MAX is disabled however much ink it is handed.
  await evaluate(`(() => { const s = window.LD.state, D = window.LD.Decimal
    s.options.offline = false; s.autoRoll = false; s.studies = 2
    s.rollUpgrades = 0; s.ink = new D('1e12')
    s.solids.forEach((d, i) => { d.bought = 0; d.amount = new D(i < 3 ? 100 : 0) }) })()`)
  await sleep(600)
  await evaluate(`(() => { window.__roll = 0; window.__max = 0
    const a = window.LD.actions, r = a.roll.bind(a), m = a.maxAll.bind(a)
    a.roll = (...x) => { window.__roll++; return r(...x) }
    a.maxAll = (...x) => { window.__max++; return m(...x) } })()`)

  const centre = async (sel) => evaluate(`(() => { const b = document.querySelector('${sel}').getBoundingClientRect()
    return { x: Math.round(b.left + b.width / 2), y: Math.round(b.top + b.height / 2) } })()`)
  const rollAt = await centre('.bar-roll')
  const maxAt = await centre('.bar-btn.max')
  const pt = (id, p) => ({ x: p.x, y: p.y, id, radiusX: 12, radiusY: 12, force: 1 })
  const counts = () => evaluate(`({ roll: window.__roll, max: window.__max })`)

  await send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [pt(1, rollAt)] })
  await sleep(900)
  const one = await counts()
  await send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [pt(1, rollAt), pt(2, maxAt)] })
  await sleep(700)
  const two = await counts()
  // More than the one press is the whole claim. Asking for five made it a
  // measure of how loaded the box was, and it failed at exactly four during a
  // parallel run.
  check('MAX repeats while ROLL is held', two.max - one.max > 1,
    `max fired ${two.max - one.max} times with ROLL down`)
  check('and ROLL keeps repeating too', two.roll - one.roll > 1, `roll fired ${two.roll - one.roll} more`)

  // touchEnd lists the point being released, so this lifts the ROLL finger.
  await send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [pt(1, rollAt)] })
  // Counted straight after the release rather than before it. The repeat fires
  // every 60ms, and the gap between the previous count and the release being
  // processed is two CDP round trips, which under four parallel browsers is
  // long enough for three or four more presses to land. Allowing for them made
  // the tolerance a measure of how loaded the box was: this failed at +3 and at
  // +4 on a busy run and passed alone. Starting the window after the release
  // asks the real question instead, and the answer is exact.
  const atRelease = await counts()
  await sleep(500)
  const lifted = await counts()
  check('lifting one finger stops only that button',
    lifted.roll === atRelease.roll && lifted.max - atRelease.max > 1,
    `roll +${lifted.roll - atRelease.roll}, max +${lifted.max - atRelease.max}`)

  await send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [pt(2, maxAt)] })
  await sleep(400)
  const done = await counts()
  await sleep(150)
  const after = await counts()
  check('and lifting the second stops that one', after.max - done.max === 0,
    `max +${after.max - done.max} after both released`)
  await send('Emulation.setTouchEmulationEnabled', { enabled: false })

  // The refresh rate governs the readouts and nothing else. The game ticks and
  // the ROLL fill moves at full frame rate whatever it says, and a press has to
  // land at once rather than waiting for the next scheduled redraw.
  const refresh = await evaluate(`(async () => {
    const s = window.LD.state, D = window.LD.Decimal
    // Earlier checks in this file hold buttons and keys down. A repeat still
    // running calls persistSoon every 60ms, which asks for an immediate redraw
    // every 60ms, so the throttle would look broken when it is being told to
    // draw. blur is the game's own release-everything path.
    window.dispatchEvent(new Event('blur'))
    await new Promise(r => setTimeout(r, 100))
    s.autoRoll = true; s.studies = 3; s.rollUpgrades = 25
    s.solids.forEach((d, i) => { if (i < 4) { d.bought = 20; d.amount = new D('1e6') } })
    s.ink = new D('1e5')
    const ink = () => document.querySelector('.res-value').textContent
    const count = async (ms) => {
      s.options.uiMs = ms
      await new Promise(r => setTimeout(r, 250))
      const seen = new Set()
      const t0 = performance.now()
      while (performance.now() - t0 < 2000) {
        seen.add(ink())
        await new Promise(r => requestAnimationFrame(r))
      }
      return seen.size
    }
    const fast = await count(16)
    const slow = await count(500)

    // The fill over one roll, measured at both extremes of the setting. An
    // absolute count of positions is really a count of frames, and inside
    // npm test the box runs four browsers and hands out three of them in a
    // second. Both runs get the same frame budget, so comparing them asks the
    // real question: does the refresh rate change the fill at all.
    s.autoRoll = false; s.rollUpgrades = 0; s.studies = 0
    const bar = document.querySelector('.bar-roll-fill')
    const sweep = async (ms) => {
      s.options.uiMs = ms
      s.solids.forEach((d, i) => { d.bought = 0; d.amount = new D(i === 0 ? 4 : 0) })
      s.ink = new D('1e12'); s.rollStartedAt = 0
      await new Promise(r => setTimeout(r, 250))
      window.LD.actions.roll()
      const widths = new Set()
      let frames = 0
      const t1 = performance.now()
      while (performance.now() - t1 < 1100) {
        widths.add(bar.style.width)
        frames++
        await new Promise(r => requestAnimationFrame(r))
      }
      return { widths: widths.size, frames }
    }
    const fillFast = await sweep(16)
    const fillSlow = await sweep(500)

    // And a purchase shows without waiting half a second for it.
    s.ink = new D('1e12')
    await new Promise(r => setTimeout(r, 250))
    const before = document.querySelector('.solid-amount').textContent
    window.LD.actions.buySolid(1)
    await new Promise(r => requestAnimationFrame(r))
    await new Promise(r => requestAnimationFrame(r))
    const after = document.querySelector('.solid-amount').textContent
    s.options.uiMs = 100
    return { fast, slow, fillFast, fillSlow, pressed: before !== after } })()`)
  check('a slower refresh rate redraws the readouts less often',
    refresh.slow < refresh.fast && refresh.slow <= 6,
    `every frame ${refresh.fast} redraws, 500ms ${refresh.slow}`)
  // As a share of the frames each sweep actually got, not as a raw count. The
  // two sweeps run one after the other and the box does not hand them the same
  // number of frames: inside `npm test`, with four browsers up, this read 53 of
  // 54 frames against 19 of 25 and failed. Nineteen of twenty-five is the
  // behaviour the check is looking for. The raw comparison was measuring how
  // busy the machine was between the two sweeps.
  const moved = (r) => (r.frames ? r.widths / r.frames : 0)
  check('but the ROLL fill moves the same at any refresh rate',
    moved(refresh.fillSlow) >= moved(refresh.fillFast) * 0.6 && refresh.fillSlow.widths > 2,
    `every frame ${refresh.fillFast.widths}/${refresh.fillFast.frames} frames, ` +
      `500ms ${refresh.fillSlow.widths}/${refresh.fillSlow.frames}`)
  check('and a purchase lands without waiting for the next redraw', refresh.pressed === true)

  // MAX must never leave the table unable to produce. Roll rate multiplies what
  // the dice pay, so with no dice it multiplies nothing, and ink can only come
  // from a die. V The Hierophant leaves exactly 1000 ink after a reset, which is
  // exactly ROLL_COST_BASE, so one press of MAX bought a faster roll, spent the
  // last of the ink and left a run that could never recover.
  const emptyTable = await evaluate(`(() => {
    const s = window.LD.state, D = window.LD.Decimal
    s.tarot = { hierophant: 1 }
    s.studies = 0; s.rollUpgrades = 0
    s.solids.forEach((d) => { d.bought = 0; d.amount = new D(0) })
    s.ink = new D(1000)
    window.LD.actions.maxAll()
    return { ink: s.ink.toString(), dice: s.solids[0].amount.toString(),
      roll: s.rollUpgrades } })()`)
  check('MAX buys dice before roll rate on an empty table',
    Number(emptyTable.dice) > 0, JSON.stringify(emptyTable))

  // F and S were the only controls in the game that did nothing when held. MAX
  // was holdable and so were the f and s keys; the two bar buttons were wired
  // to a plain click.
  const heldReset = await evaluate(`(async () => {
    const s = window.LD.state, D = window.LD.Decimal
    s.options.confirms.study = false
    s.studies = 0
    // A study resets the table, so the requirement is topped up throughout the
    // hold. A real endgame does this on its own, faster than you can press.
    const top = () => { s.ink = new D('1e60')
      s.solids.forEach((d) => { d.bought = 40; d.amount = new D('1e30') }) }
    top(); const keep = setInterval(top, 20)
    const btn = [...document.querySelectorAll('.bar-btn')].find(b => b.textContent.trim() === 'S')
    const press = (t, target) => target.dispatchEvent(
      new PointerEvent(t, { bubbles: true, pointerId: 9, button: 0, isPrimary: true }))
    press('pointerdown', btn)
    await new Promise(r => setTimeout(r, 1000))
    const held = s.studies
    press('pointerup', window)
    await new Promise(r => setTimeout(r, 300))
    clearInterval(keep)
    return { held, after: s.studies - held } })()`)
  check('holding S keeps taking studies', heldReset.held > 3, `${heldReset.held} while held`)
  check('and releasing it stops', heldReset.after === 0, `${heldReset.after} after release`)

  // The confirmation still guards a single tap. A hold arms and the next
  // repeat fires, so it runs at half the repeat rate rather than skipping it.
  const oneTap = await evaluate(`(async () => {
    const s = window.LD.state, D = window.LD.Decimal
    s.options.confirms.study = true
    s.studies = 0; s.ink = new D('1e60')
    s.solids.forEach((d) => { d.bought = 40; d.amount = new D('1e30') })
    await new Promise(r => setTimeout(r, 150))
    const btn = [...document.querySelectorAll('.bar-btn')].find(b => b.textContent.trim() === 'S')
    const press = (t, target) => target.dispatchEvent(
      new PointerEvent(t, { bubbles: true, pointerId: 10, button: 0, isPrimary: true }))
    press('pointerdown', btn); press('pointerup', window)
    await new Promise(r => setTimeout(r, 200))
    // Arming renames the button, so the reference is kept rather than looked up.
    return { studies: s.studies, label: btn.textContent.trim() } })()`)
  check('one tap on S still only arms', oneTap.studies === 0 && oneTap.label === '?',
    JSON.stringify(oneTap))


  const shot = await send('Page.captureScreenshot', { format: 'png' })
  const { writeFileSync } = await import('node:fs')
  writeFileSync(MOBILE ? 'interaction-mobile.png' : 'interaction-desktop.png', Buffer.from(shot.data, 'base64'))
} finally {
  ws?.close()
  chrome.kill()
  await sleep(150)
  try { rmSync(profile, { recursive: true, force: true }) } catch {}
}
const failed = results.filter((r) => !r.ok).length
console.log(`\n${results.length - failed}/${results.length} passed`)
process.exit(failed ? 1 : 0)
