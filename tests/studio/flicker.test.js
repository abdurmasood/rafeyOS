import { describe, expect, it } from 'vitest'
import { FLICKER_MAX, FLICKER_MIN, candleGain } from '@/lib/studio/flicker'

const over = (seconds, fn) => Array.from({ length: seconds * 60 }, (_, i) => fn(i / 60))
const mean = (values) => values.reduce((a, b) => a + b, 0) / values.length

describe('candleGain', () => {
  it('stays between its dimmest and brightest', () => {
    for (const gain of over(300, (t) => candleGain(t, 0.5))) {
      expect(gain).toBeGreaterThanOrEqual(FLICKER_MIN)
      expect(gain).toBeLessThanOrEqual(FLICKER_MAX)
    }
  })

  it('averages close to the render when the air is calm', () => {
    expect(mean(over(300, (t) => candleGain(t, 0.125)))).toBeCloseTo(1, 1)
  })

  it('dips when a gust reaches it', () => {
    expect(mean(over(300, (t) => candleGain(t, 0.5)))).toBeLessThan(mean(over(300, (t) => candleGain(t, 0.125))))
  })

  it('is the same for the same moment', () => {
    expect(candleGain(42.42, 0.3)).toBe(candleGain(42.42, 0.3))
  })
})
