// Generates the PWA icons from the same icosahedron the game draws.
//
// There is no SVG rasteriser on this box, but there is a Chrome, so the SVG is
// wrapped in a page and screenshotted at each size. Run with:
//   node tools/make-icons.mjs
import { execFileSync } from 'node:child_process'
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const PHI = (1 + Math.sqrt(5)) / 2

function icosahedron() {
  const vs = []
  for (const [a, b, c] of [
    [0, 1, PHI],
    [1, PHI, 0],
    [PHI, 0, 1],
  ]) {
    for (const sy of [1, -1]) {
      for (const sz of [1, -1]) {
        vs.push([a * (a ? 1 : 1), b * sy, c * sz].map((v, i) => (i === 0 ? a : v)))
      }
    }
  }
  // Rebuild cleanly: cyclic permutations of (0, +-1, +-PHI).
  const out = []
  const base = [
    [0, 1, PHI],
    [1, PHI, 0],
    [PHI, 0, 1],
  ]
  for (const v of base) {
    for (const s1 of [1, -1]) {
      for (const s2 of [1, -1]) {
        const p = v.map((x) => x)
        const idx = p.map((x, i) => (x !== 0 ? i : -1)).filter((i) => i >= 0)
        p[idx[0]] *= s1
        p[idx[1]] *= s2
        out.push(p)
      }
    }
  }
  const uniq = []
  for (const v of out) {
    if (!uniq.some((w) => w.every((x, i) => Math.abs(x - v[i]) < 1e-9))) uniq.push(v)
  }
  const r = Math.max(...uniq.map((v) => Math.hypot(...v)))
  return uniq.map((v) => v.map((x) => x / r))
}

function edges(vs) {
  const d = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2])
  let min = Infinity
  for (let i = 0; i < vs.length; i++)
    for (let j = i + 1; j < vs.length; j++) min = Math.min(min, d(vs[i], vs[j]))
  const es = []
  for (let i = 0; i < vs.length; i++)
    for (let j = i + 1; j < vs.length; j++) if (d(vs[i], vs[j]) < min * 1.0001) es.push([i, j])
  return es
}

function svg(scale, stroke) {
  const vs = icosahedron()
  const es = edges(vs)
  const ay = 0.62
  const ax = 0.38
  const p = vs.map(([x, y, z]) => {
    const x1 = x * Math.cos(ay) + z * Math.sin(ay)
    const z1 = -x * Math.sin(ay) + z * Math.cos(ay)
    const y2 = y * Math.cos(ax) - z1 * Math.sin(ax)
    const z2 = y * Math.sin(ax) + z1 * Math.cos(ax)
    return [x1, y2, z2]
  })
  let near = ''
  let far = ''
  for (const [a, b] of es) {
    const seg = `M${p[a][0].toFixed(4)} ${p[a][1].toFixed(4)}L${p[b][0].toFixed(4)} ${p[b][1].toFixed(4)}`
    if (p[a][2] + p[b][2] < 0) far += seg
    else near += seg
  }
  const vb = 1 / scale
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${-vb} ${-vb} ${vb * 2} ${vb * 2}">
  <path d="${far}" fill="none" stroke="#ffffff" stroke-opacity="0.4" stroke-width="${stroke}"/>
  <path d="${near}" fill="none" stroke="#ffffff" stroke-width="${stroke}"/>
</svg>`
}

const TARGETS = [
  { file: 'public/icon-192.png', size: 192, scale: 0.86, stroke: 0.05 },
  { file: 'public/icon-512.png', size: 512, scale: 0.86, stroke: 0.038 },
  // Maskable icons get cropped to a circle, so the solid sits inside the safe zone.
  { file: 'public/icon-512-maskable.png', size: 512, scale: 0.58, stroke: 0.028 },
]

const dir = mkdtempSync(join(tmpdir(), 'ld-icons-'))
for (const t of TARGETS) {
  const html = `<!doctype html><meta charset="utf-8"><style>
html,body{margin:0;padding:0;background:#000;width:${t.size}px;height:${t.size}px;overflow:hidden}
svg{display:block;width:${t.size}px;height:${t.size}px}</style>${svg(t.scale, t.stroke)}`
  const page = join(dir, 'icon.html')
  writeFileSync(page, html)
  execFileSync(
    'google-chrome',
    [
      '--headless=new',
      '--no-sandbox',
      '--disable-gpu',
      '--hide-scrollbars',
      `--window-size=${t.size},${t.size}`,
      `--screenshot=${t.file}`,
      `file://${page}`,
    ],
    { stdio: 'pipe' },
  )
  console.log(`wrote ${t.file} at ${t.size}px`)
}
rmSync(dir, { recursive: true, force: true })
