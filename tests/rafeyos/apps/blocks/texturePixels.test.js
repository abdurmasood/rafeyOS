import { describe, expect, it } from 'vitest'
import { ATLAS, flipRows, paintAtlas, tileOrigin } from '@/components/rafeyos/apps/blocks/logic/texturePixels'
import { TILE } from '@/components/rafeyos/apps/blocks/logic/blockTypes'

const pixelAt = (pixels, x, y) => [...pixels.subarray((y * ATLAS.SIZE + x) * 4, (y * ATLAS.SIZE + x) * 4 + 4)]
const isGreen = ([r, g, b]) => g > r && g > b
const isBrown = ([r, g, b]) => r > g && g > b

describe('the texture atlas', () => {
  it('is a 64 × 64 RGBA image with every tile fully opaque', () => {
    const pixels = paintAtlas()

    expect(pixels).toHaveLength(64 * 64 * 4)
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

  it('places tiles left to right, top to bottom in a 4 × 4 grid', () => {
    expect(tileOrigin(TILE.GRASS_TOP)).toEqual([0, 0])
    expect(tileOrigin(TILE.GRASS_SIDE)).toEqual([16, 0])
    expect(tileOrigin(TILE.LOG_SIDE)).toEqual([16, 16])
    expect(tileOrigin(TILE.WATER)).toEqual([48, 32])
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
})
