// The archive and the help section must not describe a system the player has
// not met. Without gating, both are a table of contents for the whole game:
// ten minutes in you could read "call the Wager", "bind a folio" and "clear a
// challenge" and know the shape of everything ahead.
import { spawn } from 'node:child_process'
import { appReady, guard, openTab, sweepStale, tabOffered } from './harness.mjs'
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
  ws.onmessage=m=>{const x=JSON.parse(m.data);const q=pending.get(x.id);if(q){pending.delete(x.id);q.res(x.result)}}}}catch{} if(!ws)await sleep(150)}
const send=(m,p={})=>new Promise(res=>{const n=++id;pending.set(n,{res});ws.send(JSON.stringify({id:n,method:m,params:p}))})
const ev=async e=>{const r=await send('Runtime.evaluate',{expression:e,returnByValue:true,awaitPromise:true})
  if(r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description); return r.result?.value}
await send('Emulation.setFocusEmulationEnabled',{enabled:true})
await send('Page.enable');await send('Runtime.enable')
const res=[];const check=(n,ok,d='')=>{res.push(ok);console.log(`${ok?'PASS':'FAIL'}  ${n}${d?'  '+d:''}`)}
await send('Page.navigate',{url:'http://127.0.0.1:5173/'})
 await appReady(ev)
await ev(`localStorage.clear()`); await send('Page.reload')
 await appReady(ev)

// On screen, not merely present. getComputedStyle(child).display does not
// inherit 'none' from a hidden ancestor, so a check on the heading alone
// reports every topic as visible while its section is hidden.
async function shown(tab, sel) {
  await ev(openTab(tab))
  await sleep(150)
  return ev(`[...document.querySelectorAll('${sel}')]
    .filter(n => n.getBoundingClientRect().height > 0)
    .map(n => n.textContent.trim()).join(' | ')`)
}

/** Everything the pane holds, visible or not. A sealed entry is on screen now,
 *  so the test has to prove the words are absent from the document rather than
 *  merely out of view. */
async function everything(tab) {
  await ev(openTab(tab))
  await sleep(150)
  return ev(`document.querySelector('.pane:not([hidden])').textContent`)
}

/** Words that give away a system the player has not reached. */
const AHEAD = ['Wager', 'folio', 'Folio', 'challenge', 'Challenge', 'autobuyer', 'Autobuyer',
  'point', 'codex', 'Codex', 'codices', 'Codices', 'esperienza', 'Esperienza']

const freshHelp = await shown('HELP', '.help-head')
const freshHelpAll = await everything('HELP')
check('a fresh save reads no topic about anything ahead',
  !AHEAD.some((w) => freshHelp.includes(w)), freshHelp)
check('and those words are not in the document at all',
  !AHEAD.some((w) => freshHelpAll.includes(w)),
  AHEAD.filter((w) => freshHelpAll.includes(w)).join(',') || 'none present')
check('sealed topics are shown, redacted, not removed',
  !freshHelp.includes('THE WAGER') && freshHelp.length > 40, freshHelp)

// The garble has to be made of the real text without ever being it: same
// length, same word breaks, letters where the letters were. Bitburner's other
// branch sends three characters in four to punctuation, which is soup.
const sealedTitle = await ev(`(() => {
  const h = document.querySelector('.help-head.sealed span')
  return h ? h.textContent : ''
})()`)
// Polled, not sampled once. A letter trades places every 60 to 160ms, so a
// fixed 150ms wait sits right on the animation's own period, and a loaded box
// starves the page for longer than that anyway.
let sealedAgain = sealedTitle
for (let i = 0; i < 40 && sealedAgain === sealedTitle; i++) {
  await sleep(60)
  sealedAgain = await ev(`(() => {
    const h = document.querySelector('.help-head.sealed span')
    return h ? h.textContent : ''
  })()`)
}
check('the redaction animates', sealedTitle !== '' && sealedTitle !== sealedAgain,
  `${JSON.stringify(sealedTitle)} -> ${JSON.stringify(sealedAgain)}`)

