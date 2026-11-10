import { describe, expect, it } from 'vitest'
import { BLOCK } from '@/components/rafeyos/apps/minecraft/logic/blockTypes'
import { blastBlocks } from '@/components/rafeyos/apps/minecraft/logic/life/creepers'
import { worldOf } from '../minecraftTestWorld'

describe('blastBlocks', () => {
  it('includes solid blocks whose centres lie inside the radius', () => {
    const world = worldOf([], (x, y) => (y <= 30 ? BLOCK.STONE : BLOCK.AIR))
    const hit = blastBlocks({ x: 100.5, y: 31, z: 100.5 }, 1.5, world.get)

    expect(hit).toEqual(expect.arrayContaining([{ x: 100, y: 30, z: 100 }]))
    // Air above the floor is skipped; a block well outside the sphere is left alone
    expect(hit.find((b) => b.x === 100 && b.y === 31 && b.z === 100)).toBeUndefined()
    expect(hit.find((b) => b.x === 110 && b.z === 110)).toBeUndefined()
  })

  it('skips water and air', () => {
    const world = worldOf([
      [50, 10, 50, BLOCK.WATER],
      [51, 10, 50, BLOCK.STONE],
    ])
    const hit = blastBlocks({ x: 50.5, y: 10.5, z: 50.5 }, 2, world.get)

    expect(hit.find((b) => b.x === 50 && b.y === 10 && b.z === 50)).toBeUndefined()
    expect(hit).toEqual(expect.arrayContaining([{ x: 51, y: 10, z: 50 }]))
  })

  it('never yields y below 0 or out-of-world cells', () => {
    const world = worldOf([], () => BLOCK.STONE)
    const hit = blastBlocks({ x: 0.5, y: 0.5, z: 0.5 }, 3, world.get)

    expect(hit.every((b) => b.y >= 0 && b.x >= 0 && b.z >= 0)).toBe(true)
  })
})
