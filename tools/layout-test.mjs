// Layout tests: the action bar and tabs must stay on screen.
//
//   npm run test:layout
import { spawn } from 'node:child_process'
import { appReady, guard, sweepStale } from './harness.mjs'
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
  ws.onmessage=m=>{const x=JSON.parse(m.data);const q=pending.get(x.id);if(q){pending.delete(x.id);q.res(x.result)}}}}catch{} if(!ws)await sleep(150)}
const send=(m,p={})=>new Promise(res=>{const n=++id;pending.set(n,{res});ws.send(JSON.stringify({id:n,method:m,params:p}))})
const ev=async e=>{const r=await send('Runtime.evaluate',{expression:e,returnByValue:true,awaitPromise:true})
  if(r.exceptionDetails) return 'EX '+(r.exceptionDetails.exception?.description||'').split('\n')[0]
  return r.result?.value}
await send('Emulation.setFocusEmulationEnabled',{enabled:true})
await send('Page.enable');await send('Runtime.enable')
await send('Page.navigate',{url:'http://127.0.0.1:5173/'})
 await appReady(ev)

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
await sleep(150)
check('a long ticker line does not push it off', fits(await ev(probe)))

// Backgrounding changes the visual viewport on a phone.
for (const h of [844, 700, 640, 844]) {
  await send('Emulation.setDeviceMetricsOverride', { width: 390, height: h, deviceScaleFactor: 2, mobile: true })
  await sleep(150)
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
await sleep(150)
const noVar = await ev(probe)
check('and with the measured height removed entirely', fits(noVar), `app ${noVar.appH} of ${noVar.vvh}`)
// An iPhone's home indicator and status bar, which a headless browser always
// reports as zero. Both of these were wrong on hardware and invisible here.
await send('Emulation.setDeviceMetricsOverride',{width:390,height:844,deviceScaleFactor:2,mobile:true})
await sleep(150)
await ev(`document.documentElement.style.setProperty('--safe-b', '34px')`)
await ev(`document.documentElement.style.setProperty('--safe-t', '47px')`)
await sleep(150)
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

// In a browser tab the browser's own chrome sits below the viewport and has
// already accounted for the gesture bar, so nothing extra is owed. The tokens
// used safe-area-max-inset everywhere, which does not collapse when a toolbar
// hides and therefore always reports the largest inset the browser could ever
// apply. In a tab that reserved a band for a toolbar already on screen, and
// the tab bar came out too tall on Android.
//
// Only the browser half is testable here. env() cannot be faked, so the
// standalone branch needs hardware; what this pins is that the tokens are not
// unconditionally the max variant.
await ev(`document.documentElement.style.removeProperty('--safe-b')`)
await ev(`document.documentElement.style.removeProperty('--safe-t')`)
await sleep(150)
const tabbed = await ev(`(() => {
  const tabs = document.querySelector('.tabs').getBoundingClientRect()
  const css = getComputedStyle(document.documentElement)
  return { h: Math.round(tabs.height), safeB: css.getPropertyValue('--safe-b').trim() } })()`)
check('a browser tab reserves no band under the tab bar',
  tabbed.safeB === '0px' && tabbed.h <= 60, JSON.stringify(tabbed))
await ev(`document.documentElement.style.setProperty('--safe-b', '34px')`)
await ev(`document.documentElement.style.setProperty('--safe-t', '47px')`)
await sleep(150)

// Few enough tabs to fit, and they share the bar between them. Sizing each to
// its own label left an early save with 60% of the bar empty.
const early = await ev(`(() => {
  const t = [...document.querySelectorAll('.tab')].filter(x => getComputedStyle(x).display !== 'none')
  const bar = document.querySelector('.tabs').getBoundingClientRect()
  const span = t[t.length-1].getBoundingClientRect().right - t[0].getBoundingClientRect().left
  return { n: t.length, span: Math.round(span), barW: Math.round(bar.width) }
})()`)
check('tabs that fit share the whole bar',
  early.n <= 6 && Math.abs(early.span - early.barW) < 2, JSON.stringify(early))

// Eight tabs of real English do not fit across 390px. They are not squeezed
// into each other any more; the bar scrolls instead. A fresh save only shows
// four, which fit, so the rest have to be unlocked before this means anything.
await ev(`(() => { const s = window.LD.state, D = window.LD.Decimal
  s.studies = 8; s.wagers = 2; s.autoRoll = true; s.challengesDone = [1,2]
  s.points = new D(4); s.ink = new D('1e40') })()`)
await sleep(150)
const bar = await ev(`(() => {
  const tabs = [...document.querySelectorAll('.tab')].filter(t => getComputedStyle(t).display !== 'none')
  let collide = false
  for (let i = 1; i < tabs.length; i++) {
    if (tabs[i].getBoundingClientRect().left < tabs[i-1].getBoundingClientRect().right - 1) collide = true
  }
  const el = document.querySelector('.tabs')
  return { n: tabs.length, collide, scrolls: el.scrollWidth > el.clientWidth + 1,
    labels: tabs.map(t => t.textContent.trim()) }
})()`)
check('tab labels never run into each other', bar.collide === false, JSON.stringify(bar.labels))
check('and the bar scrolls when they do not fit', bar.scrolls === true, JSON.stringify(bar))

// A tab reached from anywhere but a tap on it has to be brought into view.
await ev(`window.LD.actions.setTab && window.LD.actions.setTab('help')`)
await ev(`[...document.querySelectorAll('.tab')].find(t => t.textContent.trim() === 'HELP').click()`)
await sleep(150)
const seen = await ev(`(() => {
  const t = [...document.querySelectorAll('.tab')].find(x => x.getAttribute('aria-selected') === 'true')
  const b = t.getBoundingClientRect()
  return { label: t.textContent.trim(), left: Math.round(b.left), right: Math.round(b.right), w: innerWidth }
})()`)
check('the selected tab is scrolled into view',
  seen.left >= -1 && seen.right <= seen.w + 1, JSON.stringify(seen))

// The counter and the label are one control on one line. Pinned to the top
// left corner while the label centred in a 49px button, they read as two
// unrelated things stacked on top of each other, and no measurement of the
// label alone showed it: the label was perfectly centred, in a two-line box.
await ev(`[...document.querySelectorAll('.tab')].find(t => t.textContent.trim() === 'TABLE').click()`)
await sleep(150)
await ev(`(() => { const s = window.LD.state, D = window.LD.Decimal
  s.studies = 8; s.autoRoll = true; s.ink = new D('1e40')
  s.solids.forEach((d, i) => { d.bought = 8 + i; d.amount = new D(1e9) }) })()`)
await sleep(150)
const buys = await ev(`(() => {
  const rows = [...document.querySelectorAll('.solid')].filter(r => getComputedStyle(r).display !== 'none')
  return rows.map(r => {
    const b = r.querySelector('.solid-buy').getBoundingClientRect()
    const l = r.querySelector('.solid-buy-label').getBoundingClientRect()
    const c = r.querySelector('.solid-buy-cost').getBoundingClientRect()
    const rule = r.querySelector('.solid-fill').getBoundingClientRect()
    return {
      label: r.querySelector('.solid-buy-label').textContent,
      cost: r.querySelector('.solid-buy-cost').textContent,
      sameLine: Math.abs((l.top + l.bottom) / 2 - (c.top + c.bottom) / 2) < 4,
      overflows: c.right > b.right + 1 || l.left < b.left - 1,
      collides: l.right > c.left + 1,
      // The rule reads the group of ten along the bottom edge. Above the text
      // it would be an underline through the label instead.
      ruleAtBottom: b.bottom - rule.bottom <= 3 && rule.top > l.bottom
    }
  })
})()`)
check('the label and the price share one line on every row',
  buys.length >= 8 && buys.every((r) => r.sameLine),
  JSON.stringify(buys.filter((r) => !r.sameLine).slice(0, 2)))
// One long label used to widen its own button and step out of line with the
// eight above it. The buy column is a fixed width now.
const aligned = await ev(`(() => {
  const rows = [...document.querySelectorAll('.solid')].filter(r => getComputedStyle(r).display !== 'none')
  const lefts = new Set(rows.map(r => Math.round(r.querySelector('.solid-buy').getBoundingClientRect().left)))
  const widths = new Set(rows.map(r => Math.round(r.querySelector('.solid-buy').getBoundingClientRect().width)))
  return { rows: rows.length, lefts: [...lefts], widths: [...widths] }
})()`)
check('every buy button is the same width and starts at the same edge',
  aligned.rows >= 6 && aligned.lefts.length === 1 && aligned.widths.length === 1,
  JSON.stringify(aligned))

check('and neither overflows the button nor runs into the other',
  buys.every((r) => !r.overflows && !r.collides),
  JSON.stringify(buys.filter((r) => r.overflows || r.collides).slice(0, 2)))
check('the group-of-ten rule sits on the bottom edge, clear of the text',
  buys.every((r) => r.ruleAtBottom),
  JSON.stringify(buys.filter((r) => !r.ruleAtBottom).slice(0, 2)))

// FOLIO and STUDY share one header, and with nothing between them the pair
// read as one sentence: "FOLIO 1 STUDY 8". The divider has to land on the same
// line as the gap between the two buttons under it, or it looks like a third
// thing rather than the split between two.
await ev(`(() => { const s = window.LD.state, D = window.LD.Decimal
  s.studies = 8; s.folios = 1; s.stats.foliosEver = 1
  s.solids.forEach(d => { d.amount = new D('1e12'); d.bought = 20 }) })()`)
await sleep(200)
const head = await ev(`(() => {
  const h = document.querySelector('.reset-head')
  const halves = [...h.querySelectorAll('.reset-half')].filter(x => !x.hidden)
  const row = [...document.querySelectorAll('.row')]
    .find(r => [...r.querySelectorAll('.action')].filter(b => !b.hidden).length === 2)
  if (!row || halves.length !== 2) return { skip: true, halves: halves.length, row: !!row }
  const b = [...row.querySelectorAll('.action')].filter(x => !x.hidden).map(x => x.getBoundingClientRect())
  const hb = h.getBoundingClientRect()
  return {
    off: Math.abs((hb.left + hb.width / 2) - (b[0].right + b[1].left) / 2),
    widths: halves.map(x => Math.round(x.getBoundingClientRect().width)),
    btns: b.map(x => Math.round(x.width)),
    alone: h.classList.contains('alone'),
  } })()`)
check('the folio and study readouts split on the same line as their buttons',
  !head.skip && head.off <= 1 && head.widths[0] === head.btns[0] && head.alone === false,
  JSON.stringify(head))
// And with no folio yet there is only one readout, so nothing to divide.
await ev(`(() => { const s = window.LD.state, D = window.LD.Decimal
  s.studies = 0; s.folios = 0; s.stats.foliosEver = 0
  s.solids.forEach(d => { d.amount = new D(0); d.bought = 0 }) })()`)
await sleep(200)
check('and the divider is gone before folios exist',
  (await ev(`document.querySelector('.reset-head').classList.contains('alone')`)) === true)

// Back to the table, or every check below reads a hidden pane.
await ev(`[...document.querySelectorAll('.tab')].find(t => t.textContent.trim() === 'TABLE').click()`)
await sleep(150)
await ev(`document.documentElement.style.removeProperty('--safe-b')`)
await ev(`document.documentElement.style.removeProperty('--safe-t')`)

// The desktop row grew a column for the face and the override did not, so the
// number was auto-placed at the end of the row, six pixels wide, under the buy
// button. Cheap to assert, and invisible in a screenshot at a glance.
await send('Emulation.setDeviceMetricsOverride',{width:1440,height:900,deviceScaleFactor:1,mobile:false})
await sleep(150)
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

ws.close();chrome.kill();await sleep(150);try{rmSync(profile,{recursive:true,force:true})}catch{}
console.log(`\n${res.filter(Boolean).length}/${res.length} passed`)
process.exit(res.every(Boolean)?0:1)
