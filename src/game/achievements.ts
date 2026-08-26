// The Conquestion Archive.
//
// Antimatter Dimensions calls these achievements and lays them out in rows of
// eight, each a condition checked every tick and permanent once met. Some carry
// a small reward. This is a smaller set of the same idea, named after the
// notebooks rather than the genre.
import type { GameState } from '../state'
import { SOLID_COUNT } from './solids'
import { AUTOBUYERS } from './autobuyers'

export interface AchievementDef {
  id: string
  name: string
  note: string
  done: (s: GameState) => boolean
}

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
    done: (s) => s.studies >= SOLID_COUNT - 4 },
  { id: 'folio1', name: 'Bound', note: 'bind a folio',
    done: (s) => s.folios >= 1 },
  { id: 'folio5', name: 'A Quire', note: 'bind five folios',
    done: (s) => s.folios >= 5 },
  { id: 'roll50', name: 'Blur', note: 'reach fifty roll rate upgrades',
    done: (s) => s.rollUpgrades >= 50 },
  { id: 'wager1', name: 'The Interrupted Game', note: 'call the Wager',
    done: (s) => s.wagers >= 1 },
  { id: 'wager5', name: 'Pacioli Would Approve', note: 'call it five times',
    done: (s) => s.wagers >= 5 },
  { id: 'wager25', name: 'Division of Stakes', note: 'call it twenty-five times',
    done: (s) => s.wagers >= 25 },
  { id: 'points10', name: 'Problem of Points', note: 'hold ten points at once',
    done: (s) => s.points.gte(10) },
  { id: 'grid', name: 'Fully Read', note: 'buy every points upgrade',
    done: (s) => s.pointUpgrades.length >= 11 },
  { id: 'chal1', name: 'Under Constraint', note: 'clear a challenge',
    done: (s) => s.challengesDone.length >= 1 },
  { id: 'chal6', name: 'Half the Ladder', note: 'clear six challenges',
    done: (s) => s.challengesDone.length >= 6 },
  { id: 'chalall', name: 'Nothing Left to Prove', note: 'clear every challenge',
    done: (s) => s.challengesDone.length >= 12 },
  { id: 'auto1', name: 'It Rolls Itself', note: 'unlock an autobuyer',
    done: (s) => AUTOBUYERS.some((a) => s.autobuyers[a.id]?.unlocked) },
  { id: 'autoall', name: 'The Machine Learns', note: 'unlock every autobuyer',
    done: (s) => AUTOBUYERS.every((a) => s.autobuyers[a.id]?.unlocked) },
  { id: 'autofast', name: 'Faster Than Thought', note: 'take an autobuyer to its floor',
    done: (s) => AUTOBUYERS.some((a) => (s.autobuyers[a.id]?.level ?? 0) >= 5) },
  { id: 'bought500', name: 'Industrious', note: 'buy five hundred solids in one run',
    done: (s) => bought(s) >= 500 },
  { id: 'sphere', name: 'Septuaginta Duarum Basium', note: 'own a sphere of seventy-two',
    done: (s) => s.solids[SOLID_COUNT - 1].amount.gte(1) },
  { id: 'away', name: 'It Kept Working', note: 'return to eight hours of progress',
    done: (s) => s.stats.playMs >= 8 * 3600_000 },
  { id: 'hour', name: 'An Hour at the Table', note: 'play for an hour',
    done: (s) => s.stats.playMs >= 3600_000 },
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

export function byId(id: string): AchievementDef | undefined {
  return ACHIEVEMENTS.find((a) => a.id === id)
}
