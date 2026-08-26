// Away-progress tests, against the dev server.
//
// A gap in state.lastTick is exactly what a throttled background tab, a
// sleeping machine, or a closed game all produce, so all three are covered by
// moving that one number backwards.
//
//   npm run test:away
import { spawn } from 'node:child_process'
import { mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
const profile = mkdtempSync(join(tmpdir(), 'ld-aw-'))
const chrome = spawn('google-chrome',['--headless=new','--no-sandbox','--disable-gpu',
  '--remote-debugging-port=0',`--user-data-dir=${profile}`,'--window-size=390,844','about:blank'],{stdio:'ignore'})
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
  ws.onmessage=m=>{const x=JSON.parse(m.data);const q=pending.get(x.id);if(q){pending.delete(x.id);q.res(x.result)}}}}catch{} if(!ws)await sleep(250)}
const send=(m,p={})=>new Promise(res=>{const n=++id;pending.set(n,{res});ws.send(JSON.stringify({id:n,method:m,params:p}))})
const ev=async e=>{const r=await send('Runtime.evaluate',{expression:e,returnByValue:true,awaitPromise:true})
  if(r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description); return r.result?.value}
await send('Page.enable');await send('Runtime.enable')
const res=[];const check=(n,ok,d='')=>{res.push(ok);console.log(`${ok?'PASS':'FAIL'}  ${n}${d?'  '+d:''}`)}

await send('Page.navigate',{url:'http://127.0.0.1:5173/seed.html'}); await sleep(4000)

// A gap in lastTick is exactly what a throttled background tab produces.
//
// Each measurement starts from the same baseline. Simulating a gap grows the
// chain enormously, so without a reset every later measurement inherits a much
// larger income and the numbers cannot be compared to each other.
async function gap(seconds, { offline = true } = {}) {
  await ev(`(() => { const s = window.LD.state, D = window.LD.Decimal
    s.options.offline = ${offline}
    s.options.offlineTicks = 2000
    s.studies = 3; s.folios = 0; s.rollUpgrades = 0
    s.solids.forEach(d => { d.bought = 0; d.amount = new D(0) })
    s.solids[0].amount = new D('1e10')
    s.ink = new D(0)
    s.lastTick = Date.now() - ${seconds} * 1000 })()`)
  await sleep(700)
  return {
    ink: Number(await ev(`window.LD.state.ink.toString()`)),
    rate: Number(await ev(`window.LD.state.solids[0].amount.toString()`)),
    notice: await ev(`(() => { const t = document.querySelector('.toast')
      // The toast is shared with archive announcements now, so only an AWAY
      // line counts here.
      const text = t && t.classList.contains('show') ? t.textContent : null
      return text && text.startsWith('AWAY') ? text : null })()`),
  }
}

// Baseline: 1e10 d4 at one roll a second, three studies for an x8, and a d4
// averaging 2.5 a face. That is 2e11 ink a second, so five seconds is 1e12.
const short = await gap(5)
check('a five second gap is credited', short.ink > 5e11 && short.ink < 2e12, `gained ${short.ink.toExponential(2)}`)
check('no notice for a short gap', short.notice === null, String(short.notice))

const long = await gap(600)
check('a ten minute gap is credited', long.ink > 5e12, `gained ${long.ink.toExponential(2)}`)
check('notice shown for a long gap', /AWAY 10m/.test(long.notice ?? ''), String(long.notice))

// The toast fades on its own after five seconds. Wait it out, or the next
// assertion reads the one still on screen.
await sleep(5400)
check('toast fades on its own',
  await ev(`(() => { const t = document.querySelector('.toast')
    return !t.classList.contains('show') || !t.textContent.startsWith('AWAY') })()`))

const off = await gap(600, { offline: false })
// Compared against the credited run rather than an absolute figure: the wait
// here is real wall-clock time in a headless browser, which is not precise
// enough to assert on directly. What matters is that the 600 second gap did
// not land, and a couple of seconds of honest ticking is orders below it.
check('gap ignored when away progress is off', off.ink < long.ink / 50,
  `gained ${off.ink.toExponential(2)} vs ${long.ink.toExponential(2)} credited`)
check('no notice when away progress is off', off.notice === null, String(off.notice))

const capped = await gap(24 * 3600)
check('a day away is capped at eight hours', /capped/.test(capped.notice ?? '') && /AWAY 8h/.test(capped.notice ?? ''), String(capped.notice))

ws.close();chrome.kill();await sleep(400);try{rmSync(profile,{recursive:true,force:true})}catch{}
console.log(`\n${res.filter(Boolean).length}/${res.length} passed`)
process.exit(res.every(Boolean)?0:1)
