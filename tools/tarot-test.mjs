// Tarot: the weighting, the draft, and that a card changes the engine rather
// than only being marked as held.
import { spawn } from 'node:child_process'
import { appReady, guard, openTab, sweepStale, tabOffered } from './harness.mjs'
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
  (await ev(`(() => { const t = [...document.querySelectorAll('.tab, .subtab')].find(x => x.textContent.trim() === 'TAROT')
    return !t || t.hidden })()`)) === true)

// A Wager pays a draft, and the first one interrupts.
await ev(`(() => { const s = window.LD.state, D = window.LD.Decimal
  s.ink = new D('1.8e308'); s.inkThisWager = new D('1.8e308')
  s.solids.forEach(d => { d.bought = 30; d.amount = new D(1000) })
  s.studies = 8; s.options.confirms.wager = false })()`)
await sleep(300)
await ev(`window.LD.actions.wager()`)
await sleep(400)
const afterWager = await ev(`({ offered: window.LD.state.pendingDraft.length,
  progress: window.LD.state.draftProgress })`)
check('a Wager pays a draft', afterWager.offered >= 3 && afterWager.progress === 1,
  JSON.stringify(afterWager))

await ev(openTab('TAROT'))
await sleep(400)
const offer = await ev(`document.querySelectorAll('.arcana-pick').length`)
check('the draft shows the choice', offer >= 3, `${offer} on offer`)

