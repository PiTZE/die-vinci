import { spawn } from 'node:child_process'
import { guard, sweepStale } from './harness.mjs'
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
  ws.onmessage=m=>{const x=JSON.parse(m.data);const q=pending.get(x.id);if(q){pending.delete(x.id);q.res(x.result)}}}}catch{} if(!ws)await sleep(250)}
const send=(m,p={})=>new Promise(res=>{const n=++id;pending.set(n,{res});ws.send(JSON.stringify({id:n,method:m,params:p}))})
const ev=async e=>{const r=await send('Runtime.evaluate',{expression:e,returnByValue:true,awaitPromise:true})
  if(r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description); return r.result?.value}
await send('Emulation.setFocusEmulationEnabled',{enabled:true})
await send('Page.enable');await send('Runtime.enable')
const res=[];const check=(n,ok,d='')=>{res.push(ok);console.log(`${ok?'PASS':'FAIL'}  ${n}${d?'  '+d:''}`)}
await send('Page.navigate',{url:'http://127.0.0.1:5173/'}); await sleep(4000)

const setup = `(() => { const s = window.LD.state, D = window.LD.Decimal
  s.studies = 2; s.solids.forEach(d => { d.bought = 20; d.amount = new D(1e6) }) })()`
const studyBtn = `[...document.querySelectorAll('.action')].find(b => b.textContent.startsWith('STUDY') || b.textContent.startsWith('SURE?'))`

await ev(setup); await sleep(500)
const before = await ev(`window.LD.state.studies`)
await ev(`${studyBtn}.click()`); await sleep(400)
const armed = await ev(`({ studies: window.LD.state.studies, label: ${studyBtn}.textContent })`)
check('first press only arms', armed.studies === before && armed.label.startsWith('SURE?'), JSON.stringify(armed))

await ev(`${studyBtn}.click()`); await sleep(400)
const done = await ev(`window.LD.state.studies`)
check('second press goes through', done === before + 1, `${before} -> ${done}`)

// It should forget after the window, so a stray tap much later cannot combine.
await ev(setup); await sleep(400)
await ev(`${studyBtn}.click()`); await sleep(4600)
const cooled = await ev(`${studyBtn}.textContent`)
check('arming expires', !cooled.startsWith('SURE?'), cooled)

// And the setting turns it off.
await ev(`window.LD.state.options.confirms.study = false`); await sleep(400)
const s2 = await ev(`window.LD.state.studies`)
await ev(`${studyBtn}.click()`); await sleep(400)
check('setting off means one press', (await ev(`window.LD.state.studies`)) === s2 + 1)

ws.close();chrome.kill();await sleep(300);try{rmSync(profile,{recursive:true,force:true})}catch{}
console.log(`\n${res.filter(Boolean).length}/${res.length} passed`)
process.exit(res.every(Boolean)?0:1)
