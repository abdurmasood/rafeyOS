import { describe, expect, it } from 'vitest'
import { BLOCK } from '@/components/rafeyos/apps/minecraft/logic/blockTypes'
import { createGrid, fillColumn, measureHeights, scatter, slopeAt } from '@/components/rafeyos/apps/minecraft/logic/voxelGrid'

describe('the voxel grid', () => {
  it('reads air outside and ignores writes outside', () => {
    const grid = createGrid(8, 8)
    grid.set(1, 2, 3, BLOCK.STONE)
    grid.set(-1, 2, 3, BLOCK.STONE)

    expect(grid.get(1, 2, 3)).toBe(BLOCK.STONE)
    expect(grid.get(-1, 2, 3)).toBe(BLOCK.AIR)
    expect(grid.inside(7, 7, 7)).toBe(true)
    expect(grid.inside(8, 0, 0)).toBe(false)
    expect(grid.blocks[grid.index(1, 2, 3)]).toBe(BLOCK.STONE)
  })

  it('setIfAir leaves existing blocks alone', () => {
    const grid = createGrid(8, 8)
    grid.set(1, 1, 1, BLOCK.STONE)
    grid.setIfAir(1, 1, 1, BLOCK.LOG)
    grid.setIfAir(2, 1, 1, BLOCK.LOG)

    expect(grid.get(1, 1, 1)).toBe(BLOCK.STONE)
    expect(grid.get(2, 1, 1)).toBe(BLOCK.LOG)
  })

  it('measures the highest block that is neither air nor water', () => {
    const grid = createGrid(8, 8)
    grid.set(2, 3, 2, BLOCK.STONE)
    grid.set(2, 5, 2, BLOCK.WATER)
    measureHeights(grid)

    expect(grid.top(2, 2)).toBe(3)
    expect(grid.top(0, 0)).toBe(0)
  })
})

describe('fillColumn', () => {
  it('stacks the surface, the layers, stone, and water up to the sea', () => {
    const grid = createGrid(4, 16)
    fillColumn(grid, { x: 1, z: 1, top: 6, surface: BLOCK.GRASS, layers: [[BLOCK.DIRT, 2]], sea: 9 })
    const column = Array.from({ length: 11 }, (_, y) => grid.get(1, y, 1))

    expect(column).toEqual([3, 3, 3, 3, 2, 2, 1, 10, 10, 10, 0])
    expect(grid.top(1, 1)).toBe(6)
  })

  it('stops layers at the bottom of the world', () => {
    const grid = createGrid(4, 16)
    fillColumn(grid, { x: 0, z: 0, top: 1, surface: BLOCK.SAND, layers: [[BLOCK.SAND, 5]], sea: 0 })

    expect(grid.get(0, 0, 0)).toBe(BLOCK.SAND)
  })
})

describe('slopeAt', () => {
  it('is the largest step to a neighbour, and copes with edges', () => {
    const heights = new Int16Array(9)
    heights[4] = 5
    heights[5] = 9

    expect(slopeAt(heights, 3, [1, 1])).toBe(5)
    expect(slopeAt(heights, 3, [2, 1])).toBe(9)
    expect(slopeAt(heights, 3, [0, 0])).toBe(0)
    expect(slopeAt(heights, 3, [1, 2])).toBe(5)
  })
})

describe('scatter', () => {
  const run = () => {
    const visits = []
    scatter(createGrid(32, 8), 11, 4, ([x, z], rand, roll) => visits.push([x, z, rand(), roll]))
    return visits
  }

  it('visits the same jittered spots every time, clear of the border', () => {
    const visits = run()

    expect(visits.length).toBeGreaterThan(20)
    expect(run()).toEqual(visits)
    for (const [x, z] of visits) {
      expect(x).toBeGreaterThanOrEqual(3)
      expect(z).toBeLessThan(29)
    }
  })
})
