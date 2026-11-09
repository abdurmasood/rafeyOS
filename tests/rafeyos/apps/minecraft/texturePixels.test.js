import { describe, expect, it } from 'vitest'
import { ATLAS, flipRows, paintAtlas, tileOrigin, tilePixels } from '@/components/rafeyos/apps/minecraft/logic/texturePixels'
import { TILE } from '@/components/rafeyos/apps/minecraft/logic/blockTypes'

const pixelAt = (pixels, x, y) => [...pixels.subarray((y * ATLAS.SIZE + x) * 4, (y * ATLAS.SIZE + x) * 4 + 4)]
const isGreen = ([r, g, b]) => g > r && g > b
const isBrown = ([r, g, b]) => r > g && g > b

describe('the texture atlas', () => {
  it('is a 128 × 128 RGBA image with every tile fully opaque', () => {
    const pixels = paintAtlas()

    expect(pixels).toHaveLength(128 * 128 * 4)
    for (const tile of Object.values(TILE)) {
      const [ox, oy] = tileOrigin(tile)
      for (let y = 0; y < ATLAS.TILE; y++) {
        for (let x = 0; x < ATLAS.TILE; x++) expect(pixelAt(pixels, ox + x, oy + y)[3]).toBe(255)
      }
    }
  })

  it('paints the same pixels every time', () => {
    expect(paintAtlas()).toEqual(paintAtlas())
  })

  it('places tiles left to right, top to bottom in an 8 × 8 grid', () => {
    expect(tileOrigin(TILE.GRASS_TOP)).toEqual([0, 0])
    expect(tileOrigin(TILE.GRASS_SIDE)).toEqual([16, 0])
    expect(tileOrigin(TILE.LOG_SIDE)).toEqual([80, 0])
    expect(tileOrigin(TILE.WATER)).toEqual([48, 16])
  })

  it('paints exactly the pixels Rafey approved in the prototype', () => {
    let hash = 2166136261
    for (const byte of paintAtlas()) hash = Math.imul(hash ^ byte, 16777619) >>> 0

    expect(paintAtlas()).toHaveLength(65536)
    expect(hash).toBe(4139483967)
  })

  it('builds the marsh grass side from the grass side, keeping its dirt', () => {
    const pixels = paintAtlas()
    const [gx, gy] = tileOrigin(TILE.GRASS_SIDE)
    const [mx, my] = tileOrigin(TILE.MARSH_SIDE)
    let dirt = 0

    for (let y = 0; y < ATLAS.TILE; y++) {
      for (let x = 0; x < ATLAS.TILE; x++) {
        const grass = pixelAt(pixels, gx + x, gy + y)
        if (isGreen(grass)) continue
        dirt++
        expect(pixelAt(pixels, mx + x, my + y)).toEqual(grass)
      }
    }
    expect(dirt).toBeGreaterThan(100)
  })

  it('starts coal ore from stone, changing only a few pixels', () => {
    const pixels = paintAtlas()
    const [sx, sy] = tileOrigin(TILE.STONE)
    const [cx, cy] = tileOrigin(TILE.COAL_ORE)
    let same = 0

    for (let y = 0; y < ATLAS.TILE; y++) {
      for (let x = 0; x < ATLAS.TILE; x++) {
        if (pixelAt(pixels, sx + x, sy + y).join() === pixelAt(pixels, cx + x, cy + y).join()) same++
      }
    }
    expect(same).toBeGreaterThan(ATLAS.TILE * ATLAS.TILE * 0.6)
    expect(same).toBeLessThan(ATLAS.TILE * ATLAS.TILE)
  })

  it('gives grass sides a green top edge over dirt', () => {
    const pixels = paintAtlas()
    const [ox, oy] = tileOrigin(TILE.GRASS_SIDE)

    for (let x = 0; x < ATLAS.TILE; x++) {
      expect(isGreen(pixelAt(pixels, ox + x, oy))).toBe(true)
      expect(isBrown(pixelAt(pixels, ox + x, oy + ATLAS.TILE - 1))).toBe(true)
    }
  })

  it('flips the image upside down for upload, so the green edge stays on top on the GPU', () => {
    const pixels = paintAtlas()
    const flipped = flipRows(pixels, ATLAS.SIZE)

    expect(pixelAt(flipped, 20, ATLAS.SIZE - 1)).toEqual(pixelAt(pixels, 20, 0))
    expect(pixelAt(flipped, 20, 0)).toEqual(pixelAt(pixels, 20, ATLAS.SIZE - 1))
    expect(flipRows(flipped, ATLAS.SIZE)).toEqual(pixels)
  })

  it('cuts one tile out on its own, pixel for pixel, for a texture that repeats it', () => {
    const pixels = paintAtlas()
    const water = tilePixels(pixels, TILE.WATER)
    const [ox, oy] = tileOrigin(TILE.WATER)

    expect(water).toHaveLength(ATLAS.TILE * ATLAS.TILE * 4)
    for (let y = 0; y < ATLAS.TILE; y++) {
      for (let x = 0; x < ATLAS.TILE; x++) {
        expect([...water.subarray((y * ATLAS.TILE + x) * 4, (y * ATLAS.TILE + x) * 4 + 4)]).toEqual(pixelAt(pixels, ox + x, oy + y))
      }
    }
  })
})
