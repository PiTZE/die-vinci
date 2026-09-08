// Every arcanum against its own text.
//
// One check a card, twenty-two of them, and each one asks the engine whether
// the thing the card says it does is the thing it does. Not whether an effect
// fires: whether it is *that* effect. The High Priestess promised the deepest
// solid would pay ink of its own and was in fact a flat multiplier on
// everything, and it had said so since the day it was written, because nothing
// had ever read the two side by side.
//
// The claims below are written from the cards, not from the code. A card whose
// line changes has to fail here until somebody decides which half was wrong.
import { spawn } from 'node:child_process'
import { appReady, guard, sweepStale } from './harness.mjs'
import { mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
const profile = mkdtempSync(join(tmpdir(), 'ld-arc-'))
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

// A table deep enough that every card has something to act on, and the tick
// stopped so nothing moves underneath a measurement.
const SETUP = `(() => { const s = window.LD.state, D = window.LD.Decimal
  s.options.offline = false
  s.wagers = 4; s.studies = 8; s.folios = 2; s.rollUpgrades = 40
  s.chips = new D(0); s.chipUpgrades = []; s.challengesDone = []
  s.autoRoll = false; s.autoRollOn = true; s.autoDice = 0; s.autoDiceOff = []
  s.broke = false; s.haltMs = 0; s.handRollAt = 0; s.rollStartedAt = 0
  s.ink = new D('1e20'); s.inkThisWager = new D('1e20')
  s.stats.sinceResetMs = 60000; s.stats.wagerMs = 60000
  s.solids.forEach((d, i) => { d.bought = 20; d.amount = new D(1000) })
  for (const k of Object.keys(s.autobuyers)) { s.autobuyers[k].unlocked = false }
  s.tarot = {}
  return true })()`

/** The modifier set with one card held at a level, and with none held. */
const withCard = (id, level, expr) =>
  `(() => { const s = window.LD.state
    s.tarot = {}
    const off = (${expr})
    s.tarot = { ${JSON.stringify(id)}: ${level} }
    const on = (${expr})
    s.tarot = {}
    return { off, on } })()`

const M = `window.LD.arcanaModifiers(window.LD.state)`
const num = (v) => Number(v)

await ev(SETUP)
await sleep(200)

// 0 THE FOOL: a folio keeps your studies.
const fool = await ev(`(() => { const s = window.LD.state, D = window.LD.Decimal
  const run = (lvl) => { s.tarot = lvl ? { fool: lvl } : {}
    s.studies = 8; s.folios = 1
    s.solids.forEach((d) => { d.bought = 200; d.amount = new D('1e9') })
    window.LD.actions.buyFolio()
    return s.studies }
  const a = run(0), b = run(3)
  s.tarot = {}
  return { none: a, held: b } })()`)
check('0 THE FOOL: a folio keeps your studies',
  fool.none === 0 && fool.held === 3, JSON.stringify(fool))

await ev(SETUP)

// I THE MAGICIAN: the dice are loaded, and land high.
const magician = await ev(withCard('magician', 5, `(() => {
  const b = window.LD.arcanaModifiers(window.LD.state).faceBias
  return { bias: b, mean: window.LD.meanFace(72, b) } })()`))
check('I THE MAGICIAN: the dice are loaded, and land high',
  magician.off.bias === 0 && magician.on.bias > 0 && magician.on.mean > magician.off.mean,
  JSON.stringify(magician))

// II THE HIGH PRIESTESS: a multiplier on everything that never lapses.
const priestess = await ev(withCard('priestess', 4, `${M}.globalMult.toString()`))
check('II THE HIGH PRIESTESS: a multiplier on everything that never lapses',
  num(priestess.on) > num(priestess.off) && num(priestess.on) === 3,
  JSON.stringify(priestess))

// III THE EMPRESS: largest when your ink is smallest.
const empress = await ev(`(() => { const s = window.LD.state, D = window.LD.Decimal
  s.tarot = { empress: 4 }
  s.ink = new D(1)
  const poor = window.LD.arcanaModifiers(s).globalMult.toString()
  s.ink = new D('1e20')
  const rich = window.LD.arcanaModifiers(s).globalMult.toString()
  s.tarot = {}; s.ink = new D('1e20')
  return { poor, rich } })()`)
check('III THE EMPRESS: a multiplier that is largest when your ink is smallest',
  num(empress.poor) > num(empress.rich) && num(empress.rich) === 1,
  JSON.stringify(empress))

// IV THE EMPEROR: the deepest solid you own is multiplied.
const emperor = await ev(`(() => { const s = window.LD.state
  const deep = s.solids.length, shallow = 1
  s.tarot = {}
  const offDeep = window.LD.solidMultiplier(s, deep).toString()
  const offShallow = window.LD.solidMultiplier(s, shallow).toString()
  s.tarot = { emperor: 3 }
  const onDeep = window.LD.solidMultiplier(s, deep).toString()
  const onShallow = window.LD.solidMultiplier(s, shallow).toString()
  s.tarot = {}
  return { offDeep, onDeep, offShallow, onShallow } })()`)
check('IV THE EMPEROR: the deepest solid you own is multiplied, and only it',
  num(emperor.onDeep) === num(emperor.offDeep) * 16 && emperor.onShallow === emperor.offShallow,
  JSON.stringify(emperor))

// V THE HIEROPHANT: a reset leaves you ink instead of nothing.
const hierophant = await ev(`(() => { const s = window.LD.state, D = window.LD.Decimal
  const run = (lvl) => { s.tarot = lvl ? { hierophant: lvl } : {}
    s.studies = 3; s.solids.forEach((d) => { d.bought = 200; d.amount = new D('1e9') })
    window.LD.actions.buyStudy()
    return s.ink.toString() }
  const none = run(0), held = run(2)
  s.tarot = {}
  return { none, held } })()`)
check('V THE HIEROPHANT: a reset leaves you ink instead of nothing',
  num(hierophant.held) > num(hierophant.none) && num(hierophant.held) >= 1e5,
  JSON.stringify(hierophant))

await ev(SETUP)

// VI THE LOVERS: dice showing the same face pay double.
const lovers = await ev(`(() => { const s = window.LD.state
  s.tarot = {}
  const off = window.LD.arcanaModifiers(s).pairBonus
  s.tarot = { lovers: 2 }
  const on = window.LD.arcanaModifiers(s).pairBonus
  s.tarot = {}
  return { off, on } })()`)
check('VI THE LOVERS: dice showing the same face pay more',
  lovers.off === 0 && lovers.on === 2, JSON.stringify(lovers))

// VII THE CHARIOT: a charge out of the gate, and only out of the gate.
const chariot = await ev(`(() => { const s = window.LD.state
  s.tarot = { chariot: 3 }
  s.stats.sinceResetMs = 1000
  const fresh = window.LD.arcanaModifiers(s).rollRateMult
  s.stats.sinceResetMs = 60000
  const later = window.LD.arcanaModifiers(s).rollRateMult
  s.tarot = {}
  return { fresh, later } })()`)
check('VII THE CHARIOT: a surge after a reset that lapses',
  chariot.fresh > 1 && chariot.later === 1, JSON.stringify(chariot))

// VIII JUSTICE: a reset leaves some of every solid.
const justice = await ev(`(() => { const s = window.LD.state, D = window.LD.Decimal
  const run = (lvl) => { s.tarot = lvl ? { justice: lvl } : {}
    s.studies = 3; s.solids.forEach((d) => { d.bought = 200; d.amount = new D('1e9') })
    window.LD.actions.buyStudy()
    return s.solids.slice(0, 3).map(d => Number(d.amount)) }
  const none = run(0), held = run(4)
  s.tarot = {}
  return { none, held } })()`)
check('VIII JUSTICE: a reset leaves some of every solid',
  justice.none.every(v => v === 0) && justice.held.every(v => v === 4),
  JSON.stringify(justice))

await ev(SETUP)

// IX THE HERMIT: every solid costs less.
const hermit = await ev(withCard('hermit', 5, `${M}.costFactor`))
check('IX THE HERMIT: every solid costs less',
  hermit.off === 1 && hermit.on < 1, JSON.stringify(hermit))

// X WHEEL OF FORTUNE: rerolled, keeping the better face.
const wheel = await ev(withCard('wheel', 3, `${M}.rerolls`))
check('X WHEEL OF FORTUNE: every die is rolled again',
  wheel.off === 0 && wheel.on === 3, JSON.stringify(wheel))

// XI STRENGTH: an exponent on the multipliers rather than a multiplier.
const strength = await ev(`(() => { const s = window.LD.state
  s.tarot = {}
  const off = window.LD.solidMultiplier(s, 1).toString()
  const offExp = window.LD.arcanaModifiers(s).solidExp
  s.tarot = { strength: 5 }
  const on = window.LD.solidMultiplier(s, 1).toString()
  const onExp = window.LD.arcanaModifiers(s).solidExp
  s.tarot = {}
  return { off, on, offExp, onExp } })()`)
check('XI STRENGTH: solid multipliers gain an exponent',
  strength.offExp === 1 && strength.onExp > 1 && num(strength.on) > num(strength.off),
  JSON.stringify(strength))

// XII THE HANGED MAN: a reset keeps some of your roll rate.
const hanged = await ev(`(() => { const s = window.LD.state, D = window.LD.Decimal
  const run = (lvl) => { s.tarot = lvl ? { hanged: lvl } : {}
    s.studies = 3; s.rollUpgrades = 100
    s.solids.forEach((d) => { d.bought = 200; d.amount = new D('1e9') })
    window.LD.actions.buyStudy()
    return s.rollUpgrades }
  const none = run(0), held = run(5)
  s.tarot = {}
  return { none, held } })()`)
check('XII THE HANGED MAN: a reset keeps some of your roll rate',
  hanged.none === 0 && hanged.held === 50, JSON.stringify(hanged))

await ev(SETUP)

// XIII DEATH: melting pays far more.
//
// The card used to be the only way to melt at all. Melting opens on a folio
// now, the way AD opens Dimensional Sacrifice on a boost count, so the card
// makes it stronger rather than making it exist, and its own line says so.
const death = await ev(`(() => { const s = window.LD.state, D = window.LD.Decimal
  s.tarot = {}
  s.folios = 0
  const noFolioNoCard = window.LD.meltUnlocked(s)
  s.folios = 1
  const onAFolio = window.LD.meltUnlocked(s)
  // Through meltGain, which reads the card off the save, because that is what
  // the game itself calls and it is what is exposed.
  s.solids[0].amount = new D('1e12')
  const bare = window.LD.meltGain(s).toNumber()
  s.tarot = { death: 5 }
  const withCard = window.LD.meltGain(s).toNumber()
  s.tarot = {}
  s.folios = 0
  return { noFolioNoCard, onAFolio, bare, withCard } })()`)
check('XIII DEATH: a folio opens melting and the card makes it pay far more',
  death.noFolioNoCard === false && death.onAFolio === true &&
    death.bare > 1 && death.withCard > death.bare * 2,
  JSON.stringify(death))


// XIV TEMPERANCE: roll rate cheaper the deeper the run has gone.
const temperance = await ev(`(() => { const s = window.LD.state, D = window.LD.Decimal
  s.tarot = { temperance: 4 }
  s.inkThisWager = new D(10)
  const shallow = window.LD.arcanaModifiers(s).rollCostFactor
  s.inkThisWager = new D('1e200')
  const deep = window.LD.arcanaModifiers(s).rollCostFactor
  s.tarot = {}; s.inkThisWager = new D('1e20')
  return { shallow, deep } })()`)
check('XIV TEMPERANCE: roll rate cheaper the deeper the run has gone',
  temperance.deep < temperance.shallow && temperance.deep < 1,
  JSON.stringify(temperance))

// XV THE DEVIL: a large multiplier, paid for in roll rate.
const devil = await ev(withCard('devil', 4, `(() => { const m = window.LD.arcanaModifiers(window.LD.state)
  return { mult: m.globalMult.toString(), rate: m.rollRateMult } })()`))
check('XV THE DEVIL: a multiplier bought with roll rate',
  num(devil.on.mult) > num(devil.off.mult) && devil.on.rate < devil.off.rate,
  JSON.stringify(devil))

// XVI THE TOWER: lightning, on a cycle.
const tower = await ev(`(() => { const s = window.LD.state
  s.tarot = { tower: 1 }
  s.stats.wagerMs = 0
  const striking = window.LD.towerStriking(s)
  const hit = window.LD.arcanaModifiers(s).globalMult.toString()
  s.stats.wagerMs = 40000
  const quiet = window.LD.towerStriking(s)
  const rest = window.LD.arcanaModifiers(s).globalMult.toString()
  s.tarot = {}; s.stats.wagerMs = 60000
  return { striking, hit, quiet, rest } })()`)
check('XVI THE TOWER: lightning strikes, and everything pays a hundredfold',
  tower.striking === true && tower.quiet === false
    && num(tower.hit) === num(tower.rest) * 100,
  JSON.stringify(tower))

// XVII THE STARS: the draft offers more.
const stars = await ev(`(() => { const s = window.LD.state
  s.tarot = {}
  const off = window.LD.offerSize(s)
  s.tarot = { stars: 1 }
  const on = window.LD.offerSize(s)
  // And favours what you lack: an unheld card outweighs a held one.
  s.tarot = { stars: 1, sun: 3 }
  const unheld = window.LD.weightOf(s, 'moon')
  const held = window.LD.weightOf(s, 'sun')
  s.tarot = {}
  return { off, on, unheld, held } })()`)
check('XVII THE STARS: the draft offers more, and favours what you lack',
  stars.on === stars.off + 1 && stars.unheld > stars.held, JSON.stringify(stars))

// XVIII THE MOON: time away counts for longer.
const moon = await ev(withCard('moon', 3, `${M}.awayCapMult`))
check('XVIII THE MOON: time away counts for longer',
  moon.off === 1 && moon.on === 4, JSON.stringify(moon))

// XIX THE SUN: everything multiplied, nothing asked.
const sun = await ev(withCard('sun', 3, `(() => { const m = window.LD.arcanaModifiers(window.LD.state)
  return { mult: m.globalMult.toString(), rate: m.rollRateMult, cost: m.costFactor } })()`))
check('XIX THE SUN: everything is multiplied, and nothing is asked',
  num(sun.on.mult) === 5 && sun.on.rate === sun.off.rate && sun.on.cost === sun.off.cost,
  JSON.stringify(sun))

// XX JUDGEMENT: chips held, not chips spent.
const judgement = await ev(`(() => { const s = window.LD.state, D = window.LD.Decimal
  s.tarot = { judgement: 2 }
  s.chips = new D(0)
  const broke = window.LD.arcanaModifiers(s).globalMult.toString()
  s.chips = new D(10)
  const holding = window.LD.arcanaModifiers(s).globalMult.toString()
  s.tarot = {}; s.chips = new D(0)
  return { broke, holding } })()`)
check('XX JUDGEMENT: chips you have not spent multiply production',
  num(judgement.broke) === 1 && num(judgement.holding) > 1, JSON.stringify(judgement))

// XXI THE WORLD: a run begins with more of the table already open.
//
// Asked of how much of the chain is open rather than of how many rows are on
// screen: a row stays on the table while you still hold dice of that solid, so
// counting rows answers a different question and answers it the same both
// ways.
const worldOpen = await ev(`(() => { const s = window.LD.state
  const at = (lvl) => { s.tarot = lvl ? { world: lvl } : {}; s.studies = 0
    return window.LD.unlockedSolids(s) }
  const none = at(0), held = at(3)
  s.tarot = {}; s.studies = 8
  return { none, held } })()`)
check('XXI THE WORLD: a run begins with more of the table already open',
  worldOpen.held === worldOpen.none + 3, JSON.stringify(worldOpen))

// And the deck as a whole: with nothing held, nothing is changed.
const none = await ev(`(() => { const s = window.LD.state
  s.tarot = {}
  const m = window.LD.arcanaModifiers(s)
  return { mult: m.globalMult.toString(), rate: m.rollRateMult, cost: m.costFactor,
    bias: m.faceBias, rerolls: m.rerolls, pairs: m.pairBonus, exp: m.solidExp,
    keepStudies: m.keepStudies, keepSolids: m.keepSolids, away: m.awayCapMult } })()`)
check('and a deck you hold nothing in changes nothing',
  num(none.mult) === 1 && none.rate === 1 && none.cost === 1 && none.bias === 0
    && none.rerolls === 0 && none.pairs === 0 && none.exp === 1
    && none.keepStudies === 0 && none.keepSolids === 0 && none.away === 1,
  JSON.stringify(none))

ws.close();chrome.kill();await sleep(150);try{rmSync(profile,{recursive:true,force:true})}catch{}
console.log(`\n${res.filter(Boolean).length}/${res.length} passed`)
process.exit(res.every(Boolean)?0:1)
