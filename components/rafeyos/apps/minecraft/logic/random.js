// @ts-check
// Seeded randomness for Minecraft: the same seed always grows the same world, trees and textures

/**
 * A small, fast seeded generator of numbers in [0, 1).
 * @param {number} seed
 * @returns {() => number}
 */
export const mulberry32 = (seed) => {
  let state = seed | 0
  return () => {
    state = (state + 0x6d2b79f5) | 0
    let t = Math.imul(state ^ (state >>> 15), 1 | state)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

/**
 * A repeatable number in [0, 1) for one grid cell, the corner values of the terrain noise.
 * @param {number} seed
 * @param {number} x
 * @param {number} z
 */
export const hash2 = (seed, x, z) => {
  let h = (Math.imul(x, 374761393) + Math.imul(z, 668265263) + Math.imul(seed, 982451653)) | 0
  h = Math.imul(h ^ (h >>> 13), 1274126177)
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296
}

/**
 * A repeatable 32-bit integer for one grid cell, the corner values of the terrain noise.
 * @param {number} seed
 * @param {number} x
 * @param {number} y
 * @param {number} z
 */
export const hashInt = (seed, x, y, z) => {
  let h = (seed | 0) ^ Math.imul(x | 0, 0x27d4eb2d) ^ Math.imul(y | 0, 0x165667b1) ^ Math.imul(z | 0, 0x1b873593)
  h = Math.imul(h ^ (h >>> 15), 0x85ebca6b)
  h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35)
  return (h ^ (h >>> 16)) >>> 0
}

/**
 * The same hash as a number in [0, 1).
 * @param {number} seed
 * @param {number} x
 * @param {number} y
 * @param {number} z
 */
export const hash01 = (seed, x, y, z) => hashInt(seed, x, y, z) / 4294967296
