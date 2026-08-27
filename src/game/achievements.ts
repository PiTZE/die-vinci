// The Conquestion Archive.
//
// Antimatter Dimensions calls these achievements and lays them out in rows of
// eight, each a condition checked every tick and permanent once met. Some carry
// a small reward. This is a smaller set of the same idea, named after the
// notebooks rather than the genre.
import Decimal from 'break_infinity.js'
import type { GameState } from '../state'
import { SOLID_COUNT } from './solids'
import { AUTOBUYERS } from './autobuyers'

export interface AchievementDef {
  id: string
  name: string
  note: string
  done: (s: GameState) => boolean
  /**
   * When this entry is allowed to be seen at all.
   *
   * Without it the archive is a table of contents for the whole game: someone
   * ten minutes in could read "call the Wager", "clear a challenge" and "bind
   * a folio" and know the shape of everything ahead. An entry appears once the
   * thing it names exists, and an entry already earned always shows.
   */
  needs?: (s: GameState) => boolean
}

/** True once the player has met the system each group of entries is about. */
const seenFolios = (s: GameState) => s.folios > 0 || s.wagers > 0
const seenWager = (s: GameState) => s.wagers > 0
const seenChallenges = (s: GameState) => s.wagers > 0
const seenAutobuyers = (s: GameState) =>
  s.challengesDone.length > 0 || Object.values(s.autobuyers).some((a) => a.unlocked)

const bought = (s: GameState) => s.solids.reduce((a, d) => a + d.bought, 0)

export const ACHIEVEMENTS: AchievementDef[] = [
  { id: 'first', name: 'First Ink', note: 'buy a single tetrahedron',
    done: (s) => s.solids[0].bought >= 1 },
  { id: 'ten', name: 'A Group of Ten', note: 'earn a doubling on any solid',
    done: (s) => s.solids.some((d) => d.bought >= 10) },
  { id: 'faster', name: 'Quicker Hand', note: 'buy a roll rate upgrade',
    done: (s) => s.rollUpgrades >= 1 },
  { id: 'study1', name: 'Sheet One', note: 'take a study',
    done: (s) => s.studies >= 1 },
  { id: 'openall', name: 'The Whole Table', note: 'unlock every solid',
    done: (s) => s.studies >= SOLID_COUNT - 4,
    needs: (s) => s.studies >= 1 },
  { id: 'folio1', name: 'Bound', note: 'bind a folio',
    done: (s) => s.folios >= 1,
    needs: seenFolios },
  { id: 'folio5', name: 'A Quire', note: 'bind five folios',
    done: (s) => s.folios >= 5,
    needs: seenFolios },
  { id: 'roll50', name: 'Blur', note: 'reach fifty roll rate upgrades',
    done: (s) => s.rollUpgrades >= 50,
    needs: (s) => s.rollUpgrades >= 20 },
  { id: 'wager1', name: 'The Interrupted Game', note: 'call the Wager',
    done: (s) => s.wagers >= 1,
    needs: (s) => s.ink.gte('1e290') || s.wagers > 0 },
  { id: 'wager5', name: 'Pacioli Would Approve', note: 'call it five times',
    done: (s) => s.wagers >= 5,
    needs: seenWager },
  { id: 'wager25', name: 'Division of Stakes', note: 'call it twenty-five times',
    done: (s) => s.wagers >= 25,
    needs: seenWager },
  { id: 'points10', name: 'Problem of Points', note: 'hold ten points at once',
    done: (s) => s.points.gte(10),
    needs: seenWager },
  { id: 'grid', name: 'Fully Read', note: 'buy every points upgrade',
    done: (s) => s.pointUpgrades.length >= 11,
    needs: seenWager },
  { id: 'chal1', name: 'Under Constraint', note: 'clear a challenge',
    done: (s) => s.challengesDone.length >= 1,
    needs: seenChallenges },
  { id: 'chal6', name: 'Half the Ladder', note: 'clear six challenges',
    done: (s) => s.challengesDone.length >= 6,
    needs: seenChallenges },
  { id: 'chalall', name: 'Nothing Left to Prove', note: 'clear every challenge',
    done: (s) => s.challengesDone.length >= 12,
    needs: seenChallenges },
  { id: 'auto1', name: 'It Rolls Itself', note: 'unlock an autobuyer',
    done: (s) => AUTOBUYERS.some((a) => s.autobuyers[a.id]?.unlocked),
    needs: seenAutobuyers },
  { id: 'autoall', name: 'The Machine Learns', note: 'unlock every autobuyer',
    done: (s) => AUTOBUYERS.every((a) => s.autobuyers[a.id]?.unlocked),
    needs: seenAutobuyers },
  { id: 'autofast', name: 'Faster Than Thought', note: 'take an autobuyer to its floor',
    done: (s) => AUTOBUYERS.some((a) => (s.autobuyers[a.id]?.level ?? 0) >= 5),
    needs: seenAutobuyers },
  { id: 'bought500', name: 'Industrious', note: 'buy five hundred solids in one run',
    done: (s) => bought(s) >= 500 },
  { id: 'sphere', name: 'Septuaginta Duarum Basium', note: 'own a sphere of seventy-two',
    done: (s) => s.solids[SOLID_COUNT - 1].amount.gte(1),
    needs: (s) => s.studies >= 7 },
  { id: 'away', name: 'It Kept Working', note: 'return to eight hours of progress',
    done: (s) => s.stats.playMs >= 8 * 3600_000 },
  { id: 'hour', name: 'An Hour at the Table', note: 'play for an hour',
    done: (s) => s.stats.playMs >= 3600_000 },
  { id: 'arcana1', name: 'The Fool Sets Out', note: 'keep your first arcanum',
    done: (s) => Object.values(s.tarot ?? {}).some((l) => l > 0),
    needs: (s) => s.wagers > 0 },
  { id: 'arcanaall', name: 'The Whole Deck', note: 'hold all twenty-two arcana',
    done: (s) => Object.values(s.tarot ?? {}).filter((l) => l > 0).length >= 22,
    needs: (s) => Object.values(s.tarot ?? {}).some((l) => l > 0) },
  { id: 'arcana5', name: 'Read Deeply', note: 'take one arcanum to level five',
    done: (s) => Object.values(s.tarot ?? {}).some((l) => l >= 5),
    needs: (s) => Object.values(s.tarot ?? {}).some((l) => l > 0) },
  { id: 'melt1', name: 'Nothing Is Lost', note: 'melt the table',
    done: (s) => s.stats.melts >= 1,
    needs: (s) => (s.tarot?.death ?? 0) > 0 },
  { id: 'meltbig', name: 'Everything Returns', note: 'melt for a hundredfold',
    done: (s) => s.meltPower.gte(100),
    needs: (s) => (s.tarot?.death ?? 0) > 0 },
  { id: 'light', name: 'Modus Operandi', note: 'read by daylight',
    done: () => document.documentElement.dataset.theme === 'modus-operandi' },
]

