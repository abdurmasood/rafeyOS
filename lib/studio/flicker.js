// The candle's brightness relative to the render: a slow breath, a restless flicker, and a dip
// when a gust reaches it through the open window.
import { fbm, valueNoise } from './wind'

export const FLICKER_MIN = 0.6
export const FLICKER_MAX = 1.15

/** Gain on the candle's light layer at time t (s), given the wind it feels (0..1). */
export const candleGain = (t, wind) => {
  const breath = 0.06 * Math.sin(2 * Math.PI * 0.37 * t)
  const flicker = 0.1 * (2 * fbm(2.3 * t, 5) - 1) + 0.06 * (2 * valueNoise(9.1 * t, 9) - 1)
  const gustDip = 0.22 * wind * wind * (0.5 + 0.5 * (2 * valueNoise(3.7 * t, 13) - 1))
  return Math.min(FLICKER_MAX, Math.max(FLICKER_MIN, 1 + breath + flicker - gustDip))
}
