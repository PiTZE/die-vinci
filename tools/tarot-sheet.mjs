// Builds the temporary comparison sheet at leo.generis.ir/tarot.
//
// Three sets side by side: the two licensed ones found while looking for
// something to use, and the ones drawn here. Regenerate and redeploy with
//
//   node tools/tarot-sheet.mjs && sudo rsync -a tarot-sheet/ /var/www/leonard/tarot/
import { readFileSync, readdirSync, writeFileSync, mkdirSync, existsSync } from 'node:fs'
import { join } from 'node:path'
import { ART, ARCANA } from './arcana-art.mjs'

const REF = process.env.REF_DIR ?? ''
const OUT = 'tarot-sheet'

/** Inlines a downloaded file, stripped of the XML declaration and sized. */
function inline(path, box) {
  try {
    return readFileSync(path, 'utf8')
      .replace(/<\?xml[^>]*\?>/g, '')
      .replace(/\swidth="[^"]*"/g, '')
      .replace(/\sheight="[^"]*"/g, '')
      .replace('<svg', `<svg style="width:${box};height:${box}"`)
      .replace(/\n/g, '')
  } catch {
    return '<span class="missing">missing</span>'
  }
}

const ours = ARCANA.map(([id, numeral, name]) => {
  const art = ART[id]
  return `<figure class="cell${art ? '' : ' todo'}">
    <div class="art">${art
      ? `<svg viewBox="0 0 48 48" fill="none" stroke="currentColor" stroke-width="1.25"
           stroke-linecap="round" stroke-linejoin="round">${art}</svg>`
      : '<span class="missing">not drawn yet</span>'}</div>
    <figcaption><b>${numeral}</b> ${name}</figcaption></figure>`
}).join('')

function refSection(dir, files, box) {
  if (!existsSync(dir)) return '<p class="missing">not downloaded</p>'
  return files.map((f) =>
    `<figure class="cell"><div class="art ref">${inline(join(dir, f), box)}</div>
     <figcaption>${f.replace(/\.svg$/, '').replace(/^tarot-\d+-/, '')}</figcaption></figure>`).join('')
}

const giDir = join(REF, 'gi')
const ogaDir = join(REF, 'oga/vectorIcons')
const gi = existsSync(giDir) ? readdirSync(giDir).filter((f) => f.endsWith('.svg')).sort() : []
const oga = existsSync(ogaDir) ? readdirSync(ogaDir).filter((f) => f.endsWith('.svg')).sort() : []

const drawn = Object.keys(ART).length
const html = `<!doctype html><html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>die Vinci - arcana comparison</title>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=IBM+Plex+Mono:wght@400;600&display=swap">
<style>
  :root { --bg:#000; --fg:#fff; --dim:#aaa; --line:#333; --accent:#ff0000; }
  * { box-sizing: border-box; }
  body { margin:0; background:var(--bg); color:var(--fg);
    font:14px/1.6 'IBM Plex Mono',ui-monospace,monospace; padding:28px 20px 80px; }
  h1 { font-size:1.1rem; letter-spacing:.14em; font-weight:600; margin:0 0 4px; }
  h2 { font-size:.78rem; letter-spacing:.14em; color:var(--fg); font-weight:600;
    margin:44px 0 2px; padding-bottom:8px; border-bottom:1px solid var(--line); }
  p.note { color:var(--dim); font-size:.72rem; margin:8px 0 0; max-width:62rem; }
  p.note a { color:var(--fg); }
  .grid { display:grid; grid-template-columns:repeat(auto-fill,minmax(9rem,1fr));
    gap:10px; margin-top:18px; }
  .cell { margin:0; border:1px solid var(--line); padding:10px 8px; text-align:center; }
  .cell.todo { border-style:dashed; }
  .art { height:78px; display:flex; align-items:center; justify-content:center; color:var(--fg); }
  .art svg { max-width:72px; max-height:72px; }
  /* The reference sets carry their own black fills, so they need a light plate
     to be visible at all on this page. That is itself the finding. */
  .art.ref { background:#fff; border-radius:2px; }
  figcaption { color:var(--dim); font-size:.62rem; letter-spacing:.06em; margin-top:8px;
    overflow:hidden; text-overflow:ellipsis; }
  figcaption b { color:var(--fg); font-weight:600; }
  .missing { color:#666; font-size:.6rem; letter-spacing:.08em; }
  .tally { color:var(--accent); font-size:.72rem; letter-spacing:.1em; }
</style></head><body>
<h1>THE ARCANA &mdash; WHAT FITS</h1>
<p class="note">A temporary sheet for choosing artwork. Not part of the game.
  Built ${new Date().toISOString().slice(0, 16).replace('T', ' ')}.</p>

<h2>ALSO DRAWN, NOT USED <span class="tally">${drawn}/22</span></h2>
<p class="note">Stroke on a 48&times;48 box at 1.25 weight, matching the nine polyhedra. Kept here
  for comparison. Strength and the Fool never got good: the traditional Strength is a woman closing a
  lion's jaws, and no reduction of that survived at this size.</p>
<div class="grid">${ours}</div>

<h2>GAME-ICONS.NET &mdash; 22 ARCANA</h2>
<p class="note">By caro-asercion, <a href="https://game-icons.net/tags/tarot.html">game-icons.net</a>,
  licensed <a href="https://creativecommons.org/licenses/by/3.0/">CC BY 3.0</a>. Complete and
  well drawn, and solid silhouettes: a black plate with a white shape cut out of it, no strokes
  anywhere. They cannot take <code>currentColor</code> and they read as heavy blocks next to a
  wireframe. Shown on white because they carry their own black.</p>
<div class="grid">${refSection(giDir, gi, '72px')}</div>

<h2>OPENGAMEART &mdash; CC0 ARCANA ICONS <span class="tally">IN USE</span></h2>
<p class="note"><b>This is the set the game uses.</b>
  <a href="https://opengameart.org/content/patreon-public-domain-art-tarot-arcana-icons">Public domain
  (CC0)</a>, so nothing is owed for them and nothing restricts where they go. Each arrived as one
  filled path with the fill hardcoded black; the fill is dropped and set to <code>currentColor</code>
  where they are drawn, so a card takes the theme's foreground. Each keeps the viewBox it came with
  rather than being squeezed into a square none of them was drawn for.</p>
<div class="grid">${refSection(ogaDir, oga, '68px')}</div>
</body></html>`

mkdirSync(OUT, { recursive: true })
writeFileSync(join(OUT, 'index.html'), html)
console.log(`wrote ${OUT}/index.html  (${drawn}/22 drawn, ${gi.length} game-icons, ${oga.length} cc0)`)
