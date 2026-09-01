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
import { appReady, guard, openTab, sweepStale, tabOffered } from './harness.mjs'
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
    // MAX goes dark at zero ink. It still takes the press, which is the whole
    // point of dimming it rather than disabling it, but let production put
    // something in the pile so the hold has something to buy.
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
  // The ring is a separate feature with its own checks below. A hold long
  // enough to measure a repeat is also long enough to earn one, so it is taken
  // off here rather than left to answer a question nobody asked.
  await evaluate(`window.LD.releaseSticky()`)
  const atRelease = await counts()
  await sleep(500)
  const lifted = await counts()
  await evaluate(`window.LD.releaseSticky()`)
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
    window.LD.releaseSticky()
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


  // A late run flips these many times a second and every flip is true: MAX
  // spends the ink, the next roll replaces it, and a roll is in the air for a
  // fraction of a millisecond. Rendered honestly the two buttons strobe. This
  // measured 43 and 45 changes in two seconds before the states were held.
  const strobe = await evaluate(`(async () => {
    const s = window.LD.state, D = window.LD.Decimal
    s.studies = 10; s.autoRoll = false; s.rollUpgrades = 75; s.options.uiMs = 16
    s.solids.forEach((d, i) => { d.bought = 30; d.amount = new D(10).pow(70 - i * 8) })
    s.ink = new D('1e60')
    await new Promise(r => setTimeout(r, 400))
    const max = document.querySelector('.bar-btn.max')
    const roll = document.querySelector('.bar-roll')
    const fill = document.querySelector('.bar-roll-fill')
    const m = [], r_ = [], f = []
    for (let i = 0; i < 120; i++) {
      window.LD.actions.roll(); window.LD.actions.maxAll()
      m.push(max.className + (max.getAttribute('aria-disabled') === 'true' ? ' off' : ''))
      r_.push(roll.className)
      f.push(fill.style.width)
      await new Promise(r => requestAnimationFrame(r))
    }
    const flips = a => { let n = 0; for (let i = 1; i < a.length; i++) if (a[i] !== a[i-1]) n++; return n }
    return { max: flips(m), roll: flips(r_), fill: flips(f) } })()`)
  check('MAX and ROLL hold still at a late-game roll rate',
    strobe.max <= 2 && strobe.roll <= 2 && strobe.fill <= 2, JSON.stringify(strobe))

  // And the hold is a beat, not a latch: a button that really cannot be
  // pressed has to go dark, or it is lying rather than steadying.
  const goesDark = await evaluate(`(async () => {
    const s = window.LD.state, D = window.LD.Decimal
    s.autoRoll = false; s.rollUpgrades = 0
    s.solids.forEach((d) => { d.bought = 0; d.amount = new D(0) })
    s.ink = new D(0)
    await new Promise(r => setTimeout(r, 700))
    const max = document.querySelector('.bar-btn.max')
    return { cls: max.className, off: max.getAttribute('aria-disabled') === 'true' } })()`)
  check('a button that truly cannot be pressed still goes dark',
    goesDark.off === true && !goesDark.cls.includes('buyable'), JSON.stringify(goesDark))

  // The refresh rate a new save starts on.
  //
  // Cleared before the document runs rather than from the page and reloaded:
  // a reload fires pagehide, the game saves on pagehide, and the save it wrote
  // landed after the clear. That read the state this suite had just been
  // poking at and called it a fresh game.
  await send('Page.addScriptToEvaluateOnNewDocument', { source: 'localStorage.clear()' })
  await send('Page.navigate', { url: URL_ })
  await appReady(evaluate)
  const freshMs = await evaluate(`window.LD.state.options.uiMs`)
  check('a new save refreshes ten times a second', freshMs === 100, String(freshMs))

  // -- the ring: a button that holds itself down ---------------------------
  //
  // Hold one long enough and it keeps going with your finger off. One at a
  // time, which is the design rather than a limit: a phone has one thumb free
  // and the table has three buttons worth holding, so being given one is a
  // decision and being given all of them would not be.

  const pdown = (sel, id) => evaluate(`(() => { const b = document.querySelector('${sel}')
    const r = b.getBoundingClientRect()
    b.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, pointerId: ${id},
      button: 0, clientX: r.x + 5, clientY: r.y + 5 })) })()`)
  const pup = (id) => evaluate(`window.dispatchEvent(new PointerEvent('pointerup',
    { bubbles: true, pointerId: ${id} }))`)
  const rings = () => evaluate(`[...document.querySelectorAll('.sticky')]
    .map(n => n.className.split(/\\s+/).filter(Boolean).join(' '))`)

  await evaluate(`(() => { const s = window.LD.state, D = window.LD.Decimal
    s.studies = 3; s.ink = new D('1e30'); s.autoRoll = false; s.autoDice = 0
    s.inkThisWager = new D(0); s.broke = false; s.haltMs = 0
    s.solids.forEach((d, i) => { d.bought = i < 4 ? 10 : 0
      d.amount = new D(i < 4 ? 50 : 0) }) })()`)
  await sleep(300)

  // Ink first, and a beat for the button to notice: `disabled` is recomputed
  // on the UI tick and holdable refuses a press on a disabled button, so
  // dispatching straight after setting the ink presses nothing at all.
  // inkThisWager too, and not only for tidiness: a ringed ROLL left rolling at
  // this much ink crosses 1.8e308 inside a second, the action bar hands itself
  // over to the Wager, and a ring on a button that has left the screen is
  // correctly dropped. The fixture has to stay out of the endgame to ask
  // anything about the ring at all.
  // The table too, not only the wallet. Each hold in here buys hundreds of
  // dice, and after a few of them the next price is past any fixed pile of
  // ink: MAX goes dark and buys nothing, and the check that follows is
  // measuring a hold that had nothing to do.
  const ready = async () => {
    await evaluate(`(() => { const s = window.LD.state, D = window.LD.Decimal
      s.ink = new D('1e30'); s.inkThisWager = new D(0)
      s.solids.forEach((d, i) => { d.bought = i < 4 ? 10 : 0
        d.amount = new D(i < 4 ? 50 : 0) }) })()`)
    await sleep(250)
  }

  await ready()
  await pdown('.bar-btn.max', 11); await sleep(500); await pup(11)
  check('a short hold is only a hold', (await rings()).length === 0)

  await ready()
  await pdown('.bar-btn.max', 12); await sleep(1200)
  const ringed = await rings()
  await pup(12)
  check('holding it long enough puts a ring on it',
    ringed.length === 1 && ringed[0].includes('max'), JSON.stringify(ringed))

  // Your finger is free for the others, which is the point of the ring.
  await pdown('.bar-roll', 13); await sleep(300); await pup(13)
  check('and using another button does not take it off',
    (await rings()).length === 1, JSON.stringify(await rings()))

  // And holding another one long enough does not take it either. A ring the
  // next long hold silently steals is a ring you have to keep an eye on, and
  // not having to is the whole point of it.
  await pdown('.bar-roll', 14); await sleep(1200); await pup(14)
  const only = await rings()
  check('and holding another long enough does not move it',
    only.length === 1 && only[0].includes('max'), JSON.stringify(only))

  // Off, then onto ROLL, which is the button the rest of this section wants.
  await pdown('.bar-btn.max', 15); await sleep(120); await pup(15)
  await pdown('.bar-roll', 16); await sleep(1200); await pup(16)
  const handedOver = await rings()
  check('and it goes elsewhere once the ringed button is tapped off',
    handedOver.length === 1 && handedOver[0].includes('bar-roll'),
    JSON.stringify(handedOver))

  const inkBefore = await evaluate(`window.LD.state.ink.toString()`)
  await sleep(900)
  await evaluate(`(() => { window.LD.state.inkThisWager = new window.LD.Decimal(0) })()`)
  check('and the ringed button goes on working with your hands off',
    (await evaluate(`window.LD.state.ink.toString()`)) !== inkBefore)

  // The only way off it that does not mean sticking something you did not want.
  await pdown('.bar-roll', 15); await sleep(80); await pup(15)
  await sleep(150)
  check('a tap on the ringed button takes the ring off',
    (await rings()).length === 0, JSON.stringify(await rings()))

  // A held key earns a ring the same way a held finger does. It is the same
  // tiredness either way, and the desktop player is the one holding a key for
  // the length of a run.
  //
  // On space rather than M, because the check is that it goes on working and
  // MAX stops the moment the wallet is dry, which after a second of holding it
  // is a race against how loaded the box is. A ringed ROLL runs forever.
  await ready()
  await evaluate(`window.LD.releaseSticky()`)
  const spaceKey = (type) => send('Input.dispatchKeyEvent', { type, key: ' ',
    code: 'Space', windowsVirtualKeyCode: 32, nativeVirtualKeyCode: 32 })

  await spaceKey('keyDown'); await sleep(400); await spaceKey('keyUp')
  check('a short key press is only a press', (await rings()).length === 0,
    JSON.stringify(await rings()))

  await spaceKey('keyDown'); await sleep(1200)
  const keyRing = await rings()
  await spaceKey('keyUp')
  check('holding the key long enough rings its button',
    keyRing.length === 1 && keyRing[0].includes('bar-roll'), JSON.stringify(keyRing))

  await evaluate(`(() => { window.LD.state.inkThisWager = new window.LD.Decimal(0) })()`)
  await sleep(700)
  check('and it goes on rolling with the key up',
    (await evaluate(`window.LD.state.inkThisWager.gt(0)`)) === true)

  // The same key again takes it off, as a tap on the button does.
  await spaceKey('keyDown'); await sleep(80); await spaceKey('keyUp')
  await sleep(150)
  check('and pressing the key again takes the ring off',
    (await rings()).length === 0, JSON.stringify(await rings()))

  // After the roll already in the air has landed. Taking the ring off stops
  // the next throw, not the one under way, and a throw is up to a second long.
  await sleep(1200)
  await evaluate(`(() => { window.LD.state.inkThisWager = new window.LD.Decimal(0) })()`)
  await sleep(600)
  check('and then it stops', (await evaluate(`window.LD.state.inkThisWager.eq(0)`)) === true)

  // STUDY and FOLIO hold and stick like everything else. They were the last
  // controls in the game that only answered a click. (The Wager's own button
  // is checked in test:wager, where the pane is unsealed.)
  // A full table with plenty of everything, because both of these buttons are
  // disabled until the reset they stand for is affordable.
  const resetReady = `(() => { const s = window.LD.state, D = window.LD.Decimal
    s.studies = 8; s.folios = 1; s.ink = new D('1e40')
    s.solids.forEach((d) => { d.bought = 200; d.amount = new D('1e6') }) })()`
  for (const [name, sel] of [['S', '.bar-btn[title^="Take a study"]'],
    ['F', '.bar-btn[title^="Bind a folio"]']]) {
    await evaluate(`window.LD.releaseSticky()`)
    await evaluate(resetReady)
    await sleep(300)
    if (!(await evaluate(`!!document.querySelector('${sel}')`))) {
      check(`${name} is on the bar`, false)
      continue
    }
    await pdown(sel, 20); await sleep(1200)
    const r = await rings()
    await pup(20)
    check(`${name} can take the ring`, r.length === 1 && r[0].includes('bar-btn'),
      JSON.stringify(r))
  }
  await evaluate(`window.LD.releaseSticky()`)

  // A button you cannot press yet still takes the ring, which is the reason
  // these are dimmed rather than disabled. The moment you most want the game
  // to keep pressing MAX for you is while you cannot afford anything and are
  // waiting on the ink, and a disabled button receives no pointer events at
  // all, so the press could never arrive.
  await evaluate(`(() => { const s = window.LD.state, D = window.LD.Decimal
    s.autoRoll = false; s.rollUpgrades = 0; s.ink = new D(0)
    s.solids.forEach((d) => { d.bought = 0; d.amount = new D(0) }) })()`)
  await sleep(500)
  const dark = await evaluate(`(() => { const b = document.querySelector('.bar-btn.max')
    return b.getAttribute('aria-disabled') === 'true' && !b.disabled })()`)
  await pdown('.bar-btn.max', 21); await sleep(1200)
  const ringedDark = await rings()
  await pup(21)
  check('a button too poor to press can still be given the ring',
    dark === true && ringedDark.length === 1 && ringedDark[0].includes('max'),
    JSON.stringify({ dark, ringedDark }))
  await evaluate(`window.LD.releaseSticky()`)

  // Unaffordable is not gone. MAX goes dark between one roll paying and the
  // next, and dropping the ring for that would take it off a second after you
  // put it on.
  //
  // Asserted on the rule rather than by staging an economy that produces it:
  // forty checks have run before this one and the table is in whatever state
  // they left it, so "make MAX unaffordable" is a fixture that fights the
  // whole file. Disabling the button says the same thing in one line.
  await ready()
  await pdown('.bar-roll', 16); await sleep(1200); await pup(16)
  const held = await evaluate(`document.querySelector('.bar-roll').classList.contains('sticky')`)
  const waited = await evaluate(`(async () => {
    const b = document.querySelector('.bar-roll')
    b.disabled = true
    await new Promise(r => setTimeout(r, 400))
    const still = b.classList.contains('sticky')
    b.disabled = false
    return { still } })()`)
  check('a ring waits through a button it cannot afford',
    held === true && waited.still === true, JSON.stringify({ held, ...waited }))
  await evaluate(`window.LD.releaseSticky()`)

  // -- the menu, in two levels ---------------------------------------------
  //
  // Twelve flat tabs made an 822px strip on a 390px phone, so 432px of the menu
  // was off the right edge. Five groups hold the same twelve panes.

  const navFresh = await evaluate(`(() => { const s = window.LD.state, D = window.LD.Decimal
    s.wagers = 0; s.chips = new D(0); s.studies = 0; s.autoDice = 0; s.autoRoll = false
    s.broke = false; s.codexOpen = 0; s.pendingDraft = []; s.marks = []; s.marksArmed = []
    s.challengesDone = []
    for (const k of Object.keys(s.autobuyers)) s.autobuyers[k].unlocked = false })()`)
  await sleep(300)
  const navGroups = await evaluate(`(() => {
    const g = [...document.querySelectorAll('.tab')]
    return { all: g.map(b => b.textContent.trim()),
      open: g.filter(b => !b.hidden).map(b => b.textContent.trim()),
      panes: [...document.querySelectorAll('.subtab')].length } })()`)
  check('six groups hold the twelve panes',
    navGroups.all.length === 6 && navGroups.panes === 12, JSON.stringify(navGroups))
  // A group exists when anything inside it does, exactly as the flat tabs did.
  check('and a group stays sealed until something inside it is real',
    !navGroups.open.includes('WAGER') && !navGroups.open.includes('BREAK')
      && navGroups.open.includes('TABLE'), JSON.stringify(navGroups.open))

  // The second strip earns its space only when there is a choice in it.
  const oneChild = await evaluate(`(() => document.querySelector('.subtabs').hidden)()`)
  check('the strip under a one-pane group is not drawn', oneChild === true)

  await evaluate(`(() => { const s = window.LD.state; s.wagers = 1; s.studies = 3 })()`)
  await sleep(300)
  await evaluate(openTab('CHALLENGES'))
  await sleep(300)
  const navTwo = await evaluate(`(() => { const strip = document.querySelector('.subtabs')
    return { hidden: strip.hidden,
      shown: [...strip.querySelectorAll('.subtab')].filter(b => !b.hidden).map(b => b.textContent.trim()),
      group: [...document.querySelectorAll('.tab')].find(b => b.classList.contains('on'))?.textContent.trim() } })()`)
  check('opening a pane opens the group that holds it',
    navTwo.group === 'WAGER' && navTwo.hidden === false, JSON.stringify(navTwo))
  check('and the strip shows that group and no other',
    navTwo.shown.join(',') === 'WAGER,CHALLENGES,TAROT', JSON.stringify(navTwo.shown))

  // -- marks ---------------------------------------------------------------
  //
  // AD's tab notifications: a dot meaning "something in here is new and you have
  // not looked", cleared by looking, and carried by a parent for any child.

  await evaluate(`(() => { const s = window.LD.state
    s.marks = []; s.marksArmed = []; s.pendingDraft = ['sun','fool','wheel'] })()`)
  await sleep(400)
  const navMarked = await evaluate(`(() => {
    const dot = sel => [...document.querySelectorAll(sel)]
      .filter(b => !b.hidden && !b.querySelector('.tab-mark').hidden)
      .map(b => b.textContent.trim())
    return { groups: dot('.tab'), panes: dot('.subtab'),
      open: window.LD.state.options.tab } })()`)
  check('a pending draft marks the pane it is waiting in',
    navMarked.panes.includes('TAROT'), JSON.stringify(navMarked))
  // Suppressed on the group you are standing in, because the pane's own dot is
  // already on screen beside it.
  check('but not on the group you are already inside',
    !navMarked.groups.includes('WAGER'), JSON.stringify(navMarked))

  // AD's rule, and the whole reason grouping and marks had to arrive together:
  // this.subtabs.some(tab => tab.hasNotification). From outside the group, the
  // parent is the only thing that can tell you.
  await evaluate(openTab('TABLE'))
  await sleep(400)
  const navFromOutside = await evaluate(`(() => {
    const dot = sel => [...document.querySelectorAll(sel)]
      .filter(b => !b.hidden && !b.querySelector('.tab-mark').hidden)
      .map(b => b.textContent.trim())
    return { groups: dot('.tab'), panes: dot('.subtab'),
      marks: window.LD.state.marks.slice() } })()`)
  check('a group carries the mark of a pane inside it',
    navFromOutside.marks.includes('tarot') && navFromOutside.groups.includes('WAGER'),
    JSON.stringify(navFromOutside))
  check('and the marked pane is not on screen to say so itself',
    !navFromOutside.panes.includes('TAROT'), JSON.stringify(navFromOutside))

  await evaluate(openTab('TAROT'))
  await sleep(400)
  const navCleared = await evaluate(`(() => ({ marks: window.LD.state.marks.slice(),
    dot: !document.querySelector('.subtab[aria-selected="true"] .tab-mark')?.hidden }))()`)
  check('looking at it is what clears it',
    !navCleared.marks.includes('tarot'), JSON.stringify(navCleared))

  // A mark has to point at something. The WAGER tab used to take one whenever
  // a run reached the threshold, which was right while that tab held the
  // button that called it: the button is in the action bar now and the tab
  // holds nothing but what chips buy, so the dot pointed at a grid with
  // nothing new in it. Reported from playing.
  const emptyMark = await evaluate(`(async () => { const s = window.LD.state, D = window.LD.Decimal
    s.wagers = 3; s.marks = []; s.marksArmed = []; s.pendingDraft = []
    s.broke = false; s.chips = new D(0); s.chipUpgrades = []
    s.inkThisWager = new D('1e309'); s.ink = new D('1e309')
    await new Promise(r => setTimeout(r, 400))
    return { marks: s.marks.slice(), callable: window.LD.canWager ? window.LD.canWager(s) : null } })()`)
  check('a callable Wager does not mark the tab that cannot call it',
    !emptyMark.marks.includes('wager'), JSON.stringify(emptyMark))
  // And the one thing that pane does hold still marks it.
  const chipMark = await evaluate(`(async () => { const s = window.LD.state, D = window.LD.Decimal
    s.marks = []; s.marksArmed = []; s.chips = new D(50)
    await new Promise(r => setTimeout(r, 400))
    return s.marks.slice() })()`)
  check('and chips you could spend still do', chipMark.includes('wager'),
    JSON.stringify(chipMark))

  // A group returns you to the pane you were last on inside it. Leaving
  // AUTOMATION to look at the table and coming back to TABLE means choosing
  // the same thing again on every trip.
  const remembered = await evaluate(`(async () => { const s = window.LD.state
    const click = (sel, text) => [...document.querySelectorAll(sel)]
      .find(b => !b.hidden && b.textContent.trim().startsWith(text))?.click()
    const wait = () => new Promise(r => setTimeout(r, 260))
    click('.tab', 'OPTIONS'); await wait()
    click('.subtab', 'HELP'); await wait()
    const inGroup = s.options.tab
    click('.tab', 'TABLE'); await wait()
    const away = s.options.tab
    click('.tab', 'OPTIONS'); await wait()
    return { inGroup, away, back: s.options.tab } })()`)
  check('a group opens on the pane you were last on inside it',
    remembered.inGroup === 'help' && remembered.away === 'table'
      && remembered.back === 'help', JSON.stringify(remembered))

  // Never on a tab the player has not met. A mark on a navSealed pane would be the
  // loudest spoiler in the game.
  const navSealed = await evaluate(`(() => { const s = window.LD.state, D = window.LD.Decimal
    s.wagers = 0; s.chips = new D(0); s.marks = []; s.marksArmed = []
    s.pendingDraft = []; s.broke = false; s.codexOpen = 0
    for (const k of Object.keys(s.autobuyers)) s.autobuyers[k].unlocked = false
    return true })()`)
  await sleep(400)
  const noSpoiler = await evaluate(`(() => ({ marks: window.LD.state.marks.slice(),
    offered: ${tabOffered('CODICES')} }))()`)
  check('and never on one the player has not met',
    noSpoiler.offered === false && !noSpoiler.marks.includes('codices'),
    JSON.stringify(noSpoiler))

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
