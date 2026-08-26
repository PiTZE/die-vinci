// The production chain. Solid N produces solid N-1, solid 1 produces Ink.
// Antimatter Dimensions' engine with Leonardo's geometry on top.
//
// The five Platonic solids he drew for Pacioli's De divina proportione, plus
// the rhombicuboctahedron, the most reproduced drawing in that book. Six is
// what the geometry gives, not a number I chose.
import Decimal from 'break_infinity.js'

export type SolidId = 'tetra' | 'hexa' | 'octa' | 'dodeca' | 'icosa' | 'rhombi'

export interface SolidDef {
  /** 1-based position in the chain. 1 produces Ink. */
  idx: number
  id: SolidId
  short: string
  name: string
  latin: string
  element: string
  faces: number
  baseCost: Decimal
  /** Cost multiplier applied per ten bought. */
  costMult: Decimal
}

export const SOLIDS: SolidDef[] = [
  {
    idx: 1,
    id: 'tetra',
    short: 'd4',
    name: 'Tetrahedron',
    latin: 'Tetracedron',
    element: 'fire',
    faces: 4,
    baseCost: new Decimal(10),
    costMult: new Decimal(1e3),
  },
  {
    idx: 2,
    id: 'hexa',
    short: 'd6',
    name: 'Hexahedron',
    latin: 'Exacedron',
    element: 'earth',
    faces: 6,
    baseCost: new Decimal(100),
    costMult: new Decimal(1e4),
  },
  {
    idx: 3,
    id: 'octa',
    short: 'd8',
    name: 'Octahedron',
    latin: 'Octocedron',
    element: 'air',
    faces: 8,
    baseCost: new Decimal(1e4),
    costMult: new Decimal(1e5),
  },
  {
    idx: 4,
    id: 'dodeca',
    short: 'd12',
    name: 'Dodecahedron',
    latin: 'Duodecedron',
    element: 'aether',
    faces: 12,
    baseCost: new Decimal(1e6),
    costMult: new Decimal(1e6),
  },
  {
    idx: 5,
    id: 'icosa',
    short: 'd20',
    name: 'Icosahedron',
    latin: 'Icocedron',
    element: 'water',
    faces: 20,
    baseCost: new Decimal(1e9),
    costMult: new Decimal(1e7),
  },
  {
    idx: 6,
    id: 'rhombi',
    short: 'd26',
    name: 'Rhombicuboctahedron',
    latin: 'Vigintisex Basium',
    element: 'proportion',
    faces: 26,
    baseCost: new Decimal(1e13),
    costMult: new Decimal(1e8),
  },
]

export const SOLID_COUNT = SOLIDS.length
