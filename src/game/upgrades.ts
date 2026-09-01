// The Points grid, ported from Antimatter Dimensions' Infinity upgrades in
// src/core/secret-formula/infinity/infinity-upgrades.js.
//
// AD lays them out as three chains, each upgrade needing the one before it.
// Costs and effect formulas below are its own. Two deliberate changes: the
// chain that ends in its IP generator stops one short, because that upgrade
// depends on machinery this game does not have yet, and the paired-solid
// upgrades cover three solids in the middle rather than two, because nine
// solids do not divide into pairs.
import Decimal from '../vendor/break-infinity'
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
  | 'wagerChips'
  | 'chipGen'
  | 'skipStudy1'
  | 'skipStudy2'
  | 'skipStudy3'
  | 'skipFolio'

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
  ['wagerTimeMult', 'unspentMult', 'studyPower', 'wagerChips'],
  // AD's grid does not stop at eleven either. Its last five cost 10, 20, 40,
  // 80 and 300, and four of them are the same idea: begin the run further
  // along than the last one began. That is what changes the pace, rather than
  // another multiplier on a table you still have to build from nothing.
  ['chipGen', 'skipStudy1', 'skipStudy2', 'skipStudy3', 'skipFolio'],
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
    note: 'the first solid gains a multiplier from unspent chips',
  },
  studyPower: {
    id: 'studyPower',
    cost: 7,
    needs: 'unspentMult',
    label: 'STUDIES',
    note: 'studies multiply by 2.5 instead of 2',
  },
  wagerChips: {
    id: 'wagerChips',
    cost: 9,
    needs: 'studyPower',
    label: 'THE COUNT',
    note: 'every Wager pays more chips the more of them you have called',
  },
  chipGen: {
    id: 'chipGen',
    cost: 10,
    needs: 'wagerChips',
    label: 'THE FLOAT',
    note: 'chips arrive on their own, ten times slower than your fastest Wager',
  },
  skipStudy1: {
    id: 'skipStudy1',
    cost: 20,
    needs: 'chipGen',
    label: 'ONE AHEAD',
    note: 'every run begins with a study already taken',
  },
  skipStudy2: {
    id: 'skipStudy2',
    cost: 40,
    needs: 'skipStudy1',
    label: 'TWO AHEAD',
    note: 'and a second',
  },
  skipStudy3: {
    id: 'skipStudy3',
    cost: 80,
    needs: 'skipStudy2',
    label: 'THREE AHEAD',
    note: 'and a third',
  },
  skipFolio: {
    id: 'skipFolio',
    cost: 300,
    needs: 'skipStudy3',
    label: 'ALREADY BOUND',
    note: 'every run begins with a folio bound',
  },
}

export function isBought(s: GameState, id: UpgradeId): boolean {
  return s.chipUpgrades.includes(id)
}

export function isAvailable(s: GameState, id: UpgradeId): boolean {
  const def = UPGRADES[id]
  if (isBought(s, id)) return false
  return !def.needs || isBought(s, def.needs)
}

export function canBuy(s: GameState, id: UpgradeId): boolean {
  return isAvailable(s, id) && s.chips.gte(UPGRADES[id].cost)
}

export function buyUpgrade(s: GameState, id: UpgradeId): boolean {
  if (!canBuy(s, id)) return false
  s.chips = s.chips.minus(UPGRADES[id].cost)
  s.chipUpgrades.push(id)
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
  return s.chips.div(2).pow(1.5).plus(1)
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

/**
 * What a Wager pays, scaled by how many you have called.
 *
 * Antimatter Dimensions' infinitiedMult shape, 1 + log10(count) * k, which it
 * uses to multiply dimensions by Infinities completed. Here it multiplies the
 * payout instead, because the payout is what the break layer is paced by.
 *
 * Its own k is 10, and that is too generous: modelled against a Wager that
 * settles at 56 seconds, ten brings breaking inside two hours where the flat
 * payout takes thirty. Four lands it near three and a half, which is an
 * evening rather than a working week and still asks for a few hundred Wagers.
 */
export function wagerChipMultiplier(s: GameState): Decimal {
  if (!isBought(s, 'wagerChips')) return new Decimal(1)
  return new Decimal(1 + Math.log10(Math.max(1, s.wagers)) * 4)
}

/**
 * Studies a run starts with, AD's skipReset1/2/3.
 *
 * They are studies rather than solids: a study is what unlocks the next solid,
 * so starting with three is starting with a four-deep chain instead of a die.
 */
export function startingStudies(s: GameState): number {
  let n = 0
  if (isBought(s, 'skipStudy1')) n += 1
  if (isBought(s, 'skipStudy2')) n += 1
  if (isBought(s, 'skipStudy3')) n += 1
  return n
}

/** AD's skipResetGalaxy, which starts you a whole galaxy in. */
export function startingFolios(s: GameState): number {
  return isBought(s, 'skipFolio') ? 1 : 0
}

/**
 * AD's passiveGen: chips at a tenth of the rate your fastest Wager earned
 * them. Its own line is "Passively generate Infinity Points 10 times slower
 * than your fastest Infinity".
 */
export function chipsPerSecondFromGrid(s: GameState, perWager: Decimal): Decimal {
  if (!isBought(s, 'chipGen') || !Number.isFinite(s.stats.bestWagerMs)) return new Decimal(0)
  const seconds = Math.max(0.1, s.stats.bestWagerMs / 1000)
  return perWager.div(seconds * 10)
}
