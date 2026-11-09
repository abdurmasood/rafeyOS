import { describe, expect, it } from 'vitest'
import { FACES, WATER_SURFACE, cornerOcclusion, meshChunk } from '@/components/rafeyos/apps/minecraft/logic/mesher'
import { BLOCK } from '@/components/rafeyos/apps/minecraft/logic/blockTypes'
import { worldOf } from './minecraftTestWorld'

const TOP = FACES[3]
const quads = (arrays) => arrays.indices.length / 6

describe('chunk meshing', () => {
  it('draws all six faces of a lone block: 24 corners, 12 triangles', () => {
    const { solid, water } = meshChunk(worldOf([[1, 1, 1, BLOCK.STONE]]), 0, 0)

    expect(solid.positions).toHaveLength(24 * 3)
    expect(solid.uvs).toHaveLength(24 * 2)
    expect(solid.colors).toHaveLength(24 * 3)
    expect(solid.indices).toHaveLength(36)
    expect(quads(water)).toBe(0)
  })

  it('hides the faces two blocks share', () => {
    const { solid } = meshChunk(worldOf([[1, 1, 1, BLOCK.STONE], [2, 1, 1, BLOCK.DIRT]]), 0, 0)

    expect(quads(solid)).toBe(10)
  })

  it('only meshes blocks inside the chunk it was asked for', () => {
    const world = worldOf([[1, 1, 1, BLOCK.STONE], [20, 1, 1, BLOCK.STONE]])

    expect(quads(meshChunk(world, 0, 0).solid)).toBe(6)
    expect(quads(meshChunk(world, 1, 0).solid)).toBe(6)
    expect(quads(meshChunk(world, 2, 0).solid)).toBe(0)
  })

  it('draws water as a sunken surface, and only where air is above it', () => {
    const open = meshChunk(worldOf([[1, 1, 1, BLOCK.WATER]]), 0, 0).water
    const covered = meshChunk(worldOf([[1, 1, 1, BLOCK.WATER], [1, 2, 1, BLOCK.WATER]]), 0, 0).water

    expect(quads(open)).toBe(1)
    open.positions.filter((_, i) => i % 3 === 1).forEach((y) => expect(y).toBeCloseTo(1 + WATER_SURFACE, 5))
    expect(quads(covered)).toBe(1)
  })

  it('lets water show the faces of blocks beneath it', () => {
    const { solid } = meshChunk(worldOf([[1, 1, 1, BLOCK.SAND], [1, 2, 1, BLOCK.WATER]]), 0, 0)

    expect(quads(solid)).toBe(6)
  })

  it('splits a face along its brighter diagonal when one corner is shaded', () => {
    // Two blocks over the top face's second corner box it in; the block itself is meshed first (lowest y)
    const world = worldOf([[1, 1, 1, BLOCK.STONE], [2, 2, 1, BLOCK.STONE], [1, 2, 2, BLOCK.STONE]])
    const { solid } = meshChunk(world, 0, 0)
    const top = [...solid.indices.slice(3 * 6, 4 * 6)]

    expect(top).toEqual([12, 13, 15, 12, 15, 14])
  })
})

