// One wind for the whole room. Gusts come every 10-25 s and last a few seconds; each element
// (tree, plants, candle, dust) feels the same gust with its own delay and strength, so the
// motion reads as weather moving through the window, not as independent jiggling.
// Deterministic for a given time, so frames can be reproduced and tested.

const fract = (x) => x - Math.floor(x)
const hash = (n) => fract(Math.sin(n * 127.1 + 311.7) * 43758.5453)
const smooth = (t) => t * t * (3 - 2 * t)

export const smoothstep = (low, high, x) => smooth(Math.min(1, Math.max(0, (x - low) / (high - low))))

/** Smooth 1D value noise in [0, 1]. */
export const valueNoise = (t, seed = 0) => {
  const i = Math.floor(t)
  const offset = seed * 101.3
  return hash(i + offset) + (hash(i + 1 + offset) - hash(i + offset)) * smooth(t - i)
}

/** Three octaves of value noise, normalised to [0, 1]. */
export const fbm = (t, seed = 0) =>
  (0.5 * valueNoise(t, seed) + 0.25 * valueNoise(2.03 * t, seed + 1) + 0.125 * valueNoise(4.11 * t, seed + 2)) / 0.875

const GUST_PERIOD_S = 9
export const CALM = 0.25

/** 0 in the lulls, rising to 1 at the height of a gust. */
export const gust = (t) => smoothstep(0.5, 0.8, fbm(t / GUST_PERIOD_S, 3))

/** Overall wind strength in [CALM, 1]. */
export const windStrength = (t) => CALM + (1 - CALM) * gust(t)

/** What one element feels: the wind `lag` seconds ago, scaled by how sheltered it is. */
export const windAt = (t, { lag = 0, atten = 1 }) => windStrength(t - lag) * atten

/**
 * How far (m) a vertex sways along the wind. `sway` is the vertex's 0..1 freedom (0 at the pot or
 * junction), `phase` its per-leaf offset. Mirrored exactly by the GLSL in the studio shaders.
 */
export const swayOffset = ({ sway, phase, amp, freq, time, wind }) => {
  const osc =
    0.65 * Math.sin(2 * Math.PI * (freq * time + phase)) + 0.35 * Math.sin(2 * Math.PI * (2.37 * freq * time + 1.7 * phase))
  return amp * sway * (0.55 * wind + osc * (0.2 + 0.8 * wind))
}

/** Largest |swayOffset| for an amplitude: 0.55 + 1.0 at full wind. */
export const MAX_SWAY_FACTOR = 1.55
