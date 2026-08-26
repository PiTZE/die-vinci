// Save-durability tests.
//
// Measures how long a real purchase takes to reach localStorage, and whether
// the page writes when it is backgrounded. Also reports whether the browser
// has granted persistent storage, which a fresh headless profile will refuse.
//
//   npm run test:save
import { spawn } from 'node:child_process'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
const profile = mkdtempSync(join(tmpdir(), 'ld-sw-'))
const chrome = spawn('google-chrome',['--headless=new','--no-sandbox','--disable-gpu',
  '--remote-debugging-port=9356',`--user-data-dir=${profile}`,'--window-size=390,844','about:blank'],{stdio:'ignore'})
const sleep=ms=>new Promise(r=>setTimeout(r,ms))
let ws,id=0;const pending=new Map()
for(let i=0;i<60&&!ws;i++){try{const l=await(await fetch('http://127.0.0.1:9356/json')).json();const p=l.find(t=>t.type==='page')
 if(p){ws=new WebSocket(p.webSocketDebuggerUrl);await new Promise((r,j)=>{ws.onopen=r;ws.onerror=j})
  ws.onmessage=m=>{const x=JSON.parse(m.data);const q=pending.get(x.id);if(q){pending.delete(x.id);q.res(x.result)}}}}catch{} if(!ws)await sleep(250)}
const send=(m,p={})=>new Promise(res=>{const n=++id;pending.set(n,{res});ws.send(JSON.stringify({id:n,method:m,params:p}))})
const ev=async e=>{const r=await send('Runtime.evaluate',{expression:e,returnByValue:true,awaitPromise:true})
  if(r.exceptionDetails) return 'EX '+r.exceptionDetails.exception?.description; return r.result?.value}
await send('Emulation.setFocusEmulationEnabled',{enabled:true})
await send('Page.enable');await send('Runtime.enable')
await send('Page.navigate',{url:'http://127.0.0.1:5173/seed.html'}); await sleep(4000)

console.log('persisted before any action:', await ev(`navigator.storage.persisted()`))

// Make a purchase and watch how long localStorage takes to reflect it.
const key = `'leonardos-die-save'`
// Go through the real action path, the way a tap does.
await ev(`(() => { const s = window.LD.state, D = window.LD.Decimal
  s.ink = new D('1e60'); s.solids.forEach(d => { d.bought = 0 }) })()`)
await sleep(400)
const before = await ev(`window.LD.state.solids[0].bought`)
await ev(`[...document.querySelectorAll('.solid-buy')][0].click()`)
const bought = await ev(`window.LD.state.solids[0].bought`)
console.log('clicked buy: bought ' + before + ' -> ' + bought)
const t0 = Date.now()
let seen = -1
for (let i = 0; i < 160; i++) {
  const stored = await ev(`(() => { const raw = localStorage.getItem(${key}); if (!raw) return -1
    try { return JSON.parse(raw).solids[0].bought } catch { return -2 } })()`)
  if (stored === bought && bought > 0) { seen = Date.now() - t0; break }
  await sleep(100)
}
console.log(seen >= 0 ? `purchase reached localStorage after ${seen}ms` : 'purchase NEVER reached localStorage within 16s')

console.log('persisted after an action:  ', await ev(`navigator.storage.persisted()`))
console.log('persist() returns:          ', await ev(`navigator.storage.persist()`))

// And what a blur does, which is the signal a backgrounded app does deliver.
await ev(`(() => { window.LD.state.solids[1].bought = 7777 })()`)
await ev(`window.dispatchEvent(new Event('blur'))`)
await sleep(500)
const afterHide = await ev(`(() => { const raw = localStorage.getItem(${key}); if (!raw) return -1
  try { return JSON.parse(raw).solids[1].bought } catch { return -2 } })()`)
console.log('after hiding the page, second solid stored as:', afterHide, '(want 7777)')
ws.close();chrome.kill();await sleep(300);try{rmSync(profile,{recursive:true,force:true})}catch{}
