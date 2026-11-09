import { describe, expect, it } from 'vitest'
import { BLOCK } from '@/components/rafeyos/apps/minecraft/logic/blockTypes'
import { createGrid, fillColumn, measureHeights } from '@/components/rafeyos/apps/minecraft/logic/voxelGrid'
import { pickSpawn, viewIsOpen } from '@/components/rafeyos/apps/minecraft/logic/spawn'

const flatGrid = () => {
  const grid = createGrid(48, 16)
  for (let z = 0; z < 48; z++) {
    for (let x = 0; x < 48; x++) fillColumn(grid, { x, z, top: 4, surface: BLOCK.GRASS, layers: [[BLOCK.DIRT, 2]], sea: 0 })
  }
  measureHeights(grid)
  return grid
}

describe('viewIsOpen', () => {
  it('is true over flat ground and false with a wall ahead', () => {
    const grid = flatGrid()
    expect(viewIsOpen(grid, [24, 4, 24], Math.PI)).toBe(true)

    for (let y = 5; y < 12; y++) grid.set(24, y, 28, BLOCK.STONE)
    measureHeights(grid)
    expect(viewIsOpen(grid, [24, 4, 24], Math.PI)).toBe(false)
  })

  it('is false with a trunk right in front', () => {
    const grid = flatGrid()
    grid.set(24, 6, 22, BLOCK.LOG)

    expect(viewIsOpen(grid, [24, 4, 24], 0)).toBe(false)
  })

  it('accepts looking off the map only when far enough out', () => {
    const grid = flatGrid()

    expect(viewIsOpen(grid, [24, 4, 30], Math.PI)).toBe(true)
    expect(viewIsOpen(grid, [24, 4, 10], Math.PI)).toBe(true)
    expect(viewIsOpen(grid, [24, 4, 38], Math.PI)).toBe(false)
  })
})

describe('pickSpawn', () => {
  it('stands on the best open ground, facing the target', () => {
    const grid = flatGrid()
    const spawn = pickSpawn(grid, { score: ([x, z]) => -Math.hypot(x - 20, z - 30), lookAt: () => [20, 8], pitch: -0.2 })

    expect(spawn).toMatchObject({ x: 20.5, y: 5, z: 30.5, pitch: -0.2 })
    expect(spawn.yaw).toBeCloseTo(0)
  })

  it('skips ground that scores -Infinity or has no headroom', () => {
    const grid = flatGrid()
    grid.set(20, 5, 30, BLOCK.STONE)
    measureHeights(grid)
    const spawn = pickSpawn(grid, { score: ([x, z]) => -Math.hypot(x - 20, z - 30), lookAt: () => [20, 8] })

    expect(spawn).not.toMatchObject({ x: 20.5, z: 30.5 })
    expect(spawn.pitch).toBe(0.04)
  })

  it('falls back to the middle when nothing qualifies', () => {
    const grid = flatGrid()
    const spawn = pickSpawn(grid, { score: () => -Infinity, lookAt: () => [0, 0] })

    expect([spawn.x, spawn.z]).toEqual([24.5, 24.5])
  })
})
