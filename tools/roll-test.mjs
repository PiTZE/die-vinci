// The roll loop. Nothing produces until a roll lands, a hand cannot out-roll
// the roll rate, and the automator takes over from the finger.
import { spawn } from 'node:child_process'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
const profile = mkdtempSync(join(tmpdir(), 'ld-rl-'))
const chrome = spawn('google-chrome',['--headless=new','--no-sandbox','--disable-gpu',
  '--remote-debugging-port=9376',`--user-data-dir=${profile}`,'--window-size=390,844','about:blank'],{stdio:'ignore'})
const sleep=ms=>new Promise(r=>setTimeout(r,ms))
let ws,id=0;const pending=new Map()
for(let i=0;i<60&&!ws;i++){try{const l=await(await fetch('http://127.0.0.1:9376/json')).json();const p=l.find(t=>t.type==='page')
 if(p){ws=new WebSocket(p.webSocketDebuggerUrl);await new Promise((r,j)=>{ws.onopen=r;ws.onerror=j})
  ws.onmessage=m=>{const x=JSON.parse(m.data);const q=pending.get(x.id);if(q){pending.delete(x.id);q.res(x.result)}}}}catch{} if(!ws)await sleep(250)}
const send=(m,p={})=>new Promise(res=>{const n=++id;pending.set(n,{res});ws.send(JSON.stringify({id:n,method:m,params:p}))})
const ev=async e=>{const r=await send('Runtime.evaluate',{expression:e,returnByValue:true,awaitPromise:true})
  if(r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description); return r.result?.value}
await send('Emulation.setFocusEmulationEnabled',{enabled:true})
await send('Page.enable');await send('Runtime.enable')
const res=[];const check=(n,ok,d='')=>{res.push(ok);console.log(`${ok?'PASS':'FAIL'}  ${n}${d?'  '+d:''}`)}
await send('Page.navigate',{url:'http://127.0.0.1:5173/'}); await sleep(4000)
await ev(`localStorage.clear()`); await send('Page.reload'); await sleep(3500)

const ROLL = `[...document.querySelectorAll('.bar-roll')][0]`

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
await ev(`${ROLL}.click()`); await sleep(120)
const mid = await ev(`({ ink: window.LD.state.ink.toString(), spinning: window.LD.state.rollStartedAt > 0 })`)
check('pressing ROLL starts a spin', mid.spinning === true)
check('and pays nothing mid-air', mid.ink === stillIdle, mid.ink)

await sleep(1200)
const landed = await ev(`({
  ink: window.LD.state.ink.toString(),
  face: window.LD.state.faces[0],
  shown: document.querySelector('.solid-face').textContent,
  spinning: window.LD.state.rollStartedAt > 0,
})`)
check('the roll lands and pays', Number(landed.ink) > Number(stillIdle), `${stillIdle} -> ${landed.ink}`)
check('the d4 shows a face of 1 to 4', landed.face >= 1 && landed.face <= 4, `rolled ${landed.face}`)
check('and the number is drawn on the die', landed.shown === String(landed.face), landed.shown)
check('the dice come to rest', landed.spinning === false)

// Mashing must not beat the roll rate. Twenty presses inside one interval is
// one roll, or the manual path would be strictly better than the automator.
const beforeMash = await ev(`window.LD.state.ink.toString()`)
await ev(`for (let i = 0; i < 20; i++) ${ROLL}.click()`)
await sleep(1300)
const afterMash = await ev(`window.LD.state.ink.toString()`)
const gained = Number(afterMash) - Number(beforeMash)
const oneRollMax = Number(await ev(`window.LD.state.solids[0].amount.toString()`)) * 1.6 + 0.001
check('mashing cannot beat the roll rate', gained <= oneRollMax,
  `gained ${gained.toFixed(3)}, one roll caps at ${oneRollMax.toFixed(3)}`)

// Space is bound to the roll, and must not also scroll the pane under it.
await ev(`(() => { const s = window.LD.state, D = window.LD.Decimal
  s.rollStartedAt = 0; s.ink = new D(0) })()`)
await sleep(300)
const beforeKey = await ev(`window.LD.state.ink.toString()`)
await send('Input.dispatchKeyEvent',{type:'rawKeyDown',code:'Space',key:' ',windowsVirtualKeyCode:32})
await sleep(80)
await send('Input.dispatchKeyEvent',{type:'keyUp',code:'Space',key:' ',windowsVirtualKeyCode:32})
await sleep(1300)
const afterKey = await ev(`window.LD.state.ink.toString()`)
check('space rolls', Number(afterKey) > Number(beforeKey), `${beforeKey} -> ${afterKey}`)

// The automator, and the button standing down once it is in.
await ev(`(() => { const s = window.LD.state, D = window.LD.Decimal
  s.studies = 2; s.ink = new D(1e6) })()`)
await sleep(400)
await ev(`[...document.querySelectorAll('.action')].find(b => b.textContent.includes('AUTOMATE')).click()`)
await sleep(400)
const auto = await ev(`({ auto: window.LD.state.autoRoll,
  btn: getComputedStyle(${ROLL}).display })`)
check('the automator can be bought', auto.auto === true)
check('and the ROLL button stands down', auto.btn === 'none', auto.btn)

const beforeAuto = await ev(`window.LD.state.ink.toString()`)
await sleep(1600)
const afterAuto = await ev(`window.LD.state.ink.toString()`)
check('rolls now land on their own', Number(afterAuto) > Number(beforeAuto),
  `${beforeAuto} -> ${afterAuto}`)

ws.close();chrome.kill();await sleep(300);try{rmSync(profile,{recursive:true,force:true})}catch{}
console.log(`\n${res.filter(Boolean).length}/${res.length} passed`)
process.exit(res.every(Boolean)?0:1)
