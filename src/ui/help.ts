import type { GameState } from '../state'
import { el, type Pane } from './shell'
import { seal, unseal } from './redact'
import { ARCANA_MAX_LEVEL, magicianBias, OFFLINE_CAP_S } from '../game/balance'

/** A line that is only worth reading once the thing it names exists. */
type Line = string | { text: string; needs: (s: GameState) => boolean }

/**
 * The nine levels of a card, worked out rather than written down.
 *
 * A card's levels are the one part of its text that cannot be prose: nine
 * numbers, and nine numbers typed out by hand are nine chances to be wrong
 * about a formula that lives somewhere else. Each of these calls the same
 * arithmetic the engine does, so a tuning pass moves the help with it.
 */
function levels(each: (level: number) => string): string {
  const out: string[] = []
  for (let l = 1; l <= ARCANA_MAX_LEVEL; l++) out.push(`${l} ${each(l)}`)
  return out.join('   ')
}

/** Trims a computed number to something a line of help can hold. */
const n = (v: number, places = 2): string => {
  const s = v.toFixed(places)
  return s.replace(/\.?0+$/, '')
}

interface Section {
  title: string
  body: Line[]
  /**
   * Topics inside a topic, each opening on its own.
   *
   * One section for twenty-two cards, because they are twenty-two answers to
   * the same question and a reader wants one of them. Flat, they would be
   * twenty-two entries in a list of twelve, and the list is the first thing
   * the pane shows.
   */
  subs?: Section[]
  /**
   * When this topic may be read. Twelve topics from the first second is a
   * table of contents for the whole game, and a player who has rolled one d4
   * should not be reading about calling the Wager.
   */
  needs?: (s: GameState) => boolean
}

const afterStudy = (s: GameState) => s.studies >= 1 || s.wagers > 0
const hasAutoRoll = (s: GameState) => (s.autoDice ?? 0) > 0 || s.studies >= 1
const afterAutomator = (s: GameState) => s.autoRoll || s.wagers > 0
const nearWager = (s: GameState) => s.wagers > 0 || s.inkThisWager.gte('1e290')
const afterWager = (s: GameState) => s.wagers > 0
const hasTarot = (s: GameState) => s.wagers > 0
/** A card explains itself once you hold it, and says nothing before. */
const holds = (id: string) => (s: GameState) => (s.tarot?.[id] ?? 0) > 0
const hasMelt = (s: GameState) => (s.tarot?.death ?? 0) > 0
const hasCodices = (s: GameState) => (s.codexOpen ?? 0) > 0
const afterAutobuyer = (s: GameState) =>
  s.challengesDone.length > 0 || Object.values(s.autobuyers).some((a) => a.unlocked)

