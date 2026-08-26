// Render-recovery tests.
//
// A browser that freezes a backgrounded page can discard its pending
// animation frame. Killing requestAnimationFrame reproduces that while the
// page stays visible, which is the case that actually strands the display.
//
//   npm run test:freeze
import { spawn } from 'node:child_process'
import { mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
const URL_ = process.argv[2] ?? 'http://127.0.0.1:5173/seed.html'
const profile = mkdtempSync(join(tmpdir(), 'ld-fz-'))
const chrome = spawn('google-chrome',['--headless=new','--no-sandbox','--disable-gpu',
  '--remote-debugging-port=0',`--user-data-dir=${profile}`,'--window-size=390,844','about:blank'],{stdio:'ignore'})
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
  ws.onmessage=m=>{const x=JSON.parse(m.data);const q=pending.get(x.id);if(q){pending.delete(x.id);q.res(x.result)}}}}catch{} if(!ws)await sleep(250)}
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
await sleep(4500)

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
await sleep(400)

const a1 = await ev(shown); await sleep(1200); const a2 = await ev(shown)
check('display updates before freezing', a1 !== a2, `${a1} -> ${a2}`)

// The real failure is a render chain that dies while the page is still
// visible: a frozen page can have its pending frame discarded, and the old
// code stored the handle and treated a non-zero value as proof a frame was
// coming. Killing rescheduling reproduces that exactly.
const orig = `window.__origRaf = window.requestAnimationFrame.bind(window)`
await ev(orig)
await ev(`window.requestAnimationFrame = () => 0`)
await sleep(1200)
const dead1 = await ev(shown); await sleep(900); const dead2 = await ev(shown)
check('display stops when the frame chain dies', dead1 === dead2, `${dead1} -> ${dead2}`)

await ev(`window.requestAnimationFrame = window.__origRaf`)
await sleep(3000)
const alive1 = await ev(shown); await sleep(1200); const alive2 = await ev(shown)
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

ws.close();chrome.kill();await sleep(400);try{rmSync(profile,{recursive:true,force:true})}catch{}
console.log(`\n${res.filter(Boolean).length}/${res.length} passed`)
process.exit(res.every(Boolean)?0:1)
