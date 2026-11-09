// @ts-check
// Caves and ores under the surface
import { BLOCK } from './blockTypes'
import { clamp } from './noise'

/**
 * @typedef {import('./voxelGrid').Grid} Grid
 * @typedef {import('./voxelGrid').Position} Position
 * @typedef {() => number} Rand
 * @typedef {{ minY: number, keepDryBelow: number }} CarveLimits
 */

/**
 * Empties a ball of solid blocks, leaving water and ice alone.
 * @param {Grid} grid
 * @param {Position} center
 * @param {number} radius
 * @param {CarveLimits} limits
 */
const carveBall = (grid, [centerX, centerY, centerZ], radius, { minY, keepDryBelow }) => {
  const reach = Math.ceil(radius)
  for (let dy = -reach; dy <= reach; dy++) {
    for (let dz = -reach; dz <= reach; dz++) {
      for (let dx = -reach; dx <= reach; dx++) {
        if (dx * dx + dy * dy + dz * dz > radius * radius) continue
        const x = Math.floor(centerX) + dx, y = Math.floor(centerY) + dy, z = Math.floor(centerZ) + dz
        if (!grid.inside(x, y, z) || y < minY - 2) continue
        if (grid.top(x, z) <= keepDryBelow) continue
        const block = grid.blocks[grid.index(x, y, z)]
        if (block !== BLOCK.AIR && block !== BLOCK.WATER && block !== BLOCK.ICE) grid.blocks[grid.index(x, y, z)] = BLOCK.AIR
      }
    }
  }
}

/**
 * Worm caves: random walks that carve tubes. They break the surface where they meet a hillside,
 * which gives cliffs visible cave mouths. Columns at or below `keepDryBelow` are skipped so the
 * sea floor never gets air pockets under the water.
 * @param {Grid} grid
 * @param {Rand} rand
 * @param {{ count: number, minY?: number, keepDryBelow: number }} options
 */
export const carveWorms = (grid, rand, { count, minY = 5, keepDryBelow }) => {
  for (let worm = 0; worm < count; worm++) {
    let x = 8 + rand() * (grid.size - 16), z = 8 + rand() * (grid.size - 16)
    let y = minY + rand() * Math.max(4, grid.top(Math.floor(x), Math.floor(z)) - minY - 2)
    let yaw = rand() * Math.PI * 2, pitch = (rand() - 0.5) * 0.6
    const steps = 90 + Math.floor(rand() * 140)
    for (let step = 0; step < steps; step++) {
      carveBall(grid, [x, y, z], 1.3 + 1.4 * Math.abs(Math.sin(step * 0.07 + worm)), { minY, keepDryBelow })
      yaw += (rand() - 0.5) * 0.5
      pitch = clamp(pitch * 0.92 + (rand() - 0.5) * 0.25, -0.7, 0.7)
      x += Math.cos(yaw) * Math.cos(pitch)
      z += Math.sin(yaw) * Math.cos(pitch)
      y += Math.sin(pitch)
      if (y < minY) pitch = Math.abs(pitch)
    }
  }
}

/**
 * Small clusters of `ore` replacing stone only.
 * @param {Grid} grid
 * @param {Rand} rand
 * @param {{ ore: number, count: number, maxY: number, clusterSize?: number }} options
 */
export const sprinkleOre = (grid, rand, { ore, count, maxY, clusterSize = 5 }) => {
  for (let cluster = 0; cluster < count; cluster++) {
    let x = Math.floor(rand() * grid.size), y = 2 + Math.floor(rand() * (maxY - 2)), z = Math.floor(rand() * grid.size)
    for (let k = 0; k < clusterSize; k++) {
      if (grid.get(x, y, z) === BLOCK.STONE) grid.set(x, y, z, ore)
      const axis = Math.floor(rand() * 3), step = rand() < 0.5 ? -1 : 1
      if (axis === 0) x += step
      else if (axis === 1) y += step
      else z += step
    }
  }
}
