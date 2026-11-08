import { describe, expect, it, vi } from 'vitest'
import { atlasCanvas, drawBlockIcon } from '@/components/rafeyos/apps/blocks/logic/blockIcons'
import { ATLAS, paintAtlas, tileOrigin } from '@/components/rafeyos/apps/blocks/logic/texturePixels'
import { BLOCK, TILE } from '@/components/rafeyos/apps/blocks/logic/blockTypes'

const fakeDoc = (ctx) => ({ createElement: () => ({ getContext: () => ctx }) })
const fakeContext = () => ({
  createImageData: vi.fn((width, height) => ({ data: new Uint8ClampedArray(width * height * 4) })),
  putImageData: vi.fn(),
  setTransform: vi.fn(),
  clearRect: vi.fn(),
  drawImage: vi.fn(),
  fillRect: vi.fn(),
})

describe('hotbar icons', () => {
  it('puts the atlas pixels on a canvas to cut icons from', () => {
    const ctx = fakeContext()
    const pixels = paintAtlas()
    const canvas = atlasCanvas(fakeDoc(ctx), pixels)

    expect(canvas).toMatchObject({ width: ATLAS.SIZE, height: ATLAS.SIZE })
    const [image, x, y] = ctx.putImageData.mock.calls[0]
    expect(image.data).toEqual(pixels)
    expect([x, y]).toEqual([0, 0])
  })

  it('gives up without a 2D context', () => {
    expect(atlasCanvas(fakeDoc(null), paintAtlas())).toBeNull()
  })

  it('draws a cube from the top tile and two shaded sides', () => {
    const ctx = fakeContext()
    const atlas = {}
    drawBlockIcon(ctx, atlas, BLOCK.GRASS)

    const sources = ctx.drawImage.mock.calls.map(([source, sx, sy]) => [source, sx, sy])
    expect(sources).toEqual([
      [atlas, ...tileOrigin(TILE.GRASS_TOP)],
      [atlas, ...tileOrigin(TILE.GRASS_SIDE)],
      [atlas, ...tileOrigin(TILE.GRASS_SIDE)],
    ])
    expect(ctx.fillRect).toHaveBeenCalledTimes(2)
    expect(ctx.imageSmoothingEnabled).toBe(false)
  })
})
