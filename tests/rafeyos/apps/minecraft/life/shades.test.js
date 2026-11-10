import { describe, expect, it, vi } from 'vitest'
import { BLOCK } from '@/components/rafeyos/apps/minecraft/logic/blockTypes'
import { createGround } from '@/components/rafeyos/apps/minecraft/logic/life/ground'
import { SHADES, STATUS, createShades } from '@/components/rafeyos/apps/minecraft/logic/life/shades'
import { worldOf } from '../minecraftTestWorld'

const FRAME = 1 / 60
const seeded = (seed = 7) => {
  let n = seed
  return () => ((n = (n * 9301 + 49297) % 233280) / 233280)
}
/** A level stone field with its top at y 30, so feet stand at 31; `cells` add walls and pillars. */
const field = (cells = []) => worldOf(cells, (x, y) => (y <= 30 ? BLOCK.STONE : BLOCK.AIR))
const at = (x, y, z) => ({ pos: { x, y, z }, vel: { x: 0, y: 0, z: 0 } })

/** Runs a shade 16 blocks from a still player for `seconds`; what it did, frame by frame. */
const hunt = ({ world, player, from = [100.5, 31, 116.5], seconds = 15, night = 1, swimming = false, playing = true }) => {
  const shades = createShades({ world, ground: createGround(world), random: seeded() })
  const shade = shades.add(...from)
  shade.rise = 1
  const onBite = vi.fn()
  const seen = new Set()
  const eye = { x: player.pos.x, y: player.pos.y + 1.62, z: player.pos.z }
  for (let t = 0; t < seconds; t += FRAME) {
    shades.update(FRAME, { player, eye, night, playing, swimming, time: t, onBite })
    if (shades.shades[0]) seen.add(shades.shades[0].status)
  }
  return { shades, shade, onBite, seen }
}

describe('a shade on the hunt', () => {
  it('comes straight at a player in the open, pounces and bites, then backs off', () => {
    const { onBite, seen } = hunt({ world: field(), player: at(100.5, 31, 100.5) })

    expect(onBite).toHaveBeenCalled()
    expect([...seen]).toEqual(expect.arrayContaining([STATUS.STALK, STATUS.POUNCE, STATUS.BACK_OFF]))
  })

  it('can never reach a player two blocks up, and circles below', () => {
    const pillar = [[100, 31, 100, BLOCK.PLANKS], [100, 32, 100, BLOCK.PLANKS]]

    const { onBite, seen } = hunt({ world: field(pillar), player: at(100.5, 33, 100.5) })

    expect(onBite).not.toHaveBeenCalled()
    expect(seen).toContain(STATUS.BELOW)
  })

  it('reaches a player one block up, since it climbs single steps', () => {
    const step = [[100, 31, 100, BLOCK.PLANKS]]

    const { onBite } = hunt({ world: field(step), player: at(100.5, 32, 100.5) })

    expect(onBite).toHaveBeenCalled()
  })

  it('follows a wall round to its end, then comes for the player behind it', () => {
    const wall = []
    for (let x = 97; x <= 103; x++) wall.push([x, 31, 104, BLOCK.BRICK], [x, 32, 104, BLOCK.BRICK])

    const { onBite, seen } = hunt({ world: field(wall), player: at(100.5, 31, 100.5) })

    expect(seen).toContain(STATUS.AROUND)
    expect(onBite).toHaveBeenCalled()
  })

  it("won't wade in after a player in the water, and paces the shore", () => {
    // Land past z 105; before it the floor drops to 28 under two blocks of water
    const coast = worldOf([], (x, y, z) => {
      if (z > 105) return y <= 30 ? BLOCK.STONE : BLOCK.AIR
      if (y <= 28) return BLOCK.STONE
      return y <= 30 ? BLOCK.WATER : BLOCK.AIR
    })

    const { onBite, seen } = hunt({ world: coast, player: at(100.5, 29, 101.5), swimming: true })

    expect(onBite).not.toHaveBeenCalled()
    expect(seen).toContain(STATUS.SHORE)
  })

  it('holds still while the game is not being played', () => {
    const { shade } = hunt({ world: field(), player: at(100.5, 31, 100.5), playing: false, seconds: 3 })

    expect([shade.x, shade.z]).toEqual([100.5, 116.5])
  })
})

describe('the end of a shade', () => {
  it('burns away at dawn', () => {
    const { shades } = hunt({ world: field(), player: at(100.5, 31, 100.5), night: 0.2, seconds: 2 })

    expect(shades.shades).toEqual([])
  })

  it('takes two hits, a moment apart, to put down', () => {
    const world = field()
    const shades = createShades({ world, ground: createGround(world), random: seeded() })
    const shade = shades.add(100.5, 31, 103.5)
    shade.rise = 1
    const eye = { x: 100.5, y: 32.62, z: 100.5 }, look = { x: 0, y: -0.5, z: 1 }
    const norm = Math.hypot(look.x, look.y, look.z)
    const dir = { x: look.x / norm, y: look.y / norm, z: look.z / norm }

    expect(shades.hit(eye, dir, 4.5)).toBe(true)
    expect(shades.hit(eye, dir, 4.5)).toBe(true)
    expect(shade.hits).toBe(1)
    shade.hitClock = 0
    shades.hit(eye, dir, 4.5)
    expect(shade.hits).toBe(SHADES.HITS)
  })

  it('is out of reach behind a block nearer than it', () => {
    const world = field()
    const shades = createShades({ world, ground: createGround(world), random: seeded() })
    shades.add(100.5, 31, 104.5).rise = 1

    expect(shades.hit({ x: 100.5, y: 31.9, z: 100.5 }, { x: 0, y: 0, z: 1 }, 2)).toBe(false)
  })
})

describe('where shades come from', () => {
  const night = (shades, seconds, extra = {}) => {
    const player = at(100.5, 31, 100.5)
    for (let t = 0; t < seconds; t += FRAME) {
      shades.update(FRAME, { player, eye: { x: 100.5, y: 32.6, z: 100.5 }, night: 1, playing: true, swimming: false, time: t, onBite: () => {}, ...extra })
    }
  }

  it('rise in the dark, never more than four at once', () => {
    const world = field()
    const shades = createShades({ world, ground: createGround(world), random: seeded() })

    night(shades, 60)

    expect(shades.shades.length).toBeGreaterThan(0)
    expect(shades.shades.length).toBeLessThanOrEqual(SHADES.MAX)
  })

  it('never rise by day', () => {
    const world = field()
    const shades = createShades({ world, ground: createGround(world), random: seeded() })

    night(shades, 30, { night: 0 })

    expect(shades.shades).toEqual([])
  })

  it('give a respawned player a moment of grace, with none about', () => {
    const world = field()
    const shades = createShades({ world, ground: createGround(world), random: () => 0 })
    night(shades, 2)

    shades.respawned()
    expect(shades.shades).toEqual([])
    night(shades, SHADES.GRACE - 0.5)
    expect(shades.shades).toEqual([])
  })
})
