import { describe, expect, it } from 'vitest'
import { BLOCK } from '@/components/rafeyos/apps/minecraft/logic/blockTypes'
import { createGround } from '@/components/rafeyos/apps/minecraft/logic/life/ground'
import { floorAt, worldOf } from '../minecraftTestWorld'

describe('the ground under a column', () => {
  it('is the top block of a flat floor', () => {
    expect(createGround(floorAt(10))(5, 5)).toEqual({ y: 10, block: BLOCK.STONE, wet: false, depth: 0 })
  })

  it('looks through a tree to the ground it stands on', () => {
    const world = floorAt(10, [[5, 11, 5, BLOCK.LOG], [5, 12, 5, BLOCK.LOG], [5, 13, 5, BLOCK.LEAVES]])

    expect(createGround(world)(5, 5).y).toBe(10)
  })

  it('counts the water standing on it', () => {
    const world = worldOf([[5, 11, 5, BLOCK.WATER], [5, 12, 5, BLOCK.WATER]], (x, y) => (y <= 10 ? BLOCK.SAND : BLOCK.AIR))

    expect(createGround(world)(5, 5)).toMatchObject({ y: 10, block: BLOCK.SAND, wet: true, depth: 2 })
  })

  it('climbs onto blocks built since the world was made, past the generated height', () => {
    const cells = [[5, 11, 5, BLOCK.PLANKS], [5, 12, 5, BLOCK.PLANKS]]
    const world = { ...floorAt(10, cells), heights: { length: 512 * 512, [5 * 512 + 5]: 10 } }

    expect(createGround(world)(5, 5)).toMatchObject({ y: 12, block: BLOCK.PLANKS })
  })

  it('keeps what it found until told the column changed', () => {
    const cells = new Map()
    const world = { get: (x, y, z) => cells.get(`${x},${y},${z}`) ?? (y <= 10 ? BLOCK.STONE : BLOCK.AIR) }
    const ground = createGround(world)
    expect(ground(5, 5).y).toBe(10)

    cells.set('5,11,5', BLOCK.BRICK)
    expect(ground(5, 5).y).toBe(10)
    ground.forget(5, 5)
    expect(ground(5, 5).y).toBe(11)
  })

  it('has none past the edge of the world', () => {
    const ground = createGround(floorAt(10))

    expect([ground(-1, 5), ground(5, 512)]).toEqual([null, null])
  })
})
