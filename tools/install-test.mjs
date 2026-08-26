// Install-button tests, over the DevTools protocol.
//
// Chrome does not fire beforeinstallprompt in headless, so the event is
// synthesised to exercise our own handling of it. Assertions read computed
// style rather than the hidden property: a display rule on a class beats the
// attribute, and checking the property once hid a bug that a screenshot caught.
//
//   npm run test:install     (the dev server must be running)
import { spawn } from 'node:child_process'
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
const profile = mkdtempSync(join(tmpdir(), 'ld-in-'))
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
const results=[]
const check=(n,ok,d='')=>{results.push(ok);console.log(`${ok?'PASS':'FAIL'}  ${n}${d?'  '+d:''}`)}

await send('Page.navigate',{url:'http://127.0.0.1:5173/seed.html#options'}); await sleep(5000)

const before = await ev(`(() => { const b = [...document.querySelectorAll('button')].find(x => x.textContent === 'INSTALL')
  const note = [...document.querySelectorAll('.empty')].map(n => n.textContent).filter(Boolean)
  return { hasBtn: !!b, btnShown: b ? getComputedStyle(b).display !== 'none' : null, notes: note } })()`)
check('install section exists', before.hasBtn, JSON.stringify(before))
check('button not rendered with no prompt available', before.btnShown === false)
check('falls back to a hint', before.notes.some(n => /home screen|browser menu/.test(n)), before.notes.join(' | '))

// Chrome will not fire beforeinstallprompt in headless, so synthesise it to
// exercise our own handling of the event.
await ev(`(() => { const e = new Event('beforeinstallprompt')
  e.prompt = () => Promise.resolve()
  e.userChoice = Promise.resolve({ outcome: 'accepted' })
  window.__fake = e
  window.dispatchEvent(e) })()`)
await sleep(300)
const after = await ev(`(() => { const b = [...document.querySelectorAll('button')].find(x => x.textContent === 'INSTALL')
  return { shown: getComputedStyle(b).display !== 'none', accent: b.classList.contains('buyable') } })()`)
check('button appears when the browser offers a prompt', after.shown && after.accent, JSON.stringify(after))

await ev(`[...document.querySelectorAll('button')].find(x => x.textContent === 'INSTALL').click()`)
await sleep(500)
const done = await ev(`(() => { const b = [...document.querySelectorAll('button')].find(x => x.textContent === 'INSTALL')
  return { shown: getComputedStyle(b).display !== 'none' } })()`)
check('button retires after the prompt is used', done.shown === false, JSON.stringify(done))

const shot = await send('Page.captureScreenshot',{format:'png'})
writeFileSync('install.png', Buffer.from(shot.data,'base64'))
ws.close();chrome.kill();await sleep(400);try{rmSync(profile,{recursive:true,force:true})}catch{}
console.log(`\n${results.filter(Boolean).length}/${results.length} passed`)
process.exit(results.every(Boolean)?0:1)
