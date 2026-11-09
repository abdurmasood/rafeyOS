import { describe, expect, it } from 'vitest'
import { chunksTouching, createWorld } from '@/components/rafeyos/apps/minecraft/logic/world'
import { voxelIndex } from '@/components/rafeyos/apps/minecraft/logic/terrain'
import { BLOCK } from '@/components/rafeyos/apps/minecraft/logic/blockTypes'
import { generateMainland } from '@/components/rafeyos/apps/minecraft/logic/mainland'

const island = generateMainland()
// A spot high in the sky, always air: the world is only 96 tall and nothing grows near that
const SKY = [10, 60, 10]
const skyIndex = voxelIndex(...SKY)

describe('the changeable world', () => {
  it('starts as the island', () => {
    const world = createWorld(island)
    const { x, y, z } = island.spawn

    expect(world.get(Math.floor(x), y - 1, Math.floor(z))).toBe(BLOCK.SAND)
    expect(world.get(...SKY)).toBe(BLOCK.AIR)
    expect(world.spawn).toBe(island.spawn)
  })

  it('reports each change as a save entry', () => {
    const world = createWorld(island)

    expect(world.set(...SKY, BLOCK.BRICK)).toEqual([skyIndex, BLOCK.BRICK])
    expect(world.get(...SKY)).toBe(BLOCK.BRICK)
  })

  it('reports null once a block matches the island again, so the save can drop it', () => {
    const world = createWorld(island)
    world.set(...SKY, BLOCK.BRICK)

    expect(world.set(...SKY, BLOCK.AIR)).toEqual([skyIndex, null])
  })

  it('reports nothing when nothing changes or the spot is off the island', () => {
    const world = createWorld(island)

    expect(world.set(...SKY, BLOCK.AIR)).toBeNull()
    expect(world.set(-1, 20, 5, BLOCK.BRICK)).toBeNull()
  })

  it('never changes the shared island', () => {
    createWorld(island).set(...SKY, BLOCK.BRICK)

    expect(island.blocks[skyIndex]).toBe(BLOCK.AIR)
  })

  it('applies saved edits, skipping any that do not fit', () => {
    const world = createWorld(island, [[skyIndex, BLOCK.PLANKS], [-4, BLOCK.BRICK], [1.5, BLOCK.BRICK], [skyIndex + 1, 99], [10 ** 9, BLOCK.BRICK]])

    expect(world.get(...SKY)).toBe(BLOCK.PLANKS)
    expect(world.get(SKY[0] + 1, SKY[1], SKY[2])).toBe(BLOCK.AIR)
  })
})

describe('chunks touching a block', () => {
  const sorted = (pairs) => [...pairs].sort(([ax, az], [bx, bz]) => ax - bx || az - bz)

  it('is just its own chunk away from any border', () => {
    expect(chunksTouching(8, 8)).toEqual([[0, 0]])
  })

  it('includes the neighbours across a chunk border', () => {
    expect(sorted(chunksTouching(15, 5))).toEqual([[0, 0], [1, 0]])
    expect(sorted(chunksTouching(16, 16))).toEqual([[0, 0], [0, 1], [1, 0], [1, 1]])
  })

  it('stays on the island at its edges', () => {
    expect(chunksTouching(0, 0)).toEqual([[0, 0]])
    expect(chunksTouching(511, 511)).toEqual([[31, 31]])
  })
})