/** Returns the ids newly met, and records them. */
export function checkAchievements(s: GameState): string[] {
  const fresh: string[] = []
  for (const a of ACHIEVEMENTS) {
    if (s.achievements.includes(a.id)) continue
    let ok = false
    try {
      ok = a.done(s)
    } catch {
      ok = false
    }
    if (ok) {
      s.achievements.push(a.id)
      fresh.push(a.id)
    }
  }
  return fresh
}

/**
 * The entries the player is allowed to see. An entry already earned always
 * shows, because there is nothing left to spoil about something you did.
 */
export function visibleAchievements(s: GameState): AchievementDef[] {
  return ACHIEVEMENTS.filter(
    (a) => s.achievements.includes(a.id) || !a.needs || a.needs(s),
  )
}

export function byId(id: string): AchievementDef | undefined {
  return ACHIEVEMENTS.find((a) => a.id === id)
}


/**
 * What the archive pays.
 *
 * Antimatter Dimensions gives x1.03 per achievement to every dimension, and
 * they compound, so the whole set is 1.03^n. Their own achievements tab prints
 * it as the header: one earned reads x1.030. Thirty-one entries here come to
 * about x2.5 over a full run, which is a nudge rather than a lever, and that is
 * what it is for. The entries are things you were going to do anyway.
 */
export const ACHIEVEMENT_STEP = 1.03

export function achievementPower(s: GameState): Decimal {
  return new Decimal(ACHIEVEMENT_STEP).pow(s.achievements.length)
}
