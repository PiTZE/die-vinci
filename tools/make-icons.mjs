// Generates the PWA icons from tools/assets/mona-lisa.svg.
//
// There is no SVG rasteriser on this box, but there is a Chrome, so the SVG is
// cropped by viewBox, wrapped in a page, and screenshotted at each size.
//
//   npm run icons
import { execFileSync } from 'node:child_process'
import { mkdtempSync, writeFileSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const svg = readFileSync(join(root, 'tools/assets/mona-lisa.svg'), 'utf8')

/** Re-aims the drawing without touching its paths. */
function crop(box) {
  return svg.replace(/viewBox="[^"]+"/, `viewBox="${box}"`)
}

const TARGETS = [
  // Head and shoulders. The full portrait is 2:3, so squaring it either bars
  // the sides or shrinks her to nothing.
  { file: 'public/icon-192.png', size: 192, box: '20 25 160 160' },
  { file: 'public/icon-512.png', size: 512, box: '20 25 160 160' },
  // A maskable icon gets cropped to a circle, so this pulls back to keep her
  // inside the safe zone rather than losing the top of her head to the mask.
  { file: 'public/icon-512-maskable.png', size: 512, box: '-20 -12 240 240' },
]

const dir = mkdtempSync(join(tmpdir(), 'ld-icons-'))
for (const t of TARGETS) {
  const page = join(dir, 'icon.html')
  writeFileSync(
    page,
    `<!doctype html><meta charset="utf-8"><style>
html,body{margin:0;padding:0;background:#fff;width:${t.size}px;height:${t.size}px;overflow:hidden}
svg{display:block;width:${t.size}px;height:${t.size}px}</style>${crop(t.box)}`,
  )
  execFileSync(
    'google-chrome',
    [
      '--headless=new',
      '--no-sandbox',
      '--disable-gpu',
      '--hide-scrollbars',
      `--window-size=${t.size},${t.size}`,
      `--screenshot=${join(root, t.file)}`,
      `file://${page}`,
    ],
    { stdio: 'pipe' },
  )
  console.log(`wrote ${t.file} at ${t.size}px`)
}
rmSync(dir, { recursive: true, force: true })
