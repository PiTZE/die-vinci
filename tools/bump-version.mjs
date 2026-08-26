// Bumps the game version in package.json.
//
// Every segment carries at nine rather than counting on forever, so the
// sequence runs 0.0.1, 0.0.2 ... 0.0.9, 0.1.0, 0.1.1 ... 0.9.9, 1.0.0.
//
//   npm run bump            0.0.1 -> 0.0.2
//   npm run bump -- minor   0.0.4 -> 0.1.0
//   npm run bump -- major   0.4.2 -> 1.0.0
import { readFileSync, writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const file = join(root, 'package.json')
const pkg = JSON.parse(readFileSync(file, 'utf8'))

const parts = String(pkg.version).split('.').map(Number)
if (parts.length !== 3 || parts.some((n) => !Number.isInteger(n) || n < 0)) {
  console.error(`cannot parse version "${pkg.version}"`)
  process.exit(1)
}

let [major, minor, patch] = parts
const level = process.argv[2] ?? 'patch'

if (level === 'major') {
  major += 1
  minor = 0
  patch = 0
} else if (level === 'minor') {
  minor += 1
  patch = 0
} else if (level === 'patch') {
  patch += 1
} else {
  console.error(`unknown level "${level}", expected patch, minor or major`)
  process.exit(1)
}

// The carry. Nine is the last digit a segment holds.
if (patch > 9) {
  patch = 0
  minor += 1
}
if (minor > 9) {
  minor = 0
  major += 1
}

const next = `${major}.${minor}.${patch}`
pkg.version = next
writeFileSync(file, `${JSON.stringify(pkg, null, 2)}\n`)
console.log(`${parts.join('.')} -> ${next}`)
