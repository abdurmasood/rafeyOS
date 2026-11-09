// @ts-check
// Seeded gradient noise for the terrain: smooth, repeatable values from a seed and a position
import { hashInt } from './random'

/**
 * @param {number} value
 * @param {number} low
 * @param {number} high
 */
export const clamp = (value, low, high) => (value < low ? low : value > high ? high : value)

/**
 * @param {number} a
 * @param {number} b
 * @param {number} t
 */
export const lerp = (a, b, t) => a + (b - a) * t

/**
 * Eases from 0 at `a` to 1 at `b`; `a` above `b` runs it backwards.
 * @param {number} a
 * @param {number} b
 * @param {number} value
 */
export const smoothstep = (a, b, value) => {
  const t = clamp((value - a) / (b - a), 0, 1)
  return t * t * (3 - 2 * t)
}

/** @param {number} t */
const fade = (t) => t * t * t * (t * (t * 6 - 15) + 10)

// Eight unit directions; the corner hash picks one per lattice point.
const GRADIENTS = Array.from({ length: 8 }, (_, i) => [Math.cos((i * Math.PI) / 4), Math.sin((i * Math.PI) / 4)])

// Stretches the raw output, which tops out near 0.707, so it spans about [-1, 1]. Part of the pinned world.
const OUTPUT_SCALE = 1.414

/**
 * 2D gradient noise in about [-1, 1].
 * @param {number} seed
 * @param {number} x
 * @param {number} z
 */
export const perlin2 = (seed, x, z) => {
  const x0 = Math.floor(x), z0 = Math.floor(z), fx = x - x0, fz = z - z0
  const cornerInfluence = (/** @type {number} */ ix, /** @type {number} */ iz, /** @type {number} */ dx, /** @type {number} */ dz) => {
    const gradient = GRADIENTS[hashInt(seed, ix, 0, iz) & 7]
    return gradient[0] * dx + gradient[1] * dz
  }
  const u = fade(fx), v = fade(fz)
  const a = lerp(cornerInfluence(x0, z0, fx, fz), cornerInfluence(x0 + 1, z0, fx - 1, fz), u)
  const b = lerp(cornerInfluence(x0, z0 + 1, fx, fz - 1), cornerInfluence(x0 + 1, z0 + 1, fx - 1, fz - 1), u)
  return lerp(a, b, v) * OUTPUT_SCALE
}

/**
 * Layered gradient noise in about [-1, 1].
 * @param {number} seed
 * @param {number} x
 * @param {number} z
 * @param {number} [octaves]
 */
export const fbm2 = (seed, x, z, octaves = 4) => {
  let sum = 0, norm = 0, amp = 1, freq = 1
  for (let i = 0; i < octaves; i++) {
    sum += amp * perlin2(seed + i * 1013, x * freq, z * freq)
    norm += amp
    amp *= 0.5
    freq *= 2
  }
  return sum / norm
}

/**
 * Ridged multifractal in [0, 1]: sharp crests where the noise crosses zero.
 * @param {number} seed
 * @param {number} x
 * @param {number} z
 * @param {number} [octaves]
 */
export const ridged2 = (seed, x, z, octaves = 5) => {
  let sum = 0, norm = 0, amp = 1, freq = 1, weight = 1
  for (let i = 0; i < octaves; i++) {
    let ridge = 1 - Math.abs(perlin2(seed + i * 733, x * freq, z * freq))
    ridge *= ridge * weight
    weight = clamp(ridge * 1.6, 0, 1)
    sum += ridge * amp
    norm += amp
    amp *= 0.5
    freq *= 2.03
  }
  return sum / norm
}
