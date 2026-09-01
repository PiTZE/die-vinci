// The roll loop. Nothing produces until a roll lands, a hand cannot out-roll
// the roll rate, and the automator takes over from the finger.
import { spawn } from 'node:child_process'
import { appReady, guard, openTab, sweepStale, tabOffered } from './harness.mjs'
import { mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
const profile = mkdtempSync(join(tmpdir(), 'ld-rl-'))
const chrome = spawn('google-chrome',['--headless=new','--no-sandbox','--disable-gpu','--disable-dev-shm-usage','--disk-cache-size=1','--media-cache-size=1',
  '--remote-debugging-port=0',`--user-data-dir=${profile}`,'--window-size=390,844','about:blank'],{stdio:'ignore'})
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
const sleep=ms=>new Promise(r=>setTimeout(r,ms))
let ws,id=0;const pending=new Map()
for(let i=0;i<60&&!ws;i++){try{const l=await(await fetch(`http://127.0.0.1:${devtoolsPort(profile)}/json`)).json();const p=l.find(t=>t.type==='page')
 if(p){ws=new WebSocket(p.webSocketDebuggerUrl);await new Promise((r,j)=>{ws.onopen=r;ws.onerror=j})
  ws.onmessage=m=>{const x=JSON.parse(m.data);const q=pending.get(x.id);if(q){pending.delete(x.id);q.res(x.result)}}}}catch{} if(!ws)await sleep(150)}
const send=(m,p={})=>new Promise(res=>{const n=++id;pending.set(n,{res});ws.send(JSON.stringify({id:n,method:m,params:p}))})
const ev=async e=>{const r=await send('Runtime.evaluate',{expression:e,returnByValue:true,awaitPromise:true})
  if(r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description); return r.result?.value}
await send('Emulation.setFocusEmulationEnabled',{enabled:true})
await send('Page.enable');await send('Runtime.enable')
const res=[];const check=(n,ok,d='')=>{res.push(ok);console.log(`${ok?'PASS':'FAIL'}  ${n}${d?'  '+d:''}`)}
await send('Page.navigate',{url:'http://127.0.0.1:5173/'})
 await appReady(ev)
await ev(`localStorage.clear()`); await send('Page.reload')
 await appReady(ev)

// The dev server compiles on first request, so a fixed sleep after navigate is
// a guess. Wait for the app to actually exist instead.
async function booted() {
  for (let i = 0; i < 40; i++) {
    try { if (await ev(`!!(window.LD && window.LD.state)`)) return true } catch {}
    await sleep(150)
  }
  throw new Error('the app never booted')
}
await booted()

const ROLL = `[...document.querySelectorAll('.bar-roll')][0]`

// Away progress off for the whole suite. If the headless page stalls past a
// second mid-spin, the catch-up simulates the gap on a synthetic clock that
// jumps past the roll duration and lands the throw early. That is correct
// behaviour and it makes every timing assertion here a coin flip.
await ev(`window.LD.state.options.offline = false`)
await sleep(150)

// The table opens with one die and nothing running.
const start = await ev(`({
  rows: [...document.querySelectorAll('.solid')].filter(r => getComputedStyle(r).display !== 'none').length,
  ink: window.LD.state.ink.toString(),
  auto: window.LD.state.autoRoll,
})`)
check('the table opens with one die', start.rows === 1, `rows: ${start.rows}`)
check('and nothing is automated', start.auto === false)

// Nothing at all should accrue while the button is untouched.
await ev(`window.LD.actions.buySolid(1)`); await sleep(1500)
const idle = await ev(`window.LD.state.ink.toString()`)
await sleep(1500)
const stillIdle = await ev(`window.LD.state.ink.toString()`)
check('a d4 alone produces nothing without a roll', idle === stillIdle, `${idle} -> ${stillIdle}`)

// One roll pays out when it lands, not while it is in the air.
// Click and read in one synchronous expression. Probing 120ms later raced the
// 100ms tick: sometimes the roll had already landed, and the check reported a
// spin that never started rather than a tick that arrived first.
const mid = await ev(`(() => {
  ${ROLL}.click()
  return { ink: window.LD.state.ink.toString(), spinning: window.LD.state.rollStartedAt > 0 }
})()`)
check('pressing ROLL starts a spin', mid.spinning === true, JSON.stringify(mid))
check('and pays nothing mid-air', mid.ink === stillIdle, mid.ink)

// Polled rather than slept. The roll takes one interval, and a fixed 1200ms
// against a 1000ms interval leaves 200ms for the tick that resolves it, which
// is not enough on a box running four browsers: this read a face of 0 and
// called it a broken die. Six seconds is a cap, not a delay.
const readLanded = `({
  ink: window.LD.state.ink.toString(),
  face: window.LD.state.faces[0],
  shown: document.querySelector('.solid-face').textContent,
  spinning: window.LD.state.rollStartedAt > 0,
})`
// Waits for the screen, not just the state. The readouts redraw on the refresh
// rate rather than every frame, so the dice can come to rest up to one interval
// before the face is drawn, and reading the DOM the instant the state settles
// caught the previous frame's blank.
let landed = await ev(readLanded)
for (let i = 0; i < 40 && (landed.spinning || landed.shown === ''); i++) {
  await sleep(150)
  landed = await ev(readLanded)
}
check('the roll lands and pays', Number(landed.ink) > Number(stillIdle), `${stillIdle} -> ${landed.ink}`)
check('the d4 shows a face of 1 to 4', landed.face >= 1 && landed.face <= 4, `rolled ${landed.face}`)
const archivePay = await ev(`window.LD.achievementPower(window.LD.state).toNumber()`)
check('and pays count times face',
  Math.abs(Number(landed.ink) / archivePay - landed.face) < 1e-9,
  `1 d4 rolled ${landed.face}, paid ${landed.ink}`)
check('and the number is drawn on the die', landed.shown === String(landed.face), landed.shown)
check('the dice come to rest', landed.spinning === false)

// Mashing must not beat the roll rate. Twenty presses inside one interval is
// one roll, or the manual path would be strictly better than the automator.
const beforeMash = await ev(`window.LD.state.ink.toString()`)
await ev(`for (let i = 0; i < 20; i++) ${ROLL}.click()`)
await sleep(1300)
const afterMash = await ev(`window.LD.state.ink.toString()`)
const gained = Number(afterMash) - Number(beforeMash)
// One roll of N d4 can pay at most 4N: the die's highest face, times whatever
// the archive is paying by now. Its entries are re-earned every tick, so the
// ceiling has to be computed rather than written down.
const oneRollMax = Number(await ev(`window.LD.state.solids[0].amount.toString()`))
  * 4 * (await ev(`window.LD.achievementPower(window.LD.state).toNumber()`)) + 0.001
check('mashing cannot beat the roll rate', gained <= oneRollMax,
  `gained ${gained.toFixed(3)}, one roll caps at ${oneRollMax.toFixed(3)}`)

// Space is bound to the roll, and must not also scroll the pane under it.
await ev(`(() => { const s = window.LD.state, D = window.LD.Decimal
  s.rollStartedAt = 0; s.ink = new D(0) })()`)
await sleep(150)
const beforeKey = await ev(`window.LD.state.ink.toString()`)
await send('Input.dispatchKeyEvent',{type:'rawKeyDown',code:'Space',key:' ',windowsVirtualKeyCode:32})
await sleep(80)
await send('Input.dispatchKeyEvent',{type:'keyUp',code:'Space',key:' ',windowsVirtualKeyCode:32})
await sleep(1300)
const afterKey = await ev(`window.LD.state.ink.toString()`)
check('space rolls', Number(afterKey) > Number(beforeKey), `${beforeKey} -> ${afterKey}`)

// The automator is a post-Wager purchase now, bought with a point in the
// AUTOMATION tab, so the whole first run is your finger on the button.
const beforeWager = await ev(`(() => {
  const t = [...document.querySelectorAll('.tab, .subtab')].find(x => x.textContent.trim() === 'AUTOMATION')
  return !t || t.hidden })()`)
check('no automation tab before the first Wager', beforeWager === true)

await ev(`(() => { const s = window.LD.state, D = window.LD.Decimal
  s.wagers = 1; s.chips = new D(3) })()`)
await sleep(400)
await ev(openTab('AUTOMATION'))
await sleep(300)
await ev(`[...document.querySelectorAll('.auto-up')].find(b => b.textContent.includes('UNLOCK')).click()`)
await sleep(300)
check('it costs a point', (await ev(`Number(window.LD.state.chips)`)) === 2,
  `points now ${await ev(`Number(window.LD.state.chips)`)}`)
await ev(openTab('TABLE'))
await sleep(300)
const auto = await ev(`({ auto: window.LD.state.autoRoll,
  btn: getComputedStyle(${ROLL}).display })`)
check('the automator can be bought', auto.auto === true)
check('the dice sounds are cached and decodable',
  (await ev(`fetch('/sfx/throw-1.mp3').then(r => r.ok && r.headers.get('content-type'))`)) !== false,
  await ev(`fetch('/sfx/throw-1.mp3').then(r => r.status)`))
check('and the ROLL button stands down', auto.btn === 'none', auto.btn)

const beforeAuto = await ev(`window.LD.state.ink.toString()`)
await sleep(1600)
const afterAuto = await ev(`window.LD.state.ink.toString()`)
check('rolls now land on their own', Number(afterAuto) > Number(beforeAuto),
  `${beforeAuto} -> ${afterAuto}`)

// And it can be switched off again, which puts the button back.
await ev(`window.LD.actions.toggleAutomator()`)
await sleep(400)
const offAgain = await ev(`({ on: window.LD.state.autoRollOn,
  rollBtn: getComputedStyle(${ROLL}).display })`)
check('switching it off brings ROLL back',
  offAgain.on === false && offAgain.rollBtn !== 'none', JSON.stringify(offAgain))
const idleA = await ev(`window.LD.state.ink.toString()`)
await sleep(900)
check('and nothing rolls while it is off',
  (await ev(`window.LD.state.ink.toString()`)) === idleA)
await ev(`window.LD.actions.toggleAutomator()`)
await sleep(300)

// A batch must pay the mean face per die, not a flat one, or automating the
// roll would quietly be a downgrade.
await ev(`(() => { const s = window.LD.state, D = window.LD.Decimal
  s.autoRoll = true; s.rollUpgrades = 40; s.studies = 0
  s.ink = new D(0); s.inkThisWager = new D(0)
  s.solids.forEach((d, i) => { d.bought = 0; d.amount = new D(i === 0 ? 1000 : 0) }) })()`)
const t0 = Date.now()
const i0 = Number(await ev(`window.LD.state.ink.toString()`))
await sleep(3000)
const i1 = Number(await ev(`window.LD.state.ink.toString()`))
const secs = (Date.now() - t0) / 1000
const rate = Number(await ev(`1 / window.LD.rollInterval`))
// 1000 d4, mean face 2.5, so 2500 ink a roll.
const want = 1000 * 2.5 * rate * secs
const got = (i1 - i0) / want
// Wide, because this is a wall clock against a 100ms tick and it measured
// anywhere from 99% to 145% across runs. It is not trying to verify the rate.
// The regression it exists to catch is a batch paying a flat factor of 1
// instead of each die's mean face, which on a d4 lands at 40%.
check('a batch pays the mean face per die', got > 0.55 && got < 1.75,
  `${(got * 100).toFixed(0)}% of expected`)

// The throw is one eased curve arriving at rest, not a constant spin that
// stops. Measured on the wireframe's own geometry rather than on the wobble:
// the tumble is baked into the line coordinates, so how far a vertex travels
// between samples is the rotation rate itself.
await ev(`(() => { const s = window.LD.state, D = window.LD.Decimal
  s.autoRoll = false; s.rollStartedAt = 0; s.rollUpgrades = 0
  s.solids.forEach((d, i) => { d.amount = new D(i === 0 ? 10 : 0) }) })()`)
await sleep(150)
// Sampled on the frame, because the die is redrawn on the frame. A 40ms timer
// beats against the frame rate, and two samples inside one frame read as no
// movement at all.
await ev(`(() => { window.__s = []; window.__sOn = true
  const ln = document.querySelector('.solid-icon line')
  const step = () => {
    if (!window.__sOn) return
    window.__s.push([Number(ln.getAttribute('x1')), Number(ln.getAttribute('y1')),
      document.querySelector('.solid-icon').style.transform])
    requestAnimationFrame(step)
  }
  requestAnimationFrame(step) })()`)
await ev(`${ROLL}.click()`)
// Waits for frames rather than for time. Inside `npm test` the box runs four
// browsers and this window delivered twelve frames, which is not enough to
// average anything: the reading became noise and the check failed on it. Three
// seconds is the cap, and a healthy run needs about one.
// Both conditions. Long enough for the throw to finish and settle, which is
// what the squareness check reads, and enough frames to average the
// deceleration over. Under load those are not the same thing.
const tumbleUntil = Date.now() + 1400
for (let i = 0; i < 30; i++) {
  await sleep(100)
  if (Date.now() >= tumbleUntil && (await ev(`window.__s.length`)) >= 45) break
}
await ev(`window.__sOn = false`)
const swing = await ev(`(() => {
  const s = window.__s
  const d = []
  for (let i = 1; i < s.length; i++) d.push(Math.hypot(s[i][0] - s[i-1][0], s[i][1] - s[i-1][1]))
  const moving = d.filter(v => v > 0)
  const avg = a => a.length ? a.reduce((x, y) => x + y, 0) / a.length : 0
  const third = Math.max(1, Math.floor(moving.length / 3))
  return { samples: d.length, moving: moving.length,
    head: avg(moving.slice(0, third)), tail: avg(moving.slice(-third)),
    lastTransform: s.length ? s[s.length - 1][2] : null }
})()`)
check('the die actually tumbles', swing.moving > 8, JSON.stringify(swing))
check('and decelerates the whole way rather than stopping dead',
  swing.head > swing.tail * 2, `head ${swing.head.toFixed(4)} vs tail ${swing.tail.toFixed(4)}`)
check('and lands square, with no tilt left on it',
  swing.lastTransform === '', JSON.stringify(swing.lastTransform))

// A die in the air should visibly hop rather than vibrate on the spot.
await ev(`(() => { window.__h = []
  const icon = document.querySelector('.solid-icon')
  window.__ht = setInterval(() => {
    const m = icon.style.transform
    const i = m.indexOf(',')
    const j = m.indexOf('px', i)
    window.__h.push(i < 0 ? 0 : Number(m.slice(i + 1, j)))
  }, 30) })()`)
await ev(`${ROLL}.click()`)
await sleep(1400)
await ev(`clearInterval(window.__ht)`)
const hop = await ev(`(() => {
  const h = window.__h.filter(v => Number.isFinite(v))
  return { n: h.length, lowest: Math.min(...h), highest: Math.max(...h) }
})()`)
check('the hop is big enough to see', hop.lowest < -1.2, JSON.stringify(hop))

// A die in the air holds the face it last landed on, at full strength, rather
// than emptying the column for the whole roll. In a game whose feedback is
// numbers, a blank column for a second reads as the panel going out.
//
// It used to hold it dimmed to 30%, on the reasoning that a throw in the air
// means the number on screen belongs to the previous throw. True, and useless:
// a die is in the air for the whole interval and at rest for a single frame,
// so the number spent almost all of its life greyed out with a 120ms fade
// either side, which is what the dimming was supposed to be an exception to.
await ev(`(() => { const s = window.LD.state, D = window.LD.Decimal
  s.autoRoll = false; s.rollStartedAt = 0; s.rollUpgrades = 0 })()`)
await sleep(150)
// Land one first, so there is something for the next throw to hold.
await ev(`${ROLL}.click()`); await sleep(1300)
const heldFace = await ev(`document.querySelector('.solid-face').textContent`)
await ev(`${ROLL}.click()`); await sleep(120)
const air = await ev(`(() => { const f = document.querySelector('.solid-face')
  return { face: f.textContent, stale: f.classList.contains('stale'),
    opacity: getComputedStyle(f).opacity,
    progress: window.LD.rollProgress(window.LD.state, Date.now()) } })()`)
check('a die in the air holds its last face, undimmed',
  air.face === heldFace && heldFace !== "" && air.progress < 1
    && air.stale === false && air.opacity === '1',
  JSON.stringify({ heldFace, ...air }))

// And a die that has never landed shows nothing, because there is nothing to
// hold on to yet.
await ev(`(() => { const s = window.LD.state
  s.faces = s.faces.map(() => 0); s.rollStartedAt = 0 })()`)
await ev(`document.querySelectorAll('.solid-face').forEach(f => {
  f.textContent = ''; f.classList.remove('stale') })`)
await sleep(150)
await ev(`(() => { const s = window.LD.state; s.solids[0].amount = new window.LD.Decimal(0) })()`)
await sleep(250)
check('a die with nothing on it shows nothing',
  (await ev(`document.querySelector('.solid-face').textContent`)) === '')
// Put the dice back. Everything after this reads the same row.
await ev(`(() => { const s = window.LD.state; s.solids[0].amount = new window.LD.Decimal(40) })()`)
await sleep(200)
// And land one, because the column holds the last face it saw and there has
// not been a face since the row was emptied.
await ev(`${ROLL}.click()`)
await sleep(1400)
const rest = await ev(`(() => {
  const row = document.querySelector('.solid')
  const face = row.querySelector('.solid-face').getBoundingClientRect()
  const icon = row.querySelector('.solid-icon').getBoundingClientRect()
  return { face: row.querySelector('.solid-face').textContent,
    faceRight: Math.round(face.right), iconLeft: Math.round(icon.left),
    opacity: getComputedStyle(row.querySelector('.solid-icon')).opacity }
})()`)
check('the face reads left of the solid, not over it',
  rest.faceRight <= rest.iconLeft && rest.face !== '', JSON.stringify(rest))
check('and the wireframe stays at full strength',
  Number(rest.opacity) === 1, rest.opacity)

// The column has three states as the rolls get faster, and it is never empty
// in any of them.
//
// Readable: the exact face, redrawn each landing. A blur: still exact faces,
// changing as fast as the screen can. Invisible: the die's average, walked to
// rather than cut to. The middle one exists because the average printed while
// the dice are visibly tumbling reads as a column that has stopped working,
// and the batched path rolls real faces every tick whether or not anything
// reads them.

// 0.889^20 is 0.095s: past reading, not past seeing.
await ev(`(() => { const s = window.LD.state; s.autoRoll = true; s.autoRollOn = true; s.rollUpgrades = 20 })()`)
await sleep(300)
const sample = async (n, every) => ev(`(() => {
  const seen = []
  return new Promise(done => {
    const t = setInterval(() => {
      seen.push(document.querySelector('.solid-face').textContent)
      if (seen.length >= ${n}) { clearInterval(t); done(seen) }
    }, ${every})
  })
})()`)
const blur = await sample(12, 60)
const faces = blur.map(Number)
check('a roll too fast to read still shows a real face',
  faces.every((f) => Number.isInteger(f) && f >= 1 && f <= 4), JSON.stringify(blur))
// A d4's average is 2.5, so printing the average would give a flat 2.5. Any
// variation at all proves these are rolls and not that number.
check('and it is a real roll, not one number held', new Set(faces).size > 1, JSON.stringify(blur))

// 0.889^60 is under a millisecond: nothing to see, so the honest number is the
// die's average, and it is walked to rather than jumped to.
//
// Read off the d12 with the dice standing still, and from a face pinned to 12.
// The d4 was the wrong die to ask: its faces sit either side of its own
// average, so a walk from a landed 2 to an average of 2 never changes a digit
// and the check passed or failed on which face the last roll happened to give.
// Nothing rolling, because the walk is a property of the display and the
// engine overwrites the faces forty times a second at this rate.
await ev(`(() => { const s = window.LD.state, D = window.LD.Decimal
  s.autoRoll = false; s.autoDice = 0; s.handRollAt = 0; s.rollStartedAt = 0
  s.studies = 5; s.rollUpgrades = 20
  s.solids.forEach((d, i) => { d.bought = i < 4 ? 10 : 0
    d.amount = new D(i < 4 ? 100 : 0) })
  s.faces = s.faces.map((_, i) => (i === 3 ? 12 : 0)) })()`)
await sleep(300)
const pinned = await ev(`[...document.querySelectorAll('.pane:not([hidden]) .solid-face')][3].textContent.trim()`)
check('a d12 showing the face it landed on', pinned === '12', pinned)

await ev(`(() => { window.LD.state.rollUpgrades = 60 })()`)
const walk = (await ev(`(() => {
  const seen = []
  return new Promise(done => {
    const cell = [...document.querySelectorAll('.pane:not([hidden]) .solid-face')][3]
    const t = setInterval(() => {
      seen.push(cell.textContent.trim())
      if (seen.length >= 34) { clearInterval(t); done(seen) }
    }, 100)
  })
})()`)).map(Number)
check('past seeing it walks to the average rather than cutting to it',
  walk[0] > 7, JSON.stringify(walk))
// A d12 averages 6.5 and the column prints whole numbers, so it settles on 6.
// Decimals in a column of die faces read as a fault rather than a statistic.
check('and it lands on the average and stays there',
  walk[walk.length - 1] === 6 && walk[walk.length - 2] === 6, JSON.stringify(walk))
check('and every number it shows on the way is a whole one',
  walk.every((v) => Number.isInteger(v)), JSON.stringify(walk))
check('and it walks there rather than jumping, in one direction',
  (() => {
    const d = []
    for (let i = 1; i < walk.length; i++) d.push(walk[i] - walk[i - 1])
    const moving = d.filter((v) => v !== 0)
    // Twelve down to six through every step between, over the settle window.
    return new Set(walk).size >= 4 && moving.every((v) => v < 0)
  })(), JSON.stringify(walk))

// A row you own none of sits the throw out: no face, and its wireframe does
// not move while the ones with dice on them do.
await ev(`(() => { const s = window.LD.state, D = window.LD.Decimal
  s.autoRoll = false; s.rollStartedAt = 0; s.rollUpgrades = 0; s.studies = 2
  s.solids.forEach((d, i) => { d.bought = 0; d.amount = new D(i === 0 ? 5 : 0) }) })()`)
await sleep(150)
await ev(`${ROLL}.click()`); await sleep(150)
const empties = await ev(`(() => {
  const rows = [...document.querySelectorAll('.solid')].filter(r => getComputedStyle(r).display !== 'none')
  return rows.map(r => ({ face: r.querySelector('.solid-face').textContent,
    moved: r.querySelector('.solid-icon').style.transform !== '' }))
})()`)
check('the row with dice on it is thrown', empties[0] && empties[0].moved === true,
  JSON.stringify(empties))
check('and the empty rows are not',
  empties.slice(1).length > 0 && empties.slice(1).every(r => !r.moved && r.face === ''),
  JSON.stringify(empties.slice(1)))
await sleep(1200)
check('an empty row lands on nothing',
  (await ev(`[...document.querySelectorAll('.solid')].filter(r => getComputedStyle(r).display !== 'none')
     .slice(1).every(r => r.querySelector('.solid-face').textContent === '')`)) === true)

// Spin speed has to rise with the roll rate and then stop rising, or crossing
// out of the readable range makes the dice visibly slow down, which is what it
// used to do: a fixed blur rate slower than the fastest eased throw.
async function spinRate(upgrades) {
  await ev(`(() => { const s = window.LD.state, D = window.LD.Decimal
    s.autoRoll = true; s.studies = 2; s.rollUpgrades = ${upgrades}
    s.solids.forEach((d, i) => { if (i < 2) { d.bought = 10; d.amount = new D(50) } }) })()`)
  await sleep(150)
  // Sampled on the frame, not on a 32ms interval. The die is redrawn once a
  // frame, so an independent timer beats against the frame rate: two samples
  // can land inside one frame and read as no movement, and the average then
  // depends on where the beat happened to fall. That is what made this swing
  // enough to fail with the middle rate reading slower than the slowest.
  await ev(`(() => { window.__sp = []; window.__spOn = true
    const ln = document.querySelector('.solid-icon line')
    const step = () => {
      if (!window.__spOn) return
      window.__sp.push([Number(ln.getAttribute('x1')), Number(ln.getAttribute('y1'))])
      requestAnimationFrame(step)
    }
    requestAnimationFrame(step) })()`)
  // Long enough to cover several whole throws, and no longer. At one roll a
  // second an eased curve sampled for 1.4s averaged whichever part of it the
  // samples happened to land on, and the reading swung from 0.19 to 0.37
  // between runs; at a hundred rolls a second, 3.2s is 3.1s of waiting for
  // nothing. Three throws or 900ms, whichever is more.
  const span = await ev(`window.LD.rollInterval * 1000`)
  const want = Math.max(900, Math.min(3200, span * 3))
  const until = Date.now() + want
  // Both conditions. Long enough to cover several whole throws, and enough
  // frames to average, because under load the two are not the same thing.
  for (let i = 0; i < 40; i++) {
    await sleep(100)
    if (Date.now() >= until && (await ev(`window.__sp.length`)) >= 40) break
  }
  await ev(`window.__spOn = false`)
  return ev(`(() => { const s = window.__sp, d = []
    for (let i = 1; i < s.length; i++) d.push(Math.hypot(s[i][0]-s[i-1][0], s[i][1]-s[i-1][1]))
    const m = d.filter(v => v > 0)
    return m.length ? m.reduce((a,b)=>a+b,0) / m.length : 0 })()`)
}
const slow = await spinRate(0)
const quicker = await spinRate(6)
const fast = await spinRate(40)
check('the dice spin faster as the roll rate climbs', fast > slow * 1.3,
  `1 roll/s: ${slow.toFixed(4)}  ->  110 roll/s: ${fast.toFixed(4)}`)
check('and stop speeding up at the ceiling instead of dropping',
  fast >= quicker * 0.9 && quicker > slow,
  `${slow.toFixed(4)} -> ${quicker.toFixed(4)} -> ${fast.toFixed(4)}`)

// The throws hand over to the shake loop rather than both playing at once.
const bed = await ev(`(async () => {
  const ctx = new AudioContext()
  const r = await fetch('/sfx/shake.mp3')
  const b = await ctx.decodeAudioData(await r.arrayBuffer())
  return b.duration.toFixed(2) + 's ' + b.numberOfChannels + 'ch'
})()`)
check('the shake loop is there and decodes', /^1\.[0-9]+s 1ch$/.test(bed), bed)

// A fair die is the b = 0 case of a loaded one, so the maths for the upgrade
// that is coming has to already hold at both ends and in between.
const loaded = await ev(`(() => {
  const p = window.LD
  const out = {}
  for (const b of [0, 0.5, 0.9, 1]) {
    const n = 4
    let sum = 0
    for (let i = 0; i < 40000; i++) sum += p.rollFace(n, b)
    out[b] = { sampled: sum / 40000, predicted: p.meanFace(n, b) }
  }
  return out
})()`)
const near = (a, b) => Math.abs(a - b) < 0.06
check('a fair d4 averages 2.5', near(loaded['0'].sampled, 2.5) && near(loaded['0'].predicted, 2.5),
  JSON.stringify(loaded['0']))
check('a loaded one skews up and the prediction follows',
  loaded['0.5'].sampled > 2.9 && near(loaded['0.5'].sampled, loaded['0.5'].predicted) &&
  loaded['0.9'].sampled > loaded['0.5'].sampled,
  JSON.stringify({ half: loaded['0.5'], mostly: loaded['0.9'] }))
check('fully loaded always rolls the maximum',
  loaded['1'].sampled === 4 && loaded['1'].predicted === 4, JSON.stringify(loaded['1']))

// A rate per second before the automator is a claim about how fast you press.
await ev(`(() => { const s = window.LD.state, D = window.LD.Decimal
  s.autoRoll = false; s.rollUpgrades = 0; s.studies = 0
  s.solids.forEach((d, i) => { d.bought = 0; d.amount = new D(i === 0 ? 4 : 0) }) })()`)
await sleep(150)
const manual = await ev(`({ bar: document.querySelector('.res-rate').textContent,
  row: document.querySelector('.solid-rate').textContent })`)
check('before the automator the readouts are per roll',
  /per roll$/.test(manual.bar) && /\/roll$/.test(manual.row), JSON.stringify(manual))
// Four d4 average 2.5 a face, so ten a roll before anything multiplies it. The
// archive does multiply it, and its entries are re-earned every tick, so the
// expected number is computed rather than written down.
const pay4 = await ev(`window.LD.achievementPower(window.LD.state).toNumber()`)
check('and a d4 you own four of pays its average, ten a roll',
  Math.abs(parseFloat(manual.bar) / pay4 - 10) < 0.05, `${manual.bar} against x${pay4.toFixed(3)}`)

await ev(`window.LD.state.autoRoll = true`); await sleep(150)
const rolling = await ev(`({ bar: document.querySelector('.res-rate').textContent,
  row: document.querySelector('.solid-rate').textContent })`)
check('and per second once it is rolling for you',
  /\/s$/.test(rolling.bar) && /\/s$/.test(rolling.row), JSON.stringify(rolling))

// Audio, the way Safari needs it. A context built outside a gesture never
// leaves 'suspended' there, and the spin bed runs on every frame, so nothing
// but a real tap may build one. The first roll cannot be the unlock either:
// the samples have not downloaded yet, so nothing would start during it.
await send('Page.addScriptToEvaluateOnNewDocument',{source:`
  window.__ctxs = []
  const Real = window.AudioContext
  window.AudioContext = function (...a) {
    const c = new Real(...a)
    window.__ctxs.push(c)
    return c
  }
  window.AudioContext.prototype = Real.prototype
`})
await send('Page.reload')
 await appReady(ev); await booted()
await ev(`(() => { const s = window.LD.state, D = window.LD.Decimal
  s.options.offline = false; s.options.sound = true; s.autoRoll = true
  s.solids.forEach((d, i) => { if (i < 2) { d.bought = 10; d.amount = new D(500) } }) })()`)
await sleep(1800)
check('nothing builds an audio context before a gesture',
  (await ev(`window.__ctxs.length`)) === 0,
  `contexts: ${await ev(`window.__ctxs.length`)}`)

// A real input event, not a synthesised one. Chrome only treats a trusted
// gesture as an unlock, which is exactly the rule this is testing, so
// dispatchEvent would pass on a build that Safari would still play silent.
await send('Input.dispatchMouseEvent',{type:'mousePressed',x:200,y:400,button:'left',clickCount:1})
await send('Input.dispatchMouseEvent',{type:'mouseReleased',x:200,y:400,button:'left',clickCount:1})
await sleep(1200)
const armed = await ev(`({ n: window.__ctxs.length,
  state: window.__ctxs[0] ? window.__ctxs[0].state : 'none' })`)
check('a tap builds exactly one and it is running',
  armed.n === 1 && armed.state === 'running', JSON.stringify(armed))

await sleep(1500)
check('and it stays the only one however long the bed runs',
  (await ev(`window.__ctxs.length`)) === 1, `contexts: ${await ev(`window.__ctxs.length`)}`)

// The threshold stops everything and takes over the bar.
await ev(`(() => { const s = window.LD.state, D = window.LD.Decimal
  s.rollUpgrades = 0; s.ink = new D('1.8e308'); s.inkThisWager = new D('1.8e308') })()`)
await sleep(150)
const halted = await ev(`({
  ink: window.LD.state.ink.toString(),
  roll: getComputedStyle(${ROLL}).display,
  max: getComputedStyle(document.querySelector('.bar-btn.max')).display,
  wager: document.querySelector('.wager-now') && getComputedStyle(document.querySelector('.wager-now')).display,
})`)
check('the bar gives itself over to the Wager',
  halted.wager !== 'none' && halted.max === 'none' && halted.roll === 'none',
  JSON.stringify(halted))

const d1 = await ev(`window.LD.state.solids[0].amount.toString()`)
await sleep(1200)
const d2 = await ev(`window.LD.state.solids[0].amount.toString()`)
check('and nothing grows past it', d1 === d2, `${d1} -> ${d2}`)
check('ink is pinned at the threshold',
  (await ev(`window.LD.state.ink.toString()`)) === '1.7976931348623157e+308',
  await ev(`window.LD.state.ink.toString()`))

// Every solid drawn against its published vertex and edge count. These come
// out of formulas rather than out of eight hand-written edge tables, so a
// change to the shared vertex code could quietly turn a rhombicuboctahedron
// into something with the wrong number of edges and nothing would say so.
await ev(`(() => { const s = window.LD.state, D = window.LD.Decimal
  s.studies = 8; s.solids.forEach(d => { d.amount = new D(10) }) })()`)
await sleep(300)
const counts = await ev(`(() => {
  const out = {}
  const ids = ['d4','d6','d8','d12','d14','d20','d26','d32','d72']
  document.querySelectorAll('.solid').forEach((row, i) => {
    const svg = row.querySelector('.solid-icon')
    if (!svg) return
    const verts = new Set()
    let edges = 0
    const eat = (d) => {
      for (const seg of d.split('M').filter(Boolean)) {
        const nums = (seg.match(/-?\\d+\\.?\\d*/g) || []).map(Number)
        for (let k = 0; k + 1 < nums.length; k += 2) verts.add(nums[k].toFixed(2) + ',' + nums[k+1].toFixed(2))
        if (nums.length >= 4) edges += 1
      }
    }
    svg.querySelectorAll('path').forEach(p => { if (p.getAttribute('d')) eat(p.getAttribute('d')) })
    svg.querySelectorAll('line').forEach(l => {
      edges += 1
      verts.add(Number(l.getAttribute('x1')).toFixed(2) + ',' + Number(l.getAttribute('y1')).toFixed(2))
      verts.add(Number(l.getAttribute('x2')).toFixed(2) + ',' + Number(l.getAttribute('y2')).toFixed(2))
    })
    out[ids[i]] = [verts.size, edges]
  })
  return out })()`)
// Vertices and edges, from the literature.
const SOLID_FIGURES = {
  d4: [4, 6], d6: [8, 12], d8: [6, 12], d12: [20, 30], d14: [24, 36],
  d20: [12, 30], d26: [24, 48], d32: [30, 60],
  // A twelve by six wireframe globe: sixty points on five rings plus two
  // poles, and seventy-two meridian segments plus sixty of latitude.
  d72: [62, 132],
}
const wrong = Object.entries(SOLID_FIGURES).filter(([k, [v, e]]) => {
  const got = counts[k]
  return !got || got[0] !== v || got[1] !== e
})
check('every solid has the vertices and edges it should',
  wrong.length === 0,
  wrong.map(([k, want]) => `${k} drew ${JSON.stringify(counts[k])} not ${JSON.stringify(want)}`).join('; '))

// -- auto-roll, one die at a time ----------------------------------------
//
// The first run was twenty-four minutes of holding one button. A die now buys
// its own roll, and opens for it when the die below it on the chain opens for
// buying, so the ladder fills from the shallow end alongside the table.

const fresh = await ev(`(() => { const s = window.LD.state, D = window.LD.Decimal
  // The checks above finish on a run held at the threshold, where the engine
  // correctly refuses to roll anything at all.
  s.inkThisWager = new D(0); s.haltMs = 0; s.broke = false; s.handRollAt = 0
  s.studies = 0; s.autoDice = 0; s.wagers = 0; s.autoRoll = false
  s.ink = new D('1e30')
  for (const d of s.solids) { d.bought = 0; d.amount = new D(0) }
  s.solids[0].amount = new D(100)
  return { next: window.LD.nextAutoRoll(s) } })()`)
check('a table with one solid on it can automate nothing', fresh.next === 0,
  JSON.stringify(fresh))

const opened = await ev(`(() => { const s = window.LD.state
  s.studies = 1
  return { next: window.LD.nextAutoRoll(s), cost: window.LD.autoRollCost(s).toString(),
    can: window.LD.canBuyAutoRoll(s) } })()`)
check('opening the second solid puts the first die up for sale',
  opened.next === 1 && opened.can === true, JSON.stringify(opened))

// One at a time and in order: the d6 waits on the d8, not on your wallet.
const inOrder = await ev(`(() => { const s = window.LD.state
  window.LD.actions.buyAutoRoll()
  const after = { dice: s.autoDice, next: window.LD.nextAutoRoll(s) }
  s.studies = 2
  return { after, then: window.LD.nextAutoRoll(s) } })()`)
check('buying it takes the first die and offers nothing further',
  inOrder.after.dice === 1 && inOrder.after.next === 0, JSON.stringify(inOrder))
check('and the next solid opens the next die',  inOrder.then === 2, JSON.stringify(inOrder))

// The whole point: it rolls with no finger on the button, and the rest of the
// table sits it out.
const alone = await ev(`(() => { const s = window.LD.state, D = window.LD.Decimal
  s.studies = 2; s.autoDice = 1; s.autoRoll = false; s.rollStartedAt = 0; s.rollAccum = 0
  s.handRollAt = 0
  // Small, because a few hundred ink added to 1e30 is lost to the mantissa and
  // the check would read as nothing having happened.
  s.ink = new D(0)
  s.solids[0].amount = new D(100); s.solids[1].amount = new D(100)
  s.solids[2].amount = new D(100)
  const before = [s.ink.toString(), s.solids[0].amount.toString()]
  for (let i = 0; i < 30; i++) window.LD.tick(s, 0.25, Date.now() + i * 250)
  return { inkMoved: s.ink.toString() !== before[0],
    secondFed: s.solids[0].amount.toString() !== before[1],
    faces: s.faces.slice(0, 3) } })()`)
check('an automated die rolls with nobody pressing', alone.inkMoved === true,
  JSON.stringify(alone))
check('and the dice that are not automated sit the roll out',
  alone.secondFed === false && alone.faces[1] === 0, JSON.stringify(alone))

// Pressing throws the whole table, automated or not.
const byHand = await ev(`(async () => { const s = window.LD.state, D = window.LD.Decimal
  s.solids[0].amount = new D(100)
  const before = s.solids[0].amount.toString()
  window.LD.actions.roll()
  const at = Date.now()
  for (let i = 0; i < 30; i++) window.LD.tick(s, 0.25, at + i * 250)
  return { fed: s.solids[0].amount.toString() !== before } })()`)
check('a roll you asked for throws the whole table', byHand.fed === true,
  JSON.stringify(byHand))

// One automated die must not look like nine.
//
// Both halves of this were reported from playing it. The column stopped
// blanking itself so that a held button did not read empty for minutes, and
// the code kept the last face whenever the engine reported a zero. But a zero
// means "this die sat the roll out", so every unautomated die held the number
// it landed on the last time you pressed, and a table with one die automated
// looked like a table with all of them automated. And the roll clock became
// shared, so the ROLL button read its fill off a clock the automated dice were
// driving and swept across on its own with nobody touching it.
await ev(`(() => { const s = window.LD.state, D = window.LD.Decimal
  s.studies = 3; s.autoDice = 1; s.autoDiceOff = []; s.autoRoll = false
  s.inkThisWager = new D(0); s.haltMs = 0; s.broke = false
  s.ink = new D('1e12'); s.handRollAt = 0; s.rollStartedAt = 0; s.rollAccum = 0
  s.solids.forEach((d, i) => { d.bought = i < 4 ? 20 : 0; d.amount = new D(i < 4 ? 300 : 0) }) })()`)
await ev(`window.LD.actions.roll()`)
await sleep(1400)
const handThrow = await ev(`[...document.querySelectorAll('.pane:not([hidden]) .solid-face')]
  .map(n => n.textContent.trim()).slice(0, 4)`)
check('a roll you asked for lands a face on every die',
  handThrow.every((f) => f !== ''), JSON.stringify(handThrow))

await sleep(2200)
const leftAlone = await ev(`(() => ({
  faces: [...document.querySelectorAll('.pane:not([hidden]) .solid-face')]
    .map(n => n.textContent.trim()).slice(0, 4),
  fill: document.querySelector('.bar-roll-fill').style.width,
  hand: window.LD.handRolling(window.LD.state) }))()`)
check('and with your hands off, only the automated die keeps a number',
  leftAlone.faces[0] !== '' && leftAlone.faces.slice(1).every((f) => f === ''),
  JSON.stringify(leftAlone))
check('and the ROLL button does not fill itself',
  leftAlone.fill === '0%' && leftAlone.hand === false, JSON.stringify(leftAlone))

// And the wireframes. A die that is not in the roll must not tumble either:
// the clock is shared, so one automated die kept it running and every solid on
// the table span along with it. Measured as motion over a second rather than
// as one snapshot, because a die at rest and a die mid-turn look alike in a
// single frame.
const turning = await ev(`(() => new Promise(done => {
  const icons = [...document.querySelectorAll('.pane:not([hidden]) .solid-icon')].slice(0, 4)
  const read = () => icons.map(n => [...n.querySelectorAll('line, path')]
    .map(l => l.getAttribute('d') || l.getAttribute('x1') + ',' + l.getAttribute('y1')).join('|'))
  const first = read()
  const changed = icons.map(() => false)
  let n = 0
  const t = setInterval(() => {
    const now = read()
    now.forEach((v, i) => { if (v !== first[i]) changed[i] = true })
    if (++n >= 32) { clearInterval(t); done(changed) }
  }, 25)
}))()`)
check('and only the automated die is still turning',
  turning[0] === true && turning.slice(1).every((v) => v === false), JSON.stringify(turning))

// A die that stops taking part goes back where it started.
//
// rest() used to clear the CSS transform and nothing else, which drops the hop
// and the tilt but not the solid: that is drawn from an angle and a pair of
// tumble axes, both of which a throw re-picks. So a die kept whatever
// orientation the throw abandoned it in, and a table with one die automated
// was eight solids frozen at eight arbitrary angles.
await ev(`(() => { const s = window.LD.state, D = window.LD.Decimal
  s.studies = 3; s.autoDice = 0; s.autoRoll = false; s.autoDiceOff = []
  s.handRollAt = 0; s.rollStartedAt = 0; s.inkThisWager = new D(0); s.broke = false
  s.ink = new D('1e12')
  s.solids.forEach((d, i) => { d.bought = i < 4 ? 10 : 0
    d.amount = new D(i < 4 ? 50 : 0) }) })()`)
await sleep(400)
const shape = `[...document.querySelectorAll('.pane:not([hidden]) .solid-icon')].slice(0,4)
  .map(n => [...n.querySelectorAll('line, path')]
    .map(l => l.getAttribute('d') || (l.getAttribute('x1') + ',' + l.getAttribute('y1'))).join('|'))`
const startPose = await ev(shape)
await ev(`window.LD.actions.roll()`)
await sleep(700)
await ev(`(() => { window.LD.state.autoDice = 1 })()`)
await sleep(2000)
const restPose = await ev(shape)
const same = startPose.map((g, i) => g === restPose[i])
check('a die that stops rolling goes back where it started',
  same.slice(1).every(Boolean), JSON.stringify(same))
// The one still rolling is somewhere else, or the check above proves nothing.
check('and the one still rolling is not', same[0] === false, JSON.stringify(same))

// Every die that rolls itself can be handed back to your finger, which is the
// switch the automator has always had a rung up. Its reason is the automator's
// reason: with it on there is no way to watch a single die land.
const switched = await ev(`(() => { const s = window.LD.state, D = window.LD.Decimal
  s.studies = 3; s.autoDice = 2; s.autoDiceOff = []; s.autoRoll = false
  s.handRollAt = 0; s.rollStartedAt = 0; s.rollAccum = 0; s.ink = new D(0)
  s.solids[0].amount = new D(500); s.solids[1].amount = new D(500)
  const both = [window.LD.dieRollsItself(s, 1), window.LD.dieRollsItself(s, 2)]
  window.LD.actions.toggleDie(1)
  const after = [window.LD.dieRollsItself(s, 1), window.LD.dieRollsItself(s, 2)]
  const before = s.ink.toString()
  for (let i = 0; i < 20; i++) window.LD.tick(s, 0.25, Date.now() + i * 250)
  return { both, after, off: s.autoDiceOff.slice(), inkMoved: s.ink.toString() !== before,
    face: s.faces[0] } })()`)
check('a die that rolls itself can be switched off',
  switched.both.join() === 'true,true' && switched.after.join() === 'false,true',
  JSON.stringify(switched))
check('and then it sits the roll out like an unautomated one',
  switched.inkMoved === false && switched.face === 0, JSON.stringify(switched))

const backOn = await ev(`(() => { const s = window.LD.state, D = window.LD.Decimal
  window.LD.actions.toggleDie(1)
  s.ink = new D(0); s.handRollAt = 0
  const before = s.ink.toString()
  for (let i = 0; i < 20; i++) window.LD.tick(s, 0.25, Date.now() + i * 250)
  return { off: s.autoDiceOff.slice(), inkMoved: s.ink.toString() !== before } })()`)
check('and switching it back on starts it again',
  backOn.off.length === 0 && backOn.inkMoved === true, JSON.stringify(backOn))

// A switch is only worth offering for a die something would roll without you.
const noSwitch = await ev(`(() => { const s = window.LD.state
  return { two: window.LD.dieCanRollItself(s, 2), five: window.LD.dieCanRollItself(s, 5) } })()`)
check('a die nothing would roll is offered no switch',
  noSwitch.two === true && noSwitch.five === false, JSON.stringify(noSwitch))

// The automator covers the whole table, so it hands every row a switch the
// ladder had not sold yet.
const underAutomator = await ev(`(() => { const s = window.LD.state
  s.autoRoll = true; s.autoRollOn = true
  const before = window.LD.dieCanRollItself(s, 5)
  window.LD.actions.toggleDie(5)
  const after = window.LD.dieRollsItself(s, 5)
  window.LD.actions.toggleDie(5)
  s.autoRoll = false
  return { before, after } })()`)
check('the automator hands a switch to every die, and it still bites',
  underAutomator.before === true && underAutomator.after === false,
  JSON.stringify(underAutomator))

// Kept, because a switch you have to set again on every reload is not one.
const kept2 = await ev(`(() => { const s = window.LD.state
  s.autoDiceOff = [1, 3]
  const back = window.LD.importSave(window.LD.exportSave(s), Date.now())
  return { off: back.autoDiceOff } })()`)
check('a save carries which dice are switched off',
  JSON.stringify(kept2.off) === '[1,3]', JSON.stringify(kept2))
await ev(`(() => { window.LD.state.autoDiceOff = [] })()`)

// The deepest die has nothing under it to wait for, so it waits on itself: it
// opens once the whole chain is on the table, and it is the last thing ink
// ever buys, priced past the eight below it.
const deepest = await ev(`(() => { const s = window.LD.state
  s.studies = 3; s.autoDice = 8
  const early = window.LD.nextAutoRoll(s)
  s.studies = 20
  return { early, next: window.LD.nextAutoRoll(s), cost: window.LD.autoRollCost(s).toString(),
    solids: s.solids.length } })()`)
check('the deepest die waits for the whole chain to be on the table',
  deepest.early === 0 && deepest.next === 9, JSON.stringify(deepest))
check('and costs more than the eight below it', Number(deepest.cost) > 1e52,
  JSON.stringify(deepest))

// Kept through everything that clears the table, as the automator is.
const kept = await ev(`(() => { const s = window.LD.state, D = window.LD.Decimal
  s.autoDice = 3; s.autoRoll = false; s.inkThisWager = new D('1e309'); s.ink = new D('1e309')
  window.LD.actions.buyStudy()
  const afterStudy = s.autoDice
  window.LD.actions.wager()
  return { afterStudy, afterWager: s.autoDice, auto: s.autoRoll,
    ink: s.ink.toString() } })()`)
check('a study leaves the ladder alone', kept.afterStudy === 3, JSON.stringify(kept))
// The automator used to be a chip here. The ladder already sells what it sold,
// so the prestige hands over the rest of it instead of charging twice.
check('and a Wager hands over the whole of it, for nothing',
  kept.afterWager === 9 && kept.auto === true, JSON.stringify(kept))
check('with some ink to start on, because a table with one die on it is slow',
  Number(kept.ink) >= 1e6, JSON.stringify(kept))

// The tab it lives on opens two minutes into a first run now, so the two
// things that sat behind the Wager have to seal themselves.
const sealed = await ev(`(async () => { const s = window.LD.state
  s.wagers = 0; s.autoRoll = false; s.chips = new window.LD.Decimal(0)
  for (const k of Object.keys(s.autobuyers)) s.autobuyers[k].unlocked = false
  await new Promise(r => setTimeout(r, 250))
  const tab = [...document.querySelectorAll('.tab, .subtab')].find(t => t.textContent === 'AUTOMATION')
  tab.click()
  await new Promise(r => setTimeout(r, 250))
  const pane = [...document.querySelectorAll('.pane')].find(p => !p.hidden)
  const shown = [...pane.querySelectorAll('.section')].filter(x => !x.hidden)
    .map(x => x.querySelector('.section-head').textContent.trim())
  return { visible: !tab.hidden, shown } })()`)
check('the tab is open before the Wager', sealed.visible === true, JSON.stringify(sealed))
check('and holds nothing but the roll while it is',
  sealed.shown.length === 1 && sealed.shown[0] === 'THE ROLL', JSON.stringify(sealed))

ws.close();chrome.kill();await sleep(150);try{rmSync(profile,{recursive:true,force:true})}catch{}
console.log(`\n${res.filter(Boolean).length}/${res.length} passed`)
process.exit(res.every(Boolean)?0:1)
