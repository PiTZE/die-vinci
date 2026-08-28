// Wager layer tests, against the dev server.
//
// Covers the prestige itself and that a Points upgrade actually changes the
// engine, rather than just being marked as held.
//
//   npm run test:wager
import { spawn } from 'node:child_process'
import { appReady, guard, sweepStale } from './harness.mjs'
import { mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
const profile = mkdtempSync(join(tmpdir(), 'ld-wt-'))
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

// These exercise the mechanics, not the confirm-once in front of them, which
// has its own suite. Without this every reset here would need two clicks.
await ev(`(() => { const c = window.LD.state.options.confirms\n  for (const k of Object.keys(c)) c[k] = false })()`)
await sleep(150)

const atThreshold = `(() => { const s = window.LD.state, D = window.LD.Decimal
  s.ink = new D('1.8e308'); s.inkThisWager = new D('1.8e308')
  s.studies = 3; s.folios = 2; s.rollUpgrades = 40
  s.solids.forEach(d => { d.bought = 30; d.amount = new D(1000) }) })()`

// The tab only appears when the threshold is in sight.
await ev(`(() => { const s = window.LD.state, D = window.LD.Decimal; s.ink = new D(1000) })()`)
await sleep(150)
check('wager tab hidden early',
  await ev(`![...document.querySelectorAll('.tab')].some(t => t.textContent === 'WAGER' && !t.hidden)`))

await ev(atThreshold); await sleep(150)
check('wager tab appears near the threshold',
  await ev(`[...document.querySelectorAll('.tab')].some(t => t.textContent === 'WAGER' && !t.hidden)`))

await ev(`[...document.querySelectorAll('.tab')].find(t => t.textContent === 'WAGER').click()`)
await sleep(150)
// The first Wager clears the first challenge, which awards the solid 1
// autobuyer, which then spends the ten starting ink on a d4 within half a
// second. That is correct, and it is not what this check is about, so the
// autobuyers are switched off before the reset is measured.
await ev(`(() => { const a = window.LD.state.autobuyers
  for (const k of Object.keys(a)) a[k].on = false })()`)
await sleep(150)
const before = await ev(`({ points: Number(window.LD.state.points), wagers: window.LD.state.wagers })`)
await ev(`[...document.querySelectorAll('.action')].find(b => b.textContent.startsWith('CALL THE WAGER')).click()`)
await sleep(150)
const after = await ev(`({ points: Number(window.LD.state.points), wagers: window.LD.state.wagers,
  ink: window.LD.state.ink.toString(), studies: window.LD.state.studies, folios: window.LD.state.folios,
  roll: window.LD.state.rollUpgrades, bought: window.LD.state.solids.reduce((a,d)=>a+d.bought,0) })`)
check('wager pays a point', after.points === before.points + 1, JSON.stringify(after))
check('wager counts up', after.wagers === before.wagers + 1)
check('wager clears layer 0',
  after.ink === '10' && after.studies === 0 && after.folios === 0 && after.roll === 0 && after.bought === 0,
  JSON.stringify(after))

// A phone has no hover, so the note has to be reachable by touch.
const noteBefore = await ev(`document.querySelector('.upgrade-note').textContent`)
await ev(`document.querySelector('.upgrade').dispatchEvent(
  new PointerEvent('pointerdown', { bubbles: true }))`)
await sleep(150)
const noteAfter = await ev(`document.querySelector('.upgrade-note').textContent`)
check('touching an upgrade writes out what it does',
  noteAfter !== noteBefore && noteAfter.length > 20,
  JSON.stringify({ before: noteBefore, after: noteAfter }))

// An upgrade has to change the engine, not just light up.
// Measured from the fifth study, where the requirement is 20. The first four
// cost 10, and a discount of 9 against 10 floors at 1, which would pass this
// check without proving the discount is actually being subtracted.
await ev(`(() => { const s = window.LD.state, D = window.LD.Decimal
  s.points = new D(20); s.pointUpgrades = []; s.studies = 5 })()`)
await sleep(150)
// Only the active pane updates, so the table has to be on screen to be read.
await ev(`[...document.querySelectorAll('.tab')].find(t => t.textContent === 'TABLE').click()`)
await sleep(150)
// The verb and the requirement are separate spans now, so the button reads
// "STUDY" then "20 d8" rather than one slash-joined string.
const need = `(() => { const t = [...document.querySelectorAll('.action')]
  .find(b => b.textContent.startsWith('STUDY'))
  return t ? (t.querySelector('.btn-cost')?.textContent ?? t.textContent) : 'none' })()`
const studyNeedBefore = await ev(need)
await ev(`window.LD.state.pointUpgrades = ['timeMult','solids19','solids37','resetBoost']`)
await sleep(150)
const studyNeedAfter = await ev(need)
check('resetBoost lowers the study requirement by 9',
  studyNeedBefore.includes('20 ') && studyNeedAfter.includes('11 '),
  `${studyNeedBefore} -> ${studyNeedAfter}`)

// Ink held can run ahead of what the run has earned: The Hierophant pays ink
// at a reset without crediting the run for it. Production used to halt on ink
// held, so that player hit the cap with the gate still short of it, and got a
// full bar, a dead CALL button and a table that had stopped producing. It
// read as a hang. Production has to keep going until the run itself qualifies.
await ev(`[...document.querySelectorAll('.tab')].find(t => t.textContent === 'WAGER').click()`)
await ev(`(() => { const s = window.LD.state, D = window.LD.Decimal
  s.autoRoll = true; s.studies = 3; s.rollUpgrades = 25
  s.solids.forEach((d, i) => { if (i < 4) { d.bought = 20; d.amount = new D('1e8') } })
  s.ink = new D('1e309'); s.inkThisWager = new D(0) })()`)
await sleep(150)
const stuck0 = await ev(`window.LD.state.inkThisWager.toString()`)
let stuck1 = stuck0
for (let i = 0; i < 40 && stuck0 === stuck1; i++) {
  await sleep(150)
  stuck1 = await ev(`window.LD.state.inkThisWager.toString()`)
}
check('ink over the cap does not stop the run', stuck0 !== stuck1, `${stuck0} -> ${stuck1}`)
check('ink held is clamped to the threshold',
  await ev(`window.LD.state.ink.lte(new window.LD.Decimal('1.8e308'))`),
  await ev(`window.LD.state.ink.toString()`))
check('the CALL button stays shut until the run has earned it',
  await ev(`(() => { const b = [...document.querySelectorAll('.action')]
    .find(x => x.title === 'Call the Wager  (w)')
    return !!b && b.disabled })()`))

ws.close();chrome.kill();await sleep(150);try{rmSync(profile,{recursive:true,force:true})}catch{}
console.log(`\n${res.filter(Boolean).length}/${res.length} passed`)
process.exit(res.every(Boolean)?0:1)
