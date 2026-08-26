// Console helpers for testing. Installed on the dev channel only.
//
// Everything here writes straight into live state and then saves, so the game
// keeps whatever you did. Nothing validates affordability: that is the point.
import Decimal from 'break_infinity.js'
import { SOLIDS, SOLID_COUNT } from './game/solids'
import { STUDIES_THAT_UNLOCK } from './game/balance'
import { simulateAway } from './game/offline'
import { buyFolio, buyStudy, studyReq } from './game/production'
import { UPGRADES, buyUpgrade, canBuy, type UpgradeId } from './game/upgrades'
import { doWager } from './game/wager'
import { listBackups } from './backup'
import type { GameState } from './state'

export interface DevDeps {
  state: () => GameState
  save: () => void
  setState: (s: GameState) => void
}

/** Accepts 90, '90s', '30m', '2h', '3d'. Returns seconds. */
function seconds(v: number | string): number {
  if (typeof v === 'number') return v
  const m = /^(\d+(?:\.\d+)?)\s*([smhd])?$/.exec(v.trim())
  if (!m) return 0
  const n = Number(m[1])
  return n * { s: 1, m: 60, h: 3600, d: 86400 }[m[2] ?? 's']!
}

const LINES = [
  'LD.help()            this list',
  'LD.ink(1e120)        set ink            LD.add(1e50)   add ink',
  'LD.points(50)        set points         LD.wagers(10)  set wagers completed',
  'LD.dice(1e6)         give that many of every unlocked solid',
  'LD.bought(90)        set purchases on every solid, which drives the x2 per ten',
  'LD.rate(80)          set roll rate upgrades',
  'LD.study(3)          take studies       LD.folio(2)    bind folios',
  'LD.openAll()         unlock every solid without paying for it',
  'LD.wager()           call the Wager regardless of the threshold',
  'LD.upgrades()        buy every affordable Points upgrade, cheapest first',
  'LD.upgrade("resetBoost")   buy one by id. LD.upgradeIds() lists them',
  'LD.skip("2h")        simulate time away. also 90, "30m", "3d"',
  'LD.rich()            enough of everything to poke at the late game',
  'LD.backups()         what could be restored, and how old',
  'LD.clear()           wipe the save and reload',
]

export function devTools(d: DevDeps): Record<string, unknown> {
  const touch = () => {
    d.save()
  }
  const s = d.state

  return {
    help() {
      console.log(LINES.join('\n'))
      return `${LINES.length - 1} cheats`
    },
    ink(v: number | string) {
      s().ink = new Decimal(v)
      touch()
      return s().ink.toString()
    },
    add(v: number | string) {
      s().ink = s().ink.plus(new Decimal(v))
      touch()
      return s().ink.toString()
    },
    points(v: number) {
      s().points = new Decimal(v)
      touch()
      return v
    },
    wagers(v: number) {
      s().wagers = v
      touch()
      return v
    },
    dice(v: number | string) {
      const amount = new Decimal(v)
      for (const st of s().solids) st.amount = amount
      touch()
      return `every solid set to ${amount.toString()}`
    },
    bought(v: number) {
      for (const st of s().solids) st.bought = v
      touch()
      return `every solid bought ${v}, so x2 per ten applies ${Math.floor(v / 10)} times`
    },
    rate(v: number) {
      s().rollUpgrades = v
      touch()
      return v
    },
    openAll() {
      s().studies = Math.max(s().studies, STUDIES_THAT_UNLOCK)
      touch()
      return `${SOLID_COUNT} solids open`
    },
    study(n = 1) {
      let took = 0
      for (let i = 0; i < n; i++) {
        // A study is measured against studyTier, not the deepest solid, so the
        // stock has to go on whichever one this study actually asks for.
        const req = studyReq(s())
        s().solids[req.idx - 1].amount = req.need.times(2)
        if (buyStudy(s())) took++
      }
      touch()
      return `${took} taken, now ${s().studies}`
    },
    folio(n = 1) {
      let took = 0
      for (let i = 0; i < n; i++) {
        s().studies = Math.max(s().studies, STUDIES_THAT_UNLOCK)
        s().solids[SOLID_COUNT - 1].amount = new Decimal('1e9')
        if (buyFolio(s())) took++
      }
      touch()
      return `${took} bound, now ${s().folios}`
    },
    wager() {
      s().ink = new Decimal('1.8e308')
      const ok = doWager(s())
      touch()
      return ok ? `wager ${s().wagers}, points ${s().points}` : 'refused'
    },
    upgradeIds() {
      return Object.keys(UPGRADES)
    },
    upgrade(id: string) {
      const ok = buyUpgrade(s(), id as UpgradeId)
      touch()
      return ok ? `bought ${id}` : `cannot buy ${id}, check points and its prerequisite`
    },
    upgrades() {
      let n = 0
      for (let pass = 0; pass < 40; pass++) {
        const next = (Object.keys(UPGRADES) as UpgradeId[])
          .filter((id) => canBuy(s(), id))
          .sort((a, b) => UPGRADES[a].cost - UPGRADES[b].cost)[0]
        if (!next) break
        buyUpgrade(s(), next)
        n++
      }
      touch()
      return `${n} bought, ${s().pointUpgrades.length}/${Object.keys(UPGRADES).length} held`
    },
    skip(v: number | string) {
      const secs = seconds(v)
      const before = s().ink
      simulateAway(s(), secs, s().options.offlineTicks)
      touch()
      return `${secs}s simulated, ink ${before.toString()} -> ${s().ink.toString()}`
    },
    rich() {
      const st = s()
      st.studies = STUDIES_THAT_UNLOCK
      st.rollUpgrades = 60
      st.points = new Decimal(40)
      st.wagers = 8
      st.ink = new Decimal('1e150')
      st.solids.forEach((row, i) => {
        row.bought = 80
        row.amount = new Decimal(10).pow(60 - i * 5)
      })
      touch()
      return 'nine solids stocked, 60 roll upgrades, 40 points, 8 wagers'
    },
    backups() {
      return listBackups().map((b) => ({
        id: b.id,
        label: b.label,
        age: `${Math.round((Date.now() - b.at) / 60000)}m`,
        ink: b.ink,
      }))
    },
    clear() {
      localStorage.clear()
      location.reload()
      return 'wiped'
    },
    solids: SOLIDS.map((x) => `${x.short} ${x.name}`),
  }
}
