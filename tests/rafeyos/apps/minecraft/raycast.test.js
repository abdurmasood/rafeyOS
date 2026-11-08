import { describe, expect, it } from 'vitest'
import { castRay } from '@/components/rafeyos/apps/minecraft/logic/raycast'
import { BLOCK } from '@/components/rafeyos/apps/minecraft/logic/blockTypes'
import { worldOf } from './minecraftTestWorld'

describe('aiming', () => {
  it('finds the first solid block ahead and the face the ray entered', () => {
    const world = worldOf([[5, 5, 2, BLOCK.STONE], [5, 5, 1, BLOCK.DIRT]])

    expect(castRay(world, { x: 5.5, y: 5.5, z: 5.5 }, { x: 0, y: 0, z: -1 })).toEqual({ x: 5, y: 5, z: 2, normal: [0, 0, 1] })
  })

  it('reports the top face when looking straight down', () => {
    const world = worldOf([[5, 5, 5, BLOCK.GRASS]])

    expect(castRay(world, { x: 5.5, y: 9.5, z: 5.5 }, { x: 0, y: -1, z: 0 })).toEqual({ x: 5, y: 5, z: 5, normal: [0, 1, 0] })
  })

  it('reports a side face along x', () => {
    const world = worldOf([[8, 5, 5, BLOCK.LOG]])

    expect(castRay(world, { x: 5.5, y: 5.5, z: 5.5 }, { x: 1, y: 0, z: 0 })).toEqual({ x: 8, y: 5, z: 5, normal: [-1, 0, 0] })
  })

  it('looks through air and water', () => {
    const world = worldOf([[5, 5, 4, BLOCK.WATER], [5, 5, 3, BLOCK.SAND]])

    expect(castRay(world, { x: 5.5, y: 5.5, z: 5.5 }, { x: 0, y: 0, z: -1 })).toMatchObject({ z: 3 })
  })

  it('stops at its reach', () => {
    const world = worldOf([[5, 5, 0, BLOCK.STONE]])

    expect(castRay(world, { x: 5.5, y: 5.5, z: 5.5 }, { x: 0, y: 0, z: -1 })).toMatchObject({ z: 0 })
    expect(castRay(world, { x: 5.5, y: 5.5, z: 7.5 }, { x: 0, y: 0, z: -1 })).toBeNull()
    expect(castRay(world, { x: 5.5, y: 5.5, z: 7.5 }, { x: 0, y: 0, z: -1 }, 8)).toMatchObject({ z: 0 })
  })

  it("can't target the bedrock below the island", () => {
    expect(castRay(worldOf(), { x: 5.5, y: 1.5, z: 5.5 }, { x: 0, y: -1, z: 0 })).toBeNull()
  })

  it('finds nothing without a direction', () => {
    expect(castRay(worldOf([[5, 5, 5, BLOCK.STONE]]), { x: 5.5, y: 6.5, z: 5.5 }, { x: 0, y: 0, z: 0 })).toBeNull()
  })
})