// The button takes whichever card is facing you. A tap on a card brings it
// round instead: on a ring that turns, the card under your finger a moment
// ago is not the one under it now.
const took = await ev(`(() => {
  const seats = [...document.querySelectorAll('.arcana-seat')]
  const front = seats.find(x => x.style.transform.includes('translate3d(0px,')) ?? seats[0]
  const id = front.querySelector('[data-arcana]').dataset.arcana
  document.querySelector('.arcana-take').click()
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

// A card that is full is not offered. Drafting one was a Wager spent on a level
// that changed nothing. Every card stops at nine, the same nine as the solids
// and the archive rows, so "full" is one number rather than a lookup.
const caps = await ev(`(() => {
  const s = window.LD.state
  const out = {}
  s.tarot = {}
  for (const a of window.LD.ARCANA) s.tarot[a.id] = a.max
  s.pendingDraft = []
  out.offerWhenAllFull = window.LD.drawOffer(s, 3, () => 0.5).length
  s.tarot = { sun: 8 }; out.offeredAtEight = window.LD.weightOf(s, 'sun') > 0
  s.tarot = { sun: 9 }; out.offeredAtNine = window.LD.weightOf(s, 'sun') > 0
  out.caps = [...new Set(window.LD.ARCANA.map(a => a.max))]
  // A level past the cap cannot outrun it, which covers saves written before
  // the caps existed and anything the dev cheat handed out.
  s.tarot = { magician: 40 }
  out.overCapReadsAs = window.LD.levelOf(s, 'magician')
  // And taking one is refused even if a stale draft still offers it.
  s.tarot = { sun: 9 }; s.pendingDraft = ['sun']
  out.tookWhenFull = window.LD.state.tarot.sun
  return out })()`)
check('a full card is not offered', caps.offeredAtEight === true && caps.offeredAtNine === false,
  JSON.stringify({ eight: caps.offeredAtEight, nine: caps.offeredAtNine }))
check('and with every card full there is nothing to draft',
  caps.offerWhenAllFull === 0, `${caps.offerWhenAllFull} offered`)
check('every card caps at the same nine',
  JSON.stringify(caps.caps) === '[9]', JSON.stringify(caps.caps))
check('a level past the cap is read as the cap',
  caps.overCapReadsAs === 9, `40 reads as ${caps.overCapReadsAs}`)

// The first draft has to interrupt. draftInterrupts existed and nothing ever
// called it, so the very first card sat behind a tab a new player had no
// reason to open and the mechanic simply never happened for them.
const interrupt = await ev(`(() => {
  const s = window.LD.state, D = window.LD.Decimal
  s.tarot = {}; s.pendingDraft = []; s.options.tab = 'table'
  s.ink = new D('1e309'); s.inkThisWager = new D('1e309')
  window.LD.actions.wager()
  // The pane rather than the group: opening TAROT selects both it and the
  // WAGER group that holds it, and the draft is about the pane.
  const on = [...document.querySelectorAll('.subtab')].find(b => b.getAttribute('aria-selected') === 'true')
  return { pending: s.pendingDraft.length, tab: on?.textContent?.trim() }
})()`)
check('the first draft interrupts and opens the tab',
  interrupt.pending > 0 && /^T/.test(interrupt.tab ?? ''), JSON.stringify(interrupt))

// A save written before meltPower existed decoded it as 0, and the deepest
// solid is multiplied by it. Before a Wager the deepest solid only feeds the
// tier below, so the loss hid; after one it is also the solid that makes the
// ink, and the whole chain produced nothing whatever the dice showed.
const revived = await ev(`(() => {
  const s = window.LD.state, D = window.LD.Decimal
  s.tarot = {}; s.studies = 0; s.folios = 0; s.wagers = 1
  s.solids.forEach(d => { d.amount = new D(0); d.bought = 0 })
  s.solids[0] = { bought: 1, amount: new D(1) }
  const blob = window.LD.exportSave(s)
  // Strip the field the way a save written before it existed would not have it.
  const raw = JSON.parse(atob(blob)); delete raw.meltPower
  const back = window.LD.importSave(btoa(JSON.stringify(raw)), Date.now())
  return { power: back.meltPower.toString(), mult: window.LD.solidMultiplier(back, 1).toString() }
})()`)
check('a save with no meltPower still multiplies by one',
  revived.power === '1', `meltPower ${revived.power}`)
check('so the first solid after a Wager is not zeroed',
  Number(revived.mult) > 0, `x${revived.mult}`)

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

// The draft is dealt onto a ring: dragged with a finger, snapping to whichever
// card is nearest when you let go, and a tap on the one facing you takes it.
await ev(`(() => { const s = window.LD.state
  s.pendingDraft = ['sun','fool','wheel']
  for (const a of window.LD.ARCANA) s.tarot[a.id] = 0 })()`)
await ev(openTab('TAROT'))
await sleep(700)
const ring = await ev(`(() => {
  const stage = document.querySelector('.arcana-offer')
  const seats = [...document.querySelectorAll('.arcana-seat')]
  const box = stage.getBoundingClientRect()
  return { seats: seats.length,
    placed: seats.every(x => /translate3d/.test(x.style.transform)),
    // Every card inside the stage rather than spilling out of it.
    inside: seats.every(x => { const r = x.getBoundingClientRect()
      return r.top >= box.top - 2 && r.bottom <= box.bottom + 2 }),
    // One of them is facing you: the largest, and the only unblurred one.
    sharp: seats.filter(x => !x.style.filter).length } })()`)
check('the draft is dealt onto a ring', ring.seats === 3 && ring.placed === true,
  JSON.stringify(ring))
check('and every card sits inside the stage', ring.inside === true, JSON.stringify(ring))
check('and one of them faces you', ring.sharp === 1, JSON.stringify(ring))

// Dragged, and it lands square rather than wherever the finger stopped.
const dragged = await ev(`(async () => {
  const stage = document.querySelector('.arcana-offer')
  const b = stage.getBoundingClientRect()
  const at = (y) => ({ bubbles: true, pointerId: 7, pointerType: 'touch',
    clientX: b.left + b.width / 2, clientY: y })
  stage.dispatchEvent(new PointerEvent('pointerdown', at(b.top + b.height * 0.7)))
  for (let i = 1; i <= 6; i++) {
    stage.dispatchEvent(new PointerEvent('pointermove', at(b.top + b.height * 0.7 - i * 12)))
    await new Promise(r => setTimeout(r, 30))
  }
  stage.dispatchEvent(new PointerEvent('pointerup', at(b.top + b.height * 0.3)))
  const moved = [...document.querySelectorAll('.arcana-seat')].map(x => x.style.transform)
  // Long enough for the flick to spend itself. A quick swipe carries the ring
  // on by up to a card past where the finger left, so the ease has further to
  // travel than it did when distance was the only thing that moved it.
  await new Promise(r => setTimeout(r, 1600))
  const settled = [...document.querySelectorAll('.arcana-seat')].map(x => x.style.transform)
  await new Promise(r => setTimeout(r, 500))
  const still = [...document.querySelectorAll('.arcana-seat')].map(x => x.style.transform)
  // Square means one card at dead centre: no sideways offset on it.
    // Read back from style.transform, so the browser's own normalisation: it
  // writes 0.0px and hands back 0px.
  const centred = still.filter(t => t.startsWith('translate(-50%, -50%) translate3d(0px,')).length
  return { turned: moved.join() !== settled.join(), stopped: settled.join() === still.join(), centred,
    show: still.map(t => t.slice(t.indexOf('translate3d'), t.indexOf('translate3d') + 26)) } })()`)
check('a drag turns it', dragged.turned === true, JSON.stringify(dragged))
check('and it snaps to the nearest card and stays there',
  dragged.stopped === true && dragged.centred === 1, JSON.stringify(dragged))

// Which way it turns. Down brings the next card round to you, which is the
// direction a ring turns when you pull the card you are reaching for toward
// you, and it was the other way round for a build.
//
// Measured on a ring dealt for this check rather than on one three other
// checks have already turned, so what it reports is the drag and nothing
// else.
const way = await ev(`(async () => { const s = window.LD.state
  s.pendingDraft = ['sun','fool','wheel']
  for (const a of window.LD.ARCANA) s.tarot[a.id] = 0
  await new Promise(r => setTimeout(r, 600))
  const stage = document.querySelector('.arcana-offer')
  const seats = [...document.querySelectorAll('.arcana-seat')]
  const centre = () => seats.findIndex(x => x.style.transform.startsWith('translate(-50%, -50%) translate3d(0px,'))
  const b = stage.getBoundingClientRect()
  const ev2 = (y) => ({ bubbles: true, pointerId: 9, pointerType: 'touch',
    clientX: b.left + b.width / 2, clientY: y })
  // Settled first: the ring turns on its own until it is touched.
  const y0 = b.top + b.height * 0.25
  stage.dispatchEvent(new PointerEvent('pointerdown', ev2(y0)))
  stage.dispatchEvent(new PointerEvent('pointerup', ev2(y0)))
  await new Promise(r => setTimeout(r, 900))
  const before = centre()
  // Past half a card, slowly, which is the long-swipe rule: a gesture over
  // 300ms advances only once it has covered half a card's width.
  const step = Math.round((seats[0].offsetWidth * 0.7) / 5)
  stage.dispatchEvent(new PointerEvent('pointerdown', ev2(y0)))
  for (let i = 1; i <= 5; i++) {
    stage.dispatchEvent(new PointerEvent('pointermove', ev2(y0 + i * step)))
    await new Promise(r => setTimeout(r, 120))
  }
  stage.dispatchEvent(new PointerEvent('pointerup', ev2(y0 + step * 5)))
  // Waited for rather than slept through: the ring eases to its snap, and
  // under load 900ms is not always enough, which reads as no card centred at
  // all rather than as the wrong one.
  for (let i = 0; i < 60 && centre() < 0; i++) await new Promise(r => setTimeout(r, 100))
  return { before, after: centre(), n: seats.length } })()`)
check('dragging down brings the next card round',
  way.after === (way.before + 1) % way.n, JSON.stringify(way))

// A tap on a card brings it round rather than taking it, and the button says
// which card it would take.
const tapped = await ev(`(async () => {
  const seats = [...document.querySelectorAll('.arcana-seat')]
  const front = () => seats.findIndex(x => x.style.transform.includes('translate3d(0px,'))
  const before = front()
  const other = (before + 1) % seats.length
  const name = seats[other].querySelector('.card-name').textContent
  seats[other].querySelector('[data-arcana]').click()
  for (let i = 0; i < 60 && front() !== other; i++) await new Promise(r => setTimeout(r, 100))
  const label = document.querySelector('.arcana-take').textContent
  return { before, after: front(), other, name, label,
    took: window.LD.state.pendingDraft.length } })()`)
check('a tap on a card brings it round rather than taking it',
  tapped.after === tapped.other && tapped.took === 3, JSON.stringify(tapped))
// One word, because the card facing you is the largest thing on the screen
// with its own name written on it, and a button that renamed itself changed
// width every time the ring turned.
check('and the button just says TAKE', tapped.label === 'TAKE', JSON.stringify(tapped))

const took2 = await ev(`(() => {
  const seats = [...document.querySelectorAll('.arcana-seat')]
  const front = seats.find(x => x.style.transform.includes('translate3d(0px,')) ?? seats[0]
  const id = front.querySelector('[data-arcana]').dataset.arcana
  document.querySelector('.arcana-take').click()
  return { id, level: window.LD.state.tarot[id] || 0,
    pending: window.LD.state.pendingDraft.length } })()`)
check('and the button takes it',
  took2.level > 0 && took2.pending === 0, JSON.stringify(took2))

// Drafts bank rather than drop. A Wager called while a choice is still
// waiting used to throw the new one away, so a run of Wagers without opening
// the tab cost every draft but the first.
const banked = await ev(`(() => { const s = window.LD.state, D = window.LD.Decimal
  s.tarot = {}; s.pendingDraft = []; s.draftsOwed = 0
  const wager = () => { s.ink = new D('1e309'); s.inkThisWager = new D('1e309')
    window.LD.actions.wager() }
  wager(); const one = { owed: s.draftsOwed, pending: s.pendingDraft.length }
  wager(); wager()
  const three = { owed: s.draftsOwed, pending: s.pendingDraft.length }
  // Taking one hands over the next straight away.
  const first = s.pendingDraft[0]
  window.LD.actions.takeCard(first)
  const after = { owed: s.draftsOwed, pending: s.pendingDraft.length,
    held: Object.values(s.tarot).reduce((a, b) => a + b, 0) }
  return { one, three, after } })()`)
check('a Wager banks a draft instead of dropping it',
  banked.one.owed === 1 && banked.three.owed === 3, JSON.stringify(banked))
check('and the choice on screen is only ever one of them',
  banked.one.pending >= 3 && banked.three.pending >= 3, JSON.stringify(banked))
// A choice is on offer, not necessarily three of them: taking XVII The Stars
// widens the draft to four, which is the whole of that card.
check('and taking one deals the next',
  banked.after.owed === 2 && banked.after.pending >= 3 && banked.after.held === 1,
  JSON.stringify(banked))

// And they stop at what the deck can still pay out: twenty-two cards at nine
// levels, and nothing past that.
const capped = await ev(`(() => { const s = window.LD.state, D = window.LD.Decimal
  for (const a of window.LD.ARCANA) s.tarot[a.id] = 9
  s.pendingDraft = []; s.draftsOwed = 0
  s.ink = new D('1e309'); s.inkThisWager = new D('1e309')
  window.LD.actions.wager()
  const full = { owed: s.draftsOwed, pending: s.pendingDraft.length }
  // One level short, and exactly one draft is owed.
  s.tarot.sun = 8; s.draftsOwed = 0; s.pendingDraft = []
  s.ink = new D('1e309'); s.inkThisWager = new D('1e309')
  window.LD.actions.wager()
  return { full, room: { owed: s.draftsOwed, pending: s.pendingDraft.length } } })()`)
check('a full deck earns no more drafts',
  capped.full.owed === 0 && capped.full.pending === 0, JSON.stringify(capped))
check('and one level of room earns exactly one',
  capped.room.owed === 1 && capped.room.pending > 0, JSON.stringify(capped))

ws.close();chrome.kill();await sleep(300);try{rmSync(profile,{recursive:true,force:true})}catch{}
console.log(`\n${res.filter(Boolean).length}/${res.length} passed`)
process.exit(res.every(Boolean)?0:1)
