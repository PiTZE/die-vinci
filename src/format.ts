// Number formatting. Incrementals live and die on this, so it gets its own
// module and a notation the player picks.
import Decimal from './vendor/break-infinity'

export type NotationId = 'mixed' | 'scientific' | 'engineering' | 'letters'

export const NOTATIONS: { id: NotationId; label: string }[] = [
  { id: 'mixed', label: 'MIXED' },
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

/**
 * Two places, without the zeros that carry no information.
 *
 * 100.00Qa is three characters longer than 100Qa and says exactly as much, and
 * those three characters were enough to push one buy button wider than the
 * eight above it and break the column.
 */
function mantissaString(m: number, places: number): string {
  const fixed = m.toFixed(places)
  return fixed.includes('.') ? fixed.replace(/\.?0+$/, '') : fixed
}

/**
 * Mantissa and exponent, with the rounding carried.
 *
 * 9.995 at two places rounds to "10", and the readout then said 10e129, which
 * is not a number anyone writes. The carry has to happen before the exponent
 * is read, not after, so every notation below takes its parts from here rather
 * than off the Decimal.
 *
 * Found in the bar rather than reasoned about: the esperienza readout printed
 * 10e129 next to a multiplier of x9.99e909.
 */
function parts(d: Decimal, places: number): { m: number; e: number } {
  const m = d.mantissa
  const e = d.exponent
  return Number(m.toFixed(places)) >= 10 ? { m: m / 10, e: e + 1 } : { m, e }
}

function scientific(d: Decimal, places: number): string {
  const { m, e } = parts(d, places)
  return `${mantissaString(m, places)}e${e}`
}

function engineering(d: Decimal, places: number): string {
  const { m, e } = parts(d, places)
  const shift = ((e % 3) + 3) % 3
  return `${mantissaString(m * Math.pow(10, shift), places)}e${e - shift}`
}

function letters(d: Decimal, places: number): string {
  const { m, e } = parts(d, places)
  const tier = Math.floor(e / 3)
  if (tier < 1 || tier >= LETTERS.length) return `${mantissaString(m, places)}e${e}`
  return `${mantissaString(m * Math.pow(10, e - tier * 3), places)}${LETTERS[tier]}`
}

/**
 * Antimatter Dimensions' default, and the one here. Suffixes read better than
 * exponents right up until the suffixes stop meaning anything, so it uses them
 * below a decillion and scientific at or above it. AD switches at the same
 * place, one past nonillion.
 */
const MIXED_SWITCH_EXPONENT = 33

function mixed(d: Decimal, places: number): string {
  // The switch reads the carried exponent too, so 9.999e32 prints 1.00e33
  // rather than 10.00No on the wrong side of the boundary.
  return parts(d, places).e < MIXED_SWITCH_EXPONENT ? letters(d, places) : scientific(d, places)
}

/**
 * Small numbers print plainly, because "3.00e0 ink" is nobody's idea of
 * readable. Everything past a thousand goes to the chosen notation.
 */
export function format(value: Decimal, notation: NotationId = 'mixed', places = 2): string {
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
    case 'scientific':
      return scientific(value, places)
    default:
      return mixed(value, places)
  }
}

/** Counts of things you own. Always whole, never in scientific until it has to be. */
export function formatWhole(value: Decimal, notation: NotationId = 'mixed'): string {
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
