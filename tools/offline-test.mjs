// The game with the wire cut.
//
// Nobody had ever tried it. The worker registered, said it was active, and
// precached nothing at all, so the first time the connection went the app was
// a browser error page: an installed game that only works online, which is the
// one thing a PWA is for.
//
// The cause was a precache list with the same URL in it twice carrying two
// different revisions. Workbox refuses a list like that, the install throws,
// and a page that never asks for anything offline never finds out. Three
// things put entries in that list, and all three overlapped: globPatterns,
// includeAssets, and includeManifestIcons, which is on by default. The
// manifest was the worst of them, precached by the plugin and picked up again
// off disk by the glob, hashed at two different moments.
//
// So this checks the list for duplicates by reading the deployed worker, and
// then checks the thing that actually matters.
//
// How it checks it matters too. Reloading a tab that is already open is the
// gentle version and it is what the DevTools offline checkbox does: the
// process is warm, the HTTP memory cache is full, and the page can come back
// from things the service worker was never asked for. The real case is a
// phone in a tunnel opening an installed app, so this closes the browser,
// opens it again on the same profile, goes offline before the first
// navigation, and only then asks for the page. It also asks for a URL it has
// never visited, because a navigation the precache has no entry for is what
// the fallback route exists to answer.
import { spawn } from 'node:child_process'
import { appReady, guard, sweepStale } from './harness.mjs'
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
const profile = mkdtempSync(join(tmpdir(), 'ld-off-'))
// No --disk-cache-size=1 here, which every other suite passes to keep a run
// off the disk. This is the one suite where the disk is the subject: a byte of
// cache leaves the worker's own script with nowhere to live, so the profile
// comes back from a restart holding a registration whose script cannot be
// read, and the cold start fails for a reason that has nothing to do with the
// game. It took a while to see, because it fails exactly like the bug.
const chrome = spawn('google-chrome',['--headless=new','--no-sandbox','--disable-gpu','--disable-dev-shm-usage',
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
await send('Page.enable');await send('Runtime.enable');await send('Network.enable')
const res=[];const check=(n,ok,d='')=>{res.push(ok);console.log(`${ok?'PASS':'FAIL'}  ${n}${d?'  '+d:''}`)}

// Which channel to try. Dev by default; the release script checks stable.
const SITE = process.argv[2] ?? 'https://leo.generis.ir/dev/'

// -- the list itself -------------------------------------------------------
//
// Read off the deployed worker rather than the build directory, because what
// is served is what installs.
const sw = await (await fetch(`${SITE}sw.js`)).text()
const entries = [...sw.matchAll(/\{url:"([^"]+)",revision:([^}]+)\}/g)].map((m) => m[1])
const seen = new Map()
for (const u of entries) seen.set(u, (seen.get(u) ?? 0) + 1)
const dupes = [...seen].filter(([, n]) => n > 1).map(([u]) => u)
check('the precache list has something in it', entries.length > 10, `${entries.length} entries`)
check('and no URL in it twice', dupes.length === 0, dupes.join(', '))
// The three that have to be there or the page cannot be rebuilt from cache.
for (const want of ['index.html', 'manifest.webmanifest']) {
  check(`and it carries ${want}`, entries.includes(want))
}
check('and the bundle and the stylesheet',
  entries.some((u) => u.endsWith('.js') && u.startsWith('assets/')) &&
    entries.some((u) => u.endsWith('.css')),
  entries.filter((u) => u.startsWith('assets/')).join(' '))
check('and the font, which is self-hosted and would otherwise be a fallback',
  entries.some((u) => u.endsWith('.woff2')))

// -- and then actually cut it ---------------------------------------------

await send('Page.navigate', { url: SITE })
await appReady(ev)
// Installed and filled before the connection goes.
for (let i = 0; i < 40; i++) {
  const n = await ev(`caches.keys().then(ks => Promise.all(ks.map(k => caches.open(k).then(c => c.keys()))))
    .then(all => all.flat().length)`)
  if (n > 10) break
  await sleep(250)
}
const cached = await ev(`caches.keys().then(ks => Promise.all(ks.map(k => caches.open(k).then(c => c.keys()))))
  .then(all => all.flat().length)`)
check('the worker fills its cache', cached > 10, `${cached} responses`)

// Controlling the page, and then a moment to write itself down. Chrome
// persists a registration on its own schedule, and killing the browser the
// instant the cache looks full leaves the next run with a profile that has the
// cache and no registration to use it: the cold start then fails for want of a
// worker, which looks exactly like the bug this is testing for and is not it.
for (let i = 0; i < 40; i++) {
  if (await ev(`!!navigator.serviceWorker.controller`)) break
  await sleep(250)
}
check('and controls the page', await ev(`!!navigator.serviceWorker.controller`))
await sleep(2500)

// -- cold, on a second run of the browser ----------------------------------
//
// Everything above happened in a warm process. Close it, open it again on the
// same profile so the worker and its cache survive, and cut the wire before
// the first navigation of the new session.
ws.close()
chrome.kill()
// Waited for, not slept through. Chrome locks its user-data-dir, and a second
// one started while the first still holds the lock does not reuse the profile:
// it comes up on a fresh one, with no worker and no cache, and reports the
// error page that the run then blames on the game. That is what a fixed sleep
// bought here, and it is the sort of failure that reads exactly like the bug
// it is meant to be testing for.
await new Promise((done) => {
  if (chrome.exitCode !== null) return done()
  chrome.once('exit', done)
  setTimeout(done, 8000)
})
await sleep(400)

// The host is made unreachable rather than the connection emulated. CDP's
// offline switch is applied to the page's own target, and what a phone in a
// tunnel has is a name that does not resolve to anything: this maps the site
// to a dead port for the whole browser, so every request out of it fails the
// way it would there, service worker included.
const HOST = new URL(SITE).host
const cold = spawn('google-chrome',['--headless=new','--no-sandbox','--disable-gpu','--disable-dev-shm-usage',
  `--host-resolver-rules=MAP ${HOST} 127.0.0.1:1`,
  '--remote-debugging-port=0',`--user-data-dir=${profile}`,'--window-size=390,844','about:blank'],{stdio:'ignore'})
guard(cold, profile, () => ws)
ws = undefined
for(let i=0;i<60&&!ws;i++){try{const l=await(await fetch(`http://127.0.0.1:${devtoolsPort(profile)}/json`)).json();const p=l.find(t=>t.type==='page')
 if(p){ws=new WebSocket(p.webSocketDebuggerUrl);await new Promise((r,j)=>{ws.onopen=r;ws.onerror=j})
  ws.onmessage=m=>{const x=JSON.parse(m.data)
    const q=pending.get(x.id);if(q){pending.delete(x.id);q.res(x.result)}}}}catch{} if(!ws)await sleep(200)}
await send('Page.enable');await send('Runtime.enable')

// Deliberately no CDP offline emulation on top of the dead host. Measured:
// with the host unreachable the worker serves the navigation and the game
// loads, and with emulateNetworkConditions offline as well the navigation
// fails outright and never reaches the worker. Whichever of the two is the
// more faithful account of a tunnel, they cannot both be, and the one that
// asks the service worker is the one worth testing.

// What survived the restart, asked of the profile on disk rather than of the
// page: navigator.serviceWorker does not exist on about:blank, and the page
// this is about to ask for is the thing under test. If Chrome did not persist
// the registration and the cache when the process went, the run is measuring
// the harness rather than the game.
const swDir = join(profile, 'Default', 'Service Worker')
const kept = existsSync(join(swDir, 'Database')) && existsSync(join(swDir, 'ScriptCache'))
check('the worker and its cache survive the browser closing', kept,
  kept ? '' : 'the profile lost them, so what follows is about the harness')

await send('Page.navigate', { url: SITE })
await sleep(6000)
const off = await ev(`({ ld: !!window.LD, panes: document.querySelectorAll('.pane').length,
  title: document.title, tabs: document.querySelectorAll('.tab').length })`)
check('a cold start with no connection loads the game',
  off.ld === true && off.panes > 0, JSON.stringify(off))
check('with its own title rather than the browser error page',
  off.title === 'die Vinci', JSON.stringify(off.title))
check('and its menu', off.tabs > 0, `${off.tabs} groups`)

// It has to play, not merely paint. A roll offline pays ink like any other.
const played = await ev(`(async () => { const s = window.LD.state, D = window.LD.Decimal
  s.ink = new D(0); s.solids[0].amount = new D(100); s.solids[0].bought = 10
  window.LD.actions.roll()
  await new Promise(r => setTimeout(r, 1500))
  return { ink: s.ink.toString() } })()`)
check('and it plays', Number(played.ink) > 0, JSON.stringify(played))

// And a URL this browser has never asked for, which is what the navigation
// fallback is there to answer.
await send('Page.navigate', { url: `${SITE}?cold=${Date.now()}` })
await sleep(4000)
const fresh = await ev(`({ ld: !!window.LD, title: document.title })`)
check('and so does a URL it has never visited',
  fresh.ld === true && fresh.title === 'die Vinci', JSON.stringify(fresh))

ws.close();cold.kill();await sleep(150);try{rmSync(profile,{recursive:true,force:true})}catch{}
console.log(`\n${res.filter(Boolean).length}/${res.length} passed`)
process.exit(res.every(Boolean)?0:1)
