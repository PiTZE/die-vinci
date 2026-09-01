// The menu, in two levels.
//
// Twelve flat tabs made an 822px strip on a 390px phone, so 432px of the menu
// lived off the right edge behind a sideways scroll. More than half of it, at
// twelve, before the game grows any further.
//
// Antimatter Dimensions has the same problem at a larger size and solves it
// the same way: eleven top-level tabs holding forty-two subtabs, fifty-three
// destinations in a tree rather than a wall. Its modern sidebar nests each
// tab's subtabs inside the tab; its classic mode puts them in a second bar
// under the first. Five groups here, because five is what twelve panes want.
//
// The grouping is by system rather than by how often a thing is opened, which
// is what makes it stay right as layers are added: a new pane past the wall
// joins BREAK, a new record joins RECORDS, and neither the top level nor the
// phone layout changes.
import type { TabId } from '../state'

export interface NavGroup {
  id: string
  /** Short on purpose. Five of these have to fit a 360px phone with no
   *  scroll, which is the whole reason the level exists. */
  label: string
  /** In order. The first visible one is where the group opens. */
  panes: TabId[]
}

export const NAV_GROUPS: NavGroup[] = [
  // The game.
  { id: 'table', label: 'TABLE', panes: ['table'] },
  // And the thing that plays it for you, at the top level rather than under
  // the table. It was a subtab and it is the pane you open most: the ladder
  // is bought here a rung at a time through the whole first run, every
  // autobuyer arrives here, and the payout threshold that decides how deep a
  // broken run goes is here too. A destination that busy should not be a
  // second click behind another one.
  //
  // Labelled AUTO rather than AUTOMATION for the same reason the level
  // exists. Six groups spelled out measure 524px against a 390px phone, which
  // is the sideways scroll this was built to remove.
  { id: 'automation', label: 'AUTO', panes: ['automation'] },
  // The first prestige and everything it opens.
  { id: 'wager', label: 'WAGER', panes: ['wager', 'challenges', 'tarot'] },
  // Everything past 1.8e308.
  { id: 'break', label: 'BREAK', panes: ['break', 'codices'] },
  // What the save has to say about itself.
  { id: 'records', label: 'RECORDS', panes: ['archive', 'stats'] },
  // The game about the game.
  { id: 'options', label: 'OPTIONS', panes: ['options', 'about', 'help'] },
]

/** Which group a pane belongs to, or undefined for one nothing lists. */
export function groupOf(tab: TabId): NavGroup | undefined {
  return NAV_GROUPS.find((g) => g.panes.includes(tab))
}
