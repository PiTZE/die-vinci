// Breaking the Wager, against the dev server.
//
// The condition, the payout, and what the grid buys. Antimatter Dimensions'
// Break Infinity is the reference for all three, and the numbers checked here
// are its numbers: a flat one before, 10^(log10(ink)/308 - 0.75) after, and a
// gate that is nothing more than the prestige autobuyer sitting at 0.1s.
//
//   npm run test:break
import { spawn } from 'node:child_process'
import { appReady, guard, openTab, sweepStale, tabOffered } from './harness.mjs'
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
const hidden = await ev(`${tabOffered('BREAK')}`)
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
  (await ev(`${tabOffered('BREAK')}`)) === false)

// Awarded, but at its base interval, the gate says how far off it is.
await ev(`(() => { const s = window.LD.state
  s.autobuyers.wager.unlocked = true; s.autobuyers.wager.level = 0 })()`)
await sleep(250)
await ev(openTab('BREAK'))
await sleep(250)
const gate = await ev(`({
  shown: ${tabOffered('BREAK')},
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
  window.LD.actions.breakWager()
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

// And there is no going back, which is what AD does as well. Its
// breakInfinity() reads player.break = !player.break, but the button says
// "INFINITY IS BROKEN", carries an unclickable class, and refuses a second
// press. The flag is a variable only because Eternity clears it and Reality
// sets it back.
const oneWay = await ev(`(() => { const s = window.LD.state
  const before = s.broke
  window.LD.actions.breakWager()
  const btn = [...document.querySelectorAll('.action')].find(b => b.title === undefined || true)
  return { before, after: s.broke } })()`)
check('breaking cannot be undone', oneWay.before === true && oneWay.after === true,
  JSON.stringify(oneWay))
await sleep(250)
const label = await ev(`(() => { const b = [...document.querySelectorAll('.action')]
    .find(x => /BROKEN|BREAK IT/.test(x.textContent))
  return b ? { text: b.textContent.trim(), disabled: b.disabled } : null })()`)
check('and the button says so and stops taking presses',
  label && label.text === 'BROKEN' && label.disabled === true, JSON.stringify(label))

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

// SHORTER ODDS reduces the cost scaling past the wall and nothing below it,
// which is what AD's tickspeedCostMult does. Its description says so outright:
// "Reduce post-infinity Tickspeed Upgrade cost multiplier scaling". Level 10
// is far below 1.8e308, so the price there must not move; past the wall it
// must move enormously, or the upgrade the break layer is paced by does
// nothing.
const odds = await ev(`(() => { const s = window.LD.state
  const at = (n, lvl) => { s.rollUpgrades = n; s.breakRebuyables = lvl ? { rollCostDown: lvl } : {}
    return window.LD.rollCost(s).toString() }
  // In log10, because these numbers are past what a double can hold and
  // Number("4e67578") is Infinity, which compares equal to itself.
  const lg = (n, lvl) => { s.rollUpgrades = n; s.breakRebuyables = lvl ? { rollCostDown: lvl } : {}
    return window.LD.rollCost(s).log10() }
  const out = { belowPlain: at(10, 0), belowMaxed: at(10, 8),
                overPlain: lg(600, 0), overMaxed: lg(600, 8) }
  s.rollUpgrades = 0; s.breakRebuyables = {}
  return out })()`)
check('SHORTER ODDS leaves the price below the wall alone',
  odds.belowMaxed === odds.belowPlain, JSON.stringify([odds.belowPlain, odds.belowMaxed]))
check('SHORTER ODDS cuts the climb past the wall',
  odds.overMaxed < odds.overPlain - 1000,
  `1e${Math.round(odds.overPlain)} -> 1e${Math.round(odds.overMaxed)} at level 600`)

// And the wall itself: the price climb has to steepen past 1.8e308, or a
// broken run has nothing to push against. Ten levels either side of it.
const wall = await ev(`(() => { const s = window.LD.state
  s.breakRebuyables = {}
  const at = n => { s.rollUpgrades = n; return window.LD.rollCost(s).log10() }
  // The step between consecutive levels is flat below the wall and grows past
  // it, which is the whole of AD's 0.5 e (e+1) log(scale) term.
  const below = at(101) - at(100)
  // A second step, away from the first and still below the wall, so flatness
  // is measured rather than compared against a number written down here. The
  // multiplier itself is a balance dial and has moved before.
  const alsoBelow = at(151) - at(150)
  const over = at(601) - at(600)
  s.rollUpgrades = 0
  return { below, alsoBelow, over } })()`)
check('below the wall the climb is flat, whatever the multiplier is set to',
  Math.abs(wall.below - wall.alsoBelow) < 1e-9 && wall.below > 0,
  `x${Math.pow(10, wall.below).toFixed(2)} a level`)
check('past the wall the climb itself steepens', wall.over > wall.below * 100,
  `${wall.below.toFixed(3)} -> ${wall.over.toFixed(3)} orders a level`)

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

// THE COUNT, which is what makes this layer reachable at all. Antimatter
// Dimensions' infinitiedMult shape, 1 + log10(count) * 4, applied to the
// payout rather than to production. Without it a Wager pays a flat one and the
// grind to the 0.1 second autobuyer is thirty hours of an unchanging minute;
// with it the simulation breaks at four hours and nineteen minutes.
const count = await ev(`(() => { const s = window.LD.state, D = window.LD.Decimal
  s.broke = false; s.chipMult = 0; s.wagers = 100
  s.chipUpgrades = window.LD.upgradeIds().filter(id => id !== 'wagerChips')
  const off = window.LD.chipsFrom(s).toString()
  s.chipUpgrades = window.LD.upgradeIds()
  const on = window.LD.chipsFrom(s).toString()
  return { off, on } })()`)
// 1 + log10(100) * 4 = 9, and the payout floors to a whole chip.
check('THE COUNT pays by Wagers called',
  Number(count.off) === 1 && Number(count.on) === 9, JSON.stringify(count))

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
