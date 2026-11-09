import { describe, expect, it } from 'vitest'
import { BLOCK } from '@/components/rafeyos/apps/minecraft/logic/blockTypes'
import { bigOak, birch, boulder, bush, cactus, flatTop, oak, palm, pine, swampTree } from '@/components/rafeyos/apps/minecraft/logic/flora'
import { mulberry32 } from '@/components/rafeyos/apps/minecraft/logic/random'
import { createGrid } from '@/components/rafeyos/apps/minecraft/logic/voxelGrid'

const grow = (plant, options) => {
  const grid = createGrid(32, 40)
  plant(grid, [16, 1, 16], mulberry32(7), options)
  const counts = new Map()
  for (const block of grid.blocks) if (block !== BLOCK.AIR) counts.set(block, (counts.get(block) ?? 0) + 1)
  return { grid, counts }
}

describe('trees', () => {
  it.each([
    ['oak', oak, [BLOCK.LOG, BLOCK.LEAVES]],
    ['bigOak', bigOak, [BLOCK.LOG, BLOCK.LEAVES]],
    ['birch', birch, [BLOCK.BIRCH_LOG, BLOCK.BIRCH_LEAVES]],
    ['pine', pine, [BLOCK.PINE_LOG, BLOCK.PINE_LEAVES]],
    ['palm', palm, [BLOCK.PALM_LOG, BLOCK.PALM_LEAVES]],
    ['swampTree', swampTree, [BLOCK.LOG, BLOCK.MARSH_LEAVES]],
    ['flatTop', flatTop, [BLOCK.LOG, BLOCK.LEAVES]],
  ])('%s writes only its own wood and leaves', (_name, plant, allowed) => {
    const { counts } = grow(plant)

    expect([...counts.keys()].sort()).toEqual([...allowed].sort())
  })

  it('oak stands on its base with a trunk 4 to 6 tall', () => {
    const { grid } = grow(oak)
    let height = 0
    while (grid.get(16, 1 + height, 16) === BLOCK.LOG) height++

    expect(height).toBeGreaterThanOrEqual(4)
    expect(height).toBeLessThanOrEqual(6)
  })

  it('leaves only grow into air', () => {
    const grid = createGrid(32, 40)
    for (let y = 0; y < 40; y++) grid.set(17, y, 16, BLOCK.STONE)
    oak(grid, [16, 1, 16], mulberry32(7))

    expect(grid.get(17, 6, 16)).toBe(BLOCK.STONE)
  })

  it('is the same tree for the same random stream', () => {
    expect(grow(oak).grid.blocks).toEqual(grow(oak).grid.blocks)
  })
})

describe('small things', () => {
  it('a cactus is a short column', () => {
    const { counts } = grow(cactus)

    expect(counts.get(BLOCK.CACTUS)).toBeGreaterThanOrEqual(2)
    expect(counts.get(BLOCK.CACTUS)).toBeLessThanOrEqual(4)
  })

  it('a bush is leaves only, in the leaves it is given', () => {
    expect([...grow(bush).counts.keys()]).toEqual([BLOCK.LEAVES])
    expect([...grow(bush, { leaves: BLOCK.MARSH_LEAVES }).counts.keys()]).toEqual([BLOCK.MARSH_LEAVES])
  })

  it('a boulder is stone, mossy on top only when asked', () => {
    expect(grow(boulder).counts.get(BLOCK.STONE)).toBeGreaterThan(0)
    expect(grow(boulder, { mossy: false }).counts.has(BLOCK.MOSSY_STONE)).toBe(false)
  })
})
