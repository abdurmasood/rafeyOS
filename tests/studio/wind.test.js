import { describe, expect, it } from 'vitest'
import { CALM, MAX_SWAY_FACTOR, fbm, gust, swayOffset, valueNoise, windAt, windStrength } from '@/lib/studio/wind'

const STEP = 1 / 120
const sample = (fn, seconds = 600, step = 0.05) => Array.from({ length: Math.round(seconds / step) }, (_, i) => fn(i * step))

describe('wind', () => {
  it('gives the same wind for the same moment, so frames are reproducible', () => {
    expect(windStrength(123.456)).toBe(windStrength(123.456))
    expect(valueNoise(7.25, 3)).toBe(valueNoise(7.25, 3))
  })

  it('keeps noise and strength in range: never dead calm, never past full', () => {
    for (const value of sample((t) => fbm(t))) {
      expect(value).toBeGreaterThanOrEqual(0)
      expect(value).toBeLessThanOrEqual(1)
    }
    for (const value of sample(windStrength)) {
      expect(value).toBeGreaterThanOrEqual(CALM)
      expect(value).toBeLessThanOrEqual(1)
    }
  })

  it('changes smoothly from one 120 Hz frame to the next', () => {
    const jumps = sample((t) => Math.abs(windStrength(t + STEP) - windStrength(t)), 600, 0.1)
    expect(Math.max(...jumps)).toBeLessThan(0.02)
  })

  it('gusts some of the time, not all of the time', () => {
    const gusting = sample(gust).filter((value) => value > 0.5).length / sample(gust).length
    expect(gusting).toBeGreaterThan(0.08)
    expect(gusting).toBeLessThan(0.5)
  })

  it('delays and softens the wind for sheltered places', () => {
    expect(windAt(40, { lag: 2, atten: 0.5 })).toBe(windStrength(38) * 0.5)
    expect(windAt(40, {})).toBe(windStrength(40))
  })
})

describe('swayOffset', () => {
  const base = { phase: 0.3, amp: 0.02, freq: 0.8, time: 12.5, wind: 0.7 }

  it('leaves pots and junctions still', () => {
    expect(swayOffset({ ...base, sway: 0 })).toBe(0)
  })

  it('never moves a leaf farther than its amplitude allows', () => {
    for (const time of sample((t) => t, 120, 0.01)) {
      expect(Math.abs(swayOffset({ ...base, sway: 1, wind: 1, time }))).toBeLessThanOrEqual(base.amp * MAX_SWAY_FACTOR)
    }
  })

  it('leans further with the wind on average', () => {
    const mean = (wind) => sample((time) => swayOffset({ ...base, sway: 1, wind, time }), 60, 0.01).reduce((a, b) => a + b) / 6000
    expect(mean(1)).toBeGreaterThan(mean(0.25))
  })
})
