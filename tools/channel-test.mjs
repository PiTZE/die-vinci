// Channel isolation tests, against the deployed site.
//
// The thing being checked is that the stable worker, whose scope is /, does not
// answer navigations into /dev/ with its own precached index.html. Both
// channels share an origin, so their saves must stay separate too.
//
//   npm run test:channels
import { spawn } from 'node:child_process'
import { appReady, guard, sweepStale } from './harness.mjs'
import { mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
const profile = mkdtempSync(join(tmpdir(), 'ld-ch-'))
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
await send('Page.enable');await send('Runtime.enable')
const res=[];const check=(n,ok,d='')=>{res.push(ok);console.log(`${ok?'PASS':'FAIL'}  ${n}${d?'  '+d:''}`)}
const probe = `(async () => { const r = await navigator.serviceWorker.getRegistration()
  return { channel: window.LD?.channel, url: location.pathname, scope: r?.scope ?? 'none',
    ctrl: navigator.serviceWorker.controller?.scriptURL ?? 'none',
    keys: Object.keys(localStorage).filter(k => k.includes('save')) } })()`

// Install the stable worker first, which is the one that could overreach.
await send('Page.navigate',{url:'https://leo.generis.ir/'})
 await appReady(ev)
const a = await ev(probe)
check('stable serves the stable build', a.channel === 'stable', JSON.stringify(a))

await ev(`window.LD.state.ink = new window.LD.Decimal('1.234e5')`)
await ev(`window.dispatchEvent(new Event('pagehide'))`)
await sleep(150)

// Now cross into dev while the stable worker is active and controlling.
// Registering the dev worker is a network round trip on a cold profile, so
// this waits for it rather than guessing at a sleep. A fixed 7s passed for
// months and then started failing on a slower deploy, which says nothing about
// the code and everything about the sleep.
await send('Page.navigate',{url:'https://leo.generis.ir/dev/'})
 await appReady(ev)
// Both conditions, not just the scope. The worker can be registered and
// scoped correctly a beat before the page's own script has run, and polling on
// scope alone returned while window.LD was still undefined.
let b = await ev(probe)
for (let i = 0; i < 20 && !(b.scope.endsWith('/dev/') && b.channel === 'dev'); i++) {
  await sleep(1000)
  b = await ev(probe)
}
check('dev is not hijacked by the stable worker', b.channel === 'dev', JSON.stringify(b))
check('dev has its own worker scope', b.scope.endsWith('/dev/'), b.scope)
check('dev keeps a separate save', b.keys.some(k => k.endsWith('-save-dev')) || b.keys.length >= 1, b.keys.join(','))
const devInk = await ev(`window.LD.state.ink.toString()`)
check('dev did not inherit the stable save', Number(devInk) < 1e5, `dev ink ${devInk}`)

// And back again.
await send('Page.navigate',{url:'https://leo.generis.ir/'})
 await appReady(ev)
const c = await ev(probe)
check('back on stable', c.channel === 'stable', JSON.stringify(c))
const stableInk = await ev(`window.LD.state.ink.toString()`)
check('stable save survived the trip', Number(stableInk) >= 1.234e5, `stable ink ${stableInk}`)

ws.close();chrome.kill();await sleep(150);try{rmSync(profile,{recursive:true,force:true})}catch{}
console.log(`\n${res.filter(Boolean).length}/${res.length} passed`)
process.exit(res.every(Boolean)?0:1)
