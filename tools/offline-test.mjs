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
// then checks the thing that actually matters by pulling the connection out
// and reloading.
import { spawn } from 'node:child_process'
import { appReady, guard, sweepStale } from './harness.mjs'
import { mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
const profile = mkdtempSync(join(tmpdir(), 'ld-off-'))
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
await send('Page.enable');await send('Runtime.enable');await send('Network.enable')
const res=[];const check=(n,ok,d='')=>{res.push(ok);console.log(`${ok?'PASS':'FAIL'}  ${n}${d?'  '+d:''}`)}

const SITE = 'https://leo.generis.ir/dev/'

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

await send('Network.emulateNetworkConditions',
  { offline: true, latency: 0, downloadThroughput: 0, uploadThroughput: 0 })
await send('Page.navigate', { url: SITE })
await sleep(4000)
const off = await ev(`({ ld: !!window.LD, panes: document.querySelectorAll('.pane').length,
  title: document.title, tabs: document.querySelectorAll('.tab').length })`)
check('and the game loads with the connection pulled out',
  off.ld === true && off.panes > 0, JSON.stringify(off))
check('with its own title rather than the browser error page',
  off.title === 'die Vinci', JSON.stringify(off.title))
check('and its menu', off.tabs > 0, `${off.tabs} groups`)

// It has to play, not merely paint. A roll offline pays ink like any other.
const played = await ev(`(async () => { const s = window.LD.state, D = window.LD.Decimal
  s.ink = new D(0); s.solids[0].amount = new D(100); s.solids[0].bought = 10
  window.LD.actions.roll()
  await new Promise(r => setTimeout(r, 1500))
  return { ink: s.ink.toString(), rolls: s.stats?.rolls ?? null } })()`)
check('and it plays', Number(played.ink) > 0, JSON.stringify(played))

ws.close();chrome.kill();await sleep(150);try{rmSync(profile,{recursive:true,force:true})}catch{}
console.log(`\n${res.filter(Boolean).length}/${res.length} passed`)
process.exit(res.every(Boolean)?0:1)
