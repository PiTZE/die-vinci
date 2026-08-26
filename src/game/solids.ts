// The production chain. Solid N produces solid N-1, solid 1 produces Ink.
// Antimatter Dimensions' engine with real dice on top.
//
// Nine stages. AD's constants assume eight, and a shorter chain stalls: two
// fewer stages is two fewer compounding steps, and no amount of retuning the
// top recovers it. Its cost table is extended by one step following its own
// progression, where each base cost exponent gap grows by one and each cost
// multiplier gap grows every third entry.
//
//   AD base cost  [10, 100, 1e4, 1e6, 1e9, 1e13, 1e18, 1e24]  -> 1e31
//   AD cost mult  [1e3, 1e4, 1e5, 1e6, 1e8, 1e10, 1e12, 1e15] -> 1e18
//
// The first three are Platonic solids Leonardo drew for Pacioli. The rest are
// ordinary dice: odd-numbered ones are barrel prisms and even-numbered ones are
// trapezohedra, which is how a d9 or a d22 exists at all.
import Decimal from 'break_infinity.js'

export type SolidId =
  | 'd4'
  | 'd6'
  | 'd8'
  | 'd9'
  | 'd11'
  | 'd22'
  | 'd33'
  | 'd66'
  | 'd99'

/** How a solid is drawn. Face count alone does not determine the shape. */
export type SolidShape =
  | { kind: 'platonic'; id: 'tetra' | 'hexa' | 'octa' }
  | { kind: 'prism'; sides: number }
  | { kind: 'trapezohedron'; sides: number }

export interface SolidDef {
  /** 1-based position in the chain. 1 produces Ink. */
  idx: number
  id: SolidId
  short: string
  name: string
  faces: number
  shape: SolidShape
  baseCost: Decimal
  /** Cost multiplier applied per ten bought. */
  costMult: Decimal
}

const TABLE: [SolidId, string, number, SolidShape, number, number][] = [
  ['d4', 'Tetrahedron', 4, { kind: 'platonic', id: 'tetra' }, 10, 1e3],
  ['d6', 'Hexahedron', 6, { kind: 'platonic', id: 'hexa' }, 100, 1e4],
  ['d8', 'Octahedron', 8, { kind: 'platonic', id: 'octa' }, 1e4, 1e5],
  ['d9', 'Barrel', 9, { kind: 'prism', sides: 9 }, 1e6, 1e6],
  ['d11', 'Barrel', 11, { kind: 'prism', sides: 11 }, 1e9, 1e8],
  ['d22', 'Trapezohedron', 22, { kind: 'trapezohedron', sides: 11 }, 1e13, 1e10],
  ['d33', 'Barrel', 33, { kind: 'prism', sides: 33 }, 1e18, 1e12],
  ['d66', 'Trapezohedron', 66, { kind: 'trapezohedron', sides: 33 }, 1e24, 1e15],
  ['d99', 'Barrel', 99, { kind: 'prism', sides: 99 }, 1e31, 1e18],
]

export const SOLIDS: SolidDef[] = TABLE.map(
  ([id, name, faces, shape, baseCost, costMult], i) => ({
    idx: i + 1,
    id,
    short: id,
    name,
    faces,
    shape,
    baseCost: new Decimal(baseCost),
    costMult: new Decimal(costMult),
  }),
)

export const SOLID_COUNT = SOLIDS.length
