import { describe, expect, it } from 'vitest'
import { FACES, WATER_SURFACE, cornerOcclusion, meshChunk } from '@/components/rafeyos/apps/blocks/logic/mesher'
import { BLOCK } from '@/components/rafeyos/apps/blocks/logic/blockTypes'
import { worldOf } from './blocksTestWorld'

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
