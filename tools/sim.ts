// Balance simulation.
//
// Plays the game the way a player holding MAX does, with no cleverness beyond
// taking a study or a folio the moment it is affordable, and reports how long
// the climb to the Wager takes. This is how the layer 0 numbers in balance.ts
// were chosen, and how any change to them should be checked.
//
//   npm run sim          eight simulated hours
//   npm run sim -- 24    twenty-four
import { newGame } from '../src/state'
import * as P from '../src/game/production'
import * as W from '../src/game/wager'
import { UPGRADES, buyUpgrade, canBuy, type UpgradeId } from '../src/game/upgrades'
import { format } from '../src/format'

const HOURS = Number(process.argv[2] ?? 8)
/** How many wagers to play out. The point is whether each is faster. */
const WAGERS = Number(process.env.WAGERS ?? 1)
/**
 * Above this the run stops resetting and just accumulates. Studies and folios
 * clear the ink, so near the end a reset costs more than its multiplier is
 * worth. AD players do the same thing, they stop taking galaxies and push for
 * infinity.
 */
const PUSH_AT = process.argv[3] ?? '1e200'
const DT = 0.25
const WAGER = '1.7976931348623157e308'

const s = newGame(0)
let t = 0
let nextReport = 300

const stamp = () =>
  `${String(Math.floor(t / 3600)).padStart(2)}h${String(Math.floor((t % 3600) / 60)).padStart(2, '0')}m`

let done = 0
let lastAt = 0

while (t < HOURS * 3600 && done < WAGERS) {
  P.tick(s, DT)
  t += DT

  P.maxAll(s)
  if (s.ink.lt(PUSH_AT)) {
    if (P.canBuyFolio(s)) P.buyFolio(s)
    else if (P.canBuyStudy(s)) P.buyStudy(s)
  }

  if (W.canWager(s)) {
    W.doWager(s)
    done += 1
    // Cheapest first, so a single Point is never sat on.
    for (let pass = 0; pass < 12; pass++) {
      const next = (Object.keys(UPGRADES) as UpgradeId[])
        .filter((id) => canBuy(s, id))
        .sort((a, b) => UPGRADES[a].cost - UPGRADES[b].cost)[0]
      if (!next) break
      buyUpgrade(s, next)
    }
    const took = t - lastAt
    lastAt = t
    console.log(
      `wager ${String(done).padStart(2)}  took ${String(Math.floor(took / 60)).padStart(4)}m` +
        `${String(Math.floor(took % 60)).padStart(2, '0')}s  points=${s.points}` +
        `  held=${s.pointUpgrades.length}/${Object.keys(UPGRADES).length}`,
    )
  }

  if (t >= nextReport) {
    nextReport += 600
  }
}

if (done < WAGERS) {
  console.log(`\nstalled at ${format(s.ink, 'scientific')} after ${stamp()}`)
}
