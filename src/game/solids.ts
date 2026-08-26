// The production chain. Solid N produces solid N-1, solid 1 produces Ink.
// Antimatter Dimensions' engine with Leonardo's geometry on top.
//
// Every one of these is a plate in Pacioli's De divina proportione, drawn by
// Leonardo in 1497. He made about fifty-nine, most of them each solid twice:
// solidus filled, and vacuus with the faces removed so the back shows through
// the front. Those skeletal drawings are what the game renders.
//
// Nine stages, because AD's constants assume that depth. Its cost table is
// extended by one entry along its own pattern, where the base cost exponent
// gaps grow by one and the cost multiplier gaps grow every third entry:
//
//   AD base cost  [10, 100, 1e4, 1e6, 1e9, 1e13, 1e18, 1e24]  -> 1e31
//   AD cost mult  [1e3, 1e4, 1e5, 1e6, 1e8, 1e10, 1e12, 1e15] -> 1e18
import Decimal from 'break_infinity.js'

export type SolidId =
  | 'tetra'
  | 'hexa'
  | 'octa'
  | 'dodeca'
  | 'cubocta'
  | 'icosa'
  | 'rhombi'
  | 'truncicosa'
  | 'sphaera'

/** How a solid is drawn. */
export type SolidShape =
  | { kind: 'uniform' }
  /** The 72-sided sphere. Pacioli calls it a sphere, so it is drawn as one. */
  | { kind: 'sphere'; meridians: number; bands: number }

export interface SolidDef {
  /** 1-based position in the chain. 1 produces Ink. */
  idx: number
  id: SolidId
  short: string
  name: string
  /** Pacioli's own Latin, where the book gives it. */
  latin: string
  faces: number
  shape: SolidShape
  baseCost: Decimal
  /** Cost multiplier applied per ten bought. */
  costMult: Decimal
}

const UNIFORM: SolidShape = { kind: 'uniform' }

const TABLE: [SolidId, string, string, string, number, SolidShape, number, number][] = [
  ['tetra', 'd4', 'Tetrahedron', 'Tetracedron', 4, UNIFORM, 10, 1e3],
  ['hexa', 'd6', 'Hexahedron', 'Exacedron', 6, UNIFORM, 100, 1e4],
  ['octa', 'd8', 'Octahedron', 'Octocedron', 8, UNIFORM, 1e4, 1e5],
  ['dodeca', 'd12', 'Dodecahedron', 'Duodecedron', 12, UNIFORM, 1e6, 1e6],
  ['cubocta', 'd14', 'Cuboctahedron', 'Exacedron Abscisus', 14, UNIFORM, 1e9, 1e8],
  ['icosa', 'd20', 'Icosahedron', 'Icocedron', 20, UNIFORM, 1e13, 1e10],
  ['rhombi', 'd26', 'Rhombicuboctahedron', 'Vigintisex Basium', 26, UNIFORM, 1e18, 1e12],
  ['truncicosa', 'd32', 'Truncated Icosahedron', 'Ycocedron Abscisus', 32, UNIFORM, 1e24, 1e15],
  [
    'sphaera',
    'd72',
    'Sphere of Seventy-Two',
    'Septuaginta Duarum Basium',
    72,
    { kind: 'sphere', meridians: 12, bands: 6 },
    1e31,
    1e18,
  ],
]

export const SOLIDS: SolidDef[] = TABLE.map(
  ([id, short, name, latin, faces, shape, baseCost, costMult], i) => ({
    idx: i + 1,
    id,
    short,
    name,
    latin,
    faces,
    shape,
    baseCost: new Decimal(baseCost),
    costMult: new Decimal(costMult),
  }),
)

export const SOLID_COUNT = SOLIDS.length
