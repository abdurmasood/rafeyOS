// @ts-check
// Where the player starts: open ground with a clear view toward a landmark
import { BLOCK } from './blockTypes'

/**
 * @typedef {import('./voxelGrid').Grid} Grid
 * @typedef {import('./voxelGrid').Column} Column
 * @typedef {import('./voxelGrid').Position} Position
 * @typedef {{ x: number, z: number, ground: number, score: number }} Candidate
 */

/** @type {Set<number>} */
const OPEN_GROUND = new Set([BLOCK.GRASS, BLOCK.DRY_GRASS, BLOCK.MARSH_GRASS, BLOCK.SNOW, BLOCK.SAND, BLOCK.RED_SAND])
/** Every block a tree or cactus is made of: never ground to stand on. @type {ReadonlySet<number>} */
export const TREE = new Set([
  BLOCK.LOG, BLOCK.LEAVES, BLOCK.PINE_LOG, BLOCK.PINE_LEAVES, BLOCK.BIRCH_LOG, BLOCK.BIRCH_LEAVES,
  BLOCK.PALM_LOG, BLOCK.PALM_LEAVES, BLOCK.MARSH_LEAVES, BLOCK.CACTUS,
])

/**
 * True when nothing blocks the view along `yaw` for 30 blocks: no wall ahead, no trunk in your face.
 * @param {Grid} grid
 * @param {Position} standingOn - [x, y, z] of the ground block underfoot
 * @param {number} yaw
 */
export const viewIsOpen = (grid, [x, ground, z], yaw) => {
  const dx = -Math.sin(yaw), dz = -Math.cos(yaw)
  for (let k = 2; k <= 30; k++) {
    const lookX = Math.round(x + dx * k), lookZ = Math.round(z + dz * k)
    if (lookX < 0 || lookZ < 0 || lookX >= grid.size || lookZ >= grid.size) return k > 14
    if (grid.top(lookX, lookZ) > ground + 1 + k * 0.42) return false
    if (k <= 9) for (let dy = 1; dy <= 3; dy++) if (TREE.has(grid.get(lookX, ground + dy, lookZ))) return false
  }
  return true
}

/**
 * Open ground with two blocks of headroom, scored by the caller; every second block, away from the edge.
 * @param {Grid} grid
 * @param {(column: Column, ground: number) => number} score - -Infinity rules a spot out
 * @returns {Candidate[]} best first
 */
const rankCandidates = (grid, score) => {
  /** @type {Candidate[]} */
  const candidates = []
  for (let z = 8; z < grid.size - 8; z += 2) {
    for (let x = 8; x < grid.size - 8; x += 2) {
      const ground = grid.top(x, z)
      if (!OPEN_GROUND.has(grid.get(x, ground, z)) || grid.get(x, ground + 1, z) !== BLOCK.AIR || grid.get(x, ground + 2, z) !== BLOCK.AIR) continue
      const spotScore = score([x, z], ground)
      if (spotScore > -Infinity) candidates.push({ x, z, ground, score: spotScore })
    }
  }
  return candidates.sort((a, b) => b.score - a.score)
}

/**
 * @param {Grid} grid
 * @param {{ x: number, z: number, ground: number }} spot
 */
const hasNoTreesNearby = (grid, { x, z, ground }) => {
  for (let dz = -3; dz <= 3; dz++) {
    for (let dx = -3; dx <= 3; dx++) {
      for (let dy = 1; dy <= 3; dy++) if (TREE.has(grid.get(x + dx, ground + dy, z + dz))) return false
    }
  }
  return true
}

/**
 * Best standing spot by `score` that also has an open view toward `lookAt`.
 * Yaw follows physics.lookDirection: forward is (-sin yaw, -cos yaw).
 * @param {Grid} grid
 * @param {{ score: (column: Column, ground: number) => number, lookAt: (spot: { x: number, z: number }) => number[], pitch?: number }} options
 */
export const pickSpawn = (grid, { score, lookAt, pitch = 0.04 }) => {
  const yawFor = (/** @type {{ x: number, z: number }} */ spot) => {
    const [targetX, targetZ] = lookAt(spot)
    return Math.atan2(-(targetX - spot.x), -(targetZ - spot.z))
  }
  const candidates = rankCandidates(grid, score)
  const middle = grid.size >> 1
  // Nothing qualified: fall back to the centre rather than failing to start
  const best = candidates.find((spot) => hasNoTreesNearby(grid, spot) && viewIsOpen(grid, [spot.x, spot.ground, spot.z], yawFor(spot))) ?? candidates[0]
    ?? { x: middle, z: middle, ground: grid.top(middle, middle) }
  return { x: best.x + 0.5, y: best.ground + 1, z: best.z + 0.5, yaw: yawFor(best), pitch }
}
