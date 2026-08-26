// Number formatting. Incrementals live and die on this, so it gets its own
// module and a notation the player picks.
import Decimal from 'break_infinity.js'

export type NotationId = 'scientific' | 'engineering' | 'letters'

export const NOTATIONS: { id: NotationId; label: string }[] = [
  { id: 'scientific', label: 'SCIENTIFIC' },
  { id: 'engineering', label: 'ENGINEERING' },
  { id: 'letters', label: 'LETTERS' },
]

// Letters run out long before the numbers do, so past the end we fall back to
// scientific rather than inventing suffixes nobody can read.
const LETTERS = [
  '', 'K', 'M', 'B', 'T', 'Qa', 'Qi', 'Sx', 'Sp', 'Oc', 'No',
  'Dc', 'UDc', 'DDc', 'TDc', 'QaDc', 'QiDc', 'SxDc', 'SpDc', 'OcDc', 'NoDc',
  'Vg', 'UVg', 'DVg', 'TVg', 'QaVg', 'QiVg', 'SxVg', 'SpVg', 'OcVg', 'NoVg',
]

function mantissaString(m: number, places: number): string {
  return m.toFixed(places)
}

function scientific(d: Decimal, places: number): string {
  const e = d.exponent
  const m = d.mantissa
  return `${mantissaString(m, places)}e${e}`
}

function engineering(d: Decimal, places: number): string {
  const e = d.exponent
  const shift = ((e % 3) + 3) % 3
  const m = d.mantissa * Math.pow(10, shift)
  return `${mantissaString(m, places)}e${e - shift}`
}

function letters(d: Decimal, places: number): string {
  const tier = Math.floor(d.exponent / 3)
  if (tier < 1 || tier >= LETTERS.length) return scientific(d, places)
  const m = d.mantissa * Math.pow(10, d.exponent - tier * 3)
  return `${mantissaString(m, places)}${LETTERS[tier]}`
}

/**
 * Small numbers print plainly, because "3.00e0 ink" is nobody's idea of
 * readable. Everything past a thousand goes to the chosen notation.
 */
export function format(value: Decimal, notation: NotationId = 'scientific', places = 2): string {
  if (!Number.isFinite(value.mantissa) || !Number.isFinite(value.exponent)) return 'Infinity'
  if (value.lt(0)) return `-${format(value.neg(), notation, places)}`
  if (value.lt(1000)) {
    const n = value.toNumber()
    if (n === 0) return '0'
    if (Number.isInteger(n)) return String(n)
    return n.toFixed(n < 10 ? places : 1)
  }
  switch (notation) {
    case 'engineering':
      return engineering(value, places)
    case 'letters':
      return letters(value, places)
    default:
      return scientific(value, places)
  }
}

/** Counts of things you own. Always whole, never in scientific until it has to be. */
export function formatWhole(value: Decimal, notation: NotationId = 'scientific'): string {
  if (value.lt(1e6)) return Math.floor(value.toNumber()).toLocaleString('en-US')
  return format(value, notation, 2)
}

export function formatTime(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds < 0) return '--'
  if (seconds < 60) return `${seconds.toFixed(1)}s`
  const m = Math.floor(seconds / 60)
  if (m < 60) return `${m}m ${Math.floor(seconds % 60)}s`
  const h = Math.floor(m / 60)
  if (h < 24) return `${h}h ${m % 60}m`
  return `${Math.floor(h / 24)}d ${h % 24}h`
}
