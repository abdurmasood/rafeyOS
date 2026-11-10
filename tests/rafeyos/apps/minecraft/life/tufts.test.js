import { describe, expect, it } from 'vitest'
import { BLOCK } from '@/components/rafeyos/apps/minecraft/logic/blockTypes'
import { createGround } from '@/components/rafeyos/apps/minecraft/logic/life/ground'
import { TUFTS, createTufts, tuftFor } from '@/components/rafeyos/apps/minecraft/logic/life/tufts'
import { SPRITE_COUNT, SPRITE_SIZE, TUFT, paintTuftSprites } from '@/components/rafeyos/apps/minecraft/logic/life/tuftSprites'
import { floorAt, worldOf } from '../minecraftTestWorld'

const uniforms = { time: { value: 0 }, wind: { value: 1 } }
const field = (block) => worldOf([], (x, y) => (y < 10 ? BLOCK.DIRT : y === 10 ? block : BLOCK.AIR))
const placed = (tufts) => tufts.meshes.reduce((sum, mesh) => sum + mesh.count, 0)
const columns = (from, to) => Array.from({ length: to - from }, (_, i) => from + i)

describe('which tuft grows where', () => {
  const kinds = (block) => new Set(columns(0, 60).flatMap((x) => columns(0, 60).map((z) => tuftFor(block, x, z))))

  it('grows grass, tall grass and four flowers on grass, and leaves most of it bare', () => {
    expect(kinds(BLOCK.GRASS)).toEqual(new Set([-1, TUFT.GRASS, TUFT.TALL, TUFT.RED, TUFT.YELLOW, TUFT.BLUE, TUFT.WHITE]))
  })

  it('grows reeds in the marsh, dry shrubs on dry grass and sand, and nothing on snow or stone', () => {
    expect(kinds(BLOCK.MARSH_GRASS)).toEqual(new Set([-1, TUFT.REED, TUFT.GRASS]))
    expect(kinds(BLOCK.DRY_GRASS)).toEqual(new Set([-1, TUFT.DRY]))
    expect(kinds(BLOCK.SAND)).toEqual(new Set([-1, TUFT.DRY]))
    expect(kinds(BLOCK.SNOW)).toEqual(new Set([-1]))
    expect(kinds(BLOCK.STONE)).toEqual(new Set([-1]))
  })

  it('always grows the same tuft on the same column', () => {
    expect(tuftFor(BLOCK.GRASS, 123, 45)).toBe(tuftFor(BLOCK.GRASS, 123, 45))
  })
})

describe('the tufts around the player', () => {
  it('cover about a third of a grass field within reach, and none of stone', () => {
    const grass = createTufts(createGround(field(BLOCK.GRASS)), field(BLOCK.GRASS), uniforms)
    const stone = createTufts(createGround(floorAt(10)), floorAt(10), uniforms)

    grass.update({ x: 100, z: 100 })
    stone.update({ x: 100, z: 100 })

    const reach = Math.PI * TUFTS.RADIUS ** 2
    expect(placed(grass) / reach).toBeGreaterThan(0.25)
    expect(placed(grass) / reach).toBeLessThan(0.42)
    expect(placed(stone)).toBe(0)
  })

  it('stay put while the player wanders a few blocks, then follow', () => {
    const world = field(BLOCK.GRASS)
    const tufts = createTufts(createGround(world), world, uniforms)
    tufts.update({ x: 100, z: 100 })
    const first = tufts.meshes[TUFT.GRASS].instanceMatrix.array.slice()

    tufts.update({ x: 103, z: 100 })
    expect(tufts.meshes[TUFT.GRASS].instanceMatrix.array).toEqual(first)
    tufts.update({ x: 100 + TUFTS.RELAYOUT_AFTER + 1, z: 100 })
    expect(tufts.meshes[TUFT.GRASS].instanceMatrix.array).not.toEqual(first)
  })

  it('grow nowhere a block stands on the ground, and grow back once it is broken', () => {
    const cells = new Map()
    const world = { get: (x, y, z) => cells.get(`${x},${y},${z}`) ?? field(BLOCK.GRASS).get(x, y, z) }
    const ground = createGround(world)
    const tufts = createTufts(ground, world, uniforms)
    tufts.update({ x: 100, z: 100 })
    const before = placed(tufts)

    for (const x of columns(90, 111)) for (const z of columns(90, 111)) cells.set(`${x},11,${z}`, BLOCK.PLANKS)
    for (const x of columns(90, 111)) for (const z of columns(90, 111)) ground.forget(x, z)
    tufts.blockChanged(100, 100)
    tufts.update({ x: 100, z: 100 })

    expect(placed(tufts)).toBeLessThan(before)
  })
})

describe('the sprite sheet', () => {
  it('is eight opaque cut-outs on a clear ground', () => {
    const pixels = paintTuftSprites()
    const alphas = new Set(Array.from({ length: pixels.length / 4 }, (_, i) => pixels[i * 4 + 3]))

    expect(pixels.length).toBe(SPRITE_COUNT * SPRITE_SIZE * SPRITE_SIZE * 4)
    expect(alphas).toEqual(new Set([0, 255]))
  })

  it('draws something in every sprite', () => {
    const pixels = paintTuftSprites()
    const width = SPRITE_COUNT * SPRITE_SIZE
    for (let s = 0; s < SPRITE_COUNT; s++) {
      let opaque = 0
      for (let y = 0; y < SPRITE_SIZE; y++) for (let x = 0; x < SPRITE_SIZE; x++) opaque += pixels[((y * width) + s * SPRITE_SIZE + x) * 4 + 3] ? 1 : 0
      expect(opaque).toBeGreaterThan(8)
    }
  })
})
