// Challenge and autobuyer tests, against the dev server.
//
//   npm run test:challenge
import { spawn } from 'node:child_process'
import { appReady, guard, sweepStale, tabOffered } from './harness.mjs'
import { mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
const profile = mkdtempSync(join(tmpdir(), 'ld-cl-'))
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
  ws.onmessage=m=>{const x=JSON.parse(m.data);const q=pending.get(x.id);if(q){pending.delete(x.id);q.res(x.result)}}}}catch{} if(!ws)await sleep(150)}
const send=(m,p={})=>new Promise(res=>{const n=++id;pending.set(n,{res});ws.send(JSON.stringify({id:n,method:m,params:p}))})
const ev=async e=>{const r=await send('Runtime.evaluate',{expression:e,returnByValue:true,awaitPromise:true})
  if(r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description); return r.result?.value}
await send('Emulation.setFocusEmulationEnabled',{enabled:true})
await send('Page.enable');await send('Runtime.enable')
const res=[];const check=(n,ok,d='')=>{res.push(ok);console.log(`${ok?'PASS':'FAIL'}  ${n}${d?'  '+d:''}`)}
const tab = (name) => `[...document.querySelectorAll('.tab, .subtab')].find(t => t.textContent === '${name}')`

// Start from nothing. A run interrupted part way leaves its browser alive and
// holding this port, and the next run then attaches to it and inherits a save
// it never made, which is how this suite reported a challenge cleared before
// it had done anything.
await send('Page.navigate',{url:'http://127.0.0.1:5173/'})
 await appReady(ev)
await ev(`(() => { localStorage.clear(); localStorage.setItem = () => {} })()`)
await send('Page.navigate',{url:'http://127.0.0.1:5173/'})
 await appReady(ev)

// These exercise the mechanics, not the confirm-once in front of them, which
// has its own suite. Without this every reset here would need two clicks.
await ev(`(() => { const c = window.LD.state.options.confirms\n  for (const k of Object.keys(c)) c[k] = false })()`)
await sleep(150)

check('challenges hidden before the first wager',
  await ev(`!${tab('CHALLENGES')} || ${tab('CHALLENGES')}.hidden`))

// Reach the threshold and take the Wager.
await ev(`(() => { const s = window.LD.state, D = window.LD.Decimal
  // Both, because the Wager is measured on what the run earned.
  s.ink = new D('1.8e308'); s.inkThisWager = new D('1.8e308') })()`)
await sleep(150)
await ev(`${tab('WAGER')}.click()`); await sleep(150)
await ev(`document.querySelector('.wager-now').click()`)
await sleep(150)
const first = await ev(`({ done: window.LD.state.challengesDone.slice(),
  auto: window.LD.state.autobuyers.solid1.unlocked })`)
check('the first wager clears challenge 1', first.done.includes(1), JSON.stringify(first.done))
check('and unlocks the first solid autobuyer', first.auto === true)
check('challenges tab now shows', await ev(tabOffered('CHALLENGES')))
check('automation tab now shows', await ev(tabOffered('AUTOMATION')))

// Enter challenge 7, which cuts the chain to six solids.
await ev(`${tab('CHALLENGES')}.click()`); await sleep(150)
// The first solid's autobuyer is unlocked by now and would buy during the
// reset, so it is switched off for this check and back on afterwards.
await ev(`(() => { const s = window.LD.state, D = window.LD.Decimal
  s.autobuyers.solid1.on = false
  s.studies = 5; s.solids.forEach(d => { d.bought = 20; d.amount = new D(500) }) })()`)
await ev(`[...document.querySelectorAll('.pane:not([hidden]) .tile')][6].click()`)
await sleep(150)
const inC7 = await ev(`({ running: window.LD.state.challengeRunning,
  studies: window.LD.state.studies, bought: window.LD.state.solids.reduce((a,d)=>a+d.bought,0) })`)
// The seed is not a leftover: a Wager has been called by now, so every die
// rolls itself, and a reset that left the table empty would leave the
// automation with nothing to roll. resetTable has seeded it since the
// automator existed; the Wager granting that automation is what makes this
// path reachable in the suite.
check('entering a challenge resets layer 0',
  inC7.running === 7 && inC7.studies === 0 && inC7.bought <= 10,
  JSON.stringify(inC7))

// Entering reset the studies, so the cap only shows once enough are taken to
// unlock past six.
await ev(`(() => { const s = window.LD.state; s.autobuyers.solid1.on = true; s.studies = 5 })()`)
await ev(`${tab('TABLE')}.click()`); await sleep(150)
const shown = await ev(`[...document.querySelectorAll('.solid')].filter(r => !r.hidden).length`)
check('challenge 7 cuts the chain to six solids', shown === 6, `${shown} rows shown`)

