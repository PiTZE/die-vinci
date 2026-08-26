// The roll loop. Nothing produces until a roll lands, a hand cannot out-roll
// the roll rate, and the automator takes over from the finger.
import { spawn } from 'node:child_process'
import { mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
const profile = mkdtempSync(join(tmpdir(), 'ld-rl-'))
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
await send('Emulation.setFocusEmulationEnabled',{enabled:true})
await send('Page.enable');await send('Runtime.enable')
const res=[];const check=(n,ok,d='')=>{res.push(ok);console.log(`${ok?'PASS':'FAIL'}  ${n}${d?'  '+d:''}`)}
await send('Page.navigate',{url:'http://127.0.0.1:5173/'}); await sleep(4000)
await ev(`localStorage.clear()`); await send('Page.reload'); await sleep(3500)

const ROLL = `[...document.querySelectorAll('.bar-roll')][0]`

// Away progress off for the whole suite. If the headless page stalls past a
// second mid-spin, the catch-up simulates the gap on a synthetic clock that
// jumps past the roll duration and lands the throw early. That is correct
// behaviour and it makes every timing assertion here a coin flip.
await ev(`window.LD.state.options.offline = false`)
await sleep(200)

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
// Click and read in one synchronous expression. Probing 120ms later raced the
// 100ms tick: sometimes the roll had already landed, and the check reported a
// spin that never started rather than a tick that arrived first.
const mid = await ev(`(() => {
  ${ROLL}.click()
  return { ink: window.LD.state.ink.toString(), spinning: window.LD.state.rollStartedAt > 0 }
})()`)
check('pressing ROLL starts a spin', mid.spinning === true, JSON.stringify(mid))
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
check('the dice sounds are cached and decodable',
  (await ev(`fetch('/sfx/throw-1.mp3').then(r => r.ok && r.headers.get('content-type'))`)) !== false,
  await ev(`fetch('/sfx/throw-1.mp3').then(r => r.status)`))
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
await sleep(3000)
const i1 = Number(await ev(`window.LD.state.ink.toString()`))
const secs = (Date.now() - t0) / 1000
const rate = Number(await ev(`1 / window.LD.rollInterval`))
// 1000 d4, mean face 2.5, so 2500 ink a roll.
const want = 1000 * 2.5 * rate * secs
const got = (i1 - i0) / want
// Wide, because this is a wall clock against a 100ms tick and it measured
// anywhere from 99% to 145% across runs. It is not trying to verify the rate.
// The regression it exists to catch is a batch paying a flat factor of 1
// instead of each die's mean face, which on a d4 lands at 40%.
check('a batch pays the mean face per die', got > 0.55 && got < 1.75,
  `${(got * 100).toFixed(0)}% of expected`)

// The throw is one eased curve arriving at rest, not a constant spin that
// stops. Measured on the wireframe's own geometry rather than on the wobble:
// the tumble is baked into the line coordinates, so how far a vertex travels
// between samples is the rotation rate itself.
await ev(`(() => { const s = window.LD.state, D = window.LD.Decimal
  s.autoRoll = false; s.rollStartedAt = 0; s.rollUpgrades = 0
  s.solids.forEach((d, i) => { d.amount = new D(i === 0 ? 10 : 0) }) })()`)
await sleep(400)
await ev(`(() => { window.__s = []
  const ln = document.querySelector('.solid-icon line')
  window.__t = setInterval(() => window.__s.push([
    Number(ln.getAttribute('x1')), Number(ln.getAttribute('y1')),
    document.querySelector('.solid-icon').style.transform]), 40) })()`)
await ev(`${ROLL}.click()`)
await sleep(1400)
await ev(`clearInterval(window.__t)`)
const swing = await ev(`(() => {
  const s = window.__s
  const d = []
  for (let i = 1; i < s.length; i++) d.push(Math.hypot(s[i][0] - s[i-1][0], s[i][1] - s[i-1][1]))
  const moving = d.filter(v => v > 0)
  const avg = a => a.length ? a.reduce((x, y) => x + y, 0) / a.length : 0
  const third = Math.max(1, Math.floor(moving.length / 3))
  return { samples: d.length, moving: moving.length,
    head: avg(moving.slice(0, third)), tail: avg(moving.slice(-third)),
    lastTransform: s.length ? s[s.length - 1][2] : null }
})()`)
check('the die actually tumbles', swing.moving > 8, JSON.stringify(swing))
check('and decelerates the whole way rather than stopping dead',
  swing.head > swing.tail * 2, `head ${swing.head.toFixed(4)} vs tail ${swing.tail.toFixed(4)}`)
check('and lands square, with no tilt left on it',
  swing.lastTransform === '', JSON.stringify(swing.lastTransform))

// A die in the air should visibly hop rather than vibrate on the spot.
await ev(`(() => { window.__h = []
  const icon = document.querySelector('.solid-icon')
  window.__ht = setInterval(() => {
    const m = icon.style.transform
    const i = m.indexOf(',')
    const j = m.indexOf('px', i)
    window.__h.push(i < 0 ? 0 : Number(m.slice(i + 1, j)))
  }, 30) })()`)
await ev(`${ROLL}.click()`)
await sleep(1400)
await ev(`clearInterval(window.__ht)`)
const hop = await ev(`(() => {
  const h = window.__h.filter(v => Number.isFinite(v))
  return { n: h.length, lowest: Math.min(...h), highest: Math.max(...h) }
})()`)
check('the hop is big enough to see', hop.lowest < -1.2, JSON.stringify(hop))

// The face and the wireframe trade places rather than stacking.
await ev(`(() => { const s = window.LD.state, D = window.LD.Decimal
  s.autoRoll = false; s.rollStartedAt = 0; s.rollUpgrades = 0 })()`)
await sleep(400)
await ev(`${ROLL}.click()`); await sleep(120)
const air = await ev(`({ face: document.querySelector('.solid-face').textContent })`)
check('a die in the air shows no face', air.face === '', JSON.stringify(air))
await sleep(1200)
const rest = await ev(`(() => {
  const row = document.querySelector('.solid')
  const face = row.querySelector('.solid-face').getBoundingClientRect()
  const icon = row.querySelector('.solid-icon').getBoundingClientRect()
  return { face: row.querySelector('.solid-face').textContent,
    faceRight: Math.round(face.right), iconLeft: Math.round(icon.left),
    opacity: getComputedStyle(row.querySelector('.solid-icon')).opacity }
})()`)
check('the face reads left of the solid, not over it',
  rest.faceRight <= rest.iconLeft && rest.face !== '', JSON.stringify(rest))
check('and the wireframe stays at full strength',
  Number(rest.opacity) === 1, rest.opacity)

// Too fast to read means no numbers at all, just a blur.
await ev(`(() => { const s = window.LD.state; s.autoRoll = true; s.rollUpgrades = 60 })()`)
await sleep(500)
const blur = await ev(`({ face: document.querySelector('.solid-face').textContent })`)
check('an unreadable roll rate shows the average, as a whole number',
  blur.face === '2', JSON.stringify(blur))

// A row you own none of sits the throw out: no face, and its wireframe does
// not move while the ones with dice on them do.
await ev(`(() => { const s = window.LD.state, D = window.LD.Decimal
  s.autoRoll = false; s.rollStartedAt = 0; s.rollUpgrades = 0; s.studies = 2
  s.solids.forEach((d, i) => { d.bought = 0; d.amount = new D(i === 0 ? 5 : 0) }) })()`)
await sleep(500)
await ev(`${ROLL}.click()`); await sleep(260)
const empties = await ev(`(() => {
  const rows = [...document.querySelectorAll('.solid')].filter(r => getComputedStyle(r).display !== 'none')
  return rows.map(r => ({ face: r.querySelector('.solid-face').textContent,
    moved: r.querySelector('.solid-icon').style.transform !== '' }))
})()`)
check('the row with dice on it is thrown', empties[0] && empties[0].moved === true,
  JSON.stringify(empties))
check('and the empty rows are not',
  empties.slice(1).length > 0 && empties.slice(1).every(r => !r.moved && r.face === ''),
  JSON.stringify(empties.slice(1)))
await sleep(1200)
check('an empty row lands on nothing',
  (await ev(`[...document.querySelectorAll('.solid')].filter(r => getComputedStyle(r).display !== 'none')
     .slice(1).every(r => r.querySelector('.solid-face').textContent === '')`)) === true)

// Spin speed has to rise with the roll rate and then stop rising, or crossing
// out of the readable range makes the dice visibly slow down, which is what it
// used to do: a fixed blur rate slower than the fastest eased throw.
async function spinRate(upgrades) {
  await ev(`(() => { const s = window.LD.state, D = window.LD.Decimal
    s.autoRoll = true; s.studies = 2; s.rollUpgrades = ${upgrades}
    s.solids.forEach((d, i) => { if (i < 2) { d.bought = 10; d.amount = new D(50) } }) })()`)
  await sleep(700)
  await ev(`(() => { window.__sp = []
    const ln = document.querySelector('.solid-icon line')
    window.__spt = setInterval(() => window.__sp.push([
      Number(ln.getAttribute('x1')), Number(ln.getAttribute('y1'))]), 32) })()`)
  // Long enough to cover several whole throws. At one roll a second an eased
  // curve sampled for 1.4s averaged whichever part of it the samples happened
  // to land on, and the reading swung from 0.19 to 0.37 between runs.
  await sleep(3200)
  await ev(`clearInterval(window.__spt)`)
  return ev(`(() => { const s = window.__sp, d = []
    for (let i = 1; i < s.length; i++) d.push(Math.hypot(s[i][0]-s[i-1][0], s[i][1]-s[i-1][1]))
    const m = d.filter(v => v > 0)
    return m.length ? m.reduce((a,b)=>a+b,0) / m.length : 0 })()`)
}
const slow = await spinRate(0)
const quicker = await spinRate(6)
const fast = await spinRate(40)
check('the dice spin faster as the roll rate climbs', fast > slow * 1.3,
  `1 roll/s: ${slow.toFixed(4)}  ->  110 roll/s: ${fast.toFixed(4)}`)
check('and stop speeding up at the ceiling instead of dropping',
  fast >= quicker * 0.9 && quicker > slow,
  `${slow.toFixed(4)} -> ${quicker.toFixed(4)} -> ${fast.toFixed(4)}`)

// The throws hand over to the shake loop rather than both playing at once.
const bed = await ev(`(async () => {
  const ctx = new AudioContext()
  const r = await fetch('/sfx/shake.mp3')
  const b = await ctx.decodeAudioData(await r.arrayBuffer())
  return b.duration.toFixed(2) + 's ' + b.numberOfChannels + 'ch'
})()`)
check('the shake loop is there and decodes', /^1\.[0-9]+s 1ch$/.test(bed), bed)

// A fair die is the b = 0 case of a loaded one, so the maths for the upgrade
// that is coming has to already hold at both ends and in between.
const loaded = await ev(`(() => {
  const p = window.LD
  const out = {}
  for (const b of [0, 0.5, 0.9, 1]) {
    const n = 4
    let sum = 0
    for (let i = 0; i < 40000; i++) sum += p.rollFace(n, b)
    out[b] = { sampled: sum / 40000, predicted: p.meanFace(n, b) }
  }
  return out
})()`)
const near = (a, b) => Math.abs(a - b) < 0.06
check('a fair d4 averages 2.5', near(loaded['0'].sampled, 2.5) && near(loaded['0'].predicted, 2.5),
  JSON.stringify(loaded['0']))
check('a loaded one skews up and the prediction follows',
  loaded['0.5'].sampled > 2.9 && near(loaded['0.5'].sampled, loaded['0.5'].predicted) &&
  loaded['0.9'].sampled > loaded['0.5'].sampled,
  JSON.stringify({ half: loaded['0.5'], mostly: loaded['0.9'] }))
check('fully loaded always rolls the maximum',
  loaded['1'].sampled === 4 && loaded['1'].predicted === 4, JSON.stringify(loaded['1']))

// A rate per second before the automator is a claim about how fast you press.
await ev(`(() => { const s = window.LD.state, D = window.LD.Decimal
  s.autoRoll = false; s.rollUpgrades = 0; s.studies = 0
  s.solids.forEach((d, i) => { d.bought = 0; d.amount = new D(i === 0 ? 4 : 0) }) })()`)
await sleep(600)
const manual = await ev(`({ bar: document.querySelector('.res-rate').textContent,
  row: document.querySelector('.solid-rate').textContent })`)
check('before the automator the readouts are per roll',
  /per roll$/.test(manual.bar) && /\/roll$/.test(manual.row), JSON.stringify(manual))
check('and a d4 you own four of pays its average, ten a roll',
  manual.bar.startsWith('10'), manual.bar)

await ev(`window.LD.state.autoRoll = true`); await sleep(600)
const rolling = await ev(`({ bar: document.querySelector('.res-rate').textContent,
  row: document.querySelector('.solid-rate').textContent })`)
check('and per second once it is rolling for you',
  /\/s$/.test(rolling.bar) && /\/s$/.test(rolling.row), JSON.stringify(rolling))

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
