import { describe, expect, it } from 'vitest'
import { BLOCK } from '@/components/rafeyos/apps/minecraft/logic/blockTypes'
import { CONTINENT, ZONE, continentAt, fillContinentColumn, plantContinent, surfaceFor } from '@/components/rafeyos/apps/minecraft/logic/continent'
import { createGrid, measureHeights } from '@/components/rafeyos/apps/minecraft/logic/voxelGrid'

describe('the continent', () => {
  it('is 256 wide with the sea at 28', () => {
    expect(CONTINENT).toEqual({ SIZE: 256, SEA: 28 })
  })

  it('has all six zones across its local area', () => {
    const zones = new Set()
    for (let z = 0; z < 256; z += 6) for (let x = 0; x < 256; x += 6) {
      const c = continentAt(x, z)
      if (c.land > 0.02) zones.add(c.biome)
    }

    expect(zones.size).toBe(6)
    expect([...zones].sort()).toEqual(Object.values(ZONE).sort())
  })

  it('gives the same column every time', () => {
    expect(continentAt(100, 120)).toEqual(continentAt(100, 120))
  })
})

describe('surfaceFor', () => {
  it('picks the ground for each zone, leaving canyon to its own filler', () => {
    expect(surfaceFor([0, 0], 40, { land: 1, biome: ZONE.SWAMP }, 0)[0]).toBe(BLOCK.MARSH_GRASS)
    expect(surfaceFor([0, 0], 40, { land: 1, biome: ZONE.DESERT }, 0)[0]).toBe(BLOCK.SAND)
    expect(surfaceFor([0, 0], 40, { land: 1, biome: ZONE.MEADOW }, 6)[0]).toBe(BLOCK.STONE)
    expect(surfaceFor([0, 0], 40, { land: 1, biome: ZONE.CANYON }, 0)).toBeNull()
    expect(surfaceFor([0, 0], 20, { land: 1, biome: ZONE.FROST }, 0)[0]).toBe(BLOCK.GRAVEL)
  })
})

describe('fillContinentColumn and plantContinent', () => {
  it('writes canyon bands and plants a forest tree on grass', () => {
    const grid = createGrid(16, 64)
    fillContinentColumn(grid, { x: 4, z: 4, localX: 4, localZ: 4, top: 40, column: { land: 1, biome: ZONE.CANYON }, slope: 3 })
    expect(grid.get(4, 40, 4)).not.toBe(BLOCK.AIR)

    fillContinentColumn(grid, { x: 8, z: 8, localX: 8, localZ: 8, top: 34, column: { land: 1, biome: ZONE.FOREST }, slope: 0 })
    measureHeights(grid)
    plantContinent(grid, [8, 8], ZONE.FOREST, { rand: () => 0.1, roll: 0.1 })
    expect(grid.get(8, 35, 8)).toBe(BLOCK.LOG)
  })

  it('freezes the cold sea', () => {
    const grid = createGrid(16, 64)
    fillContinentColumn(grid, { x: 2, z: 2, localX: 2, localZ: 2, top: 20, column: { land: 0.5, biome: ZONE.FROST }, slope: 0 })

    expect(grid.get(2, 28, 2)).toBe(BLOCK.ICE)
  })
})