// The first sealed topic on a fresh save. Hardcoded on purpose: the whole
// point of the feature is that the real title is not in the document, so the
// test cannot read it out of the page it is checking.
const REAL = 'ROLLS ITSELF'
check('it keeps the shape of the real title',
  sealedTitle.length === REAL.length &&
    [...REAL].every((c, i) => (c === ' ') === (sealedTitle[i] === ' ')),
  `${JSON.stringify(sealedTitle)} against ${JSON.stringify(REAL)}`)
check('letters stay letters, in the same case',
  [...REAL].every((c, i) => c === ' ' || /[A-Z]/.test(sealedTitle[i])),
  JSON.stringify(sealedTitle))
check('and it is never the real title',
  sealedTitle !== REAL && sealedAgain !== REAL, JSON.stringify(sealedTitle))
// Word by word, because a single word settling back is the leak that matters.
const anyWordSettled = await ev(`(() => {
  const real = ['ROLLS ITSELF', 'EVERY DIE AT ONCE', 'STUDY AND FOLIO', 'THE WAGER',
    'CHALLENGES', 'AUTO BUY']
  const shown = [...document.querySelectorAll('.help-head.sealed span')].map(n => n.textContent)
  for (let i = 0; i < shown.length; i++) {
    const a = (shown[i] || '').split(' '), b = (real[i] || '').split(' ')
    for (let w = 0; w < a.length; w++) if (b[w] && b[w].length > 2 && a[w] === b[w]) return b[w]
  }
  return ''
})()`)
check('no single word settles back onto the truth', anyWordSettled === '',
  anyWordSettled ? `"${anyWordSettled}" was showing` : 'none')
check('it is not punctuation soup',
  [...sealedTitle].filter((c) => /[A-Z]/.test(c)).length >= REAL.replace(/ /g, '').length - 1,
  JSON.stringify(sealedTitle))

check('and still has the ones it needs',
  ['ROLLING', 'THE TABLE', 'ROLL RATE', 'KEYS'].every((t) => freshHelp.includes(t)), freshHelp)

const freshArchive = await shown('ARCHIVE', '.tile')
const freshArchiveAll = await everything('ARCHIVE')
// Every pane is built whether or not its tab can be reached, so a label
// written at mount sits in the document from the first second. The break layer
// leaked ten words that way until its text moved into update().
const breakWords = await ev(`(() => { const t = document.documentElement.innerHTML.toUpperCase()
  return ["BREAK THE WAGER","OVERSHOOT","LEDGER","HOUSE EDGE","SHORTER ODDS","THE RAKE","CHEAPER PLATES","QUICK HANDS","PROVENANCE","CLOCKED"].filter(w => t.includes(w)) })()`)
check('nothing about breaking the Wager on a fresh save',
  breakWords.length === 0, breakWords.join(', '))

// The settings screen too. Eight confirmation switches on a fresh save named
// folios, melting, the Wager, challenges, chips and breaking the Wager: six
// systems in a list that sat beside a carefully gated archive and help.
// The tab this suite was already on, put back afterwards: the archive checks
// below read a pane that only redraws while it is the active one.
const wasOn = await ev(`document.querySelector('.tab[aria-selected=\"true\"]').textContent`)
await ev(openTab('OPTIONS'))
await sleep(300)
const OPT_AHEAD = ['FOLIO', 'MELT', 'THE WAGER', 'ENTER A CHALLENGE', 'LEAVE A CHALLENGE',
  'A CHIP UPGRADE OVER 1', 'BREAKING THE WAGER']
const settings = await ev(`[...document.querySelectorAll('.opt')].filter(n => !n.hidden)
  .map(n => n.querySelector('.opt-name').textContent)`)
const ahead = OPT_AHEAD.filter((w) => settings.includes(w))
check('no confirmation switch for anything not yet met',
  ahead.length === 0, ahead.join(', '))
// And the one for the thing you can do from the first second is there.
check('the study switch is, because a study is on the table from the start',
  settings.includes('STUDY'), settings.join(', '))
