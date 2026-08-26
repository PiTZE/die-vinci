// The Points grid, ported from Antimatter Dimensions' Infinity upgrades in
// src/core/secret-formula/infinity/infinity-upgrades.js.
//
// AD lays them out as three chains, each upgrade needing the one before it.
// Costs and effect formulas below are its own. Two deliberate changes: the
// chain that ends in its IP generator stops one short, because that upgrade
// depends on machinery this game does not have yet, and the paired-solid
// upgrades cover three solids in the middle rather than two, because nine
// solids do not divide into pairs.
import Decimal from 'break_infinity.js'
import type { GameState } from '../state'

export type UpgradeId =
  | 'timeMult'
  | 'solids19'
  | 'solids37'
  | 'resetBoost'
  | 'buyTenMult'
  | 'solids28'
  | 'solids456'
  | 'folioBoost'
  | 'wagerTimeMult'
  | 'unspentMult'
  | 'studyPower'

export interface UpgradeDef {
  id: UpgradeId
  cost: number
  /** Must be bought first. Roots have none. */
  needs?: UpgradeId
  label: string
  note: string
}

/** Three columns, top to bottom, exactly as AD chains them. */
export const UPGRADE_CHAINS: UpgradeId[][] = [
  ['timeMult', 'solids19', 'solids37', 'resetBoost'],
  ['buyTenMult', 'solids28', 'solids456', 'folioBoost'],
  ['wagerTimeMult', 'unspentMult', 'studyPower'],
]

export const UPGRADES: Record<UpgradeId, UpgradeDef> = {
  timeMult: {
    id: 'timeMult',
    cost: 1,
    label: 'HOURS',
    note: 'every solid gains a multiplier from time played',
  },
  solids19: {
    id: 'solids19',
    cost: 1,
    needs: 'timeMult',
    label: 'd4 d72',
    note: 'first and last solid gain a multiplier from wagers',
  },
  solids37: {
    id: 'solids37',
    cost: 1,
    needs: 'solids19',
    label: 'd8 d26',
    note: 'third and seventh solid gain a multiplier from wagers',
  },
  resetBoost: {
    id: 'resetBoost',
    cost: 1,
    needs: 'solids37',
    label: 'CHEAPER',
    note: 'studies and folios need 9 fewer solids',
  },
  buyTenMult: {
    id: 'buyTenMult',
    cost: 1,
    label: 'PER TEN',
    note: 'ten of a solid multiplies it by 2.2 instead of 2',
  },
  solids28: {
    id: 'solids28',
    cost: 1,
    needs: 'buyTenMult',
    label: 'd6 d32',
    note: 'second and eighth solid gain a multiplier from wagers',
  },
  solids456: {
    id: 'solids456',
    cost: 1,
    needs: 'solids28',
    label: 'd12 d14 d20',
    note: 'the middle three solids gain a multiplier from wagers',
  },
  folioBoost: {
    id: 'folioBoost',
    cost: 2,
    needs: 'solids456',
    label: 'FOLIOS',
    note: 'every folio is twice as strong',
  },
  wagerTimeMult: {
    id: 'wagerTimeMult',
    cost: 3,
    label: 'THIS RUN',
    note: 'every solid gains a multiplier from time in this wager',
  },
  unspentMult: {
    id: 'unspentMult',
    cost: 5,
    needs: 'wagerTimeMult',
    label: 'UNSPENT',
    note: 'the first solid gains a multiplier from unspent points',
  },
  studyPower: {
    id: 'studyPower',
    cost: 7,
    needs: 'unspentMult',
    label: 'STUDIES',
    note: 'studies multiply by 2.5 instead of 2',
  },
}

export function isBought(s: GameState, id: UpgradeId): boolean {
  return s.pointUpgrades.includes(id)
}

export function isAvailable(s: GameState, id: UpgradeId): boolean {
  const def = UPGRADES[id]
  if (isBought(s, id)) return false
  return !def.needs || isBought(s, def.needs)
}

export function canBuy(s: GameState, id: UpgradeId): boolean {
  return isAvailable(s, id) && s.points.gte(UPGRADES[id].cost)
}

export function buyUpgrade(s: GameState, id: UpgradeId): boolean {
  if (!canBuy(s, id)) return false
  s.points = s.points.minus(UPGRADES[id].cost)
  s.pointUpgrades.push(id)
  return true
}

// -- effects --------------------------------------------------------------

/** AD: (totalMinutesPlayed / 2) ^ 0.15, applied to every dimension. */
export function timeMultiplier(s: GameState): Decimal {
  if (!isBought(s, 'timeMult')) return new Decimal(1)
  const minutes = s.stats.playMs / 60000
  return new Decimal(Math.max(1, Math.pow(Math.max(minutes, 0) / 2, 0.15)))
}

/** AD: max((thisInfinityMinutes / 4) ^ 0.25, 1). */
export function runMultiplier(s: GameState): Decimal {
  if (!isBought(s, 'wagerTimeMult')) return new Decimal(1)
  const minutes = s.stats.wagerMs / 60000
  return new Decimal(Math.max(1, Math.pow(Math.max(minutes, 0) / 4, 0.25)))
}

/** AD's dimInfinityMult: infinities * 0.2 + 1, here wagers. */
function wagerMultiplier(s: GameState): Decimal {
  return new Decimal(s.wagers * 0.2 + 1)
}

/** Which solids each paired upgrade covers. Nine do not split into pairs, so
 *  the fourth covers the middle three rather than leaving one uncovered. */
const PAIRS: [UpgradeId, number[]][] = [
  ['solids19', [1, 9]],
  ['solids28', [2, 8]],
  ['solids37', [3, 7]],
  ['solids456', [4, 5, 6]],
]

/** idx is 1-based. */
export function pairMultiplier(s: GameState, idx: number): Decimal {
  for (const [id, tiers] of PAIRS) {
    if (tiers.includes(idx) && isBought(s, id)) return wagerMultiplier(s)
  }
  return new Decimal(1)
}

/** AD: (unspentIP / 2) ^ 1.5 + 1, on the first dimension only. */
export function unspentMultiplier(s: GameState, idx: number): Decimal {
  if (idx !== 1 || !isBought(s, 'unspentMult')) return new Decimal(1)
  return s.points.div(2).pow(1.5).plus(1)
}

/** AD's buy10Mult is 1.1, applied on top of the x2 per ten. */
export function perTenMultiplier(s: GameState): Decimal {
  return new Decimal(isBought(s, 'buyTenMult') ? 2.2 : 2)
}

/** AD's dimboostMult, taken as a max against the base of 2. */
export function studyPower(s: GameState): number {
  return isBought(s, 'studyPower') ? 2.5 : 2
}

/** AD's galaxyBoost doubles galaxy strength. */
export function folioStrength(s: GameState): number {
  return isBought(s, 'folioBoost') ? 2 : 1
}

/** AD's resetBoost takes 9 off both requirements. */
export function requirementDiscount(s: GameState): number {
  return isBought(s, 'resetBoost') ? 9 : 0
}
