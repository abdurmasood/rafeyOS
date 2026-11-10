import { describe, expect, it } from 'vitest'
import { BLOCK } from '@/components/rafeyos/apps/minecraft/logic/blockTypes'
import { ZONE } from '@/components/rafeyos/apps/minecraft/logic/continent'
import { createGround } from '@/components/rafeyos/apps/minecraft/logic/life/ground'
import { HERDS, createHerds } from '@/components/rafeyos/apps/minecraft/logic/life/herds'
import { SPECIES } from '@/components/rafeyos/apps/minecraft/logic/life/species'
import { worldOf } from '../minecraftTestWorld'

const seeded = (seed = 1) => {
  let n = seed
  return () => ((n = (n * 9301 + 49297) % 233280) / 233280)
}
/** Ground of `block` with its top at y 30, air above; `cells` add or replace blocks. */
const land = (block, cells = []) => worldOf(cells, (x, y) => (y < 30 ? BLOCK.DIRT : y === 30 ? block : BLOCK.AIR))
const sea = (depth) => worldOf([], (x, y) => (y <= 28 - depth ? BLOCK.SAND : y <= 28 ? BLOCK.WATER : BLOCK.AIR))
const herdsOn = (world, zone = ZONE.MEADOW, seed = 1) => createHerds({ world, ground: createGround(world), zoneAt: () => zone, random: seeded(seed) })
const species = (herds) => new Set(herds.animals.map((animal) => animal.species))
const STILL = { x: 100, z: 100, speed: 0 }

describe('where herds live', () => {
  it.each([
    [BLOCK.GRASS, ZONE.MEADOW, ['hare', 'deer']],
    [BLOCK.GRASS, ZONE.FOREST, ['hare', 'deer']],
    [BLOCK.ICE, ZONE.FROST, ['penguin']],
    [BLOCK.MARSH_GRASS, ZONE.SWAMP, ['duck']],
  ])('puts animals on %i in the %s', (block, zone, kinds) => {
    const herds = herdsOn(land(block), zone)

    herds.populate(STILL)

    expect(herds.animals.length).toBeGreaterThan(0)
    for (const kind of species(herds)) expect(kinds).toContain(kind)
  })

  it('keeps goats to high rock, and crabs to sand by the water', () => {
    const lowRock = herdsOn(land(BLOCK.STONE), ZONE.MEADOW)
    const dunes = herdsOn(land(BLOCK.SAND), ZONE.DESERT)
    lowRock.populate(STILL)
    dunes.populate(STILL)

    expect(lowRock.animals).toEqual([])
    expect(dunes.animals).toEqual([])
    expect(lowRock.herdFor(100, 100)).toBeNull()
  })

  it('schools fish in deep water and nothing in shallows away from land', () => {
    const deep = herdsOn(sea(10), ZONE.MEADOW)
    deep.populate(STILL)

    expect(species(deep)).toEqual(new Set(['fish']))
    expect(herdsOn(sea(1)).herdFor(100, 100)).toBeNull()
  })

  it('never fills past its caps, however many tries', () => {
    const herds = herdsOn(land(BLOCK.GRASS))
    herds.populate(STILL)
    for (let i = 0; i < 200; i++) herds.update(HERDS.SPAWN_EVERY, STILL)

    expect(herds.animals.filter((animal) => animal.species !== 'fish').length).toBeLessThanOrEqual(HERDS.LAND)
  })
})

describe('how animals move', () => {
  it('steps up one block but not two, drops two but not three, and keeps out of water it can’t swim', () => {
    const herds = herdsOn(land(BLOCK.GRASS, [
      [101, 31, 100, BLOCK.DIRT], [102, 31, 100, BLOCK.DIRT], [102, 32, 100, BLOCK.DIRT],
      [103, 30, 100, BLOCK.AIR], [103, 29, 100, BLOCK.AIR], [103, 28, 100, BLOCK.AIR], [103, 27, 100, BLOCK.AIR],
      [104, 30, 100, BLOCK.WATER],
    ]))

    expect(herds.standAt('deer', 101.5, 100.5, 31)).toBe(32)
    expect(herds.standAt('deer', 102.5, 100.5, 31)).toBeNull()
    expect(herds.standAt('deer', 103.5, 100.5, 31)).toBeNull()
    expect(herds.standAt('deer', 104.5, 100.5, 31)).toBeNull()
    expect(herds.standAt('duck', 104.5, 100.5, 31)).not.toBeNull()
  })

  it('bolts away from a player running at it', () => {
    const herds = herdsOn(land(BLOCK.GRASS))
    herds.populate({ x: 100, z: 100 })
    const animal = herds.animals.find((a) => a.species === 'hare' || a.species === 'deer')
    const player = { x: animal.x + 2, z: animal.z, speed: 5 }
    const before = Math.hypot(animal.x - player.x, animal.z - player.z)

    for (let i = 0; i < 60; i++) herds.update(1 / 60, player)

    expect(animal.mode).toBe('flee')
    expect(Math.hypot(animal.x - player.x, animal.z - player.z)).toBeGreaterThan(before)
  })

  it('leaves animals behind once the player is far away', () => {
    const herds = herdsOn(land(BLOCK.GRASS))
    herds.populate({ x: 100, z: 100 })
    const far = { x: 100 + HERDS.GONE + HERDS.FAR + 10, z: 100, speed: 0 }

    herds.update(0.01, far)

    expect(herds.animals.every((a) => Math.hypot(a.x - far.x, a.z - far.z) <= HERDS.GONE)).toBe(true)
  })

  it('keeps fish under the surface', () => {
    const herds = herdsOn(sea(10))
    herds.populate(STILL)
    for (let i = 0; i < 300; i++) herds.update(1 / 30, STILL)

    expect(herds.animals.length).toBeGreaterThan(0)
    for (const fish of herds.animals) expect(fish.y).toBeLessThan(28.88)
  })

  it('wheels gulls overhead in flocks round the player', () => {
    const herds = herdsOn(land(BLOCK.GRASS))
    herds.update(0.5, STILL)

    expect(herds.gulls).toHaveLength(HERDS.FLOCKS * HERDS.GULLS)
    for (const gull of herds.gulls) {
      expect(gull.y).toBeGreaterThan(40)
      expect(Math.hypot(gull.x - STILL.x, gull.z - STILL.z)).toBeLessThan(60)
    }
  })
})

describe('the species', () => {
  it.each(Object.entries(SPECIES))('%s is built from sound parts, each swinging one about a pivot', (name, def) => {
    for (const colours of def.colours) {
      for (const part of def.parts(colours)) {
        expect(part.size.every((side) => side > 0)).toBe(true)
        expect(part.colour).toMatch(/^#[0-9a-f]{6}$/)
        if (part.swing) expect(part.pivot).toHaveLength(3)
      }
    }
    expect(def.parts(def.colours[0]).length).toBe(def.parts(def.colours.at(-1)).length)
  })
})
