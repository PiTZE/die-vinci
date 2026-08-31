// The codices, against the dev server.
//
// Antimatter Dimensions' Infinity Dimensions are the reference, so the numbers
// checked here are its numbers: each purchase hands over ten, the chain feeds
// itself on a ten-second clock and the currency on a one-second clock, the
// currency is raised to the seventh power against every solid, and a prestige
// keeps the purchases and takes back everything they made.
//
//   npm run test:codices
import { spawn } from 'node:child_process'
import { appReady, guard, sweepStale } from './harness.mjs'
import { mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
const profile = mkdtempSync(join(tmpdir(), 'ld-cdx-'))
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

const tabShown = `[...document.querySelectorAll('.tab')].some(t => t.textContent === 'CODICES' && !t.hidden)`

// Nothing about the second chain exists before the wall comes down, and a
// broken save with a shallow run does not get it either. The gate is depth,
// not the break.
check('the codices tab is not there on a fresh save', (await ev(tabShown)) === false)

await ev(`(() => { const s = window.LD.state, D = window.LD.Decimal
  s.wagers = 40; s.broke = true; s.chips = new D('1e30')
  s.deepestInk = new D('1e308') })()`)
await sleep(250)
check('nor on a broken save whose deepest run stopped at the wall',
  (await ev(tabShown)) === false)

// AD's first Infinity Dimension opens at 1e1100 antimatter against a 1.8e308
// wall. Ours opens past the wall for the same reason: the whole point of the
// ladder is to be a reason to run past it.
const first = await ev(`(() => {
  const s = window.LD.state, D = window.LD.Decimal
  const at = window.LD.codexUnlockAt(1)
  return { past: at.gt(new D('1.7976931348623157e308')), at: at.toString() } })()`)
check('the first codex opens past the wall, as AD s first opens past its own',
  first.past === true, first.at)

await ev(`(() => { const s = window.LD.state, D = window.LD.Decimal
  s.deepestInk = window.LD.codexUnlockAt(1) })()`)
await sleep(250)
check('reaching that depth opens the tab', (await ev(tabShown)) === true)
check('and opens exactly one codex',
  (await ev(`window.LD.openCodices(window.LD.state)`)) === 1)

await ev(`[...document.querySelectorAll('.tab')].find(t => t.textContent === 'CODICES').click()`)
await sleep(250)
const rows = await ev(`(() => { const pane = [...document.querySelectorAll('.pane')].find(p => !p.hidden)
  return { shown: [...pane.querySelectorAll('.codex')].filter(r => !r.hidden).length,
           total: pane.querySelectorAll('.codex').length,
           next: pane.querySelector('.codex-next').textContent } })()`)
check('one row on screen and eight held back', rows.shown === 1 && rows.total === 9,
  JSON.stringify(rows))
check('with the next one named by the depth it wants, not by a price',
  /opens when one run earns/.test(rows.next), rows.next)
// Nothing on the table produces depth. A run ends when the Wager autobuyer
// decides the payout is enough, so how deep it gets is that threshold and
// nothing else, and the rule that sets it lives on another tab. Said only
// when there is an autobuyer to point at: a run called by hand is already as
// deep as the hand let it get.
check('and says nothing about a rule that is not there yet',
  !/AUTOMATION/.test(rows.next), rows.next)
const pointer = await ev(`(async () => { const s = window.LD.state
  s.autobuyers.wager.unlocked = true; s.autobuyers.wager.on = true
  await new Promise(r => setTimeout(r, 300))
  return document.querySelector('.pane:not([hidden]) .codex-next').textContent })()`)
check('and points at the rule that buys depth once it exists',
  /raise that in AUTOMATION/.test(pointer), pointer)

// AD: "Because each ID purchase gives 10 IDs".
const bought = await ev(`(() => { const s = window.LD.state
  const before = { bought: s.codices[0].bought, amount: s.codices[0].amount.toString() }
  window.LD.actions.buyCodex(1)
  return { before, bought: s.codices[0].bought, amount: s.codices[0].amount.toString() } })()`)
check('a purchase hands over ten', bought.bought === 1 && bought.amount === '10',
  JSON.stringify(bought))

// Its own multiplier is power^purchases, and the first codex's power is AD's
// 50 for ID1.
const mult = await ev(`(() => { const s = window.LD.state
  const one = window.LD.codexMultiplier(s, 1).toString()
  window.LD.actions.buyCodex(1)
  return { one, two: window.LD.codexMultiplier(s, 1).toString(), bought: s.codices[0].bought } })()`)
check('and multiplies its own output by fifty a purchase, as AD s first does',
  mult.one === '50' && mult.two === '2500', JSON.stringify(mult))

// The price climbs geometrically, which is the whole reason a bulk buy has a
// closed form.
const price = await ev(`(() => { const s = window.LD.state
  const at = n => { const held = s.codices[0].bought; s.codices[0].bought = n
    const c = window.LD.codexCost(s, 1).toString(); s.codices[0].bought = held; return c }
  return { zero: at(0), one: at(1), two: at(2) } })()`)
check('the price climbs by a fixed ratio a purchase',
  Number(price.one) / Number(price.zero) === Number(price.two) / Number(price.one),
  JSON.stringify(price))

// The engine. ID1 produces the currency per second; everything above it
// produces the tier below on a ten-second clock.
const ticked = await ev(`(() => { const s = window.LD.state, D = window.LD.Decimal
  s.esperienza = new D(1)
  s.codices[0].bought = 1; s.codices[0].amount = new D(10)
  const before = s.esperienza.toString()
  window.LD.tick(s, 1, Date.now())
  return { before, after: s.esperienza.toString() } })()`)
// Ten held at x50 is 500 a second, on top of the one it started at.
check('the first codex pays esperienza per second, at its own multiplier',
  Number(ticked.after) - Number(ticked.before) === 500, JSON.stringify(ticked))

const fed = await ev(`(() => { const s = window.LD.state, D = window.LD.Decimal
  s.deepestInk = window.LD.codexUnlockAt(2)
  window.LD.tick(s, 0.001, Date.now())
  s.codices[1].bought = 1; s.codices[1].amount = new D(10)
  s.codices[0].amount = new D(0)
  window.LD.tick(s, 1, Date.now())
  return { open: window.LD.openCodices(s), first: s.codices[0].amount.toString() } })()`)
// Ten held at x30 is 300 a second, on a clock ten times slower: 30.
check('and a codex feeds the one below it on a ten-second clock',
  fed.open === 2 && Number(fed.first) === 30, JSON.stringify(fed))

// AD's powerConversionRate is 7, applied per dimension so it compounds through
// the chain. Same line, same exponent.
const power = await ev(`(() => { const s = window.LD.state, D = window.LD.Decimal
  s.esperienza = new D(10)
  return { mult: window.LD.esperienzaMultiplier(s).toString() } })()`)
check('esperienza multiplies every solid by its seventh power',
  Number(power.mult) === 1e7, JSON.stringify(power))

const one = await ev(`(() => { const s = window.LD.state, D = window.LD.Decimal
  s.esperienza = new D(1)
  return window.LD.esperienzaMultiplier(s).toString() })()`)
check('and multiplies by nothing at all before any of them are bought', one === '1')

// The half that makes it a progression: AD's InfinityDimensions.resetAmount
// on a crunch drops every dimension to its baseAmount and resets the power.
const kept = await ev(`(() => { const s = window.LD.state, D = window.LD.Decimal
  s.codices[0].bought = 3; s.codices[0].amount = new D('1e40')
  s.esperienza = new D('1e20')
  s.inkThisWager = new D('1e900')
  window.LD.actions.wager()
  return { bought: s.codices[0].bought, amount: s.codices[0].amount.toString(),
    esperienza: s.esperienza.toString() } })()`)
check('a Wager keeps every purchase',  kept.bought === 3, JSON.stringify(kept))
check('and takes back everything they made, down to ten a purchase',
  kept.amount === '30' && kept.esperienza === '1', JSON.stringify(kept))

// The depth a run reached is what opens the next one, so a Wager has to bank
// it before it clears the run's total.
const banked = await ev(`window.LD.state.deepestInk.toString()`)
check('and banks how deep the run got before clearing it',
  Number(banked) >= 1e900 || banked.includes('e+9') || banked.includes('e9'), banked)

// The readout in the bar, which says what the number buys rather than what it
// is. It only appears once a codex does.
const bar = await ev(`(() => {
  const labels = [...document.querySelectorAll('.res')].filter(r => !r.hidden)
    .map(r => r.querySelector('.res-label').textContent)
  return labels })()`)
check('the bar gains an esperienza readout with the first codex',
  bar.includes('ESPERIENZA'), JSON.stringify(bar))

// Three new Decimal fields and an array of pairs, all of which have to survive
// a round trip. meltPower is the cautionary tale: it decoded through a blanket
// `?? 0` and a multiplier of nought turned the whole chain off for anyone
// whose save predated it.
const trip = await ev(`(() => { const s = window.LD.state, D = window.LD.Decimal
  s.codices[0].bought = 4; s.codices[0].amount = new D('1.5e30')
  s.codexOpen = 2; s.esperienza = new D('2.5e40'); s.deepestInk = new D('1e777')
  const back = window.LD.importSave(window.LD.exportSave(s), Date.now())
  return { bought: back.codices[0].bought, amount: back.codices[0].amount.toString(),
    open: back.codexOpen, esperienza: back.esperienza.toString(),
    deepest: back.deepestInk.toString() } })()`)
check('a save carries the codices, the esperienza and the depth',
  trip.bought === 4 && trip.open === 2 && trip.amount === '1.5e+30'
    && trip.esperienza === '2.5e+40' && trip.deepest === '1e+777', JSON.stringify(trip))

// And a save written before any of this existed decodes to a chain that still
// multiplies by one rather than by nothing.
const old = await ev(`(() => { const s = window.LD.state
  const raw = JSON.parse(decodeURIComponent(escape(atob(window.LD.exportSave(s)))))
  delete raw.codices; delete raw.codexOpen; delete raw.esperienza; delete raw.deepestInk
  const blob = btoa(unescape(encodeURIComponent(JSON.stringify(raw))))
  const back = window.LD.importSave(blob, Date.now())
  return { esperienza: back.esperienza.toString(), open: back.codexOpen,
    codices: back.codices.length, deepest: back.deepestInk.toString(),
    mult: window.LD.esperienzaMultiplier(back).toString() } })()`)
check('a save written before the codices existed decodes to a multiplier of one',
  old.esperienza === '1' && old.mult === '1' && old.open === 0 && old.codices === 9
    && old.deepest === '0', JSON.stringify(old))

ws.close();chrome.kill();await sleep(150);try{rmSync(profile,{recursive:true,force:true})}catch{}
console.log(`\n${res.filter(Boolean).length}/${res.length} passed`)
process.exit(res.every(Boolean)?0:1)
