// Backup and restore tests, against the dev server.
//
// This is the safety net for a lost save, so it should not ship on trust.
// Covers the copy taken before a migration, which is the one that would have
// saved layer 0 from migrations 1 to 2 and 2 to 3, and a round trip through
// restore.
//
//   npm run test:backup
import { spawn } from 'node:child_process'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
const profile = mkdtempSync(join(tmpdir(), 'ld-bk-'))
const chrome = spawn('google-chrome',['--headless=new','--no-sandbox','--disable-gpu',
  '--remote-debugging-port=9362',`--user-data-dir=${profile}`,'--window-size=390,844','about:blank'],{stdio:'ignore'})
const sleep=ms=>new Promise(r=>setTimeout(r,ms))
let ws,id=0;const pending=new Map()
for(let i=0;i<60&&!ws;i++){try{const l=await(await fetch('http://127.0.0.1:9362/json')).json();const p=l.find(t=>t.type==='page')
 if(p){ws=new WebSocket(p.webSocketDebuggerUrl);await new Promise((r,j)=>{ws.onopen=r;ws.onerror=j})
  ws.onmessage=m=>{const x=JSON.parse(m.data);const q=pending.get(x.id);if(q){pending.delete(x.id);q.res(x.result)}}}}catch{} if(!ws)await sleep(250)}
const send=(m,p={})=>new Promise(res=>{const n=++id;pending.set(n,{res});ws.send(JSON.stringify({id:n,method:m,params:p}))})
const ev=async e=>{const r=await send('Runtime.evaluate',{expression:e,returnByValue:true,awaitPromise:true})
  if(r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description); return r.result?.value}
await send('Emulation.setFocusEmulationEnabled',{enabled:true})
await send('Page.enable');await send('Runtime.enable')
const res=[];const check=(n,ok,d='')=>{res.push(ok);console.log(`${ok?'PASS':'FAIL'}  ${n}${d?'  '+d:''}`)}
const KEY = 'leonardos-die-save'

await send('Page.navigate',{url:'http://127.0.0.1:5173/'}); await sleep(3500)

// A version 1 save, which is what a player who last opened the game before the
// chain changed would still be holding.
const OLD = JSON.stringify({
  version: 1, lastTick: Date.now(), ink: '4.2e77', inkThisWager: '4.2e77',
  solids: Array.from({ length: 6 }, () => ({ bought: 55, amount: '1e30' })),
  rollUpgrades: 44, studies: 9, folios: 4, points: '0', wagers: 0, tarot: {},
  options: { notation: 'mixed', tab: 'table' }, stats: { started: Date.now() },
})
// Planting a save and then navigating is not enough on its own: the page
// saves on pagehide and writes the current state straight back over it. Writes
// are stubbed out first so the planted save survives the trip.
await ev(`(() => { localStorage.setItem('${KEY}', ${JSON.stringify(OLD)})
  localStorage.setItem = () => {} })()`)
await send('Page.navigate',{url:'http://127.0.0.1:5173/'}); await sleep(3500)

const migrated = await ev(`({ ink: window.LD.state.ink.toString(), studies: window.LD.state.studies })`)
check('the migration cleared layer 0, as designed',
  migrated.ink === '10' && migrated.studies === 0, JSON.stringify(migrated))

console.log('   keys:', await ev(`Object.keys(localStorage).join(', ')`))
const kept = await ev(`(() => { const raw = localStorage.getItem('${KEY}-backup-premigration')
  if (!raw) return null
  const save = JSON.parse(JSON.parse(raw).save)
  return { version: save.version, ink: save.ink, studies: save.studies } })()`)
check('the pre-migration copy holds the untouched save',
  kept && kept.version === 1 && kept.ink === '4.2e77' && kept.studies === 9, JSON.stringify(kept))

check('it is listed for restore',
  await ev(`window.LD.state && !!document.querySelector('.backup-restore')`))

// Round trip: restore it and confirm the old numbers come back.
await ev(`(() => { const s = window.LD.state, D = window.LD.Decimal; s.ink = new D('12345') })()`)
await sleep(500)
await ev(`(() => { const b = [...document.querySelectorAll('.tab')].find(t => t.textContent === 'OPTIONS'); b && b.click() })()`)
await sleep(600)
const restored = await ev(`(() => {
  const raw = localStorage.getItem('${KEY}-backup-premigration')
  localStorage.setItem('${KEY}', JSON.parse(raw).save)
  const back = JSON.parse(localStorage.getItem('${KEY}')).ink
  // Same reason as above: stop the live state being written back on the way out.
  localStorage.setItem = () => {}
  return back })()`)
check('restoring puts the old save back', restored === '4.2e77', String(restored))

await send('Page.navigate',{url:'http://127.0.0.1:5173/'}); await sleep(3500)
const afterRestore = await ev(`window.LD.state.ink.toString()`)
check('and loading it migrates rather than crashing', afterRestore === '10', afterRestore)

ws.close();chrome.kill();await sleep(400);try{rmSync(profile,{recursive:true,force:true})}catch{}
console.log(`\n${res.filter(Boolean).length}/${res.length} passed`)
process.exit(res.every(Boolean)?0:1)
