import { describe, expect, it, vi } from 'vitest'
import { BLOCK } from '@/components/rafeyos/apps/minecraft/logic/blockTypes'
import { createGround } from '@/components/rafeyos/apps/minecraft/logic/life/ground'
import { CREEPERS, STATUS, createCreepers } from '@/components/rafeyos/apps/minecraft/logic/life/creepers'
import { worldOf } from '../minecraftTestWorld'

const FRAME = 1 / 60
const seeded = (seed = 7) => {
  let n = seed
  return () => ((n = (n * 9301 + 49297) % 233280) / 233280)
}
/** A level stone field with its top at y 30, so feet stand at 31. */
const field = (cells = []) => worldOf(cells, (x, y) => (y <= 30 ? BLOCK.STONE : BLOCK.AIR))
const at = (x, y, z) => ({ pos: { x, y, z }, vel: { x: 0, y: 0, z: 0 } })

/** Runs a creeper from `from` toward a still player for `seconds`. */
const approach = ({
  world, player, from = [100.5, 31, 116.5], seconds = 15, night = 1, swimming = false, playing = true,
}) => {
  const creepers = createCreepers({ world, ground: createGround(world), random: seeded() })
  const creeper = creepers.add(...from)
  const onBoom = vi.fn()
  const seen = new Set()
  const eye = { x: player.pos.x, y: player.pos.y + 1.62, z: player.pos.z }
  for (let t = 0; t < seconds; t += FRAME) {
    creepers.update(FRAME, { player, eye, night, playing, swimming, time: t, onBoom })
    if (creepers.creepers[0]) seen.add(creepers.creepers[0].status)
  }
  return { creepers, creeper, onBoom, seen }
}

describe('a creeper hunting', () => {
  it('walks in, fuses, and explodes next to a still player', () => {
    const { onBoom, seen } = approach({ world: field(), player: at(100.5, 31, 100.5) })

    expect(onBoom).toHaveBeenCalled()
    expect([...seen]).toEqual(expect.arrayContaining([STATUS.WALK, STATUS.FUSE]))
    expect(onBoom.mock.calls[0][0]).toMatchObject({ x: expect.any(Number), y: expect.any(Number), z: expect.any(Number) })
  })

  it('cancels fuse if the player gets farther than FUSE_CANCEL', () => {
    const world = field()
    const creepers = createCreepers({ world, ground: createGround(world), random: seeded() })
    const creeper = creepers.add(100.5, 31, 102.5)
    const onBoom = vi.fn()
    const player = at(100.5, 31, 100.5)
    const eye = { x: 100.5, y: 32.62, z: 100.5 }
    const frame = { player, eye, night: 1, playing: true, swimming: false, time: 0, onBoom }

    // Close enough to start fuse
    for (let t = 0; t < 0.2; t += FRAME) creepers.update(FRAME, frame)
    expect(creeper.status).toBe(STATUS.FUSE)

    // Player flees past cancel range
    player.pos.z = 100.5 - (CREEPERS.FUSE_CANCEL + 1)
    eye.z = player.pos.z
    for (let t = 0; t < 0.3; t += FRAME) creepers.update(FRAME, { ...frame, time: t })

    expect(creeper.status).toBe(STATUS.WALK)
    expect(onBoom).not.toHaveBeenCalled()
  })

  it('holds still while the game is not being played', () => {
    const { creeper } = approach({ world: field(), player: at(100.5, 31, 100.5), playing: false, seconds: 3 })

    expect([creeper.x, creeper.z]).toEqual([100.5, 116.5])
  })
})

describe('killing a creeper', () => {
  it('takes two hits, a moment apart, to put down', () => {
    const world = field()
    const creepers = createCreepers({ world, ground: createGround(world), random: seeded() })
    const creeper = creepers.add(100.5, 31, 103.5)
    const eye = { x: 100.5, y: 32.62, z: 100.5 }, look = { x: 0, y: -0.5, z: 1 }
    const norm = Math.hypot(look.x, look.y, look.z)
    const dir = { x: look.x / norm, y: look.y / norm, z: look.z / norm }

    expect(creepers.hit(eye, dir, 4.5)).toBe(true)
    expect(creepers.hit(eye, dir, 4.5)).toBe(true)
    expect(creeper.hits).toBe(1)
    creeper.hitClock = 0
    creepers.hit(eye, dir, 4.5)
    expect(creeper.hits).toBe(CREEPERS.HITS)

    creepers.update(FRAME, {
      player: at(100.5, 31, 100.5), eye, night: 1, playing: true, swimming: false, time: 0, onBoom: () => {},
    })
    expect(creepers.creepers).toEqual([])
  })

  it('clears fuse when hit', () => {
    const world = field()
    const creepers = createCreepers({ world, ground: createGround(world), random: seeded() })
    const creeper = creepers.add(100.5, 31, 102.0)
    const onBoom = vi.fn()
    const player = at(100.5, 31, 100.5)
    const eye = { x: 100.5, y: 32.62, z: 100.5 }
    for (let t = 0; t < 0.2; t += FRAME) {
      creepers.update(FRAME, { player, eye, night: 1, playing: true, swimming: false, time: t, onBoom })
    }
    expect(creeper.status).toBe(STATUS.FUSE)

    const dir = { x: 0, y: 0, z: 1 }
    creepers.hit(eye, dir, 4.5)
    expect(creeper.fuse).toBe(0)
    expect(creeper.status).toBe(STATUS.HIT)
    expect(onBoom).not.toHaveBeenCalled()
  })
})

describe('where creepers come from', () => {
  const night = (creepers, seconds, extra = {}) => {
    const player = at(100.5, 31, 100.5)
    for (let t = 0; t < seconds; t += FRAME) {
      creepers.update(FRAME, {
        player, eye: { x: 100.5, y: 32.6, z: 100.5 }, night: 1, playing: true, swimming: false, time: t,
        onBoom: () => {}, ...extra,
      })
    }
  }

  it('spawn in the dark, never more than MAX at once', () => {
    const world = field()
    const creepers = createCreepers({ world, ground: createGround(world), random: seeded() })

    night(creepers, 60)

    expect(creepers.creepers.length).toBeGreaterThan(0)
    expect(creepers.creepers.length).toBeLessThanOrEqual(CREEPERS.MAX)
  })

  it('never spawn by day', () => {
    const world = field()
    const creepers = createCreepers({ world, ground: createGround(world), random: seeded() })

    night(creepers, 30, { night: 0 })

    expect(creepers.creepers).toEqual([])
  })

  it('stay after dawn instead of burning away', () => {
    const world = field()
    const creepers = createCreepers({ world, ground: createGround(world), random: seeded() })
    creepers.add(100.5, 31, 110.5)

    night(creepers, 2, { night: 0.2 })

    expect(creepers.creepers).toHaveLength(1)
    expect(creepers.creepers[0].status).not.toBe(STATUS.FUSE)
  })

  it('give a respawned player a moment of grace, with none about', () => {
    const world = field()
    const creepers = createCreepers({ world, ground: createGround(world), random: () => 0 })
    night(creepers, 2)

    creepers.respawned()
    expect(creepers.creepers).toEqual([])
    night(creepers, CREEPERS.GRACE - 0.5)
    expect(creepers.creepers).toEqual([])
  })
})