describe('water surfaces', () => {
  /** Water blocks at height `y` over each [x, z] cell. */
  const waterAt = (y, cells) => cells.map(([x, z]) => [x, y, z, BLOCK.WATER])
  /** Every [x, z] cell of a width × depth rectangle from (x0, z0). */
  const rectangle = (x0, z0, width, depth) => Array.from({ length: width * depth }, (_, i) => [x0 + (i % width), z0 + Math.floor(i / width)])
  const component = (arrays, axis, size) => [...arrays.filter((_, i) => i % size === axis)]

  it('merges a 3 × 3 pool into one quad', () => {
    expect(quads(meshChunk(worldOf(waterAt(1, rectangle(1, 1, 3, 3))), 0, 0).water)).toBe(1)
  })

  it('covers an L-shaped pool with two quads', () => {
    const pool = [...rectangle(0, 0, 3, 1), ...rectangle(0, 1, 1, 2)]

    expect(quads(meshChunk(worldOf(waterAt(1, pool)), 0, 0).water)).toBe(2)
  })

  it('keeps pools at two heights in one chunk apart, the lower one first', () => {
    const world = worldOf([...waterAt(3, rectangle(8, 8, 2, 2)), ...waterAt(1, rectangle(1, 1, 2, 2))])
    const { water } = meshChunk(world, 0, 0)

    expect(quads(water)).toBe(2)
    expect(component(water.positions, 1, 3)).toEqual([...Array(4).fill(1 + WATER_SURFACE), ...Array(4).fill(3 + WATER_SURFACE)].map(Math.fround))
  })

  it('shows no surface where a solid block such as ice sits on the water', () => {
    expect(quads(meshChunk(worldOf([[1, 1, 1, BLOCK.WATER], [1, 2, 1, BLOCK.ICE]]), 0, 0).water)).toBe(0)
  })

  it('covers a fully flooded layer with exactly one quad', () => {
    const flooded = worldOf([], (x, y) => (y === 1 ? BLOCK.WATER : BLOCK.AIR))

    expect(quads(meshChunk(flooded, 0, 0).water)).toBe(1)
  })

  it('lays the merged quad out like a top face, sunken WATER_SURFACE into its block and unshaded', () => {
    // A pool on a floor at y = 0, so the water fills y = 1 and its surface sits at 0 + 1 + WATER_SURFACE
    const floor = 0
    const { water } = meshChunk(worldOf(waterAt(floor + 1, rectangle(1, 1, 3, 3))), 0, 0)
    const top = Math.fround(floor + 1 + WATER_SURFACE)

    expect([...water.positions]).toEqual([1, top, 4, 4, top, 4, 1, top, 1, 4, top, 1])
    expect([...water.indices]).toEqual([0, 1, 2, 2, 1, 3])
    expect([...water.colors]).toEqual(Array(12).fill(1))
  })

  it('gives UVs in blocks from the chunk corner, so the water texture repeats once per block', () => {
    // Chunk (1, 0) starts at x = 16; the pool fills its first 3 × 2 blocks
    const { water } = meshChunk(worldOf(waterAt(1, rectangle(16, 0, 3, 2))), 1, 0)

    expect([...water.uvs]).toEqual([0, 2, 3, 2, 0, 0, 3, 0])
    // Positions are in world blocks, so the chunk's x0 offset shows here (the UVs above are chunk-relative)
    expect(Math.min(...component(water.positions, 0, 3))).toBe(16)
    expect(Math.min(...component(water.uvs, 0, 2))).toBe(0)
    expect(Math.max(...component(water.uvs, 0, 2))).toBe(3)
    expect(Math.max(...component(water.uvs, 1, 2))).toBe(2)
  })
})

describe('chunk bounds', () => {
  /** @param {{ positions: Float32Array, bounds: { center: number[], radius: number } }} arrays */
  const everyCornerInside = ({ positions, bounds: { center, radius } }) => {
    for (let i = 0; i < positions.length; i += 3) {
      const distance = Math.hypot(positions[i] - center[0], positions[i + 1] - center[1], positions[i + 2] - center[2])
      expect(distance).toBeLessThanOrEqual(radius + 1e-9)
    }
  }

  it('puts a sphere around every corner of the solid and water meshes', () => {
    const world = worldOf([[1, 1, 1, BLOCK.STONE], [9, 5, 12, BLOCK.LOG], [3, 2, 7, BLOCK.WATER], [4, 2, 7, BLOCK.WATER]])
    const { solid, water } = meshChunk(world, 0, 0)

    everyCornerInside(solid)
    everyCornerInside(water)
    // Corners run from (1, 1, 1) to (10, 6, 13)
    expect(solid.bounds.center).toEqual([5.5, 3.5, 7])
    expect(solid.bounds.radius).toBeCloseTo(Math.hypot(9, 5, 12) / 2, 9)
  })

  it('is an empty sphere for a mesh with nothing in it', () => {
    expect(meshChunk(worldOf(), 0, 0).water.bounds).toEqual({ center: [0, 0, 0], radius: 0 })
  })

  it('is a plain array and number, so it can be posted between threads as is', () => {
    const { bounds } = meshChunk(worldOf([[1, 1, 1, BLOCK.STONE]]), 0, 0).solid

    expect(Object.keys(bounds)).toEqual(['center', 'radius'])
    expect(Array.isArray(bounds.center)).toBe(true)
    expect(bounds.center).toEqual([1.5, 1.5, 1.5])
    expect(bounds.radius).toBeCloseTo(Math.sqrt(3) / 2, 12)
  })
})

describe('corner occlusion', () => {
  const at = [1, 1, 1]

  it('is fully open with nothing around', () => {
    expect(cornerOcclusion(worldOf(), at, TOP, [0, 1, 0])).toBe(3)
  })

  it('darkens a corner by each block touching it, and boxes it in when both sides are solid', () => {
    const across = worldOf([[0, 2, 0, BLOCK.STONE]])
    const oneSide = worldOf([[0, 2, 1, BLOCK.STONE]])
    const bothSides = worldOf([[0, 2, 1, BLOCK.STONE], [1, 2, 0, BLOCK.STONE]])

    expect(cornerOcclusion(across, at, TOP, [0, 1, 0])).toBe(2)
    expect(cornerOcclusion(oneSide, at, TOP, [0, 1, 0])).toBe(2)
    expect(cornerOcclusion(bothSides, at, TOP, [0, 1, 0])).toBe(0)
  })

  it('ignores water, which lets light through', () => {
    expect(cornerOcclusion(worldOf([[0, 2, 1, BLOCK.WATER]]), at, TOP, [0, 1, 0])).toBe(3)
  })
})
