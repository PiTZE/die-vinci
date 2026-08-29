// Breaking the Wager, against the dev server.
//
// The condition, the payout, and what the grid buys. Antimatter Dimensions'
// Break Infinity is the reference for all three, and the numbers checked here
// are its numbers: a flat one before, 10^(log10(ink)/308 - 0.75) after, and a
// gate that is nothing more than the prestige autobuyer sitting at 0.1s.
//
//   npm run test:break
import { spawn } from 'node:child_process'
import { appReady, guard, sweepStale } from './harness.mjs'
import { mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
const profile = mkdtempSync(join(tmpdir(), 'ld-bkw-'))
const chrome = spawn('google-chrome',['--headless=new','--no-sandbox','--disable-gpu','--disable-dev-shm-usage','--disk-cache-size=1','--media-cache-size=1',
  '--remote-debugging-port=0',`--user-data-dir=${profile}`,'--window-size=390,844','about:blank'],{stdio:'ignore'})
guard(chrome, profile, () => ws)
sweepStale()
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
await ev(`(() => { const c = window.LD.state.options.confirms
  for (const k of Object.keys(c)) c[k] = false })()`)

// A save that has never called a Wager should not be able to see any of this.
const hidden = await ev(`[...document.querySelectorAll('.tab')].some(t => t.textContent === 'BREAK' && !t.hidden)`)
check('the break tab is not there before the Wager can be automated', hidden === false)

// The thirteenth challenge is what awards the autobuyer, so nothing before it
// opens the tab either.
const armed = `(() => { const s = window.LD.state, D = window.LD.Decimal
  s.wagers = 30; s.chips = new D('1e12'); s.studies = 8
  s.challengesDone = [1,2,3,4,5,6,7,8,9,10,11,12]
  for (const k of Object.keys(s.autobuyers)) { s.autobuyers[k].unlocked = true; s.autobuyers[k].level = 40 }
  s.autobuyers.wager.unlocked = false; s.autobuyers.wager.level = 0 })()`
await ev(armed); await sleep(250)
check('nor with twelve challenges cleared and no Wager autobuyer',
  (await ev(`[...document.querySelectorAll('.tab')].some(t => t.textContent === 'BREAK' && !t.hidden)`)) === false)

// Awarded, but at its base interval, the gate says how far off it is.
await ev(`(() => { const s = window.LD.state
  s.autobuyers.wager.unlocked = true; s.autobuyers.wager.level = 0 })()`)
await sleep(250)
await ev(`[...document.querySelectorAll('.tab')].find(t => t.textContent === 'BREAK').click()`)
await sleep(250)
const gate = await ev(`({
  shown: [...document.querySelectorAll('.tab')].some(t => t.textContent === 'BREAK' && !t.hidden),
  line: document.querySelector('.break-gate').textContent,
  disabled: [...document.querySelectorAll('.action')].find(b => b.textContent.includes('BREAK IT'))?.disabled,
  grid: document.querySelector('.break-figure') ? true : false })`)
check('the tab arrives with the Wager autobuyer', gate.shown === true, JSON.stringify(gate))
check('and asks for a tenth of a second, in seconds',
  /0\.1 seconds/.test(gate.line) && /60\.00/.test(gate.line), gate.line)
check('with the button refusing until then', gate.disabled === true)

// The whole condition, and nothing else.
await ev(`(() => { window.LD.state.autobuyers.wager.level = 40 })()`)
await sleep(250)
const ready = await ev(`({
  line: document.querySelector('.break-gate').textContent,
  ms: window.LD.interval(window.LD.state, 'wager'),
  disabled: [...document.querySelectorAll('.action')].find(b => b.textContent.includes('BREAK IT'))?.disabled })`)
check('at the floor the button opens', ready.disabled === false && ready.ms === 100,
  JSON.stringify(ready))

// And nothing else is on screen yet. The grid section used to draw its own
// border under an empty heading for the whole time before the wall came down.
// Scoped to the pane on screen. Every pane is mounted, so an unscoped count
// is every section in the game.
const boxes = await ev(`(() => { const pane = [...document.querySelectorAll('.pane')].find(p => !p.hidden)
  return pane ? [...pane.querySelectorAll('.section')].filter(n => !n.hidden).length : -1 })()`)
check('with no empty box under it', boxes === 1, `${boxes} sections on screen`)

// AD's payout, both sides of the switch. A run that earned exactly the
// threshold pays 10^(308/308 - 0.75) = 1.78, floored to 1, so the check is on
// a run that went well past it.
const pay = await ev(`(() => { const s = window.LD.state, D = window.LD.Decimal
  s.inkThisWager = new D('1e616')
  const flat = window.LD.chipsFrom(s).toString()
  s.broke = true
  const broken = window.LD.chipsFrom(s).toString()
  s.broke = false
  return { flat, broken } })()`)
check('an unbroken Wager pays exactly one', pay.flat === '1', JSON.stringify(pay))
// 10^(616/308 - 0.75) = 10^1.25 = 17.78, floored.
check('a broken one pays by the overshoot', Number(pay.broken) === 17, JSON.stringify(pay))

// Breaking takes the ceiling off production, which is the other half of it.
const ceiling = await ev(`(() => { const s = window.LD.state, D = window.LD.Decimal
  s.inkThisWager = new D('1e308').times(2)
  const stops = window.LD.mustWager(s)
  s.broke = true
  const runs = window.LD.mustWager(s)
  s.broke = false
  return { stops, runs } })()`)
check('the wall stops the run until it is broken',
  ceiling.stops === true && ceiling.runs === false, JSON.stringify(ceiling))

// And breaking hands every other autobuyer its floor, as AD's does on the
// same line.
const freebies = await ev(`(async () => { const s = window.LD.state
  for (const k of Object.keys(s.autobuyers)) if (k !== 'wager') s.autobuyers[k].level = 0
  const before = Object.keys(s.autobuyers).filter(k => window.LD.isMaxed(s, k)).length
  window.LD.actions.toggleBreak()
  await new Promise(r => setTimeout(r, 150))
  const after = Object.keys(s.autobuyers).filter(k => window.LD.isMaxed(s, k)).length
  return { before, after, total: Object.keys(s.autobuyers).length, broke: s.broke } })()`)
check('breaking maxes every other autobuyer for nothing',
  freebies.broke === true && freebies.before === 1 && freebies.after === freebies.total,
  JSON.stringify(freebies))

// The grid only exists on the far side.
await sleep(250)
const grid = await ev(`({
  tiles: [...document.querySelectorAll('.tile-grid')].filter(g => !g.hidden).length,
  names: [...document.querySelectorAll('.break-figure')].length })`)
check('and the grid appears with it', grid.tiles > 0, JSON.stringify(grid))

// A rebuyable climbs and stops.
const rebuy = await ev(`(() => { const s = window.LD.state, D = window.LD.Decimal
  s.chips = new D('1e40')
  const costs = []
  for (let i = 0; i < 3; i++) {
    costs.push(window.LD.breakCost(s, 'rollCostDown').toString())
    window.LD.actions.buyBreak('rollCostDown')
  }
  const level = window.LD.breakLevel(s, 'rollCostDown')
  for (let i = 0; i < 40; i++) window.LD.actions.buyBreak('rollCostDown')
  return { costs, level, capped: window.LD.breakLevel(s, 'rollCostDown') } })()`)
check('a rebuyable climbs x5 a level', rebuy.costs[1] / rebuy.costs[0] === 5, JSON.stringify(rebuy.costs))
check('and stops at its cap', rebuy.capped === 8, `level ${rebuy.capped}`)

// SHORTER ODDS has to actually move the number the whole run is paced by.
const odds = await ev(`(() => { const s = window.LD.state, D = window.LD.Decimal
  s.rollUpgrades = 10
  s.breakRebuyables = {}
  const before = window.LD.rollCost(s).toString()
  s.breakRebuyables = { rollCostDown: 8 }
  const after = window.LD.rollCost(s).toString()
  s.breakRebuyables = {}
  return { before, after } })()`)
check('SHORTER ODDS makes roll rate cheaper to climb',
  Number(odds.after) < Number(odds.before) / 1e6, JSON.stringify(odds))

// The chip multiplier is AD's ipMult: x2 a purchase, 10^(n+1) to buy.
const mult = await ev(`(() => { const s = window.LD.state, D = window.LD.Decimal
  s.chipMult = 0
  s.chips = new D('1e6')
  s.chipUpgrades = window.LD.upgradeIds()
  const open = window.LD.chipMultUnlocked(s)
  const first = window.LD.chipMultCost(s).toString()
  window.LD.actions.buyChipMult()
  const second = window.LD.chipMultCost(s).toString()
  const factor = window.LD.chipMultiplier(s).toString()
  return { open, first, second, factor } })()`)
check('the chip multiplier opens once the grid is bought', mult.open === true)
check('costs ten, then a hundred', Number(mult.first) === 10 && Number(mult.second) === 100,
  JSON.stringify(mult))
check('and doubles the payout', Number(mult.factor) === 2, mult.factor)

// Metatron's Cube, against commons.wikimedia.org/wiki/File:Metatrons_cube.svg.
// Thirteen circles of one radius, six centres at twice it and six at four
// times it, all on the same six bearings, so every circle is tangent and none
// overlap. The first version had the rings at r and 2r, which is the same
// arrangement with the circles four times too big: they overlapped into a
// flower with scribble over it.
const cube = await ev(`(() => {
  const svg = document.querySelector('.geo-metatron')
  if (!svg) return null
  const cs = [...svg.querySelectorAll('circle')].map(c => ({
    x: Number(c.getAttribute('cx')), y: Number(c.getAttribute('cy')), r: Number(c.getAttribute('r')) }))
  const r = cs[0].r
  const mid = cs.find(c => cs.every(o => Math.hypot(o.x - c.x, o.y - c.y) < 4.01 * r))
  const rings = cs.filter(c => c !== mid)
    .map(c => +(Math.hypot(c.x - mid.x, c.y - mid.y) / r).toFixed(2))
  const counts = {}
  for (const d of rings) counts[d] = (counts[d] || 0) + 1
  return { circles: cs.length, radii: [...new Set(cs.map(c => c.r))].length,
    rings: counts, chords: svg.querySelectorAll('line').length } })()`)
check("Metatron's Cube has thirteen circles of one radius",
  cube && cube.circles === 13 && cube.radii === 1, JSON.stringify(cube))
check('six centres at twice the radius and six at four times',
  cube && cube.rings['2'] === 6 && cube.rings['4'] === 6, JSON.stringify(cube?.rings))
// Every pair of the twelve that ring the middle: 12 choose 2.
check('and a chord between every pair of the twelve',
  cube && cube.chords === 66, `${cube?.chords} chords`)

ws.close();chrome.kill();await sleep(150);try{rmSync(profile,{recursive:true,force:true})}catch{}
console.log(`\n${res.filter(Boolean).length}/${res.length} passed`)
process.exit(res.every(Boolean)?0:1)
