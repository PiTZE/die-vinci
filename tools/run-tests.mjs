// Runs the suites at the same time instead of one after another.
//
// They were always independent: each spawns its own Chrome into its own
// throwaway profile on its own ephemeral port, and none of them touch the
// repo. Running them in sequence was habit, not a requirement, and it made a
// full pass the sum of every suite rather than the length of the slowest.
//
//   npm test           three at a time
//   npm test -- 5      five, if the box has the memory
//
// Three by default because a headless Chrome is about 250MB and this box has
// 3.7GB. Overshoot that and the run is slower, not faster.
import { spawn } from 'node:child_process'

const SUITES = [
  // Longest first, so the slow ones are not left starting last.
  'roll', 'freeze', 'ui', 'layout', 'away', 'confirm', 'challenge',
  'spoilers', 'wager', 'backup', 'install', 'channels', 'durability', 'save',
]

/** One less than the cores. Half the cores measured slower on four (76s
 *  against 67s) because `roll` alone is 35s and the rest has to fit around it,
 *  and more than this starves the pages badly enough that a suite times its
 *  own animation as frozen. */
import { cpus } from 'node:os'
const DEFAULT_LIMIT = Math.max(2, Math.min(4, cpus().length - 1))
const LIMIT = Number(process.argv[2]) || DEFAULT_LIMIT
const started = Date.now()
const results = new Map()
let next = 0

function run(name) {
  return new Promise((resolve) => {
    const at = Date.now()
    const child = spawn('npm', ['run', `test:${name}`], { stdio: ['ignore', 'pipe', 'pipe'] })
    let out = ''
    child.stdout.on('data', (d) => (out += d))
    child.stderr.on('data', (d) => (out += d))
    child.on('close', (code) => {
      const line = out.split('\n').reverse().find((l) => /^\d+\/\d+ passed/.test(l.trim()))
      const fails = out.split('\n').filter((l) => l.startsWith('FAIL'))
      results.set(name, { code, line: line?.trim() ?? 'no result line', fails, secs: (Date.now() - at) / 1000 })
      const mark = code === 0 ? 'ok  ' : 'FAIL'
      console.log(`${mark} ${name.padEnd(12)} ${((Date.now() - at) / 1000).toFixed(1)}s   ${line?.trim() ?? ''}`)
      resolve()
    })
  })
}

async function worker() {
  while (next < SUITES.length) await run(SUITES[next++])
}

await Promise.all(Array.from({ length: Math.min(LIMIT, SUITES.length) }, worker))

const failed = [...results.entries()].filter(([, r]) => r.code !== 0)
for (const [name, r] of failed) {
  for (const f of r.fails) console.log(`  ${name}: ${f}`)
}
const checks = [...results.values()].reduce((a, r) => {
  const m = /^(\d+)\/(\d+) passed/.exec(r.line)
  return m ? a + Number(m[2]) : a
}, 0)
console.log(
  `\n${SUITES.length - failed.length}/${SUITES.length} suites, ${checks} checks, ` +
    `${((Date.now() - started) / 1000).toFixed(1)}s wall`,
)
process.exit(failed.length ? 1 : 0)
