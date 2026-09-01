// Marks on the menu: "something in here is new and you have not looked."
//
// Antimatter Dimensions' tab notifications, from src/core/tab-notifications.js
// and its seventeen rules. Its shape, which is the part worth copying:
//
//   - a Set of tab keys on the save, so a mark survives a reload
//   - a rule fires on a condition, and skips the tab you are already looking at
//   - opening a tab clears its mark
//   - a parent tab is marked when any of its children is
//
// That last line is why this exists at all. Grouping twelve panes into five
// buries eight of them one level down, and without something pointing at a
// group there is no way to know whether anything inside wants you. Grouping
// without marks is worse than the wall of tabs it replaces.
//
// One departure. AD fires each rule once ever, held in a bitfield, because
// most of its rules are "this system has just unlocked". Half of these are
// recurring instead: a draft arrives after every Wager, a codex becomes
// affordable again every time chips build back up. So a rule fires on the
// rising edge of its condition and re-arms when the condition goes false,
// which gives AD's once-ever behaviour for free on any condition that latches.
import type { GameState, TabId } from '../state'
import { canBuyAutoRoll } from './production'
import { canWager } from './wager'
import { canBreak, chipsFromInk, wagerThreshold } from './breaks'
import { canBuyAnyCodex, codexUnlockAt, openCodices, CODEX_COUNT } from './codices'
import { UPGRADES, canBuy, type UpgradeId } from './upgrades'

export interface MarkRule {
  id: string
  /** The pane the mark lands on. */
  tab: TabId
  when(s: GameState): boolean
}

export const MARK_RULES: MarkRule[] = [
  // A draft waits in the tarot tab until you open it. The first one
  // interrupts, because a player who has never seen the mechanic will not go
  // looking for it; every one after that has been silent until now.
  { id: 'draft', tab: 'tarot', when: (s) => s.pendingDraft.length > 0 },

  // The next rung of the auto-roll ladder is affordable. This is the one that
  // fires most often in a first run, and it is the one worth firing: the
  // ladder is bought in a tab you have no other reason to open.
  { id: 'autoRoll', tab: 'automation', when: (s) => canBuyAutoRoll(s) },

  // The run is over and the only move left is on another tab.
  { id: 'wagerReady', tab: 'wager', when: (s) => !s.broke && canWager(s) },

  // Chips you have not spent, on a grid you may not have opened since.
  {
    id: 'chips',
    tab: 'wager',
    when: (s) => (Object.keys(UPGRADES) as UpgradeId[]).some((id) => canBuy(s, id)),
  },

  // Challenges arrive with the first Wager and nothing says so.
  {
    id: 'challenges',
    tab: 'challenges',
    when: (s) => s.wagers > 0 && s.challengesDone.length === 0,
  },

  // AD's own breakInfinity rule, on AD's own condition: the prestige
  // autobuyer has reached its floor, which is the whole gate.
  { id: 'breakReady', tab: 'break', when: (s) => !s.broke && canBreak(s) },

  // A codex is affordable. AD's IDUnlock, widened from the first unlock to
  // every purchase, because chips arrive in a tab away from this one.
  { id: 'codex', tab: 'codices', when: (s) => canBuyAnyCodex(s) },

  /**
   * The payout threshold will end a run before it reaches the next codex.
   *
   * Measured over twelve hours from the same broken save: left where the chip
   * multiplier puts it, one codex of nine opens; aimed at the depth the next
   * one wants, all nine open and the break grid finishes. A thirty-fold gap
   * between two ways of playing, with nothing on screen to say the rule exists
   * unless you happen to open the pane it lives in.
   *
   * This is the one mark here that is not "something new arrived". It is
   * "the thing you are doing will not get you there", which is the case AD
   * covers with breakInfinity and which we had no answer to at all.
   */
  {
    id: 'threshold',
    tab: 'automation',
    when: (s) => {
      if (!s.broke) return false
      const open = openCodices(s)
      if (open >= CODEX_COUNT) return false
      return wagerThreshold(s).lt(chipsFromInk(s, codexUnlockAt(open + 1)))
    },
  },
]

/** Panes wanting attention right now. */
export function marksOn(s: GameState): string[] {
  return s.marks ?? []
}

export function isMarked(s: GameState, tab: TabId): boolean {
  return marksOn(s).includes(tab)
}

/** A group is marked when any pane inside it is, which is AD's
 *  `this.subtabs.some(tab => tab.hasNotification)`. */
export function anyMarked(s: GameState, tabs: readonly TabId[]): boolean {
  return tabs.some((t) => isMarked(s, t));
}

/** Looking at it is what clears it. */
export function clearMark(s: GameState, tab: TabId): void {
  if (!s.marks?.length) return
  s.marks = s.marks.filter((t) => t !== tab)
}

/**
 * Runs the rules and sets marks. Called from the main loop rather than from
 * the tick, so nothing in `game/` has to import this and the module graph
 * stays one way.
 *
 * `visible` says which panes the player is allowed to know about. A mark on a
 * sealed tab would be the loudest spoiler in the game.
 */
export function checkMarks(s: GameState, visible: (tab: TabId) => boolean): void {
  const armed = s.marksArmed ?? []
  const next: string[] = []
  const marks = new Set(s.marks ?? [])
  for (const rule of MARK_RULES) {
    let on = false
    try {
      on = rule.when(s)
    } catch {
      // A rule that cannot be evaluated on this save is a rule that does not
      // fire. It must never be one that takes the menu down with it.
      on = false
    }
    if (!on) continue
    next.push(rule.id)
    // The rising edge only, so a condition that stays true marks once and a
    // condition that comes and goes marks every time it comes back.
    if (armed.includes(rule.id)) continue
    // Not on the tab you are already reading, and never on a sealed one.
    if (s.options.tab === rule.tab || !visible(rule.tab)) continue
    marks.add(rule.tab)
  }
  s.marksArmed = next
  s.marks = [...marks].filter((t) => visible(t as TabId))
}