await ev(`(() => { const t = [...document.querySelectorAll('.tab, .subtab')].find(x => x.textContent === ${JSON.stringify(wasOn)}); if (t) t.click() })()`)
await sleep(300)

check('and no archive entry about anything ahead',
  !AHEAD.some((w) => freshArchive.includes(w)), freshArchive.slice(0, 100))
check('nor anywhere in the archive document',
  !AHEAD.some((w) => freshArchiveAll.includes(w)),
  AHEAD.filter((w) => freshArchiveAll.includes(w)).join(',') || 'none present')
const sealedAtStart = await ev(`document.querySelectorAll('.pane:not([hidden]) .tile.sealed').length`)
check('sealed entries are redacted rather than removed', sealedAtStart > 8,
  `${sealedAtStart} sealed on a fresh save`)
check('and the count says how many are held back',
  /still sealed/.test(freshArchiveAll))

// A study reveals the topics a study is about, without touching the rest.
await ev(`(() => { const s = window.LD.state; s.studies = 3; s.autoRoll = true })()`)
await sleep(150)
const midHelp = await shown('HELP', '.help-head')
check('a study opens the automator and the resets',
  midHelp.includes('EVERY DIE AT ONCE') && midHelp.includes('STUDY AND FOLIO'), midHelp)
check('but not the Wager, challenges or autobuyers',
  !midHelp.includes('THE WAGER') && !midHelp.includes('CHALLENGES') && !midHelp.includes('AUTO BUY'),
  midHelp)

await ev(`(() => { const s = window.LD.state; s.wagers = 1; s.challengesDone = [1] })()`)
await sleep(150)
const lateHelp = await shown('HELP', '.help-head')
check('a Wager opens the rest',
  ['THE WAGER', 'CHALLENGES', 'AUTO BUY'].every((t) => lateHelp.includes(t)), lateHelp)
const lateArchive = await shown('ARCHIVE', '.tile')
// Sealed entries are on screen either way now, so the length barely moves.
// What changes is how many are still redacted.
// Fewer sealed than before, not below some number: entries about systems the
// Wager did not unlock, tarot and melting among them, are still sealed and
// should be.
const stillSealed = await ev(`document.querySelectorAll('.pane:not([hidden]) .tile.sealed').length`)
check('and the archive fills in behind it',
  lateArchive.includes('Wager') && stillSealed < sealedAtStart,
  `${sealedAtStart} sealed on a fresh save, ${stillSealed} after a Wager`)

// An arcanum you have not held has its name and its note redacted, and its
// picture has to go too. A sun drawn beside a redacted name says which card it
// is as plainly as the name would. It leaked once: `hidden` is defined on
// HTMLElement and an <svg> is not one, so assigning to the property set
// something nothing reads and every card showed its picture.
await ev(`(() => { const s = window.LD.state
  s.wagers = 2; s.tarot = { sun: 1 }; s.pendingDraft = [] })()`)
await ev(openTab('TAROT'))
await sleep(250)
const art = await ev(`(() => {
  const cells = [...document.querySelectorAll('.pane:not([hidden]) .card')]
  // Visibility rather than display: the picture's space is kept so a sealed
  // card is the same shape as a held one, and what is checked is whether it
  // is painted.
  const shown = cells.filter(c => {
    const svg = c.querySelector('.card-art')
    if (!svg) return false
    const cs = getComputedStyle(svg)
    return cs.display !== 'none' && cs.visibility !== 'hidden'
  })
  return { cells: cells.length, held: cells.filter(c => c.classList.contains('held')).length,
    drawn: shown.length } })()`)
check('only the arcana you hold show their picture',
  art.cells === 22 && art.held === 1 && art.drawn === 1, JSON.stringify(art))

ws.close();chrome.kill();await sleep(150);try{rmSync(profile,{recursive:true,force:true})}catch{}
console.log(`\n${res.filter(Boolean).length}/${res.length} passed`)
process.exit(res.every(Boolean)?0:1)
