import { spawn } from 'node:child_process'
import { appReady, guard, sweepStale } from './harness.mjs'
import { mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
const profile = mkdtempSync(join(tmpdir(), 'ld-cf-'))
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

const setup = `(() => { const s = window.LD.state, D = window.LD.Decimal
  s.studies = 2; s.solids.forEach(d => { d.bought = 20; d.amount = new D(1e6) }) })()`
const studyBtn = `[...document.querySelectorAll('.action')].find(b => b.textContent.startsWith('STUDY') || b.textContent.startsWith('SURE?'))`

await ev(setup); await sleep(150)
const before = await ev(`window.LD.state.studies`)
await ev(`${studyBtn}.click()`); await sleep(150)
const armed = await ev(`({ studies: window.LD.state.studies, label: ${studyBtn}.textContent })`)
check('first press only arms', armed.studies === before && armed.label.startsWith('SURE?'), JSON.stringify(armed))

await ev(`${studyBtn}.click()`); await sleep(150)
const done = await ev(`window.LD.state.studies`)
check('second press goes through', done === before + 1, `${before} -> ${done}`)

// It should forget after the window, so a stray tap much later cannot combine.
await ev(setup); await sleep(150)
await ev(`${studyBtn}.click()`); await sleep(4600)
const cooled = await ev(`${studyBtn}.textContent`)
check('arming expires', !cooled.startsWith('SURE?'), cooled)

// And the setting turns it off.
await ev(`window.LD.state.options.confirms.study = false`); await sleep(150)
const s2 = await ev(`window.LD.state.studies`)
await ev(`${studyBtn}.click()`); await sleep(150)
check('setting off means one press', (await ev(`window.LD.state.studies`)) === s2 + 1)

// A key has no button to be disabled, so S and F armed a confirmation for a
// reset that could not happen. Pressing again then did nothing at all, which
// reads as the game ignoring you.
await ev(`(() => { const s = window.LD.state, D = window.LD.Decimal
  s.options.confirms.study = true; s.options.confirms.folio = true
  s.studies = 0; s.folios = 0; s.stats.foliosEver = 0
  s.solids.forEach(d => { d.amount = new D(0); d.bought = 0 })
  s.ink = new D(0) })()`)
await sleep(150)
const key = (k) => ev(`window.dispatchEvent(new KeyboardEvent('keydown', { key: ${JSON.stringify(k)}, bubbles: true }))`)
await key('s'); await key('f'); await sleep(150)
const idle = await ev(`(() => {
  const t = [...document.querySelectorAll('.action.duo')].map(b => b.textContent)
  const bar = [...document.querySelectorAll('.bar-btn')].map(b => b.textContent)
  return { armed: t.some(x => x.startsWith('SURE?')) || bar.includes('?'), bar } })()`)
check('S and F do not arm a reset that cannot happen', idle.armed === false, JSON.stringify(idle))

// Binding a folio must not hide the section that just became the point of the
// game. It clears the studies that opened the table, so the requirement goes
// unmet and the whole section used to vanish until all nine were open again.
const folio = await ev(`(() => { const s = window.LD.state, D = window.LD.Decimal
  s.studies = 8; s.folios = 0; s.stats.foliosEver = 0
  s.solids.forEach(d => { d.amount = new D('1e12'); d.bought = 20 })
  const before = window.LD.folioUnlocked(s)
  window.LD.actions.buyFolio()
  const after = window.LD.folioUnlocked(s)
  s.wagers += 1; s.folios = 0; s.studies = 0
  return { before, after, pastWager: window.LD.folioUnlocked(s), studies: s.studies } })()`)
check('a folio stays unlocked once one is bound',
  folio.before === true && folio.after === true && folio.pastWager === true, JSON.stringify(folio))

ws.close();chrome.kill();await sleep(150);try{rmSync(profile,{recursive:true,force:true})}catch{}
console.log(`\n${res.filter(Boolean).length}/${res.length} passed`)
process.exit(res.every(Boolean)?0:1)
