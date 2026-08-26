// Durability: does the game keep asking for an eviction exemption, and does it
// offer the things that can still be done when the browser says no?
//
// The file picker cannot be driven headlessly, so this covers the ask loop and
// the states the OPTIONS rows can be in. persist() is stubbed to always refuse,
// so the retry path is what runs rather than a lucky grant.
import { spawn } from 'node:child_process'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
const profile = mkdtempSync(join(tmpdir(), 'ld-du-'))
const chrome = spawn('google-chrome',['--headless=new','--no-sandbox','--disable-gpu',
  '--remote-debugging-port=9374',`--user-data-dir=${profile}`,'--window-size=390,844','about:blank'],{stdio:'ignore'})
const sleep=ms=>new Promise(r=>setTimeout(r,ms))
let ws,id=0;const pending=new Map()
for(let i=0;i<60&&!ws;i++){try{const l=await(await fetch('http://127.0.0.1:9374/json')).json();const p=l.find(t=>t.type==='page')
 if(p){ws=new WebSocket(p.webSocketDebuggerUrl);await new Promise((r,j)=>{ws.onopen=r;ws.onerror=j})
  ws.onmessage=m=>{const x=JSON.parse(m.data);const q=pending.get(x.id);if(q){pending.delete(x.id);q.res(x.result)}}}}catch{} if(!ws)await sleep(250)}
const send=(m,p={})=>new Promise(res=>{const n=++id;pending.set(n,{res});ws.send(JSON.stringify({id:n,method:m,params:p}))})
const ev=async e=>{const r=await send('Runtime.evaluate',{expression:e,returnByValue:true,awaitPromise:true})
  if(r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description); return r.result?.value}
await send('Emulation.setFocusEmulationEnabled',{enabled:true})
await send('Page.enable');await send('Runtime.enable')
const res=[];const check=(n,ok,d='')=>{res.push(ok);console.log(`${ok?'PASS':'FAIL'}  ${n}${d?'  '+d:''}`)}

// Installed before any of the game's own script runs, so the boot request is
// counted too.
await send('Page.addScriptToEvaluateOnNewDocument',{source:`
  window.__persistCalls = 0
  Object.defineProperty(navigator.storage, 'persist', { configurable: true,
    value: () => { window.__persistCalls++; return Promise.resolve(false) } })
  Object.defineProperty(navigator.storage, 'persisted', { configurable: true,
    value: () => Promise.resolve(false) })
`})
await send('Page.navigate',{url:'http://127.0.0.1:5173/'}); await sleep(4000)

const atBoot = await ev('window.__persistCalls')
check('it asks at boot', atBoot >= 1, `calls: ${atBoot}`)

// The gesture is the moment Firefox will prompt, so the throttle that keeps the
// background retries quiet must not eat it.
await ev(`window.dispatchEvent(new PointerEvent('pointerdown'))`); await sleep(500)
const afterTap = await ev('window.__persistCalls')
check('a tap asks again despite the throttle', afterTap > atBoot, `${atBoot} -> ${afterTap}`)

await ev(`window.dispatchEvent(new PointerEvent('pointerdown'))`); await sleep(500)
const afterSecond = await ev('window.__persistCalls')
check('a second tap inside the window is throttled', afterSecond === afterTap,
  `${afterTap} -> ${afterSecond}`)

await ev(`[...document.querySelectorAll('.tab')].find(t => t.textContent.includes('OPTIONS')).click()`)
await sleep(800)

const rows = await ev(`
  (() => {
    const sec = [...document.querySelectorAll('.section')].find(s => s.textContent.includes('STORAGE'))
    const txt = sec ? sec.textContent : ''
    return {
      state: txt.includes('evictable') ? 'evictable' : txt.includes('protected') ? 'protected' : '?',
      ask: txt.includes('ASK AGAIN'),
      notify: txt.includes('notifications'),
      file: txt.includes('SAVE FILE') || txt.includes('UNBIND'),
      picker: typeof window.showSaveFilePicker === 'function',
    }
  })()`)

check('it reports the refusal honestly', rows.state === 'evictable', rows.state)
check('and offers to ask again', rows.ask === true)
check('and offers the notification signal', rows.notify === true)
check('the file mirror row follows picker support', rows.file === rows.picker,
  `row: ${rows.file}, picker: ${rows.picker}`)

ws.close();chrome.kill();await sleep(300);try{rmSync(profile,{recursive:true,force:true})}catch{}
console.log(`\n${res.filter(Boolean).length}/${res.length} passed`)
process.exit(res.every(Boolean)?0:1)
