import { describe, expect, it } from 'vitest'
import { BLOCK } from '@/components/rafeyos/apps/minecraft/logic/blockTypes'
import { createGrid, fillColumn, measureHeights } from '@/components/rafeyos/apps/minecraft/logic/voxelGrid'
import { ISLE, isCrater, isleSurface, islandField, plantIsle, seaFloor } from '@/components/rafeyos/apps/minecraft/logic/islands'

const volcano = { kind: ISLE.VOLCANO, x: 100, z: 100, r: 40, peak: 30 }
const jungle = { kind: ISLE.JUNGLE, x: 300, z: 100, r: 30, peak: 15 }
const field = islandField([volcano, jungle])

describe('islandField', () => {
  it('reports the isle under a column, high at its heart', () => {
    const near = field.at([100, 100], seaFloor(100, 100))

    expect(near.kind).toBe(ISLE.VOLCANO)
    expect(near.isle).toBe(volcano)
    expect(near.height).toBeGreaterThan(28)
    expect(field.at([300, 100], seaFloor(300, 100)).kind).toBe(ISLE.JUNGLE)
  })

  it('reports sea far away', () => {
    const far = field.at([500, 500], seaFloor(500, 500))

    expect(far).toEqual({ height: -Infinity, kind: 'sea', isle: null })
  })
})

describe('isCrater', () => {
  it('is true only inside a volcano core', () => {
    expect(isCrater(volcano, [101, 100])).toBe(true)
    expect(isCrater(volcano, [120, 100])).toBe(false)
    expect(isCrater(jungle, [300, 100])).toBe(false)
    expect(isCrater(null, [0, 0])).toBe(false)
  })
})

describe('isleSurface', () => {
  it('lays black sand round a volcano and magma in its crater', () => {
    const flat = { slope: 0, noise: 0, inCrater: false }

    expect(isleSurface(ISLE.VOLCANO, 28, flat)[0]).toBe(BLOCK.BLACK_SAND)
    expect(isleSurface(ISLE.VOLCANO, 50, { ...flat, inCrater: true })[0]).toBe(BLOCK.MAGMA)
    expect(isleSurface(ISLE.PLAIN, 32, flat)[0]).toBe(BLOCK.GRASS)
    expect(isleSurface(ISLE.PLAIN, 32, { ...flat, slope: 6 })[0]).toBe(BLOCK.STONE)
  })
})

describe('plantIsle', () => {
  const standOn = (ground, h) => {
    const grid = createGrid(16, 64)
    fillColumn(grid, { x: 8, z: 8, top: h, surface: ground, layers: [[BLOCK.DIRT, 3]], sea: 28 })
    measureHeights(grid)
    return grid
  }

  it('plants a palm on a beach and nothing under the sea', () => {
    const beach = standOn(BLOCK.SAND, 29)
    plantIsle(beach, [8, 8], ISLE.PLAIN, { rand: () => 0.5, roll: 0.1 })
    expect(beach.get(8, 30, 8)).toBe(BLOCK.PALM_LOG)

    const sea = standOn(BLOCK.SAND, 20)
    plantIsle(sea, [8, 8], ISLE.PLAIN, { rand: () => 0.5, roll: 0.1 })
    expect(sea.get(8, 21, 8)).toBe(BLOCK.WATER)
  })

  it('plants a pine on a pines isle grass', () => {
    const grid = standOn(BLOCK.GRASS, 40)
    plantIsle(grid, [8, 8], ISLE.PINES, { rand: () => 0.5, roll: 0.1 })

    expect(grid.get(8, 41, 8)).toBe(BLOCK.PINE_LOG)
  })
})
