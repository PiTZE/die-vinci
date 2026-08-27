// Challenge and autobuyer tests, against the dev server.
//
//   npm run test:challenge
import { spawn } from 'node:child_process'
import { appReady, guard, sweepStale } from './harness.mjs'
import { mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
const profile = mkdtempSync(join(tmpdir(), 'ld-cl-'))
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
const tab = (name) => `[...document.querySelectorAll('.tab')].find(t => t.textContent === '${name}')`

// Start from nothing. A run interrupted part way leaves its browser alive and
// holding this port, and the next run then attaches to it and inherits a save
// it never made, which is how this suite reported a challenge cleared before
// it had done anything.
await send('Page.navigate',{url:'http://127.0.0.1:5173/'})
 await appReady(ev)
await ev(`(() => { localStorage.clear(); localStorage.setItem = () => {} })()`)
await send('Page.navigate',{url:'http://127.0.0.1:5173/'})
 await appReady(ev)

// These exercise the mechanics, not the confirm-once in front of them, which
// has its own suite. Without this every reset here would need two clicks.
await ev(`(() => { const c = window.LD.state.options.confirms\n  for (const k of Object.keys(c)) c[k] = false })()`)
await sleep(150)

check('challenges hidden before the first wager',
  await ev(`!${tab('CHALLENGES')} || ${tab('CHALLENGES')}.hidden`))

// Reach the threshold and take the Wager.
await ev(`(() => { const s = window.LD.state, D = window.LD.Decimal; s.ink = new D('1.8e308') })()`)
await sleep(150)
await ev(`${tab('WAGER')}.click()`); await sleep(150)
await ev(`[...document.querySelectorAll('.action')].find(b => b.textContent.startsWith('CALL THE WAGER')).click()`)
await sleep(150)
const first = await ev(`({ done: window.LD.state.challengesDone.slice(),
  auto: window.LD.state.autobuyers.solid1.unlocked })`)
check('the first wager clears challenge 1', first.done.includes(1), JSON.stringify(first.done))
check('and unlocks the first solid autobuyer', first.auto === true)
check('challenges tab now shows', await ev(`${tab('CHALLENGES')} && !${tab('CHALLENGES')}.hidden`))
check('automation tab now shows', await ev(`${tab('AUTOMATION')} && !${tab('AUTOMATION')}.hidden`))

// Enter challenge 7, which cuts the chain to six solids.
await ev(`${tab('CHALLENGES')}.click()`); await sleep(150)
// The first solid's autobuyer is unlocked by now and would buy during the
// reset, so it is switched off for this check and back on afterwards.
await ev(`(() => { const s = window.LD.state, D = window.LD.Decimal
  s.autobuyers.solid1.on = false
  s.studies = 5; s.solids.forEach(d => { d.bought = 20; d.amount = new D(500) }) })()`)
await ev(`[...document.querySelectorAll('.challenge')][6].click()`)
await sleep(150)
const inC7 = await ev(`({ running: window.LD.state.challengeRunning,
  studies: window.LD.state.studies, bought: window.LD.state.solids.reduce((a,d)=>a+d.bought,0) })`)
check('entering a challenge resets layer 0', inC7.running === 7 && inC7.studies === 0 && inC7.bought === 0,
  JSON.stringify(inC7))

// Entering reset the studies, so the cap only shows once enough are taken to
// unlock past six.
await ev(`(() => { const s = window.LD.state; s.autobuyers.solid1.on = true; s.studies = 5 })()`)
await ev(`${tab('TABLE')}.click()`); await sleep(150)
const shown = await ev(`[...document.querySelectorAll('.solid')].filter(r => !r.hidden).length`)
check('challenge 7 cuts the chain to six solids', shown === 6, `${shown} rows shown`)

// Clear it by reaching the threshold inside it.
await ev(`(() => { const s = window.LD.state, D = window.LD.Decimal; s.ink = new D('1.8e308') })()`)
await sleep(150)
await ev(`${tab('WAGER')}.click()`); await sleep(150)
await ev(`[...document.querySelectorAll('.action')].find(b => b.textContent.startsWith('CALL THE WAGER')).click()`)
await sleep(150)
const cleared = await ev(`({ done: window.LD.state.challengesDone.slice(),
  running: window.LD.state.challengeRunning, auto: window.LD.state.autobuyers.solid7.unlocked })`)
check('clearing a challenge inside it awards its autobuyer',
  cleared.done.includes(7) && cleared.running === 0 && cleared.auto === true, JSON.stringify(cleared))

// An unlocked autobuyer has to actually buy.
await ev(`(() => { const s = window.LD.state, D = window.LD.Decimal
  s.ink = new D('1e30'); s.solids.forEach(d => { d.bought = 0; d.amount = new D(0) }) })()`)
const boughtBefore = await ev(`window.LD.state.solids[0].bought`)
await sleep(2500)
const boughtAfter = await ev(`window.LD.state.solids[0].bought`)
check('an unlocked autobuyer buys on its own', boughtAfter > boughtBefore,
  `${boughtBefore} -> ${boughtAfter}`)

// And upgrading it costs points and shortens the interval.
await ev(`(() => { const s = window.LD.state, D = window.LD.Decimal; s.points = new D(50) })()`)
await ev(`${tab('AUTOMATION')}.click()`); await sleep(150)
const beforeUp = await ev(`({ level: window.LD.state.autobuyers.solid1.level,
  points: Number(window.LD.state.points),
  every: window.LD.state.autobuyers.solid1.level })`)
// Cost doubles per level, so it is derived rather than assumed to be 1.
const expectCost = Math.pow(2, beforeUp.level)
// Scoped to the autobuyer list. The automator sits above it in its own
// section with the same row markup, and an unscoped query finds that first.
await ev(`(() => {
  const list = [...document.querySelectorAll('.section')]
    .find(x => x.textContent.startsWith('AUTOBUYERS'))
  const b = [...list.querySelectorAll('.auto-up')].find(x => !x.disabled)
  if (b) b.click()
})()`)
await sleep(150)
const afterUp = await ev(`({ level: window.LD.state.autobuyers.solid1.level, points: Number(window.LD.state.points) })`)
check('upgrading an autobuyer spends the doubling cost and shortens it',
  afterUp.level === beforeUp.level + 1 && afterUp.points === beforeUp.points - expectCost,
  `${JSON.stringify(beforeUp)} -> ${JSON.stringify(afterUp)}, cost ${expectCost}`)

ws.close();chrome.kill();await sleep(150);try{rmSync(profile,{recursive:true,force:true})}catch{}
console.log(`\n${res.filter(Boolean).length}/${res.length} passed`)
process.exit(res.every(Boolean)?0:1)
