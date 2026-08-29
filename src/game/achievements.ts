// The Conquestion Archive.
//
// Antimatter Dimensions calls these achievements, lays them out in rows of
// eight, and pays for a finished row on top of paying for each entry. This is
// the same idea in rows of nine, named after the notebooks rather than the
// genre.
import Decimal from 'break_infinity.js'
import { unlockedSolids, type GameState } from '../state'
import { SOLIDS, SOLID_COUNT } from './solids'
import { AUTOBUYERS } from './autobuyers'

export interface AchievementDef {
  id: string
  name: string
  note: string
  done: (s: GameState) => boolean
  /**
   * When this entry is allowed to be seen at all.
   *
   * Without it the archive is a table of contents for the whole game. Someone
   * ten minutes in could read "call the Wager", "clear a challenge" and "bind
   * a folio" and know the shape of everything ahead. An entry appears once the
   * thing it names exists, and an entry already earned always shows.
   */
  needs?: (s: GameState) => boolean
}

export interface AchievementRow {
  id: string
  /** Sealed until one of its entries is readable, like the entries themselves. */
  title: string
  entries: AchievementDef[]
}

/** True once the player has met the system each group of entries is about. */
const seenFolios = (s: GameState) => s.folios > 0 || s.wagers > 0
const seenWager = (s: GameState) => s.wagers > 0
const seenChallenges = (s: GameState) => s.wagers > 0
const seenAutobuyers = (s: GameState) =>
  s.challengesDone.length > 0 || Object.values(s.autobuyers).some((a) => a.unlocked)
const seenArcana = (s: GameState) => Object.values(s.tarot ?? {}).some((l) => l > 0)
const seenMelt = (s: GameState) => (s.tarot?.death ?? 0) > 0

const bought = (s: GameState) => s.solids.reduce((a, d) => a + d.bought, 0)

/**
 * One entry a solid, which is Antimatter Dimensions' first row exactly: eight
 * dimensions, eight achievements, all inside the first run.
 *
 * Named from Pacioli's own Latin rather than invented, because the table
 * already carries those names and the sphere's entry was already called
 * Septuaginta Duarum Basium before this row existed.
 *
 * The tetrahedron keeps the id `first` and the sphere keeps `sphere`. Those
 * two entries existed before the row did, and an id is what a save records, so
 * renaming them would take them back off anyone who had earned them.
 */
const PLATES: AchievementDef[] = SOLIDS.map((def, i) => ({
  id: i === 0 ? 'first' : i === SOLID_COUNT - 1 ? 'sphere' : def.id,
  name: def.latin,
  note: `own ${/^[aeiou]/i.test(def.name) ? 'an' : 'a'} ${def.name.toLowerCase()}`,
  done: (s: GameState) => s.solids[i].amount.gte(1),
  // A solid you have never opened does not have its name given away. Measured
  // on the high-water mark so a reset does not re-seal an entry you can read.
  needs: (s: GameState) =>
    unlockedSolids(s) >= i + 1 || (s.stats.solidsEver ?? 0) >= i + 1,
}))

