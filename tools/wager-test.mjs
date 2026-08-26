// Wager layer tests, against the dev server.
//
// Covers the prestige itself and that a Points upgrade actually changes the
// engine, rather than just being marked as held.
//
//   npm run test:wager
import { spawn } from 'node:child_process'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
const profile = mkdtempSync(join(tmpdir(), 'ld-wt-'))
const chrome = spawn('google-chrome',['--headless=new','--no-sandbox','--disable-gpu',
  '--remote-debugging-port=9360',`--user-data-dir=${profile}`,'--window-size=390,844','about:blank'],{stdio:'ignore'})
const sleep=ms=>new Promise(r=>setTimeout(r,ms))
let ws,id=0;const pending=new Map()
for(let i=0;i<60&&!ws;i++){try{const l=await(await fetch('http://127.0.0.1:9360/json')).json();const p=l.find(t=>t.type==='page')
 if(p){ws=new WebSocket(p.webSocketDebuggerUrl);await new Promise((r,j)=>{ws.onopen=r;ws.onerror=j})
  ws.onmessage=m=>{const x=JSON.parse(m.data);const q=pending.get(x.id);if(q){pending.delete(x.id);q.res(x.result)}}}}catch{} if(!ws)await sleep(250)}
const send=(m,p={})=>new Promise(res=>{const n=++id;pending.set(n,{res});ws.send(JSON.stringify({id:n,method:m,params:p}))})
const ev=async e=>{const r=await send('Runtime.evaluate',{expression:e,returnByValue:true,awaitPromise:true})
  if(r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description); return r.result?.value}
await send('Emulation.setFocusEmulationEnabled',{enabled:true})
await send('Page.enable');await send('Runtime.enable')
const res=[];const check=(n,ok,d='')=>{res.push(ok);console.log(`${ok?'PASS':'FAIL'}  ${n}${d?'  '+d:''}`)}

await send('Page.navigate',{url:'http://127.0.0.1:5173/'}); await sleep(4000)

const atThreshold = `(() => { const s = window.LD.state, D = window.LD.Decimal
  s.ink = new D('1.8e308'); s.studies = 3; s.folios = 2; s.rollUpgrades = 40
  s.solids.forEach(d => { d.bought = 30; d.amount = new D(1000) }) })()`

// The tab only appears when the threshold is in sight.
await ev(`(() => { const s = window.LD.state, D = window.LD.Decimal; s.ink = new D(1000) })()`)
await sleep(300)
check('wager tab hidden early',
  await ev(`![...document.querySelectorAll('.tab')].some(t => t.textContent === 'WAGER' && !t.hidden)`))

await ev(atThreshold); await sleep(400)
check('wager tab appears near the threshold',
  await ev(`[...document.querySelectorAll('.tab')].some(t => t.textContent === 'WAGER' && !t.hidden)`))

await ev(`[...document.querySelectorAll('.tab')].find(t => t.textContent === 'WAGER').click()`)
await sleep(500)
const before = await ev(`({ points: Number(window.LD.state.points), wagers: window.LD.state.wagers })`)
await ev(`[...document.querySelectorAll('.action')].find(b => b.textContent.startsWith('CALL THE WAGER')).click()`)
await sleep(400)
const after = await ev(`({ points: Number(window.LD.state.points), wagers: window.LD.state.wagers,
  ink: window.LD.state.ink.toString(), studies: window.LD.state.studies, folios: window.LD.state.folios,
  roll: window.LD.state.rollUpgrades, bought: window.LD.state.solids.reduce((a,d)=>a+d.bought,0) })`)
check('wager pays a point', after.points === before.points + 1, JSON.stringify(after))
check('wager counts up', after.wagers === before.wagers + 1)
check('wager clears layer 0',
  after.ink === '10' && after.studies === 0 && after.folios === 0 && after.roll === 0 && after.bought === 0)

// An upgrade has to change the engine, not just light up.
await ev(`(() => { const s = window.LD.state, D = window.LD.Decimal
  s.points = new D(20); s.pointUpgrades = [] })()`)
await sleep(300)
// Only the active pane updates, so the table has to be on screen to be read.
await ev(`[...document.querySelectorAll('.tab')].find(t => t.textContent === 'TABLE').click()`)
await sleep(500)
const studyNeedBefore = await ev(`(() => { const t = [...document.querySelectorAll('.action')]
  .find(b => b.textContent.startsWith('STUDY /')); return t ? t.textContent : 'none' })()`)
await ev(`window.LD.state.pointUpgrades = ['timeMult','solids19','solids37','resetBoost']`)
await sleep(600)
const studyNeedAfter = await ev(`(() => { const t = [...document.querySelectorAll('.action')]
  .find(b => b.textContent.startsWith('STUDY /')); return t ? t.textContent : 'none' })()`)
check('resetBoost lowers the study requirement by 9',
  studyNeedBefore.includes('20 ') && studyNeedAfter.includes('11 '),
  `${studyNeedBefore} -> ${studyNeedAfter}`)

ws.close();chrome.kill();await sleep(400);try{rmSync(profile,{recursive:true,force:true})}catch{}
console.log(`\n${res.filter(Boolean).length}/${res.length} passed`)
process.exit(res.every(Boolean)?0:1)