// Clear it by reaching the threshold inside it.
await ev(`(() => { const s = window.LD.state, D = window.LD.Decimal
  // Both, because the Wager is measured on what the run earned.
  s.ink = new D('1.8e308'); s.inkThisWager = new D('1.8e308') })()`)
await sleep(150)
await ev(`${tab('WAGER')}.click()`); await sleep(150)
await ev(`document.querySelector('.wager-now').click()`)
await sleep(150)
const cleared = await ev(`({ done: window.LD.state.challengesDone.slice(),
  running: window.LD.state.challengeRunning, auto: window.LD.state.autobuyers.solid7.unlocked })`)
check('clearing a challenge inside it awards its autobuyer',
  cleared.done.includes(7) && cleared.running === 0 && cleared.auto === true, JSON.stringify(cleared))

// An unlocked autobuyer has to actually buy.
await ev(`(() => { const s = window.LD.state, D = window.LD.Decimal
  s.ink = new D('1e30'); s.solids.forEach(d => { d.bought = 0; d.amount = new D(0) }) })()`)
const boughtBefore = await ev(`window.LD.state.solids[0].bought`)
await sleep(2500)
const boughtAfter = await ev(`window.LD.state.solids[0].bought`)
check('an unlocked autobuyer buys on its own', boughtAfter > boughtBefore,
  `${boughtBefore} -> ${boughtAfter}`)

// And upgrading it costs chips and shortens the interval.
await ev(`(() => { const s = window.LD.state, D = window.LD.Decimal; s.chips = new D(50) })()`)
await ev(`${tab('AUTOMATION')}.click()`); await sleep(150)
const beforeUp = await ev(`({ level: window.LD.state.autobuyers.solid1.level,
  chips: Number(window.LD.state.chips),
  every: window.LD.state.autobuyers.solid1.level })`)
// Cost doubles per level, so it is derived rather than assumed to be 1.
const expectCost = Math.pow(2, beforeUp.level)
// Scoped to the autobuyer list. The automator sits above it in its own
// section with the same row markup, and an unscoped query finds that first.
await ev(`(() => {
  const list = [...document.querySelectorAll('.section')]
    .find(x => x.textContent.startsWith('AUTO BUY'))
  const b = [...list.querySelectorAll('.auto-up')].find(x => !x.disabled)
  if (b) b.click()
})()`)
await sleep(150)
const afterUp = await ev(`({ level: window.LD.state.autobuyers.solid1.level, chips: Number(window.LD.state.chips) })`)
check('upgrading an autobuyer spends the doubling cost and shortens it',
  afterUp.level === beforeUp.level + 1 && afterUp.chips === beforeUp.chips - expectCost,
  `${JSON.stringify(beforeUp)} -> ${JSON.stringify(afterUp)}, cost ${expectCost}`)

// The two reset autobuyers take a cap, which is the only autobuyer setting
// Antimatter Dimensions gives and the only one worth giving: a reset is the
// only purchase you can want to stop making. Its condition, from
// dimboost-autobuyer.js, is an OR rather than an AND, so the folio rule lifts
// the study cap instead of narrowing it.
const limits = await ev(`(() => { const s = window.LD.state
  const a = s.autobuyers.study
  const out = {}
  s.studies = 5; s.folios = 0
  a.limitOn = false
  out.uncapped = window.LD.autoAllowed(s, 'study')
  a.limitOn = true; a.limitAt = 5
  out.atTheCap = window.LD.autoAllowed(s, 'study')
  a.limitAt = 6
  out.underTheCap = window.LD.autoAllowed(s, 'study')
  a.limitAt = 5; a.untilOn = true; a.untilFolios = 3
  out.cappedFewFolios = window.LD.autoAllowed(s, 'study')
  s.folios = 3
  out.capLiftedByFolios = window.LD.autoAllowed(s, 'study')
  // The folio autobuyer has the cap and not the lift.
  const f = s.autobuyers.folio
  f.limitOn = true; f.limitAt = 3
  out.folioAtTheCap = window.LD.autoAllowed(s, 'folio')
  f.limitAt = 4
  out.folioUnderTheCap = window.LD.autoAllowed(s, 'folio')
  // And a solid autobuyer has neither, so nothing can stop it.
  out.solidAlwaysAllowed = window.LD.autoAllowed(s, 'solid1')
  a.limitOn = false; a.untilOn = false; f.limitOn = false
  return out })()`)
check('a reset autobuyer stops at its cap',
  limits.uncapped === true && limits.atTheCap === false && limits.underTheCap === true,
  JSON.stringify(limits))
check('and enough folios lift the study cap rather than narrowing it',
  limits.cappedFewFolios === false && limits.capLiftedByFolios === true,
  JSON.stringify(limits))
check('the folio autobuyer takes a cap and no lift',
  limits.folioAtTheCap === false && limits.folioUnderTheCap === true,
  JSON.stringify(limits))
check('and a solid autobuyer takes neither', limits.solidAlwaysAllowed === true)

