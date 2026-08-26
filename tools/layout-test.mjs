// Layout tests: the action bar and tabs must stay on screen.
//
//   npm run test:layout
import { spawn } from 'node:child_process'
import { guard, sweepStale } from './harness.mjs'
import { mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
const profile = mkdtempSync(join(tmpdir(), 'ld-ly-'))
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
  ws.onmessage=m=>{const x=JSON.parse(m.data);const q=pending.get(x.id);if(q){pending.delete(x.id);q.res(x.result)}}}}catch{} if(!ws)await sleep(250)}
const send=(m,p={})=>new Promise(res=>{const n=++id;pending.set(n,{res});ws.send(JSON.stringify({id:n,method:m,params:p}))})
const ev=async e=>{const r=await send('Runtime.evaluate',{expression:e,returnByValue:true,awaitPromise:true})
  if(r.exceptionDetails) return 'EX '+(r.exceptionDetails.exception?.description||'').split('\n')[0]
  return r.result?.value}
await send('Emulation.setFocusEmulationEnabled',{enabled:true})
await send('Page.enable');await send('Runtime.enable')
await send('Page.navigate',{url:'http://127.0.0.1:5173/'}); await sleep(4000)

const probe = `(() => {
  const t = document.querySelector('.tabs'), a = document.querySelector('.action-bar')
  const app = document.querySelector('.app'), th = document.querySelector('.thought')
  const r = n => { if (!n) return null; const b = n.getBoundingClientRect()
    return { top: Math.round(b.top), bottom: Math.round(b.bottom), h: Math.round(b.height) } }
  return { vh: innerHeight, vvh: Math.round(visualViewport?.height ?? innerHeight),
    appH: Math.round(app.getBoundingClientRect().height),
    varH: getComputedStyle(document.documentElement).getPropertyValue('--app-h').trim(),
    thought: r(th), actionBar: r(a), tabs: r(t),
    tabsOffscreen: t ? t.getBoundingClientRect().bottom > innerHeight + 1 : null } })()`

const res=[];const check=(n,ok,d='')=>{res.push(ok);console.log(`${ok?'PASS':'FAIL'}  ${n}${d?'  '+d:''}`)}
const fits = (p) => p.tabs && !p.tabsOffscreen && p.appH <= p.vvh + 1 && p.actionBar.bottom <= p.tabs.top + 1

check('the chrome fits on load', fits(await ev(probe)))

// A long ticker line, which is what varies most between frames.
await ev(`document.querySelector('.thought').textContent =
  'Pascal and Fermat solved the problem of points by letter in 1654, and probability theory begins right there in that correspondence.'`)
await sleep(400)
check('a long ticker line does not push it off', fits(await ev(probe)))

// Backgrounding changes the visual viewport on a phone.
for (const h of [844, 700, 640, 844]) {
  await send('Emulation.setDeviceMetricsOverride', { width: 390, height: h, deviceScaleFactor: 2, mobile: true })
  await sleep(500)
  const p = await ev(probe)
  check(`viewport at ${h}px keeps the tabs on screen`, fits(p), `app ${p.appH} of ${p.vvh}`)
}
await send('Emulation.clearDeviceMetricsOverride')

// And a freeze / resume.
await send('Page.setWebLifecycleState',{state:'frozen'}); await sleep(1500)
await send('Page.setWebLifecycleState',{state:'active'}); await sleep(1500)
const back = await ev(probe)
check('and after a freeze and resume', fits(back), `app ${back.appH} of ${back.vvh}`)

// The measured height is an enhancement. Without it the CSS still has to keep
// the app inside the viewport, which is what svh is there for.
await ev(`document.documentElement.style.removeProperty('--app-h')`)
await sleep(300)
const noVar = await ev(probe)
check('and with the measured height removed entirely', fits(noVar), `app ${noVar.appH} of ${noVar.vvh}`)
// An iPhone's home indicator and status bar, which a headless browser always
// reports as zero. Both of these were wrong on hardware and invisible here.
await send('Emulation.setDeviceMetricsOverride',{width:390,height:844,deviceScaleFactor:2,mobile:true})
await sleep(500)
await ev(`document.documentElement.style.setProperty('--safe-b', '34px')`)
await ev(`document.documentElement.style.setProperty('--safe-t', '47px')`)
await sleep(400)
const inset = await ev(`(() => {
  const sel = document.querySelector('.tab[aria-selected="true"]').getBoundingClientRect()
  const bar = document.querySelector('.bar').getBoundingClientRect()
  const first = document.querySelector('.bar-inner').getBoundingClientRect()
  const tabs = document.querySelector('.tabs').getBoundingClientRect()
  return { underSelected: Math.round(innerHeight - sel.bottom),
    tabsBottom: Math.round(innerHeight - tabs.bottom),
    tabH: Math.round(sel.height),
    tabsBarH: Math.round(tabs.height),
    barTextTop: Math.round(first.top) }
})()`)
check('the selected tab reaches the bottom edge past the home indicator',
  inset.underSelected === 0 && inset.tabsBottom === 0, JSON.stringify(inset))
check('and it keeps a 44px target above the indicator',
  inset.tabH >= 44 + 34, JSON.stringify(inset))
// 44 for the target, 34 for the indicator, and nothing else. Counting the
// inset on the bar as well as on the buttons made it 90px on an iPhone.
check('without counting the indicator twice',
  inset.tabsBarH <= 44 + 34 + 4, JSON.stringify(inset))
check('the top bar clears the status bar', inset.barTextTop >= 47, JSON.stringify(inset))
await ev(`document.documentElement.style.removeProperty('--safe-b')`)
await ev(`document.documentElement.style.removeProperty('--safe-t')`)

// The desktop row grew a column for the face and the override did not, so the
// number was auto-placed at the end of the row, six pixels wide, under the buy
// button. Cheap to assert, and invisible in a screenshot at a glance.
await send('Emulation.setDeviceMetricsOverride',{width:1440,height:900,deviceScaleFactor:1,mobile:false})
await sleep(600)
await ev(`(() => { const s = window.LD.state, D = window.LD.Decimal
  s.studies = 4; s.autoRoll = true
  s.solids.forEach((d,i) => { if (i < 4) { d.bought = 12; d.amount = new D(500) } }) })()`)
await sleep(1400)
const wide = await ev(`(() => {
  const row = document.querySelector('.solid')
  const f = row.querySelector('.solid-face').getBoundingClientRect()
  const i = row.querySelector('.solid-icon').getBoundingClientRect()
  const pane = document.querySelector('.pane:not([hidden])').getBoundingClientRect()
  const inner = document.querySelector('.pane:not([hidden]) .pane-inner').getBoundingClientRect()
  const act = document.querySelector('.action-bar').getBoundingClientRect()
  return { faceRight: Math.round(f.right), iconLeft: Math.round(i.left),
    fill: Math.round((inner.height / pane.height) * 100),
    actionH: Math.round(act.height), deadBelow: Math.round(innerHeight - act.bottom) }
})()`)
check('the face stays left of the solid on a desktop row',
  wide.faceRight <= wide.iconLeft, JSON.stringify(wide))
check('the pane fills the window rather than leaving a band under it',
  wide.fill > 85 && wide.actionH < 110 && wide.deadBelow <= 2, JSON.stringify(wide))

ws.close();chrome.kill();await sleep(300);try{rmSync(profile,{recursive:true,force:true})}catch{}
console.log(`\n${res.filter(Boolean).length}/${res.length} passed`)
process.exit(res.every(Boolean)?0:1)
