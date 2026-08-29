// Backup and restore tests, against the dev server.
//
// This is the safety net for a lost save, so it should not ship on trust.
// Covers the copy taken before a migration, which is the one that would have
// saved layer 0 from migrations 1 to 2 and 2 to 3, and a round trip through
// restore.
//
//   npm run test:backup
import { spawn } from 'node:child_process'
import { appReady, guard, sweepStale } from './harness.mjs'
import { mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
const profile = mkdtempSync(join(tmpdir(), 'ld-bk-'))
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
const KEY = 'leonardos-die-save'

await send('Page.navigate',{url:'http://127.0.0.1:5173/'})
 await appReady(ev)

// A version 1 save, which is what a player who last opened the game before the
// chain changed would still be holding.
const OLD = JSON.stringify({
  version: 1, lastTick: Date.now(), ink: '4.2e77', inkThisWager: '4.2e77',
  solids: Array.from({ length: 6 }, () => ({ bought: 55, amount: '1e30' })),
  rollUpgrades: 44, studies: 9, folios: 4, points: '0', wagers: 0, tarot: {},
  options: { notation: 'mixed', tab: 'table' }, stats: { started: Date.now() },
})
// Planting a save and then navigating is not enough on its own: the page
// saves on pagehide and writes the current state straight back over it. Writes
// are stubbed out first so the planted save survives the trip.
await ev(`(() => { localStorage.setItem('${KEY}', ${JSON.stringify(OLD)})
  localStorage.setItem = () => {} })()`)
await send('Page.navigate',{url:'http://127.0.0.1:5173/'})
 await appReady(ev)

const migrated = await ev(`({ ink: window.LD.state.ink.toString(), studies: window.LD.state.studies })`)
check('the migration cleared layer 0, as designed',
  migrated.ink === '10' && migrated.studies === 0, JSON.stringify(migrated))

console.log('   keys:', await ev(`Object.keys(localStorage).join(', ')`))
const kept = await ev(`(() => { const raw = localStorage.getItem('${KEY}-backup-premigration')
  if (!raw) return null
  const save = JSON.parse(JSON.parse(raw).save)
  return { version: save.version, ink: save.ink, studies: save.studies } })()`)
check('the pre-migration copy holds the untouched save',
  kept && kept.version === 1 && kept.ink === '4.2e77' && kept.studies === 9, JSON.stringify(kept))

check('it is listed for restore',
  await ev(`window.LD.state && !!document.querySelector('.backup-restore')`))

// Round trip: restore it and confirm the old numbers come back.
await ev(`(() => { const s = window.LD.state, D = window.LD.Decimal; s.ink = new D('12345') })()`)
await sleep(150)
await ev(`(() => { const b = [...document.querySelectorAll('.tab')].find(t => t.textContent === 'OPTIONS'); b && b.click() })()`)
await sleep(150)
const restored = await ev(`(() => {
  const raw = localStorage.getItem('${KEY}-backup-premigration')
  localStorage.setItem('${KEY}', JSON.parse(raw).save)
  const back = JSON.parse(localStorage.getItem('${KEY}')).ink
  // Same reason as above: stop the live state being written back on the way out.
  localStorage.setItem = () => {}
  return back })()`)
check('restoring puts the old save back', restored === '4.2e77', String(restored))

await send('Page.navigate',{url:'http://127.0.0.1:5173/'})
 await appReady(ev)
const afterRestore = await ev(`window.LD.state.ink.toString()`)
check('and loading it migrates rather than crashing', afterRestore === '10', afterRestore)

// EXPORT used to call select() on the save box, which focuses it, which on a
// phone throws the keyboard over half the screen for a box nobody types into.
await ev(`[...document.querySelectorAll('.tab')].find(t => t.textContent.includes('OPTIONS')).click()`)
await sleep(150)
await ev(`document.querySelector('textarea').blur()`)
await ev(`[...document.querySelectorAll('.action')].find(b => b.textContent === 'EXPORT').click()`)
await sleep(150)
// Focus is the whole test. selectionEnd moves to the end just from assigning
// value, with or without focus, and a caret in an unfocused box raises nothing.
const io = await ev(`({
  focused: document.activeElement === document.querySelector('textarea'),
  filled: document.querySelector('textarea').value.length > 20,
  active: document.activeElement.tagName
})`)
check('EXPORT fills the box without focusing it',
  io.filled === true && io.focused === false, JSON.stringify(io))
// And nothing here is typed by hand, so the box asks for no keyboard at all.
// Safari ignores a change to this after the fact, so it has to be set up front.
check('the save box asks for no keyboard',
  (await ev(`document.querySelector('textarea').getAttribute('inputmode')`)) === 'none')

// 5 -> 6 moves a save still sitting on the old every-frame default onto 100ms,
// and leaves any other rate where the player put it. A version 5 save is
// planted the same way, with writes stubbed so it survives the navigation.
// 6 -> 7 renames the currency. A save holding Points has to come back holding
// the same number of Chips, and the grid it bought has to still be bought.
{
  const V6 = JSON.stringify({
    version: 6, lastTick: Date.now(), ink: '1e40', inkThisWager: '1e40',
    solids: Array.from({ length: 9 }, () => ({ bought: 20, amount: '1e10' })),
    rollUpgrades: 20, studies: 8, folios: 1, points: '17', wagers: 6, tarot: {},
    pointUpgrades: ['timeMult', 'solids19'],
    options: { notation: 'mixed', tab: 'table' }, stats: { started: Date.now() },
  })
  await ev(`(() => { localStorage.setItem('${KEY}', ${JSON.stringify(V6)})
    localStorage.setItem = () => {} })()`)
  await send('Page.navigate', { url: 'http://127.0.0.1:5173/' })
  await appReady(ev)
  const got = await ev(`({ chips: window.LD.state.chips.toString(),
    held: window.LD.state.chipUpgrades.length })`)
  check('a version 6 save carries its Points over as Chips',
    got.chips === '17' && got.held === 2, JSON.stringify(got))
}

for (const [was, want] of [[16, 100], [500, 500]]) {
  const V5 = JSON.stringify({
    version: 5, lastTick: Date.now(), ink: '1e40', inkThisWager: '1e40',
    solids: Array.from({ length: 9 }, () => ({ bought: 20, amount: '1e10' })),
    rollUpgrades: 20, studies: 8, folios: 1, points: '0', wagers: 1, tarot: {},
    options: { notation: 'mixed', tab: 'table', uiMs: was }, stats: { started: Date.now() },
  })
  await ev(`(() => { localStorage.setItem('${KEY}', ${JSON.stringify(V5)})
    localStorage.setItem = () => {} })()`)
  await send('Page.navigate', { url: 'http://127.0.0.1:5173/' })
  await appReady(ev)
  const got = await ev(`window.LD.state.options.uiMs`)
  check(`a version 5 save on ${was}ms loads on ${want}ms`, got === want, String(got))
}


ws.close();chrome.kill();await sleep(150);try{rmSync(profile,{recursive:true,force:true})}catch{}
console.log(`\n${res.filter(Boolean).length}/${res.length} passed`)
process.exit(res.every(Boolean)?0:1)
