// Vinci's Thoughts: the news ticker.
//
// Antimatter Dimensions runs one along the top, mixing game facts with jokes.
// This one mixes lines from the history the game is built on with lines that
// read the save, so it comments on what you are actually doing.
import { format } from '../format'
import type { GameState } from '../state'
import { SOLIDS } from '../game/solids'

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

export function pickThought(s: GameState, avoid: string): string {
  const usable: string[] = []
  for (const l of LINES) {
    const text = typeof l === 'string' ? l : l(s)
    if (text && text !== avoid) usable.push(text)
  }
  if (!usable.length) return avoid
  return usable[Math.floor(Math.random() * usable.length)]
}
