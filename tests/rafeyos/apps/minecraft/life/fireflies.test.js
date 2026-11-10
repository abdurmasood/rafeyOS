import { describe, expect, it } from 'vitest'
import { BLOCK } from '@/components/rafeyos/apps/minecraft/logic/blockTypes'
import { createGround } from '@/components/rafeyos/apps/minecraft/logic/life/ground'
import { FIREFLIES, createFireflies } from '@/components/rafeyos/apps/minecraft/logic/life/fireflies'
import { worldOf } from '../minecraftTestWorld'

const meadow = worldOf([], (x, y) => (y < 10 ? BLOCK.DIRT : y === 10 ? BLOCK.GRASS : BLOCK.AIR))
const seeded = () => {
  let n = 0
  return () => ((n = (n * 9301 + 49297) % 233280) / 233280)
}
const heights = (flies) => Array.from({ length: FIREFLIES.COUNT }, (_, i) => flies.points.geometry.attributes.position.array[i * 3 + 1])

describe('fireflies', () => {
  it('stay hidden by day', () => {
    const flies = createFireflies(createGround(meadow), { value: 0 }, seeded())

    flies.update({ x: 100, z: 100 }, 0, 1)

    expect(flies.points.visible).toBe(false)
  })

  it('come out at night, low over the grass', () => {
    const flies = createFireflies(createGround(meadow), { value: 3 }, seeded())

    flies.update({ x: 100, z: 100 }, 1, 1)

    expect(flies.points.visible).toBe(true)
    for (const y of heights(flies)) expect(y > 10 && y < 13.5).toBe(true)
  })

  it('find no home where there is no grass', () => {
    const stone = worldOf([], (x, y) => (y <= 10 ? BLOCK.STONE : BLOCK.AIR))
    const flies = createFireflies(createGround(stone), { value: 0 }, seeded())

    flies.update({ x: 100, z: 100 }, 1, 1)

    for (const y of heights(flies)) expect(y).toBe(-100)
  })
})
