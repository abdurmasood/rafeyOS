import { describe, expect, it } from 'vitest'
import { CREEPER_UV, SKIN, paintCreeperSkin } from '@/components/rafeyos/apps/minecraft/logic/life/creeperSkin'

/** Read RGBA at skin (x,y) from top-left (same coords paint uses). */
const at = (pixels, x, y) => {
  const offset = ((SKIN.H - 1 - y) * SKIN.W + x) * 4
  return [pixels[offset], pixels[offset + 1], pixels[offset + 2], pixels[offset + 3]]
}

describe('creeper skin', () => {
  it('paints a full opaque 64×32 RGBA buffer', () => {
    const pixels = paintCreeperSkin()

    expect(pixels).toHaveLength(SKIN.W * SKIN.H * 4)
    expect(pixels.every((_, i) => i % 4 !== 3 || pixels[i] === 255 || pixels[i] === 0)).toBe(true)
    // Head top region is painted green (opaque)
    const [r, g, b, a] = at(pixels, 10, 2)
    expect(a).toBe(255)
    expect(g).toBeGreaterThan(r)
    expect(g).toBeGreaterThan(b)
  })

  it('puts a dark face on the head front UV square', () => {
    const pixels = paintCreeperSkin()
    const front = []
    for (let y = 8; y < 16; y++) {
      for (let x = 8; x < 16; x++) front.push(at(pixels, x, y))
    }
    const dark = front.filter(([r, g, b]) => r < 40 && g < 40 && b < 40)
    const green = front.filter(([r, g, b]) => g > r && g > b && g > 40)

    expect(dark.length).toBeGreaterThan(8)
    expect(green.length).toBeGreaterThan(8)
  })

  it('exports classic UV origins', () => {
    expect(CREEPER_UV.HEAD).toEqual({ u: 0, v: 0, w: 8, h: 8, d: 8 })
    expect(CREEPER_UV.BODY).toEqual({ u: 16, v: 16, w: 8, h: 12, d: 4 })
    expect(CREEPER_UV.LEG).toEqual({ u: 0, v: 16, w: 4, h: 6, d: 4 })
  })
})
