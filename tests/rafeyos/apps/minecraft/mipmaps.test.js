import { describe, expect, it } from 'vitest'
import { mipChain } from '@/components/rafeyos/apps/minecraft/logic/mipmaps'
import { ATLAS } from '@/components/rafeyos/apps/minecraft/logic/texturePixels'

/** A distinct opaque colour for each tile index. */
const tileColour = (tile) => [tile * 4, 255 - tile * 3, (tile * 37) % 256, 255]

/** An atlas where every tile is one solid colour, so any blend across tiles shows up as a colour no tile has. */
const solidTileAtlas = () => {
  const pixels = new Uint8Array(ATLAS.SIZE * ATLAS.SIZE * 4)
  for (let y = 0; y < ATLAS.SIZE; y++) {
    for (let x = 0; x < ATLAS.SIZE; x++) {
      const tile = Math.floor(y / ATLAS.TILE) * ATLAS.COLS + Math.floor(x / ATLAS.TILE)
      pixels.set(tileColour(tile), (y * ATLAS.SIZE + x) * 4)
    }
  }
  return pixels
}

const pixelOf = ({ data, width }, x, y) => [...data.subarray((y * width + x) * 4, (y * width + x) * 4 + 4)]

describe('the mip chain', () => {
  it('halves the atlas down to one pixel per tile: 128, 64, 32, 16, 8', () => {
    const levels = mipChain(solidTileAtlas(), ATLAS.SIZE, ATLAS.COLS)

    expect(levels.map(({ width, height }) => [width, height])).toEqual([[128, 128], [64, 64], [32, 32], [16, 16], [8, 8]])
    levels.forEach(({ data, width }) => expect(data).toHaveLength(width * width * 4))
  })

  it('keeps the base level as given, without copying it', () => {
    const atlas = solidTileAtlas()

    expect(mipChain(atlas, ATLAS.SIZE, ATLAS.COLS)[0].data).toBe(atlas)
  })

  it("never lets a tile's colour cross into its neighbour at any level", () => {
    const levels = mipChain(solidTileAtlas(), ATLAS.SIZE, ATLAS.COLS)

    levels.forEach((level) => {
      const tileSize = level.width / ATLAS.COLS
      for (let y = 0; y < level.width; y++) {
        for (let x = 0; x < level.width; x++) {
          const tile = Math.floor(y / tileSize) * ATLAS.COLS + Math.floor(x / tileSize)
          expect(pixelOf(level, x, y)).toEqual(tileColour(tile))
        }
      }
    })
  })

  it('leaves each tile as exactly its own colour at the 8 px level', () => {
    const smallest = mipChain(solidTileAtlas(), ATLAS.SIZE, ATLAS.COLS).at(-1)

    for (let tile = 0; tile < ATLAS.COLS * ATLAS.COLS; tile++) {
      expect(pixelOf(smallest, tile % ATLAS.COLS, Math.floor(tile / ATLAS.COLS))).toEqual(tileColour(tile))
    }
  })

  it('averages each 2 × 2 block, rounding to the nearest value', () => {
    const square = Uint8Array.from([
      0, 10, 100, 255, 1, 20, 101, 255,
      2, 30, 102, 255, 2, 40, 103, 255,
    ])
    const [, single] = mipChain(square, 2, 1)

    expect([...single.data]).toEqual([1, 25, 102, 255])
  })

  it('goes all the way to one pixel when asked, as the water tile does', () => {
    const tile = new Uint8Array(16 * 16 * 4).fill(200)

    expect(mipChain(tile, 16, 1).map(({ width }) => width)).toEqual([16, 8, 4, 2, 1])
  })

  it('rejects a smallest level it could never reach', () => {
    const tile = new Uint8Array(16 * 16 * 4)

    expect(() => mipChain(tile, 16, 0)).toThrow(RangeError)
    expect(() => mipChain(tile, 16, 32)).toThrow(RangeError)
  })
})