export const ACHIEVEMENT_ROWS: AchievementRow[] = [
  {
    id: 'plates',
    title: 'THE PLATES',
    entries: PLATES,
  },
  {
    id: 'table',
    title: 'THE TABLE',
    entries: [
      { id: 'ten', name: 'A Group of Ten', note: 'earn a doubling on any solid',
        done: (s) => s.solids.some((d) => d.bought >= 10) },
      { id: 'faster', name: 'Quicker Hand', note: 'buy a roll rate upgrade',
        done: (s) => s.rollUpgrades >= 1 },
      { id: 'roll50', name: 'Blur', note: 'reach fifty roll rate upgrades',
        done: (s) => s.rollUpgrades >= 50,
        needs: (s) => s.rollUpgrades >= 20 },
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
      { id: 'hour', name: 'An Hour at the Table', note: 'play for an hour',
        done: (s) => s.stats.playMs >= 3600_000 },
      { id: 'light', name: 'Modus Operandi', note: 'read by daylight',
        done: () => document.documentElement.dataset.theme === 'modus-operandi' },
    ],
  },
  {
    id: 'wager',
    title: 'THE WAGER',
    entries: [
      { id: 'wager1', name: 'The Interrupted Game', note: 'call the Wager',
        done: (s) => s.wagers >= 1,
        needs: (s) => s.inkThisWager.gte('1e290') || s.wagers > 0 },
      { id: 'wager5', name: 'Pacioli Would Approve', note: 'call it five times',
        done: (s) => s.wagers >= 5,
        needs: seenWager },
      { id: 'wager25', name: 'Division of Stakes', note: 'call it twenty-five times',
        done: (s) => s.wagers >= 25,
        needs: seenWager },
      { id: 'points10', name: 'Problem of Points', note: 'hold ten chips at once',
        done: (s) => s.chips.gte(10),
        needs: seenWager },
      { id: 'grid', name: 'Fully Read', note: 'buy every chip upgrade',
        done: (s) => s.chipUpgrades.length >= 11,
        needs: seenWager },
      { id: 'bought500', name: 'Industrious', note: 'buy five hundred solids in one run',
        done: (s) => bought(s) >= 500 },
      { id: 'chal1', name: 'Under Constraint', note: 'clear a challenge',
        done: (s) => s.challengesDone.length >= 1,
        needs: seenChallenges },
      { id: 'chal6', name: 'Half the Ladder', note: 'clear six challenges',
        done: (s) => s.challengesDone.length >= 6,
        needs: seenChallenges },
      { id: 'chalall', name: 'Nothing Left to Prove', note: 'clear every challenge',
        done: (s) => s.challengesDone.length >= 12,
        needs: seenChallenges },
    ],
  },
  {
    id: 'long',
    title: 'THE LONG GAME',
    entries: [
      { id: 'auto1', name: 'It Rolls Itself', note: 'unlock an autobuyer',
        done: (s) => AUTOBUYERS.some((a) => s.autobuyers[a.id]?.unlocked),
        needs: seenAutobuyers },
      { id: 'autoall', name: 'The Machine Learns', note: 'unlock every autobuyer',
        done: (s) => AUTOBUYERS.every((a) => s.autobuyers[a.id]?.unlocked),
        needs: seenAutobuyers },
      { id: 'autofast', name: 'Faster Than Thought', note: 'take an autobuyer to its floor',
        done: (s) => AUTOBUYERS.some((a) => (s.autobuyers[a.id]?.level ?? 0) >= 5),
        needs: seenAutobuyers },
      { id: 'away', name: 'It Kept Working', note: 'return to eight hours of progress',
        done: (s) => s.stats.playMs >= 8 * 3600_000 },
      { id: 'arcana1', name: 'The Fool Sets Out', note: 'keep your first arcanum',
        done: (s) => seenArcana(s),
        needs: (s) => s.wagers > 0 },
      { id: 'arcana5', name: 'Read Deeply', note: 'take one arcanum to level five',
        done: (s) => Object.values(s.tarot ?? {}).some((l) => l >= 5),
        needs: seenArcana },
      { id: 'arcanaall', name: 'The Whole Deck', note: 'hold all twenty-two arcana',
        done: (s) => Object.values(s.tarot ?? {}).filter((l) => l > 0).length >= 22,
        needs: seenArcana },
      { id: 'melt1', name: 'Nothing Is Lost', note: 'melt the table',
        done: (s) => s.stats.melts >= 1,
        needs: seenMelt },
      { id: 'meltbig', name: 'Everything Returns', note: 'melt for a hundredfold',
        done: (s) => s.meltPower.gte(100),
        needs: seenMelt },
    ],
  },
]

export const ACHIEVEMENTS: AchievementDef[] = ACHIEVEMENT_ROWS.flatMap((r) => r.entries)

/** Which row an entry sits in, for the pane and for the row bonus. */
export function rowOf(id: string): AchievementRow | undefined {
  return ACHIEVEMENT_ROWS.find((r) => r.entries.some((a) => a.id === id))
}

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

export function rowsComplete(s: GameState): number {
  return ACHIEVEMENT_ROWS.filter((r) => r.entries.every((a) => s.achievements.includes(a.id)))
    .length
}

/**
 * What the archive pays.
 *
 * Antimatter Dimensions' own formula, from `Achievements._power`:
 *
 *   Math.pow(1.25, unlockedRows) * Math.pow(1.03, effectiveCount)
 *
 * We had the x1.03 an entry and not the row. A row of nine is worth x1.305 in
 * entries alone, so x1.25 for finishing it roughly doubles what the row is
 * worth, which is the point: it turns nine unrelated things into one thing
 * worth finishing.
 *
 * All four rows complete is x1.03^36 x 1.25^4, about x7.1. That is a lot more
 * than the x2.4 the flat version topped out at and still small beside AD's own
 * archive, which reaches roughly x166 over eleven rows. The entries are things
 * you were going to do anyway; the row is the part you go out of your way for.
 */
export const ACHIEVEMENT_STEP = 1.03
export const ACHIEVEMENT_ROW_BONUS = 1.25

export function achievementPower(s: GameState): Decimal {
  return new Decimal(ACHIEVEMENT_STEP)
    .pow(s.achievements.length)
    .times(new Decimal(ACHIEVEMENT_ROW_BONUS).pow(rowsComplete(s)))
}
