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
check('and pays count times face', Number(landed.ink) === landed.face,
  `1 d4 rolled ${landed.face}, paid ${landed.ink}`)
check('and the number is drawn on the die', landed.shown === String(landed.face), landed.shown)
check('the dice come to rest', landed.spinning === false)

// Mashing must not beat the roll rate. Twenty presses inside one interval is
// one roll, or the manual path would be strictly better than the automator.
const beforeMash = await ev(`window.LD.state.ink.toString()`)
await ev(`for (let i = 0; i < 20; i++) ${ROLL}.click()`)
await sleep(1300)
const afterMash = await ev(`window.LD.state.ink.toString()`)
const gained = Number(afterMash) - Number(beforeMash)
// One roll of N d4 can pay at most 4N: the die's highest face.
const oneRollMax = Number(await ev(`window.LD.state.solids[0].amount.toString()`)) * 4 + 0.001
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

// A batch must pay the mean face per die, not a flat one, or automating the
// roll would quietly be a downgrade.
await ev(`(() => { const s = window.LD.state, D = window.LD.Decimal
  s.autoRoll = true; s.rollUpgrades = 40; s.studies = 0
  s.ink = new D(0); s.inkThisWager = new D(0)
  s.solids.forEach((d, i) => { d.bought = 0; d.amount = new D(i === 0 ? 1000 : 0) }) })()`)
const t0 = Date.now()
const i0 = Number(await ev(`window.LD.state.ink.toString()`))
await sleep(2000)
const i1 = Number(await ev(`window.LD.state.ink.toString()`))
const secs = (Date.now() - t0) / 1000
const rate = Number(await ev(`1 / window.LD.rollInterval`))
// 1000 d4, mean face 2.5, so 2500 ink a roll.
const want = 1000 * 2.5 * rate * secs
const got = (i1 - i0) / want
check('a batch pays the mean face per die', got > 0.75 && got < 1.25,
  `${(got * 100).toFixed(0)}% of expected`)

// The face and the wireframe trade places rather than stacking.
await ev(`(() => { const s = window.LD.state, D = window.LD.Decimal
  s.autoRoll = false; s.rollStartedAt = 0; s.rollUpgrades = 0 })()`)
await sleep(400)
await ev(`${ROLL}.click()`); await sleep(120)
const air = await ev(`({ cls: document.querySelector('.solid-die').className,
  face: document.querySelector('.solid-face').textContent })`)
check('a die in the air shows no face', air.face === '' && !air.cls.includes('landed'),
  JSON.stringify(air))
await sleep(1200)
const rest = await ev(`({ cls: document.querySelector('.solid-die').className,
  icon: getComputedStyle(document.querySelector('.solid-icon')).opacity })`)
check('a landed die dims its wireframe for the face',
  rest.cls.includes('landed') && Number(rest.icon) < 0.3, JSON.stringify(rest))

// Too fast to read means no numbers at all, just a blur.
await ev(`(() => { const s = window.LD.state; s.autoRoll = true; s.rollUpgrades = 60 })()`)
await sleep(500)
const blur = await ev(`({ face: document.querySelector('.solid-face').textContent,
  cls: document.querySelector('.solid-die').className })`)
check('an unreadable roll rate drops the numbers',
  blur.face === '' && !blur.cls.includes('landed'), JSON.stringify(blur))

// The threshold stops everything and takes over the bar.
await ev(`(() => { const s = window.LD.state, D = window.LD.Decimal
  s.rollUpgrades = 0; s.ink = new D('1.8e308') })()`)
await sleep(600)
const halted = await ev(`({
  ink: window.LD.state.ink.toString(),
  roll: getComputedStyle(${ROLL}).display,
  max: getComputedStyle(document.querySelector('.bar-btn.max')).display,
  wager: document.querySelector('.wager-now') && getComputedStyle(document.querySelector('.wager-now')).display,
})`)
check('the bar gives itself over to the Wager',
  halted.wager !== 'none' && halted.max === 'none' && halted.roll === 'none',
  JSON.stringify(halted))

const d1 = await ev(`window.LD.state.solids[0].amount.toString()`)
await sleep(1200)
const d2 = await ev(`window.LD.state.solids[0].amount.toString()`)
check('and nothing grows past it', d1 === d2, `${d1} -> ${d2}`)
check('ink is pinned at the threshold',
  (await ev(`window.LD.state.ink.toString()`)) === '1.7976931348623157e+308',
  await ev(`window.LD.state.ink.toString()`))

ws.close();chrome.kill();await sleep(300);try{rmSync(profile,{recursive:true,force:true})}catch{}
console.log(`\n${res.filter(Boolean).length}/${res.length} passed`)
process.exit(res.every(Boolean)?0:1)
