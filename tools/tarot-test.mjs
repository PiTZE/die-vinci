// Tarot: the weighting, the draft, and that a card changes the engine rather
// than only being marked as held.
import { spawn } from 'node:child_process'
import { appReady, guard, sweepStale } from './harness.mjs'
import { mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
const profile = mkdtempSync(join(tmpdir(), 'ld-tarot-'))
const chrome = spawn('google-chrome',['--headless=new','--no-sandbox','--disable-gpu','--disable-dev-shm-usage','--disk-cache-size=1','--media-cache-size=1',
  '--remote-debugging-port=0',`--user-data-dir=${profile}`,'--window-size=390,844','about:blank'],{stdio:'ignore'})
guard(chrome, profile, () => ws)
sweepStale()
function devtoolsPort(dir) {
  try { return readFileSync(join(dir, 'DevToolsActivePort'), 'utf8').split('\n')[0].trim() } catch { return '0' }
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
await send('Page.navigate',{url:'http://127.0.0.1:5173/'})
await appReady(ev)
await ev(`window.LD.state.options.offline = false`)

check('no tarot tab before the first Wager',
  (await ev(`(() => { const t = [...document.querySelectorAll('.tab')].find(x => x.textContent.trim() === 'TAROT')
    return !t || t.hidden })()`)) === true)

// A Wager pays a draft, and the first one interrupts.
await ev(`(() => { const s = window.LD.state, D = window.LD.Decimal
  s.ink = new D('1.8e308'); s.solids.forEach(d => { d.bought = 30; d.amount = new D(1000) })
  s.studies = 8; s.options.confirms.wager = false })()`)
await sleep(300)
await ev(`window.LD.actions.wager()`)
await sleep(400)
const afterWager = await ev(`({ offered: window.LD.state.pendingDraft.length,
  progress: window.LD.state.draftProgress })`)
check('a Wager pays a draft', afterWager.offered >= 3 && afterWager.progress === 1,
  JSON.stringify(afterWager))

await ev(`[...document.querySelectorAll('.tab')].find(t => t.textContent.trim() === 'TAROT').click()`)
await sleep(400)
const offer = await ev(`document.querySelectorAll('.arcana-pick').length`)
check('the draft shows the choice', offer >= 3, `${offer} on offer`)

const took = await ev(`(() => {
  const first = document.querySelector('.arcana-pick')
  const id = first.dataset.arcana
  first.click()
  return id })()`)
await sleep(400)
const held = await ev(`({ level: window.LD.state.tarot['${took}'] || 0,
  pending: window.LD.state.pendingDraft.length })`)
check('taking one levels it and clears the offer',
  held.level === 1 && held.pending === 0, `${took}: ${JSON.stringify(held)}`)

// The weighting: early cards should dominate a fresh pool.
const spread = await ev(`(() => {
  const s = window.LD.state
  const before = JSON.stringify(s.tarot)
  s.tarot = {}
  const tally = {}
  for (let i = 0; i < 6000; i++) {
    for (const id of window.LD.drawOffer(s, 3)) tally[id] = (tally[id] || 0) + 1
  }
  s.tarot = JSON.parse(before)
  return tally })()`)
const EARLY = ['empress','hierophant','chariot','justice','hermit']
const LATE = ['priestess','death','tower','moon','sun','judgement','world']
const avg = (ids) => ids.reduce((a, k) => a + (spread[k] || 0), 0) / ids.length
check('early arcana are offered far more than late ones',
  avg(EARLY) > avg(LATE) * 3, `early ${avg(EARLY).toFixed(0)} vs late ${avg(LATE).toFixed(0)} per card`)

// Holding one makes it step aside.
const decay = await ev(`(() => {
  const s = window.LD.state
  const before = JSON.stringify(s.tarot)
  s.tarot = {}
  const zero = window.LD.weightOf(s, 'hermit')
  s.tarot = { hermit: 3 }
  const three = window.LD.weightOf(s, 'hermit')
  s.tarot = JSON.parse(before)
  return { zero, three } })()`)
check('a card held steps aside for the rest',
  decay.three < decay.zero / 4, JSON.stringify(decay))

// An effect has to change the engine, not just be marked as held.
const sun = await ev(`(() => {
  const s = window.LD.state, D = window.LD.Decimal
  s.tarot = {}; s.solids[0].amount = new D(100); s.solids[0].bought = 0
  const before = window.LD.inkPerSecond(s).toString()
  s.tarot = { sun: 1 }
  const after = window.LD.inkPerSecond(s).toString()
  s.tarot = {}
  return { before, after } })()`)
check('XIX The Sun actually multiplies production',
  Number(sun.after) > Number(sun.before) * 2, JSON.stringify(sun))

// XIII Death gates melting, and melting pays the deepest solid.
const melt = await ev(`(() => {
  const s = window.LD.state, D = window.LD.Decimal
  s.tarot = {}; s.studies = 8
  const locked = window.LD.meltUnlocked(s)
  s.tarot = { death: 2 }
  s.solids[0].amount = new D('1e12')
  const can = window.LD.canMelt(s)
  const gain = window.LD.meltGain(s).toString()
  const before = s.meltPower.toString()
  window.LD.actions.melt()
  return { locked, can, gain, before, after: s.meltPower.toString(),
    lowerCleared: s.solids[0].amount.toString() } })()`)
check('melting is locked until Death is held', melt.locked === false)
check('and then it can be melted', melt.can === true, `gain x${melt.gain}`)
check('melting pays the top solid and empties the rest',
  Number(melt.after) > Number(melt.before) && melt.lowerCleared === '0',
  JSON.stringify(melt))

// The ten mode fills the group of ten or waits. Flooring at one made it the
// single mode wearing a different label for most of the game.
const modes = await ev(`(() => {
  const s = window.LD.state, D = window.LD.Decimal
  s.tarot = {}; s.studies = 3; s.meltPower = new D(1)
  s.autobuyers.solid1 = { unlocked: true, on: true, mode: 'ten', level: 0, since: 0 }
  const out = {}
  for (const [name, ink] of [['rich', '1e30'], ['poor', '25']]) {
    for (const m of ['single', 'ten', 'max']) {
      s.autobuyers.solid1.mode = m
      s.solids[0].bought = 0
      s.solids.forEach(d => { d.amount = new D(0) })
      s.ink = new D(ink)
      s.autobuyers.solid1.since = 0
      window.LD.runAutobuyers(s, 600)
      out[name + ':' + m] = s.solids[0].bought
    }
  }
  return out })()`)
check('the modes buy what they say when the ink is there',
  modes['rich:single'] === 1 && modes['rich:ten'] === 10 && modes['rich:max'] > 10,
  JSON.stringify(modes))
// 25 ink buys two tetrahedra at ten each, so ten mode must buy nothing at all.
check('and ten waits for the whole group rather than dribbling out singles',
  modes['poor:ten'] === 0 && modes['poor:single'] === 1,
  `poor: single ${modes['poor:single']}, ten ${modes['poor:ten']}, max ${modes['poor:max']}`)

// No trailing zeros: three characters that say nothing widened a button out
// of line with the eight above it.
const shown = await ev(`(() => {
  const D = window.LD.Decimal
  return [1e17, 1e5, 1.5e6, 35.52, 9.99].map(v => window.LD.format(new D(v), 'mixed')) })()`)
check('numbers carry no trailing zeros',
  shown.every((t) => !/\.0+($|[A-Za-z])/.test(t)), JSON.stringify(shown))

ws.close();chrome.kill();await sleep(300);try{rmSync(profile,{recursive:true,force:true})}catch{}
console.log(`\n${res.filter(Boolean).length}/${res.length} passed`)
process.exit(res.every(Boolean)?0:1)
