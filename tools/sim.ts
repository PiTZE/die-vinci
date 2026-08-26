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
import { format } from '../src/format'

const HOURS = Number(process.argv[2] ?? 8)
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

while (t < HOURS * 3600 && s.ink.lt(WAGER)) {
  P.tick(s, DT)
  t += DT

  P.maxAll(s)
  if (s.ink.lt(PUSH_AT)) {
    if (P.canBuyFolio(s)) P.buyFolio(s)
    else if (P.canBuyStudy(s)) P.buyStudy(s)
  }

  if (t >= nextReport) {
    nextReport += 300
    console.log(
      `${stamp()}  ${format(s.ink, 'scientific').padEnd(11)}  ` +
        `studies=${String(s.studies).padStart(2)} folios=${String(s.folios).padStart(2)} ` +
        `roll=${String(s.rollUpgrades).padStart(3)} rate=${P.rollRate(s).toExponential(1)}/s`,
    )
  }
}

console.log(
  s.ink.gte(WAGER)
    ? `\nWAGER REACHED at ${stamp()}  folios=${s.folios} studies=${s.studies}`
    : `\nstalled at ${format(s.ink, 'scientific')} after ${stamp()}  folios=${s.folios} studies=${s.studies}`,
)