const SECTIONS: Section[] = [
  {
    title: 'ROLLING',
    body: [
      'Nothing happens until you roll. Press ROLL and the dice spin, and when they land each one shows a face: a d4 lands on 1 to 4, a d12 on 1 to 12.',
      'The face is what each of those dice is worth this roll. Four d4 landing on 4 make sixteen. Every multiplier you own stacks on top of that.',
      'A die with more faces is worth more for that reason alone. A d72 averages 36.5 a face where a d4 averages 2.5, and the swing either way of that average is about 58% at every size.',
      'You cannot roll faster than the roll rate. Holding the button rolls as fast as it allows, and no faster.',
    ],
  },
  {
    title: 'THE TABLE',
    body: [
      'Nine solids in a chain. Each one produces the solid above it in the list, and the tetrahedron produces ink. Ink buys everything.',
      'You start with one die. A study unlocks the next.',
      'Every ten of a solid doubles its multiplier. The counter in the corner of the buy button shows how far into the current ten you are, and the two fills behind it show what you own and what your ink covers.',
      'Each solid is a plate Leonardo drew for Pacioli in 1497.',
    ],
  },
  {
    title: 'ROLL RATE',
    body: [
      'How long a roll takes. Faster rolls mean more of them, so it multiplies the whole chain at once. That is why it sits above the table rather than beside it.',
      'Each upgrade costs twenty times the last.',
      { text: 'Folios make every one of them worth more, permanently.',
        needs: (s) => s.folios > 0 || s.wagers > 0 },
    ],
  },
  {
    title: 'ROLLS ITSELF',
    needs: hasAutoRoll,
    body: [
      'A die can be bought its own roll, in AUTOMATION. It opens once you have opened the die below it on the chain, so the first one arrives with your first study.',
      'It buys you nothing but your hands back. Holding already rolls as fast as the roll rate allows, so what changes is whether you have to be there, and the price is ink you would otherwise have spent on dice.',
      'Your first Wager hands over whatever you have not bought, for nothing, and it stays handed over. It also leaves you some ink, because a table that rolls itself with one die on it takes a while to say anything.',
      'A die that rolls itself reads per second on the table. One still waiting on you reads per roll, and shows no face when you are not pressing.',
      'The deepest die opens once the whole chain is on the table, and costs more than the eight below it together.',
      'Any die that rolls itself can be switched off again, which is the only way to watch a single one land once it is automated.',
    ],
  },
  {
    title: 'EVERY DIE AT ONCE',
    needs: afterAutomator,
    body: [
      'Your first Wager hands over the whole ladder, free, and you never lose it. Not to a study, not to a folio, not to another Wager.',
      'It used to be a purchase of its own, one chip. It is not any more: the ladder already sells you your hands back a die at a time, and charging again at the prestige would be charging twice for the same thing.',
      'AUTOMATION grows a master switch above the nine. Turn it off and the whole table waits for you again, which is the only way to watch a run land one throw at a time once everything is automatic.',
      'Holding ROLL gives exactly the roll rate, because a roll refuses to start while one is in the air. None of this is extra speed. It is only whether you have to be there.',
    ],
  },
  {
    title: 'STUDY AND FOLIO',
    needs: afterStudy,
    body: [
      'A study unlocks the next solid and multiplies the ones below it. Its multiplier reaches down the chain rather than across, so the deep solids benefit last.',
      'A folio is a study that also clears your studies. What it leaves behind is a permanently better roll rate.',
      'Both clear the table and your ink. That is the trade.',
    ],
  },
  {
    title: 'THE WAGER',
    needs: nearWager,
    body: [
      'At 1.8e308 ink you can call the Wager, named for the interrupted game of dice Pacioli posed in 1494.',
      'It clears everything on the table and pays one chip. Chips buy the grid, and the grid makes the next run faster. That is the whole loop.',
      'The number is where a double stops being able to count, which is a fair place for a game about chance to break.',
    ],
  },
  {
    title: 'CHALLENGES',
    needs: afterWager,
    body: [
      'Each is a run under a restriction, cleared by reaching the Wager while it is active.',
      'Clearing one awards an autobuyer. That is how the game stops needing your hands.',
    ],
  },
  {
    title: 'AUTO BUY',
    needs: afterAutobuyer,
    body: [
      'Each buys one thing on a timer. A chip spent on one cuts its interval to 0.6 of what it was, down to a floor of a tenth of a second.',
      'The mode button sets what each purchase does: one, a group of ten, or as many as the ink allows.',
    ],
  },
  {
    title: 'TAROT',
    needs: hasTarot,
    body: [
      'Every Wager pays a draft. Three arcana are offered and you keep one, and every card you keep stays active, so the choice is what to take first rather than what to equip.',
      // Named only once you hold it. Written into the line above it would say
      // there is a card that widens the draft before you have met one.
      { text: 'The Stars makes that four.', needs: (s: GameState) => (s.tarot?.stars ?? 0) > 0 },
      'Draw one you already hold and it levels instead, and every effect grows with its level, so a repeat is never a wasted draw.',
      'The arcana you have not seen are offered more often than the ones you have, and the ones worth something early are offered more often than the ones that need a full table.',
    ],
  },
  {
    title: 'THE ARCANA, ONE BY ONE',
    needs: hasTarot,
    body: [
      'What each card does, and what a level of it is worth. A card explains itself once you hold it: reading the deck before you have drawn from it is the one spoiler a draft cannot recover from.',
    ],
    subs: [
      {
        title: "0 THE FOOL",
        needs: holds("fool"),
        body: [
          "A folio clears every study you have taken. This keeps one of them per level, so at level nine a folio costs you nine fewer studies to rebuild.",
          "It does nothing at a study and nothing at a Wager. Only folios.",
          "Studies a folio keeps." + ' ' + levels((l) => `keeps ${l}`),
        ],
      },
      {
        title: "I THE MAGICIAN",
        needs: holds("magician"),
        body: [
          "Loads the dice. Every die is likelier to land high, and the face is what a die is worth, so this multiplies every tier of the chain at once.",
          "Each level closes a quarter of the remaining gap to a ceiling of 0.85, so level one is worth 0.21 and level nine 0.79. Every level is worth taking and none of them reaches the end.",
          "At level nine a d72 averages 59.8 a face rather than 36.5, and a d4 averages 3.4 rather than 2.5.",
          "A perfectly loaded die is worth exactly twice its fair average and no more, which is why this is a middling card however far you push it.",
          "How loaded the dice are, where 0 is fair and 1 always lands on the maximum." + ' ' + levels((l) => `bias ${n(magicianBias(l))}`),
        ],
      },
      {
        title: "II THE HIGH PRIESTESS",
        needs: holds("priestess"),
        body: [
          "Multiplies everything by 1 plus half a level: x1.5 at level one, x5.5 at level nine.",
          "It asks nothing and it never lapses, which is what makes it a late-tier card.",
          "The multiplier." + ' ' + levels((l) => `x${n(1 + l * 0.5)}`),
        ],
      },
      {
        title: "III THE EMPRESS",
        needs: holds("empress"),
        body: [
          "Multiplies everything, hardest when you have the least ink and fading as it grows. At no ink at all it is worth up to four times its level, and by 1e12 it is worth nothing.",
          "So it is strongest in the seconds after a study or a folio, which is exactly when a reset feels worst. It is a card about getting back on your feet rather than about being on them.",
          "The multiplier at no ink at all, fading to nothing by 1e12." + ' ' + levels((l) => `up to x${n(1 + l * 4)}`),
        ],
      },
      {
        title: "IV THE EMPEROR",
        needs: holds("emperor"),
        body: [
          "Multiplies the deepest solid on your table by 1 plus five a level: x6 at level one, x46 at level nine.",
          "The deepest solid feeds every tier under it, so a multiplier there compounds all the way down to the ink. It is worth nothing on a chain of one and a great deal on a chain of nine.",
          "The multiplier on the deepest solid." + ' ' + levels((l) => `x${n(1 + l * 5)}`),
        ],
      },
      {
        title: "V THE HIEROPHANT",
        needs: holds("hierophant"),
        body: [
          "A reset leaves you ink instead of nothing: ten to the power of one plus twice the level, so 1e3 at level one and 1e19 at level nine.",
          "The ink is a gift rather than something the run earned, so it fills your table without moving you closer to the Wager. The circles on the table measure what a run has earned, and this does not touch them.",
          "The ink a reset leaves you." + ' ' + levels((l) => `1e${1 + l * 2}`),
        ],
      },
      {
        title: "VI THE LOVERS",
        needs: holds("lovers"),
        body: [
          "Dice showing the same face pay more. A pair pays double at level one, and each level pays for one more die in the group, so at level nine ten matching dice would each pay ten times.",
          "The only card in the deck that reads the faces against each other rather than one at a time. It is worth more the more dice are on the table and the fewer faces they have.",
          "How many matching dice are paid for." + ' ' + levels((l) => `${l + 1} of a kind`),
        ],
      },
      {
        title: "VII THE CHARIOT",
        needs: holds("chariot"),
        body: [
          "For the first twenty seconds after any reset, the roll rate is multiplied by 1 plus three tenths a level: x1.3 at level one, x3.7 at level nine.",
          "The window is fixed and only the surge grows. It used to grow both, which at level five was a hundred-second surge on a run that resets every minute or two, so it never lapsed, and it made an early card the strongest in the game.",
          "The multiplier on roll rate, for twenty seconds after a reset." + ' ' + levels((l) => `x${n(1 + l * 0.3)}`),
        ],
      },
      {
        title: "VIII JUSTICE",
        needs: holds("justice"),
        body: [
          "A reset leaves you one of every open solid per level, rather than an empty table.",
          "Small in what it hands you and large in what it saves: the first die of a tier is the one you cannot buy until the tier below it has paid for it.",
          "How many of each open solid a reset leaves." + ' ' + levels((l) => `keeps ${l}`),
        ],
      },
      {
        title: "IX THE HERMIT",
        needs: holds("hermit"),
        body: [
          "Every solid costs less: eight per cent a level, down to a floor of a fifth of the original price.",
          "It applies to the whole chain at once and it never lapses, so it compounds with everything else you hold.",
          "What a solid costs." + ' ' + levels((l) => `x${n(Math.max(0.2, 1 - l * 0.08))}`),
        ],
      },
      {
        title: "X WHEEL OF FORTUNE",
        needs: holds("wheel"),
        body: [
          "Every die is rolled again, once per level, and keeps the best face it saw.",
          "The first reroll is worth much more than the ninth: with one you keep the better of two, and each after that is a smaller chance of an improvement you did not already have.",
          "How many times a die is rolled, keeping the best." + ' ' + levels((l) => `${l + 1} rolls`),
        ],
      },
      {
        title: "XI STRENGTH",
        needs: holds("strength"),
        body: [
          "Raises every solid multiplier to a power, 1 plus two hundredths a level, so 1.02 at level one and 1.18 at level nine.",
          "An exponent rather than a multiplier, which is a different shape entirely. It is worth almost nothing early, while the multipliers are small, and enormous once they are astronomical.",
          "The exponent on every solid multiplier." + ' ' + levels((l) => `^${n(1 + l * 0.02)}`),
        ],
      },
      {
        title: "XII THE HANGED MAN",
        needs: holds("hanged"),
        body: [
          "A reset keeps a tenth of your roll rate upgrades per level, so at level ten it would keep all of them.",
          "Roll rate multiplies the entire chain, and rebuilding it is most of what a reset costs you in time.",
          "The roll rate a reset keeps." + ' ' + levels((l) => `keeps ${n(Math.min(1, l * 0.1) * 100, 0)}%`),
        ],
      },
      {
        title: "XIII DEATH",
        needs: holds("death"),
        body: [
          "Unlocks melting, and it is the only way to get it. Melting destroys the shallow end of the chain to multiply the deepest solid.",
          "The card multiplies nothing by itself. Its level is what decides how much a melt is worth and how far it reaches.",
          "Its level is read by melting rather than by anything on the table, so there is no ladder here: a melt is worth more and reaches further the higher it is.",
        ],
      },
      {
        title: "XIV TEMPERANCE",
        needs: holds("temperance"),
        body: [
          "Roll rate gets cheaper the deeper the run has gone, up to nine tenths off.",
          "It reads what this run has earned rather than what you are holding, so it is worth nothing at the start of a run and most at the end of a long one. A reset does not take the card away, but it does take away the depth it was reading.",
          "What roll rate costs at the deepest a run can go." + ' ' + levels((l) => `up to x${n(Math.max(0.1, 1 - Math.min(0.9, l * 0.5)))}`),
        ],
      },
      {
        title: "XV THE DEVIL",
        needs: holds("devil"),
        body: [
          "Multiplies everything by 1 plus 1.6 a level, and takes five per cent of your roll rate per level to pay for it, down to a floor of seventy per cent.",
          "The floor is what makes it worth holding at all. Priced without one the card is worse than not having it, because roll rate multiplies the whole chain and a straight cost on it swamps a straight bonus.",
          "The multiplier, and the roll rate it is bought with." + ' ' + levels((l) => `x${n(1 + l * 1.6)} at x${n(Math.max(0.7, 1 - l * 0.05))}`),
        ],
      },
      {
        title: "XVI THE TOWER",
        needs: holds("tower"),
        body: [
          "Every ninety seconds, everything you produce is multiplied by a hundred for three seconds.",
          "Levels shorten the wait and lengthen the strike: the gap falls by fifteen per cent of the base per level and the strike grows by twenty per cent of the base per level.",
          "The clock runs on the current run, so a Wager starts it again.",
          "Lightning plays over the deepest die on the table while it strikes.",
          "The gap between strikes, and how long one lasts." + ' ' + levels((l) => `${n(90 / (1 + (l - 1) * 0.15), 1)}s cycle, ${n(3 * (1 + (l - 1) * 0.2), 1)}s strike`),
        ],
      },
      {
        title: "XVII THE STARS",
        needs: holds("stars"),
        body: [
          "The draft offers four cards instead of three, and weights the ones you do not own higher still.",
          "The only card that changes the draft rather than the game, so it is worth the most while there are still cards you have never seen.",
          "The size of the draft, which does not change with the level; what a level adds is the weight on a card you do not own." + ' ' + levels(() => 'four on offer'),
        ],
      },
      {
        title: "XVIII THE MOON",
        needs: holds("moon"),
        body: [
          "Time away counts for longer. The cap is eight hours, multiplied by 1 plus the level, so eight hours more per level, up to eighty at level nine.",
          "Nothing else about away progress changes. It is still simulated in ticks rather than applied in one step, and it still stops at the cap.",
          "The cap on time away." + ' ' + levels((l) => `${n((OFFLINE_CAP_S * (1 + l)) / 3600, 0)}h`),
        ],
      },
      {
        title: "XIX THE SUN",
        needs: holds("sun"),
        body: [
          "Multiplies everything by 2 plus the level: x3 at level one, x11 at level nine.",
          "No window, no drawback, nothing to keep an eye on. It is the strongest card in the deck and the rarest thing in the draft, and its whole text is that it asks nothing.",
          "The multiplier." + ' ' + levels((l) => `x${2 + l}`),
        ],
      },
      {
        title: "XX JUDGEMENT",
        needs: holds("judgement"),
        body: [
          "Multiplies everything by the chips you are holding, half a chip per level.",
          "Chips you have spent do not count, so it pays exactly while you are saving rather than buying. It is worth nothing while the grid is cheap and a great deal once it is nearly bought and the last upgrades cost five and seven.",
          "The multiplier per chip you are holding." + ' ' + levels((l) => `x${n(l * 0.5)} a chip`),
        ],
      },
      {
        title: "XXI THE WORLD",
        needs: holds("world"),
        body: [
          "A run begins with one more solid already open per level.",
          "The first studies exist to open the chain, so this hands the early ones back outright: at level nine a run starts most of the way down the table.",
          "Solids a run starts with, over the one it would have." + ' ' + levels((l) => `${l} more`),
        ],
      },
    ],
  },
  {
    title: 'MELTING',
    needs: hasMelt,
    body: [
      'Death lets you melt the table. Everything below your deepest solid is destroyed, and what is left carries a multiplier for all of it.',
      'The multiplier replaces the one you had rather than adding to it, so melting early for a small number gains you nothing. The question is when, not whether.',
      'It is offered only when it would beat what you already hold.',
    ],
  },
  {
    title: 'THE CODICES',
    needs: hasCodices,
    body: [
      'A second chain, bought with chips. A codex feeds the one below it and the first one makes esperienza, which multiplies every solid on the table.',
      'A Wager keeps every codex you bought and takes back everything they produced, so a long run is worth more than a short one for the first time.',
      'They open on how deep a single run has gone, not on what you can pay. Every threshold is past the old wall, which is the reason to run past it.',
    ],
  },
  {
    title: 'KEYS',
    body: [
      'Space rolls the dice. Hold it.',
      'M buys the most expensive thing you can afford, repeatedly. Hold it.',
      'Keep holding any of them and it takes a ring: it goes on pressing itself with your hands off. One at a time, so choose which. Tap it again to stop it.',
      '1 to 9 buy a solid, shift for a single one. R buys roll rate.',
      { text: 'S takes a study. It asks twice unless you turn that off.', needs: afterStudy },
      { text: 'F binds a folio, and asks twice as well.', needs: (s) => s.folios > 0 || s.wagers > 0 },
      { text: 'W calls the Wager, and asks twice.', needs: nearWager },
    ],
  },
  {
    title: 'YOUR SAVE',
    body: [
      'It lives in this browser and never leaves it. Three slots, and rolling backups at five minutes, thirty minutes and four hours, plus one taken before any update that changes the save.',
      'OPTIONS shows whether the browser has agreed not to evict it. The game keeps asking for that, but Chrome answers silently and can refuse an installed app for reasons it will not explain.',
      'While it says evictable, the backups are still inside the same browser and go with it. Bind a save file on a desktop, or export a copy on a phone. That is the only copy eviction cannot reach.',
    ],
  },
]

