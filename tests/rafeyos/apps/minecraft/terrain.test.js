import { describe, expect, it } from 'vitest'
import {
  WORLD, WORLD_ID, blockIn, inBounds, voxelIndex,
} from '@/components/rafeyos/apps/minecraft/logic/terrain'
import { BLOCK } from '@/components/rafeyos/apps/minecraft/logic/blockTypes'
import { generateMainland } from '@/components/rafeyos/apps/minecraft/logic/mainland'

const island = generateMainland()

describe('the world', () => {
  it('is 512 blocks square and 96 tall, with the sea at 28; changing generation must bump WORLD_ID', () => {
    expect(WORLD).toEqual({ SIZE: 512, HEIGHT: 96, CHUNK: 16, WATER_LEVEL: 28 })
    expect(WORLD_ID).toBe('mainland-1')
  })

  it('comes out frozen, so whoever holds it copies the blocks before changing any', () => {
    expect(Object.isFrozen(island)).toBe(true)
  })
})

describe('the voxel grid', () => {
  it('maps each block to its own slot', () => {
    expect(voxelIndex(0, 0, 0)).toBe(0)
    expect(voxelIndex(1, 0, 0)).toBe(1)
    expect(voxelIndex(0, 0, 1)).toBe(WORLD.SIZE)
    expect(voxelIndex(0, 1, 0)).toBe(WORLD.SIZE * WORLD.SIZE)
    expect(voxelIndex(511, 95, 511)).toBe(WORLD.SIZE * WORLD.SIZE * WORLD.HEIGHT - 1)
  })

  it('reads air outside the world and stone beneath it', () => {
    const { blocks } = island

    expect(inBounds(-1, 5, 5)).toBe(false)
    expect(inBounds(5, WORLD.HEIGHT, 5)).toBe(false)
    expect(inBounds(511, 95, 511)).toBe(true)
    expect(blockIn(blocks, -1, 5, 5)).toBe(BLOCK.AIR)
    expect(blockIn(blocks, 5, -1, 5)).toBe(BLOCK.STONE)
  })
})
