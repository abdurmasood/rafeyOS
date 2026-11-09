import { describe, expect, it } from 'vitest'
import { clamp, fbm2, lerp, perlin2, ridged2, smoothstep } from '@/components/rafeyos/apps/minecraft/logic/noise'

const samples = []
for (let z = -20; z < 20; z += 1.7) for (let x = -20; x < 20; x += 1.3) samples.push([x, z])

describe('terrain noise', () => {
  it('gives the same value for the same seed and place', () => {
    expect(perlin2(5, 3.3, 4.4)).toBe(perlin2(5, 3.3, 4.4))
    expect(fbm2(5, 3.3, 4.4)).toBe(fbm2(5, 3.3, 4.4))
    expect(perlin2(5, 3.3, 4.4)).not.toBe(perlin2(6, 3.3, 4.4))
  })

  it('keeps gradient noise within [-1, 1]', () => {
    for (const [x, z] of samples) {
      expect(Math.abs(perlin2(9, x, z))).toBeLessThanOrEqual(1)
      expect(Math.abs(fbm2(9, x, z))).toBeLessThanOrEqual(1)
    }
  })

  it('keeps ridged noise within [0, 1]', () => {
    for (const [x, z] of samples) {
      const v = ridged2(9, x, z)
      expect(v).toBeGreaterThanOrEqual(0)
      expect(v).toBeLessThanOrEqual(1)
    }
  })

  it('has the small helpers behave', () => {
    expect(clamp(5, 0, 3)).toBe(3)
    expect(clamp(-1, 0, 3)).toBe(0)
    expect(clamp(2, 0, 3)).toBe(2)
    expect(lerp(0, 10, 0.25)).toBe(2.5)
    expect(smoothstep(0, 1, -1)).toBe(0)
    expect(smoothstep(0, 1, 2)).toBe(1)
    expect(smoothstep(0, 1, 0.5)).toBe(0.5)
    expect(smoothstep(1, 0, 0.1)).toBeGreaterThan(0.9)
  })
})
