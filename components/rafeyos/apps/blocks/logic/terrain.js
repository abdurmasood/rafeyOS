// @ts-check
// The island: value-noise hills around a rocky peak, beaches, water, snow and trees, plus where the player starts.
// Generated once per page and cached; nothing mutates the cached copy.
import { BLOCK } from './blockTypes'
import { hash2, mulberry32 } from './random'

export const WORLD = Object.freeze({
  SIZE: 96, HEIGHT: 64, CHUNK: 16, SEED: 7, WATER_LEVEL: 17, ROCK_LINE: 31, SNOW_LINE: 35,
})

/** Saved builds name the island they were made on. Bump it whenever generation changes, or old builds land wrong. */
export const WORLD_ID = 'island-1'

/**
 * @typedef {{ x: number, y: number, z: number, yaw: number, pitch: number }} Spawn - feet position and view
 * @typedef {{ blocks: Uint8Array, heights: Int16Array, spawn: Spawn }} Island
 */

/**
 * @param {number} x
 * @param {number} y
 * @param {number} z
 */
export const inBounds = (x, y, z) => x >= 0 && y >= 0 && z >= 0 && x < WORLD.SIZE && y < WORLD.HEIGHT && z < WORLD.SIZE

/**
 * Where block (x, y, z) sits in the world's flat array.
 * @param {number} x
 * @param {number} y
 * @param {number} z
 */
export const voxelIndex = (x, y, z) => (y * WORLD.SIZE + z) * WORLD.SIZE + x

/**
 * The block at (x, y, z); outside the island it's air, and below it solid stone.
 * @param {Uint8Array} blocks
 * @param {number} x
 * @param {number} y
 * @param {number} z
 */
export const blockIn = (blocks, x, y, z) => (inBounds(x, y, z) ? blocks[voxelIndex(x, y, z)] : y < 0 ? BLOCK.STONE : BLOCK.AIR)

/**
 * @param {number} x
 * @param {number} z
 */
const valueNoise = (x, z) => {
  const xi = Math.floor(x), zi = Math.floor(z), xf = x - xi, zf = z - zi
  const u = xf * xf * (3 - 2 * xf), v = zf * zf * (3 - 2 * zf)
  const a = hash2(WORLD.SEED, xi, zi), b = hash2(WORLD.SEED, xi + 1, zi)
  const c = hash2(WORLD.SEED, xi, zi + 1), d = hash2(WORLD.SEED, xi + 1, zi + 1)
  return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v
}

/**
 * Four octaves of noise, normalised to [0, 1].
 * @param {number} x
 * @param {number} z
 */
const fbm = (x, z) => {
  let sum = 0, amp = 0.5, freq = 1, norm = 0
  for (let octave = 0; octave < 4; octave++) {
    sum += amp * valueNoise(x * freq, z * freq)
    norm += amp
    amp *= 0.5
    freq *= 2
  }
  return sum / norm
}

/**
 * Ground height of column (x, z): rolling hills, a peak where the second noise is high, sinking toward the shore.
 * @param {number} x
 * @param {number} z
 */
export const heightAt = (x, z) => {
  const hills = fbm(x / 26, z / 26)
  const peaks = fbm(x / 54 + 31, z / 54 + 17)
  const dx = (x - WORLD.SIZE / 2) / (WORLD.SIZE / 2), dz = (z - WORLD.SIZE / 2) / (WORLD.SIZE / 2)
  const shore = Math.max(0, Math.hypot(dx, dz) - 0.6)
  return Math.floor(11 + hills * 15 + Math.max(0, peaks - 0.48) * 62 - shore * 46)
}

/**
 * The block at height y in a column whose ground is at h.
 * @param {number} y
 * @param {number} h
 */
const columnBlock = (y, h) => {
  const beach = h <= WORLD.WATER_LEVEL + 1
  if (y > h) return BLOCK.WATER
  if (y === h) return beach ? BLOCK.SAND : h >= WORLD.SNOW_LINE ? BLOCK.SNOW : h >= WORLD.ROCK_LINE ? BLOCK.STONE : BLOCK.GRASS
  if (y > h - 4) return beach ? BLOCK.SAND : h >= WORLD.ROCK_LINE ? BLOCK.STONE : BLOCK.DIRT
  return BLOCK.STONE
}

/**
 * @param {Uint8Array} blocks
 * @param {Int16Array} heights
 */
const fillTerrain = (blocks, heights) => {
  for (let z = 0; z < WORLD.SIZE; z++) {
    for (let x = 0; x < WORLD.SIZE; x++) {
      const h = Math.max(1, Math.min(WORLD.HEIGHT - 12, heightAt(x, z)))
      heights[z * WORLD.SIZE + x] = h
      for (let y = 0; y <= Math.max(h, WORLD.WATER_LEVEL); y++) blocks[voxelIndex(x, y, z)] = columnBlock(y, h)
    }
  }
}

/**
 * A trunk 4–6 tall under a rounded crown of leaves.
 * @param {Uint8Array} blocks
 * @param {number[]} base - [x, y, z] of the lowest log
 * @param {() => number} rand
 */
