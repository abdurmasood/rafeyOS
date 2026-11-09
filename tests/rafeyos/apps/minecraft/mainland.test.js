import { describe, expect, it } from 'vitest'
import { BLOCK } from '@/components/rafeyos/apps/minecraft/logic/blockTypes'
import { generateMainland } from '@/components/rafeyos/apps/minecraft/logic/mainland'
import { createGrid } from '@/components/rafeyos/apps/minecraft/logic/voxelGrid'
import { viewIsOpen } from '@/components/rafeyos/apps/minecraft/logic/spawn'
import { WORLD, voxelIndex } from '@/components/rafeyos/apps/minecraft/logic/terrain'

// FNV-1a over raw bytes, so any change to generation shows up here
const fnv1a = (bytes) => {
  let hash = 2166136261
  for (let i = 0; i < bytes.length; i++) hash = Math.imul(hash ^ bytes[i], 16777619) >>> 0
  return hash
}

// Computed from the approved prototype; never edit these to make a port pass
const BLOCKS_CHECKSUM = 2822320334
const HEIGHTS_CHECKSUM = 181558537
const SPAWN = { x: 254.5, y: 33, z: 352.5, yaw: -Math.PI, pitch: -0.2 }

const world = generateMainland()
const { blocks, heights, spawn } = world

describe('the Mainland & Isles world', () => {
  it('is the approved world, bit for bit', () => {
    expect(WORLD).toEqual({ SIZE: 512, HEIGHT: 96, CHUNK: 16, WATER_LEVEL: 28 })
    expect(blocks).toHaveLength(512 * 512 * 96)
    expect(fnv1a(blocks)).toBe(BLOCKS_CHECKSUM)
    expect(fnv1a(new Uint8Array(heights.buffer, heights.byteOffset, heights.byteLength))).toBe(HEIGHTS_CHECKSUM)
    expect(spawn).toEqual(SPAWN)
    expect(Object.is(spawn.yaw, -Math.PI)).toBe(true)
  })

  it('uses every block except the two only the player places', () => {
    const counts = new Array(256).fill(0)
    for (let i = 0; i < blocks.length; i++) counts[blocks[i]]++

    const missing = Object.entries(BLOCK)
      .filter(([name, id]) => name !== 'PLANKS' && name !== 'BRICK' && counts[id] === 0)
      .map(([name]) => name)
    expect(missing).toEqual([])
    expect(counts[BLOCK.PLANKS] + counts[BLOCK.BRICK]).toBe(0)
  })

  it('sinks into the sea at all four corners', () => {
    const last = WORLD.SIZE - 1
    for (const [x, z] of [[0, 0], [last, 0], [0, last], [last, last]]) {
      expect(heights[z * WORLD.SIZE + x]).toBeLessThan(WORLD.WATER_LEVEL)
    }
  })

  it('starts the player on open sand with a clear view', () => {
    const [bx, bz] = [Math.floor(spawn.x), Math.floor(spawn.z)]
    const at = (dy) => blocks[voxelIndex(bx, spawn.y + dy, bz)]
    const grid = createGrid(WORLD.SIZE, WORLD.HEIGHT)
    grid.blocks.set(blocks)
    grid.heights.set(heights)

    expect(at(-1)).toBe(BLOCK.SAND)
    expect(at(0)).toBe(BLOCK.AIR)
    expect(at(1)).toBe(BLOCK.AIR)
    expect(viewIsOpen(grid, [bx, spawn.y - 1, bz], spawn.yaw)).toBe(true)
  })
})
