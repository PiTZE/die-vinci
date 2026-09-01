import Decimal from '../src/vendor/break-infinity'
import { newGame } from '../src/state'
import * as P from '../src/game/production'
import * as W from '../src/game/wager'
import { modifiers } from '../src/game/tarot'

const s: any = newGame(0)
s.tarot = { hierophant: 1 }
s.wagers = 1
// Straight after a Wager: one solid, the starting ink.
P.tick(s, 0.001, 1)
console.log('after wager-ish: ink', s.ink.toString(), 'open', P.openSolids(s))
console.log('keepInk', modifiers(s).keepInk.toString())

s.ink = new Decimal(1e3)
P.maxAll(s)
console.log('after maxAll: ink', s.ink.toString(),
  'd4', s.solids[0].amount.toString(), 'bought', s.solids[0].bought)
console.log('canBuyStudy', P.canBuyStudy(s))
if (P.canBuyStudy(s)) P.buyStudy(s)
console.log('after study: ink', s.ink.toString(), 'studies', s.studies,
  'open', P.openSolids(s), 'd4', s.solids[0].amount.toString())

let ms = 1000
for (let i = 0; i < 40; i++) {
  if (!s.rollStartedAt) s.rollStartedAt = ms
  ms += 250
  P.tick(s, 0.25, ms)
}
console.log('after 10s of rolling: ink', s.ink.toString(),
  'faces', JSON.stringify(s.faces.slice(0, 3)), 'rollStartedAt', s.rollStartedAt)
console.log('mustWager', P.mustWager(s), 'haltMs', s.haltMs)