const plantTree = (blocks, [x, y, z], rand) => {
  const trunk = 4 + Math.floor(rand() * 3)
  const top = y + trunk
  for (let dy = -2; dy <= 1; dy++) {
    const r = dy < 0 ? 2 : 1
    for (let dz = -r; dz <= r; dz++) {
      for (let dx = -r; dx <= r; dx++) {
        const corner = Math.abs(dx) === r && Math.abs(dz) === r
        if (corner && (dy === 1 || rand() < 0.55)) continue
        if (blockIn(blocks, x + dx, top + dy, z + dz) === BLOCK.AIR && inBounds(x + dx, top + dy, z + dz)) {
          blocks[voxelIndex(x + dx, top + dy, z + dz)] = BLOCK.LEAVES
        }
      }
    }
  }
  for (let i = 0; i < trunk; i++) blocks[voxelIndex(x, y + i, z)] = BLOCK.LOG
}

/**
 * Trees on grass, at least five blocks apart.
 * @param {Uint8Array} blocks
 * @param {Int16Array} heights
 */
const plantTrees = (blocks, heights) => {
  const rand = mulberry32(WORLD.SEED)
  /** @type {Array<[number, number]>} */
  const trees = []
  for (let z = 3; z < WORLD.SIZE - 3; z++) {
    for (let x = 3; x < WORLD.SIZE - 3; x++) {
      const h = heights[z * WORLD.SIZE + x]
      if (blocks[voxelIndex(x, h, z)] !== BLOCK.GRASS || rand() > 0.03) continue
      if (trees.some(([tx, tz]) => Math.abs(tx - x) < 5 && Math.abs(tz - z) < 5)) continue
      trees.push([x, z])
      plantTree(blocks, [x, h + 1, z], rand)
    }
  }
}

/**
 * Whether a trunk or leaves stand within two blocks of (x, z), up to three above the ground at h.
 * @param {Uint8Array} blocks
 * @param {number} x
 * @param {number} h
 * @param {number} z
 */
const treeNear = (blocks, x, h, z) => {
  for (let dz = -2; dz <= 2; dz++) {
    for (let dx = -2; dx <= 2; dx++) {
      for (let dy = 1; dy <= 3; dy++) {
        const block = blockIn(blocks, x + dx, h + dy, z + dz)
        if (block === BLOCK.LOG || block === BLOCK.LEAVES) return true
      }
    }
  }
  return false
}

/**
 * Whether nothing rises above standing height for the next 16 blocks along `yaw`.
 * @param {Island} island
 * @param {number[]} at - [x, h, z] of the ground block
 * @param {number} yaw
 */
export const openView = ({ blocks, heights }, [x, h, z], yaw) => {
  const dx = -Math.sin(yaw), dz = -Math.cos(yaw)
  for (let d = 1; d <= 16; d++) {
    const cx = Math.floor(x + 0.5 + dx * d), cz = Math.floor(z + 0.5 + dz * d)
    if (cx < 0 || cz < 0 || cx >= WORLD.SIZE || cz >= WORLD.SIZE) return d > 10
    if (heights[cz * WORLD.SIZE + cx] > h + (d < 6 ? 0 : 2)) return false
    const eyeLevel = blockIn(blocks, cx, h + 2, cz)
    if (eyeLevel === BLOCK.LOG || eyeLevel === BLOCK.LEAVES) return false
  }
  return true
}

/**
 * A clear meadow about halfway out, turned toward an open view, preferably across the island, so the first
 * thing the player sees is the landscape rather than a wall.
 * @param {{ blocks: Uint8Array, heights: Int16Array }} terrain
 * @returns {Spawn}
 */
const pickSpawn = (terrain) => {
  const { blocks, heights } = terrain
  const mid = WORLD.SIZE / 2
  let best = { x: mid, h: WORLD.HEIGHT - 10, z: mid, yaw: 0 }, bestScore = -Infinity
  for (let z = 6; z < WORLD.SIZE - 6; z++) {
    for (let x = 6; x < WORLD.SIZE - 6; x++) {
      const h = heights[z * WORLD.SIZE + x]
      if (h < WORLD.WATER_LEVEL + 3 || h > WORLD.ROCK_LINE - 5) continue
      if (blocks[voxelIndex(x, h, z)] !== BLOCK.GRASS || treeNear(blocks, x, h, z)) continue
      const placeScore = -Math.abs(Math.hypot(x - mid, z - mid) / mid - 0.5) + hash2(WORLD.SEED, x, z) * 0.04
      const towardMiddle = Math.atan2(-(mid - x), -(mid - z))
      for (let i = 0; i < 16; i++) {
        const yaw = (i * Math.PI) / 8
        if (!openView(/** @type {Island} */ (terrain), [x, h, z], yaw)) continue
        const score = placeScore + 0.3 * Math.cos(yaw - towardMiddle)
        if (score > bestScore) { bestScore = score; best = { x, h, z, yaw } }
      }
    }
  }
  return Object.freeze({ x: best.x + 0.5, y: best.h + 1, z: best.z + 0.5, yaw: best.yaw, pitch: -0.1 })
}

/** @type {Island | null} */
let island = null

/**
 * The island, built on first use and then shared; callers copy `blocks` before changing anything.
 * @returns {Island}
 */
export const generateIsland = () => {
  if (island) return island
  const blocks = new Uint8Array(WORLD.SIZE * WORLD.SIZE * WORLD.HEIGHT)
  const heights = new Int16Array(WORLD.SIZE * WORLD.SIZE)
  fillTerrain(blocks, heights)
  plantTrees(blocks, heights)
  island = Object.freeze({ blocks, heights, spawn: pickSpawn({ blocks, heights }) })
  return island
}
