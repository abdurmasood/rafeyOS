import { describe, expect, it } from 'vitest'
import { BLOCK } from '@/components/rafeyos/apps/minecraft/logic/blockTypes'
import { carveWorms, sprinkleOre } from '@/components/rafeyos/apps/minecraft/logic/caves'
import { mulberry32 } from '@/components/rafeyos/apps/minecraft/logic/random'
import { createGrid, measureHeights } from '@/components/rafeyos/apps/minecraft/logic/voxelGrid'

const solidGrid = (fillBlock = BLOCK.STONE, topY = 20) => {
  const grid = createGrid(32, 32)
  for (let z = 0; z < 32; z++) for (let x = 0; x < 32; x++) for (let y = 0; y <= topY; y++) grid.set(x, y, z, fillBlock)
  measureHeights(grid)
  return grid
}
const countOf = (grid, block) => grid.blocks.reduce((total, current) => total + (current === block ? 1 : 0), 0)

describe('carveWorms', () => {
  it('carves air tubes out of stone', () => {
    const grid = solidGrid()
    const stoneBefore = countOf(grid, BLOCK.STONE), airBefore = countOf(grid, BLOCK.AIR)
    carveWorms(grid, mulberry32(1), { count: 3, keepDryBelow: 0 })

    expect(countOf(grid, BLOCK.AIR)).toBeGreaterThan(airBefore)
    expect(countOf(grid, BLOCK.STONE)).toBeLessThan(stoneBefore)
  })

  it('never touches water or ice', () => {
    const grid = solidGrid(BLOCK.WATER)
    for (let z = 0; z < 32; z++) for (let x = 0; x < 32; x++) grid.set(x, 21, z, BLOCK.ICE)
    const water = countOf(grid, BLOCK.WATER), ice = countOf(grid, BLOCK.ICE)
    grid.heights.fill(20)
    carveWorms(grid, mulberry32(2), { count: 3, keepDryBelow: 0 })

    expect(countOf(grid, BLOCK.WATER)).toBe(water)
    expect(countOf(grid, BLOCK.ICE)).toBe(ice)
  })

  it('skips columns at or below keepDryBelow', () => {
    const grid = solidGrid()
    const stone = countOf(grid, BLOCK.STONE)
    carveWorms(grid, mulberry32(3), { count: 3, keepDryBelow: 20 })

    expect(countOf(grid, BLOCK.STONE)).toBe(stone)
  })
})

describe('sprinkleOre', () => {
  it('replaces stone only', () => {
    const dirt = solidGrid(BLOCK.DIRT)
    sprinkleOre(dirt, mulberry32(4), { ore: BLOCK.COAL_ORE, count: 50, maxY: 18 })
    expect(countOf(dirt, BLOCK.COAL_ORE)).toBe(0)

    const stone = solidGrid()
    sprinkleOre(stone, mulberry32(4), { ore: BLOCK.COAL_ORE, count: 50, maxY: 18 })
    expect(countOf(stone, BLOCK.COAL_ORE)).toBeGreaterThan(0)
    expect(countOf(stone, BLOCK.AIR)).toBe(countOf(solidGrid(), BLOCK.AIR))
  })
})
