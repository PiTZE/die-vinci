// Layout tests: the action bar and tabs must stay on screen.
//
//   npm run test:layout
import { spawn } from 'node:child_process'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
const profile = mkdtempSync(join(tmpdir(), 'ld-ly-'))
const chrome = spawn('google-chrome',['--headless=new','--no-sandbox','--disable-gpu',
  '--remote-debugging-port=9376',`--user-data-dir=${profile}`,'--window-size=390,844','about:blank'],{stdio:'ignore'})
const sleep=ms=>new Promise(r=>setTimeout(r,ms))
let ws,id=0;const pending=new Map()
for(let i=0;i<60&&!ws;i++){try{const l=await(await fetch('http://127.0.0.1:9376/json')).json();const p=l.find(t=>t.type==='page')
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
ws.close();chrome.kill();await sleep(300);try{rmSync(profile,{recursive:true,force:true})}catch{}
console.log(`\n${res.filter(Boolean).length}/${res.length} passed`)
process.exit(res.every(Boolean)?0:1)
