// Render-recovery tests.
//
// A browser that freezes a backgrounded page can discard its pending
// animation frame. Killing requestAnimationFrame reproduces that while the
// page stays visible, which is the case that actually strands the display.
//
//   npm run test:freeze
import { spawn } from 'node:child_process'
import { appReady, guard, sweepStale } from './harness.mjs'
import { mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
const URL_ = process.argv[2] ?? 'http://127.0.0.1:5173/seed.html'
const profile = mkdtempSync(join(tmpdir(), 'ld-fz-'))
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
await send('Page.enable');await send('Runtime.enable')
const res=[];const check=(n,ok,d='')=>{res.push(ok);console.log(`${ok?'PASS':'FAIL'}  ${n}${d?'  '+d:''}`)}

// The ink readout specifically. Indexing blindly into .res-value once picked
// up the points readout, which never changes and made the test read a frozen
// display where there was none.
const shown = `(() => { const r = [...document.querySelectorAll('.res')]
  .find(n => n.querySelector('.res-label')?.textContent === 'INK')
  return r ? r.querySelector('.res-value').textContent : 'NO INK READOUT' })()`
const stateInk = `window.LD.state.ink.toString()`

// A headless page can start hidden, and a hidden page correctly does not run
// requestAnimationFrame. Without this the test reads a display that never
// updated and calls it a freeze.
await send('Emulation.setFocusEmulationEnabled', { enabled: true })
await send('Page.navigate',{url:URL_})
await send('Page.bringToFront')
// Wait for the app to actually be there rather than for a number of seconds.
// A fixed 4.5s was enough alone and not enough under `npm test`, where this
// starts alongside the roll suite and the page gets a fraction of a core.
await appReady(ev)

// Baseline: the display should be moving.
const vis = await ev(`document.visibilityState`)
if (vis !== 'visible') {
  console.log(`SKIP  page is ${vis} in this browser, so rendering is correctly paused`)
  ws.close(); chrome.kill(); process.exit(0)
}
// Nothing produces by hand, so this needs the automator on and a chain to run.
// The subject here is the render loop surviving a freeze, not the game economy.
await ev(`(() => { const s = window.LD.state, D = window.LD.Decimal
  s.autoRoll = true; s.studies = 2
  s.solids.forEach((d, i) => { if (i < 3) { d.bought = 10; d.amount = new D(100) } }) })()`)
await sleep(150)

// Polled. The roll interval here is a second and a fixed 1200ms leaves 200ms
// for the tick that resolves it, which is not enough on a box running four
// browsers. Six seconds is a cap, not a delay.
const a1 = await ev(shown)
let a2 = a1
for (let i = 0; i < 40 && a1 === a2; i++) {
  await sleep(150)
  a2 = await ev(shown)
}
check('display updates before freezing', a1 !== a2, `${a1} -> ${a2}`)

// The real failure is a render chain that dies while the page is still
// visible: a frozen page can have its pending frame discarded, and the old
// code stored the handle and treated a non-zero value as proof a frame was
// coming. Killing rescheduling reproduces that exactly.
const orig = `window.__origRaf = window.requestAnimationFrame.bind(window)`
await ev(orig)
await ev(`window.requestAnimationFrame = () => 0`)
await sleep(1200)
const dead1 = await ev(shown); await sleep(150); const dead2 = await ev(shown)
check('display stops when the frame chain dies', dead1 === dead2, `${dead1} -> ${dead2}`)

await ev(`window.requestAnimationFrame = window.__origRaf`)
// Polled rather than slept. The watchdog runs on an interval, and a fixed 3s
// wait was really a claim about how loaded the box is: this passed alone and
// failed inside `npm test`, on a run where the whole suite took half again as
// long as usual. Twelve seconds is a cap, not a delay; a working watchdog
// finishes in about three.
let alive1 = await ev(shown)
let alive2 = alive1
for (let i = 0; i < 40 && alive1 === alive2; i++) {
  await sleep(300)
  alive1 = alive2
  alive2 = await ev(shown)
}
check('watchdog restarts rendering on its own', alive1 !== alive2, `${alive1} -> ${alive2}`)

// And the game itself must never have stopped counting while that happened.
const s1 = await ev(stateInk); await sleep(1000); const s2 = await ev(stateInk)
check('game kept counting throughout', Number(s2) > Number(s1),
  `${Number(s1).toExponential(2)} -> ${Number(s2).toExponential(2)}`)

// Freezing and resuming must not lose time either.
const f1 = await ev(stateInk)
await send('Page.setWebLifecycleState',{state:'frozen'}); await sleep(2500)
await send('Page.setWebLifecycleState',{state:'active'}); await sleep(1500)
const f2 = await ev(stateInk)
check('a freeze and resume is credited, not lost', Number(f2) > Number(f1),
  `${Number(f1).toExponential(2)} -> ${Number(f2).toExponential(2)}`)

// -- and the other loop, which is the dice ---------------------------------
//
// The nine solids keep their own frame loop, and it had none of the above. It
// stored its handle and read a truthy value as proof a frame was coming, which
// is the bug this whole file exists about, a second time and in a second
// place. Reported as the dice stopping after a tab switch and coming back only
// when the game was closed and opened again.
//
// The handle handed out here is truthy, unlike the `() => 0` above. That is
// the whole of the failure: a zero reads as "no loop running" and every
// ensureLoop would have started one, so a falsy stub tests nothing here.
await ev(`(() => { const s = window.LD.state, D = window.LD.Decimal
  // Rolling far too fast to read, which is the continuous spin rather than the
  // eased throw, and past the wall so the table is never halted mid-measure.
  s.broke = true
  s.autoRoll = true; s.autoRollOn = true; s.autoDiceOff = []
  s.rollUpgrades = 400
  s.solids.forEach((d, i) => { if (i < 3) { d.bought = 10; d.amount = new D(100) } }) })()`)
await sleep(600)

// Sampled off a timer, never off a frame: a frame-driven sampler stops with
// the thing it is measuring and reports every freeze as a clean zero.
//
// The whole figure, not one vertex. Reading a single x1 measured the
// tetrahedron's apex, which sits on the axis it turns about and so holds still
// through a perfectly good spin. That looked exactly like the bug.
const spun = `(async () => {
  const svg = document.querySelector('.solid-icon')
  const read = () => [...svg.querySelectorAll('line,path')]
    .map(n => n.getAttribute('x1') + ',' + n.getAttribute('x2') + (n.getAttribute('d') || '')).join('|')
  let prev = read(), changes = 0
  await new Promise(done => { let n = 0; const h = setInterval(() => {
    const v = read(); n++; if (v !== prev) changes++; prev = v
    if (n >= 40) { clearInterval(h); done() } }, 16) })
  return changes })()`

const spin1 = await ev(spun)
check('the dice turn before the frame chain dies', spin1 > 10, `${spin1}/40 samples moved`)

await ev(`window.requestAnimationFrame = () => 987654`)
await sleep(700)
const spin2 = await ev(spun)
check('and stop when it dies', spin2 === 0, `${spin2}/40 samples moved`)

await ev(`window.requestAnimationFrame = window.__origRaf`)
let spin3 = 0
for (let i = 0; i < 12 && spin3 <= 10; i++) spin3 = await ev(spun)
check('and come back on their own, without the game being reopened',
  spin3 > 10, `${spin3}/40 samples moved`)

ws.close();chrome.kill();await sleep(150);try{rmSync(profile,{recursive:true,force:true})}catch{}
console.log(`\n${res.filter(Boolean).length}/${res.length} passed`)
process.exit(res.every(Boolean)?0:1)