// The two master switches. Each is a gate over a group that keeps every
// switch inside it exactly as it was, so turning one back on puts the table
// where it stood rather than where the defaults put it.
const masters = await ev(`(async () => {
  const s = window.LD.state, D = window.LD.Decimal
  const sleep = (ms) => new Promise(r => setTimeout(r, ms))
  const out = {}

  // Every autobuyer running, one of them deliberately switched off.
  for (const k of Object.keys(s.autobuyers)) { s.autobuyers[k].unlocked = true; s.autobuyers[k].on = true }
  s.autobuyers.rollRate.on = false
  s.autobuyersOn = true
  s.ink = new D('1e40'); s.solids.forEach(d => { d.amount = new D(100) })
  const before = s.solids.reduce((a, d) => a + d.bought, 0)
  await sleep(900)
  out.runningWithItOn = s.solids.reduce((a, d) => a + d.bought, 0) > before

  s.autobuyersOn = false
  s.ink = new D('1e40')
  const stopped = s.solids.reduce((a, d) => a + d.bought, 0)
  await sleep(900)
  out.stoppedWithItOff = s.solids.reduce((a, d) => a + d.bought, 0) === stopped
  // And it forgot nothing while it was off.
  out.keptEachSwitch = s.autobuyers.rollRate.on === false && s.autobuyers.solid1.on === true
  s.autobuyersOn = true

  // The dice master, over the ladder rather than only over the automator.
  s.autoRoll = false; s.autoDice = 3; s.autoDiceOff = []; s.autoRollOn = true
  s.rollUpgrades = 0
  s.inkThisWager = new D(0)
  await sleep(1400)
  out.laddderRollsWithItOn = s.inkThisWager.gt(0)
  s.autoRollOn = false
  await sleep(1400)
  s.inkThisWager = new D(0)
  await sleep(1400)
  out.ladderStopsWithItOff = s.inkThisWager.eq(0)
  s.autoRollOn = true
  return out })()`)
check('the autobuyer master runs them with it on', masters.runningWithItOn === true,
  JSON.stringify(masters))
check('and stops all of them with it off', masters.stoppedWithItOff === true,
  JSON.stringify(masters))
check('and forgets nobody\'s own switch while it is off', masters.keptEachSwitch === true,
  JSON.stringify(masters))
check('the roll master covers the ladder, not just the automator',
  masters.laddderRollsWithItOn === true && masters.ladderStopsWithItOff === true,
  JSON.stringify(masters))

// The second challenge, which is AD's C2 and now has AD's shape.
//
// Its chall2Pow goes to zero on a purchase and climbs back to one over three
// minutes, multiplying every dimension's production the whole way. What was
// here instead stopped production dead for the full three minutes and refused
// to let you roll at all, which is the same sentence and a different game.
const halt = await ev(`(() => { const s = window.LD.state, D = window.LD.Decimal
  window.LD.actions.enterChallenge(2)
  s.ink = new D('1e12'); s.solids[0].amount = new D(1000); s.solids[0].bought = 10
  s.haltMs = 0
  const full = window.LD.chargeBack(s)
  // Any purchase drops it to nothing.
  window.LD.actions.buySolid(1, true)
  const after = { charge: window.LD.chargeBack(s), ms: s.haltMs }
  // Half way back at ninety seconds, all the way at three minutes.
  s.haltMs = 90000
  const half = window.LD.chargeBack(s)
  s.haltMs = 0
  const back = window.LD.chargeBack(s)
  return { full, after, half, back } })()`)
check('a purchase in challenge 2 takes production to nothing',
  halt.full === 1 && halt.after.charge === 0 && halt.after.ms === 180000,
  JSON.stringify(halt))
check('and it climbs back linearly over three minutes',
  Math.abs(halt.half - 0.5) < 0.001 && halt.back === 1, JSON.stringify(halt))

// It scales production rather than stopping it, and it never stops you playing.
const during = await ev(`(async () => { const s = window.LD.state, D = window.LD.Decimal
  s.haltMs = 90000
  s.ink = new D(0); s.solids[0].amount = new D(1000); s.solids[0].bought = 10
  const rolled = window.LD.actions.roll() !== false
  await new Promise(r => setTimeout(r, 1200))
  const paid = s.ink.gt(0)
  return { rolled, paid, ink: s.ink.toString() } })()`)
check('and the table still rolls while it recovers', during.rolled === true,
  JSON.stringify(during))
check('and still pays, at a fraction rather than nothing', during.paid === true,
  JSON.stringify(during))
await ev(`window.LD.actions.exitChallenge()`)

ws.close();chrome.kill();await sleep(150);try{rmSync(profile,{recursive:true,force:true})}catch{}
console.log(`\n${res.filter(Boolean).length}/${res.length} passed`)
process.exit(res.every(Boolean)?0:1)
