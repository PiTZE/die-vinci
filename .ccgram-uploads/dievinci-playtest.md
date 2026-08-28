# die Vinci playtest findings

Handoff notes for the dev agent. Build 0.2.4 (2026-08-27 14:57:27), live at leo.generis.ir. I played it with a scripted headless Chromium that sent real input: spacebar rolls, pointer presses on buy buttons, number-key buys, tab navigation, settings changes, prestige confirms. Two sessions, 5h46m on the stats panel by the end, zero console errors the whole way.

Where the test ended: chain pushed to the d72 sphere, folio #1 bound at 80 d72, ink at the 1.8e308 cap, Wager #1 called, The Empress drafted (arcana 1/22), autoroll bought, Wager #2 at 77.22%, challenge #2 entered and left, archive 14/29 at x1.513.

## What I exercised

- Full core loop: roll, ink payout, dice buys, per-ten doublings, chain production where each solid prints the one below it
- Studies 1 through 6 in session one, then the full line to d72 in session two
- Roll rate ladder at 1K, 20K, 400K, 3.2B
- Wager end to end: the cap message at 1.8e308, the call, points, The Empress draft, autoroll purchase
- Challenges list (12 entries) plus entry and exit of challenge #2
- Automation tab after unlock
- Archive, stats panel, both themes, all four notations
- Save system: 3 slots, export (2808 chars), rolling backups at 5 min, 30 min, 4 h, hard reload mid-run
- Mobile layout at 390 x 844
- Help tab. The save section renders its full text. An earlier report of mine called it empty; that was my scrape missing the DOM, not your bug. Ignore that finding.

## Bugs

### 1. Bootstrap deadlock after the first wager (high)

Calling Wager #1 resets the run to zero dice. The autoroller and autobuyer I just paid a point for will not buy the first d4 at 10 ink, so the table sits dead until the player manually buys one. An automation unlock that needs manual help in its first minute reads as broken, and anyone who walks away at that moment sees a frozen game.

Repro: call the wager, spend the point on autoroll, watch the table do nothing at 10 ink.

Fix idea: seed the post-wager run with one d4, or let the autobuyer fire when a solid sits at zero owned and ink covers its base price.

### 2. Autobuyer fights the challenge halt (medium)

Inside challenge #2 the autobuyer keeps buying while the challenge's halt condition tries to hold the table still. The two loops fight and the challenge cannot settle. I left without finishing it.

Fix idea: suspend the autobuyer while a challenge constraint is unsatisfied, or give each challenge its own purchase policy.

### 3. Studies wipe wager progress (medium, design tension)

Wager progress tracks current-run ink, so a study resets the bar. Wager #2 sat at 77.22% when the economy wall left me with no points for power upgrades, and the only way forward was studies that erased it. That stretch has no good move: nothing to buy, no reason to roll, and a near-full bar you must throw away.

Fix idea: bank wager progress across studies, or track lifetime ink per prestige instead of run ink, or let studies contribute a slice of wager progress.

### 4. Save writes lag actions by up to 5 seconds (low)

In-memory state reaches localStorage seconds after a purchase or study. Closing the tab inside that window drops the action. Backups bound the loss. A flush on pagehide or visibilitychange would remove it.

Repro: buy anything, dump localStorage within five seconds, compare.

### 5. Holding M overpays walled solids (low)

M buys the most expensive affordable solid. At a price wall that pours thousands of ink into an overpriced solid while the next solid at a tenth of the price would grow the run faster. During study #2 my d4 count hit the thousands while d6 sat pinned at exactly 10 until I bought it by hand. Players who only ever hold M will wonder why their chain stalls.

Fix idea: skip solids priced into their wall tier, or cap M spend per tick.

### 6. Focus lost after row rebuild (info)

Clicking BUY re-renders the row and browser focus can land on a removed button, so later key events miss the handler until focus resets. I could not reproduce it with a normal profile. A defensive blur() on row rebuild closes it anyway.

## Balance notes

The study curve works. First study costs 10 d4, every one after costs 20 of the top solid, and cost walls end each run right about when the next solid gets affordable. My first six studies took about 3, 5, 6, 7, 8, and 10 minutes, and the d4 multiplier grew from x2.12 after the first to x152.8 by the sixth. Rebuilds feel faster each time, which is the whole prestige fantasy.

Price walls are abrupt. d4 jumps 10 to 10K at ten owned, d6 jumps 100 to 1M, d14 jumps 1e9 to 1e17. Hitting one with no purchase target unlocked feels like a hard stop rather than a nudge.

The slowest minute in the game is the first one, where you roll at 1/s until the first FASTER at 1K ink. That is a first-session drop-off risk. A cheaper first FASTER, or a higher base rate for the first minute, would help.

Roll rate pricing is a x20 ladder per level against roughly a x0.89 interval reduction. Early levels feel great, later ones are long-term sinks, and income comes from count and per-ten doublings rather than rate. That split keeps the big-roll fantasy intact. Fine as is.

Wager #2 pacing needs a look. At 77.22% I had no points left for power upgrades and studies would wipe the bar, so the only progress left was grinding ink against a wall.

Offline progress stays automator-only (8 h cap, the Moon card extends it). Coherent for a sit-at-the-table game and the help says so honestly, but the mid-game stretch is long. Even 10% of rate-limited rolls while away would soften it without touching the automator's value.

## Copy questions

- "CONQUESTION ARCHIVE" header. If it is a conquest-plus-question portmanteau it is too subtle. Rename it or own it in the help.
- Achievement "Sheet One" for taking a study. Confirm the drafting-sheet pun is intentional and not a leftover placeholder.

## Polish nits

- The stats panel's "since a reset" block shows roll rate 0 right after buying FASTER because it resets per run. A one-word hint would prevent the double-take.
- Desktop truncates long solid names ("RHOMBI...") while mobile fits them. The Latin subtitle row could absorb the full name.
- Options buries per-action confirms and away ticks under labels that do not hint at their impact.
- Nothing tells you the ink number is the progress bar toward the wager until the log-scale run bar appears near the end. A faint tick strip under the ink header would telegraph the horizon without breaking the minimalism.

## What works, do not break it

- Hold-space rolling respects the roll rate exactly; a roll refuses to start while another is in the air
- The confirm-arm pattern: "SURE? THIS RESETS" arms for four seconds, second press confirms. Fast for experts, safe for tired clicks
- Persistence survived a hard reload mid-run with zero loss, backups rewrote on schedule
- Theme switches reskin everything instantly, mixed notation stays readable deep into the exponents
- Locked achievements show as scrambled anagrams, which made me want to decode them
- The mobile layout is better than desktop for reading the chain: bottom tab bar, full names, reachable roll bar
- The quote marquee teaches real probability history, from Cardano to Bell's inequality, and it carries the grind
- Hidden tabs materialize with an UNLOCKED toast exactly when they become relevant

## Suggested fix order

1. Bootstrap deadlock after the wager (bug 1)
2. Autobuyer versus challenge halt (bug 2)
3. Save flush on pagehide (bug 4, a one-liner)
4. Wager progress versus studies (bug 3, needs a design decision first)
5. M heuristic at walls (bug 5)
6. Copy items and nits
