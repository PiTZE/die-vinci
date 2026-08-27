// The archive and the help section must not describe a system the player has
// not met. Without gating, both are a table of contents for the whole game:
// ten minutes in you could read "call the Wager", "bind a folio" and "clear a
// challenge" and know the shape of everything ahead.
import { spawn } from 'node:child_process'
import { guard, sweepStale } from './harness.mjs'
import { mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
const profile = mkdtempSync(join(tmpdir(), 'ld-spoil-'))
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
await send('Page.navigate',{url:'http://127.0.0.1:5173/'}); await sleep(4500)
await ev(`localStorage.clear()`); await send('Page.reload'); await sleep(3500)

// On screen, not merely present. getComputedStyle(child).display does not
// inherit 'none' from a hidden ancestor, so a check on the heading alone
// reports every topic as visible while its section is hidden.
async function shown(tab, sel) {
  await ev(`[...document.querySelectorAll('.tab')].find(t => t.textContent.trim() === '${tab}').click()`)
  await sleep(450)
  return ev(`[...document.querySelectorAll('${sel}')]
    .filter(n => n.getBoundingClientRect().height > 0)
    .map(n => n.textContent.trim()).join(' | ')`)
}

/** Everything the pane holds, visible or not. A sealed entry is on screen now,
 *  so the test has to prove the words are absent from the document rather than
 *  merely out of view. */
async function everything(tab) {
  await ev(`[...document.querySelectorAll('.tab')].find(t => t.textContent.trim() === '${tab}').click()`)
  await sleep(450)
  return ev(`document.querySelector('.pane:not([hidden])').textContent`)
}

/** Words that give away a system the player has not reached. */
const AHEAD = ['Wager', 'folio', 'Folio', 'challenge', 'Challenge', 'autobuyer', 'Autobuyer', 'point']

const freshHelp = await shown('HELP', '.help-head')
const freshHelpAll = await everything('HELP')
check('a fresh save reads no topic about anything ahead',
  !AHEAD.some((w) => freshHelp.includes(w)), freshHelp)
check('and those words are not in the document at all',
  !AHEAD.some((w) => freshHelpAll.includes(w)),
  AHEAD.filter((w) => freshHelpAll.includes(w)).join(',') || 'none present')
check('sealed topics are shown, redacted, not removed',
  freshHelp.includes('\u2593'), freshHelp)

// The blocks have to move, and to be a texture rather than one repeated glyph.
const first = await ev(`document.querySelector('.archive-cell.sealed, .help-head.sealed')
  ? document.querySelector('.help-head.sealed span').textContent : ''`)
await sleep(700)
const second = await ev(`document.querySelector('.help-head.sealed')
  ? document.querySelector('.help-head.sealed span').textContent : ''`)
check('the redaction animates', first !== '' && second !== '' && first !== second,
  `${JSON.stringify(first)} -> ${JSON.stringify(second)}`)
check('and is a texture, not one repeated block',
  new Set([...first.replace(/ /g, '')]).size > 1, JSON.stringify(first))

check('and still has the ones it needs',
  ['ROLLING', 'THE TABLE', 'ROLL RATE', 'KEYS'].every((t) => freshHelp.includes(t)), freshHelp)

const freshArchive = await shown('ARCHIVE', '.archive-cell')
const freshArchiveAll = await everything('ARCHIVE')
check('and no archive entry about anything ahead',
  !AHEAD.some((w) => freshArchive.includes(w)), freshArchive.slice(0, 100))
check('nor anywhere in the archive document',
  !AHEAD.some((w) => freshArchiveAll.includes(w)),
  AHEAD.filter((w) => freshArchiveAll.includes(w)).join(',') || 'none present')
check('sealed entries are redacted rather than removed',
  (await ev(`document.querySelectorAll('.archive-cell.sealed').length`)) > 8)
check('and the count says how many are held back',
  /still sealed/.test(freshArchiveAll))

// A study reveals the topics a study is about, without touching the rest.
await ev(`(() => { const s = window.LD.state; s.studies = 3; s.autoRoll = true })()`)
await sleep(700)
const midHelp = await shown('HELP', '.help-head')
check('a study opens the automator and the resets',
  midHelp.includes('THE AUTOMATOR') && midHelp.includes('STUDY AND FOLIO'), midHelp)
check('but not the Wager, challenges or autobuyers',
  !midHelp.includes('THE WAGER') && !midHelp.includes('CHALLENGES') && !midHelp.includes('AUTOBUYERS'),
  midHelp)

await ev(`(() => { const s = window.LD.state; s.wagers = 1; s.challengesDone = [1] })()`)
await sleep(700)
const lateHelp = await shown('HELP', '.help-head')
check('a Wager opens the rest',
  ['THE WAGER', 'CHALLENGES', 'AUTOBUYERS'].every((t) => lateHelp.includes(t)), lateHelp)
const lateArchive = await shown('ARCHIVE', '.archive-cell')
// Sealed entries are on screen either way now, so the length barely moves.
// What changes is how many are still redacted.
const stillSealed = await ev(`document.querySelectorAll('.archive-cell.sealed').length`)
check('and the archive fills in behind it',
  lateArchive.includes('Wager') && stillSealed < 5,
  `${stillSealed} entries still sealed after a Wager`)

ws.close();chrome.kill();await sleep(300);try{rmSync(profile,{recursive:true,force:true})}catch{}
console.log(`\n${res.filter(Boolean).length}/${res.length} passed`)
process.exit(res.every(Boolean)?0:1)
