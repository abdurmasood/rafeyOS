import { describe, expect, it } from 'vitest'
import {
  WORLD, WORLD_ID, blockIn, generateIsland, heightAt, inBounds, openView, voxelIndex,
} from '@/components/rafeyos/apps/blocks/logic/terrain'
import { BLOCK } from '@/components/rafeyos/apps/blocks/logic/blockTypes'

// FNV-1a over every block, so any change to generation shows up here
const checksum = (blocks) => {
  let hash = 0x811c9dc5
  for (const block of blocks) hash = Math.imul(hash ^ block, 0x01000193) >>> 0
  return hash
}
const count = (blocks, block) => blocks.reduce((n, b) => n + (b === block ? 1 : 0), 0)

describe('the island', () => {
  it('is the same island every time; changing generation must bump WORLD_ID, or saved builds land in the wrong places', () => {
    const { blocks } = generateIsland()

    expect(WORLD_ID).toBe('island-1')
    expect(checksum(blocks)).toBe(ISLAND_CHECKSUM)
  })

  it('is built once and shared', () => {
    expect(generateIsland()).toBe(generateIsland())
    expect(Object.isFrozen(generateIsland())).toBe(true)
  })

  it('has hills, water, beaches, rock, snow and trees', () => {
    const { blocks } = generateIsland()

    for (const block of [BLOCK.GRASS, BLOCK.WATER, BLOCK.SAND, BLOCK.STONE, BLOCK.SNOW, BLOCK.LOG, BLOCK.LEAVES]) {
      expect(count(blocks, block)).toBeGreaterThan(0)
    }
  })

  it('sinks into the sea at its edges', () => {
    const { heights } = generateIsland()

    expect(heights[0]).toBeLessThanOrEqual(WORLD.WATER_LEVEL)
    expect(heights[WORLD.SIZE * WORLD.SIZE - 1]).toBeLessThanOrEqual(WORLD.WATER_LEVEL)
    expect(heightAt(0, 0)).toBe(heightAt(0, 0))
  })

  it('starts the player on grass, in the open, facing a clear view', () => {
    const island = generateIsland()
    const { x, y, z, yaw } = island.spawn
    const [bx, bz] = [Math.floor(x), Math.floor(z)]

    expect(blockIn(island.blocks, bx, y - 1, bz)).toBe(BLOCK.GRASS)
    expect(blockIn(island.blocks, bx, y, bz)).toBe(BLOCK.AIR)
    expect(blockIn(island.blocks, bx, y + 1, bz)).toBe(BLOCK.AIR)
    expect(openView(island, [bx, y - 1, bz], yaw)).toBe(true)
  })
})

describe('the voxel grid', () => {
  it('maps each block to its own slot', () => {
    expect(voxelIndex(0, 0, 0)).toBe(0)
    expect(voxelIndex(1, 0, 0)).toBe(1)
    expect(voxelIndex(0, 0, 1)).toBe(WORLD.SIZE)
    expect(voxelIndex(0, 1, 0)).toBe(WORLD.SIZE * WORLD.SIZE)
  })

  it('reads air outside the island and stone beneath it', () => {
    const { blocks } = generateIsland()

    expect(inBounds(-1, 5, 5)).toBe(false)
    expect(inBounds(5, WORLD.HEIGHT, 5)).toBe(false)
    expect(blockIn(blocks, -1, 5, 5)).toBe(BLOCK.AIR)
    expect(blockIn(blocks, 5, -1, 5)).toBe(BLOCK.STONE)
  })
})

const ISLAND_CHECKSUM = 1132091598