/** Which sections are open. Kept for the life of the tab rather than in the
 *  save: it is a reading position, not progress. */
const open = new Set<string>()

/** Sections that are not always readable, with the test that reveals them. */
const gated: {
  head: HTMLElement
  mark: HTMLElement
  /** What the head opens and closes. */
  panel: HTMLElement
  /** Where the paragraphs go, which is not the same element: a topic holding
   *  sub-topics keeps them in its panel too, and the paragraphs are rewritten
   *  whenever the readable set changes. Writing them into the panel took the
   *  sub-topics out with them. */
  body: HTMLElement
  paint: () => void
  title: string
  text: Line[]
  /** The lines currently rendered, joined, or '' for none. */
  filled: string
  needs?: (s: GameState) => boolean
}[] = []

export function helpPane(): Pane {
  return {
    id: 'help',
    label: 'HELP',

    mount(root) {
      // One topic, opened by its own head, whether it sits at the top level or
      // inside another one. A sub-topic is the same thing a topic is: a head
      // that seals, a body that is not written until it unseals, and a mark.
      const build = (parent: HTMLElement, s: Section, depth: number): void => {
        const section = el('div', depth ? 'help-sub' : 'section')
        const h = el('button', depth ? 'help-head help-subhead' : 'section-head help-head')
        h.type = 'button'
        h.appendChild(el('span', 'grow', s.title))
        const mark = el('span', 'help-mark', '+')
        h.appendChild(mark)
        section.appendChild(h)
        const panel = el('div', 'help-body')
        const body = el('div', 'help-lines')
        panel.appendChild(body)
        section.appendChild(panel)
        const paint = () => {
          const on = open.has(s.title)
          panel.hidden = !on
          mark.textContent = on ? '\u2212' : '+'
          h.setAttribute('aria-expanded', String(on))
        }
        h.addEventListener('click', () => {
          if (h.classList.contains('sealed')) return
          if (open.has(s.title)) open.delete(s.title)
          else open.add(s.title)
          paint()
        })
        paint()
        parent.appendChild(section)
        gated.push({ head: h, mark, panel, body, paint, title: s.title, text: s.body, needs: s.needs, filled: '' })
        // The children hang off the panel, so closing the parent closes them
        // all and opening it again finds each one as it was left.
        for (const sub of s.subs ?? []) build(panel, sub, depth + 1)
      }

      // Closed by default, so the pane opens as a list of what there is to
      // read rather than a wall of it. Twelve sections stacked out flat is
      // three screens of scrolling before you find the one you wanted.
      for (const s of SECTIONS) build(root, s, 0)
    },

    update(s: GameState) {
      // Topics unseal as the systems they describe arrive. Recomputed each
      // frame rather than at mount, because the pane is built once and a study
      // taken while it is open should open the section it unlocks.
      for (const g of gated) {
        const on = !g.needs || g.needs(s)
        const label = g.head.firstElementChild as HTMLElement
        if (on) {
          unseal(label, g.title)
          // Lines can unlock separately from their topic, so the body is
          // rebuilt whenever the readable set changes rather than filled once.
          const lines = g.text
            .filter((l) => typeof l === 'string' || l.needs(s))
            .map((l) => (typeof l === 'string' ? l : l.text))
          const key = lines.join('\u0000')
          if (g.filled !== key) {
            g.body.replaceChildren(...lines.map((line) => el('p', 'help-text', line)))
            const first = g.filled === ''
            g.filled = key
            // Back to + or -, from the block it wore while sealed.
            if (first) g.paint()
          }
        } else {
          seal(label, g.title)
          open.delete(g.title)
          g.body.replaceChildren()
          g.filled = ''
          g.panel.hidden = true
          if (g.mark.textContent !== '?') g.mark.textContent = '?'
        }
        g.head.classList.toggle('sealed', !on)
        g.head.setAttribute('aria-disabled', String(!on))
      }
    },
  }
}
