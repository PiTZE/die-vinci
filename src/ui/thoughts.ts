// Vinci's Thoughts: the news ticker.
//
// Antimatter Dimensions runs one along the top, mixing game facts with jokes.
// This one mixes lines from the history the game is built on with lines that
// read the save, so it comments on what you are actually doing.
import { format } from '../format'
import type { GameState } from '../state'
import { SOLIDS } from '../game/solids'

/**
 * How fast the line crawls, in pixels a second. Antimatter Dimensions scrolls
 * its ticker at a fixed rate and gives you an on/off switch; the rate it picks
 * is too slow to read comfortably on a phone, where the line is a third the
 * width, so this is a setting instead. Off keeps the old behaviour: one line
 * held still, replaced every twenty seconds.
 */
export const THOUGHT_SPEEDS = [
  { id: 0, label: 'STILL' },
  { id: 40, label: 'SLOW' },
  { id: 75, label: 'NORMAL' },
  { id: 140, label: 'FAST' },
] as const

export const THOUGHT_SPEED_DEFAULT = 75

type Line = string | ((s: GameState) => string | null)

const LINES: Line[] = [
  'Pacioli asked how to divide the stakes of a game cut short. Nobody could answer for 160 years.',
  'Cardano wrote the first book on dice odds. He was, by his own account, a compulsive gambler.',
  'Pascal and Fermat solved the problem of points by letter in 1654. Probability starts there.',
  'Laplace: given every particle, nothing is uncertain. The dice were only ever unmeasured.',
  'Boltzmann made randomness a matter of bookkeeping over states you cannot see.',
  'Einstein said God does not play dice. Bell proved in 1964 that he does.',
  'Aspect settled it in a laboratory in 1982. The dice are genuinely random.',
  'Leonardo drew each solid twice: filled, and hollow so you could see the back through the front.',
  'The rhombicuboctahedron was the first skeletal polyhedron ever printed.',
  'Mirror writing, right to left. Nobody has ever agreed on why.',
  'He left the Sforza horse unfinished. The bronze went to cannon instead.',
  'Sixty plates, drawn in 1497, printed in 1509.',
  (s) => (s.wagers === 0 ? 'The table only grows. Nothing here resets yet.' : null),
  (s) => (s.wagers > 0 ? `${s.wagers} interrupted games so far.` : null),
  (s) => (s.folios > 0 ? `${s.folios} folios bound. The hand gets faster each time.` : null),
  (s) => (s.studies > 6 ? 'The studies are getting expensive. That is the idea.' : null),
  (s) => (s.challengesDone.length > 0 ? `${s.challengesDone.length} constraints survived.` : null),
  (s) =>
    s.solids[SOLIDS.length - 1].amount.gt(0)
      ? 'A sphere of seventy-two bases, turning at the top of the chain.'
      : null,
  (s) => (s.points.gt(0) ? `${format(s.points, s.options.notation)} points unspent.` : null),
  (s) => (s.stats.playMs > 3600_000 ? 'An hour at the table. Leonardo would have moved on by now.' : null),
]

/**
 * Lines that only mean anything in order.
 *
 * The pool above is shuffled, which is right for remarks but wrong for a story:
 * Bell answering Einstein lands as nothing if you saw the answer first. A
 * sequence is drawn as a single candidate, and once drawn it plays to the end,
 * one line per turn of the ticker, before the pool resumes.
 */
interface Sequence {
  id: string
  lines: string[]
}

const SEQUENCES: Sequence[] = [
  {
    // The whole arc the game is built on, told in the order it happened.
    id: 'the-argument',
    lines: [
      'Pacioli, 1494: two players, a game cut short, and no way to divide the stakes.',
      'Cardano, around 1564: the first arithmetic of dice, written by a man who could not stop playing them.',
      'Pascal and Fermat, 1654: six letters, and the problem of points is solved. Probability exists.',
      'Laplace, 1814: nothing was ever random. We only lacked the measurements.',
      'Boltzmann: then let randomness be bookkeeping, and count the ways a thing can be arranged.',
      'Einstein: God does not play dice with the universe.',
      'Bell, 1964: whether He does or not is a question you can put to an experiment.',
      'Aspect, 1982: the experiment was done. The dice are real.',
    ],
  },
]

/** What is left of a sequence that is mid-play. */
let queue: string[] = []

/** Starts every sequence over. For a test, and for a fresh load. */
export function resetThoughts(): void {
  queue = []
}

export function pickThought(s: GameState, avoid: string): string {
  // A sequence in progress owns the ticker until it finishes. Nothing is drawn
  // against it, including the no-repeats rule: a sequence that repeats a line
  // is a sequence that meant to.
  if (queue.length) return queue.shift() as string

  const usable: string[] = []
  for (const l of LINES) {
    const text = typeof l === 'string' ? l : l(s)
    if (text && text !== avoid) usable.push(text)
  }

  // Each sequence is one candidate among the loose lines, not one candidate per
  // line it holds, or a long sequence would crowd out everything else.
  const pool: (string | Sequence)[] = [...usable, ...SEQUENCES]
  if (!pool.length) return avoid

  const picked = pool[Math.floor(Math.random() * pool.length)]
  if (typeof picked === 'string') return picked
  queue = picked.lines.slice(1)
  return picked.lines[0]
}
