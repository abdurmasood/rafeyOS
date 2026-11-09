// @ts-check
// Islands that each have a character. The island set is a reusable field (islandField), so any world
// can place its own islands with the same shapes.
import { BLOCK } from './blockTypes'
import { fbm2, smoothstep } from './noise'
import { bigOak, birch, bush, flatTop, oak, palm, pine } from './flora'

/**
 * @typedef {import('./voxelGrid').Grid} Grid
 * @typedef {import('./voxelGrid').Column} Column
 * @typedef {import('./voxelGrid').Layers} Layers
 * @typedef {{ kind: string, x: number, z: number, r: number, peak?: number, pillars?: Array<{ x: number, z: number, r: number, top: number }> }} Isle
 * @typedef {{ height: number, kind: string, isle: Isle | null }} IsleHit
 * @typedef {{ distance: number, floor: number, bumps: number }} IsleSample - how far from the centre (in radii), the sea floor there, and the local lumpiness
 * @typedef {[number, Layers]} Surface
 */

const SEA = 28, SEED = 7411

export const ISLE = Object.freeze({
  PINES: 'pines',
  WOODS: 'woods',
  ATOLL: 'atoll',
  JUNGLE: 'jungle',
  VOLCANO: 'volcano',
  BAR: 'bar',
  REDSTACKS: 'redstacks',
  PLAIN: 'isle',
})

/** What a column reports when no island reaches it. */
export const OPEN_SEA = 'sea'

/**
 * @param {number} x
 * @param {number} z
 */
export const seaFloor = (x, z) => SEA - 15 + 4 * fbm2(SEED + 1, x / 40, z / 40, 3)

/** @param {Isle} isle */
export const pillarsOf = (isle) => (isle.pillars ??= Array.from({ length: 7 }, (_, i) => {
  const angle = i * 2.4 + 0.3, distance = 4 + (i % 3) * 6
  return { x: isle.x + Math.cos(angle) * distance, z: isle.z + Math.sin(angle) * distance, r: 2.4 + (i % 3) * 0.9, top: SEA + 12 + ((i * 7) % 18) }
}))

/**
 * @param {Isle} isle
 * @param {IsleSample} sample
 */
const volcanoHeight = (isle, { distance, floor, bumps }) => {
  if (distance > 1.1) return -Infinity
  const peak = isle.peak ?? 0, rim = 0.2
  if (distance < rim) return SEA + peak - 2 - (1 - distance / rim) * 9
  const t = (distance - rim) / (1 - rim)
  return floor + (SEA + peak - floor) * Math.pow(Math.max(0, 1 - t), 1.25) + bumps * 3 * t
}

/**
 * Pines, woods, jungle and plain isles share one soft hill on a shelf.
 * @param {Isle} isle
 * @param {IsleSample} sample
 */
const hillHeight = (isle, { distance, floor, bumps }) => {
  if (distance > 1.2) return -Infinity
  const shelf = smoothstep(1.15, 0.78, distance)
  const hill = Math.pow(Math.max(0, 1 - distance), 1.3) * (isle.peak ?? 0) * (0.6 + 0.6 * (bumps + 0.5))
  return floor + (SEA + 2 - floor) * shelf + hill * shelf
}

/** @param {IsleSample} sample */
const atollHeight = ({ distance, floor, bumps }) => {
  if (distance > 1.25) return -Infinity
  const ring = Math.abs(distance - 0.78)
  if (ring < 0.13) return SEA + 1 + (ring < 0.06 && bumps > 0 ? 1 : 0)
  if (distance < 0.78) return SEA - 4 + 2 * bumps
  return floor + (SEA - 3 - floor) * smoothstep(1.25, 0.9, distance)
}

/**
 * @param {Isle} isle
 * @param {Column} column - the unwarped column, since the pillars are placed in world space
 * @param {IsleSample} sample
 */
const redstacksHeight = (isle, [x, z], { distance, floor, bumps }) => {
  if (distance > 1.3) return -Infinity
  for (const pillar of pillarsOf(isle)) if (Math.hypot(x - pillar.x, z - pillar.z) < pillar.r + bumps) return pillar.top
  return floor + (SEA - 6 - floor) * smoothstep(1.3, 0.6, distance)
}

/**
 * A long thin sandbar: its own stretched distance, not the round one.
 * @param {Isle} isle
 * @param {Column} warped
 * @param {number} floor
 */
const barHeight = (isle, [warpedX, warpedZ], floor) => {
  const stretched = Math.hypot((warpedX - isle.x) / (isle.r * 2.6), (warpedZ - isle.z) / (isle.r * 0.4))
  if (stretched > 1.4) return -Infinity
  return stretched < 1 ? SEA + (stretched < 0.5 ? 1 : 0) : floor + (SEA - 2 - floor) * smoothstep(1.4, 1, stretched)
}

/**
 * Height this island gives the column, or -Infinity outside its reach.
 * @param {Isle} isle
 * @param {Column} column
 * @param {number} floor
 * @param {{ warpedX: number, warpedZ: number, bumps: number }} warp
 */
export const isleHeight = (isle, column, floor, { warpedX, warpedZ, bumps }) => {
  const distance = Math.hypot(warpedX - isle.x, warpedZ - isle.z) / isle.r
  const sample = { distance, floor, bumps }
  switch (isle.kind) {
    case ISLE.VOLCANO: return volcanoHeight(isle, sample)
    case ISLE.JUNGLE: case ISLE.PINES: case ISLE.WOODS: case ISLE.PLAIN: return hillHeight(isle, sample)
    case ISLE.ATOLL: return atollHeight(sample)
    case ISLE.REDSTACKS: return redstacksHeight(isle, column, sample)
    case ISLE.BAR: return barHeight(isle, [warpedX, warpedZ], floor)
  }
  return -Infinity
}

/**
 * Highest island under each column. Warp and bumps are sampled once per column, not per island.
 * @param {Isle[]} isles
 */
export const islandField = (isles) => ({
  /**
   * @param {Column} column
   * @param {number} floor
   * @returns {IsleHit}
   */
  at([x, z], floor) {
    /** @type {IsleHit} */
    let best = { height: -Infinity, kind: OPEN_SEA, isle: null }
    /** @type {{ warpedX: number, warpedZ: number, bumps: number } | null} */
    let warp = null
    for (const isle of isles) {
      const reach = isle.r * (isle.kind === ISLE.BAR ? 3.8 : 1.5) + 8
      if (Math.abs(x - isle.x) > reach || Math.abs(z - isle.z) > reach) continue
      warp ??= {
        warpedX: x + 7 * fbm2(SEED + 2, x / 30, z / 30, 3),
        warpedZ: z + 7 * fbm2(SEED + 3, x / 30 + 9, z / 30, 3),
        bumps: fbm2(SEED + 4, x / 22, z / 22, 3),
      }
      const height = isleHeight(isle, [x, z], floor, warp)
      if (height > best.height) best = { height, kind: isle.kind, isle }
    }
    return best
  },
})

/**
 * The surface block and layers under it for one island column.
 * @param {string} kind
 * @param {number} height
 * @param {{ slope: number, noise: number, inCrater: boolean }} ground
 * @returns {Surface}
 */
export const isleSurface = (kind, height, { slope, noise, inCrater }) => {
  const altitude = height - SEA
  const sand = kind === ISLE.VOLCANO ? BLOCK.BLACK_SAND : BLOCK.SAND
  if (height < SEA) {
    if (SEA - height <= 4) return [sand, [[sand, 2]]]
    return [noise > 0.3 ? BLOCK.GRAVEL : noise < -0.3 ? BLOCK.CLAY : BLOCK.SAND, [[BLOCK.SAND, 2]]]
  }
  if (inCrater) return [BLOCK.MAGMA, [[BLOCK.BASALT, 3]]]
  if (altitude <= 1) return [(kind === ISLE.PINES || kind === ISLE.WOODS) && noise > 0 ? BLOCK.GRAVEL : sand, [[sand, 3]]]
  switch (kind) {
    case ISLE.VOLCANO: return altitude > 11 + noise * 4 ? [noise > 0.55 ? BLOCK.STONE : BLOCK.BASALT, [[BLOCK.BASALT, 4]]] : [BLOCK.GRASS, [[BLOCK.DIRT, 3]]]
    case ISLE.PINES: return slope >= 4 || altitude > 16 ? [BLOCK.STONE, []] : [BLOCK.GRASS, [[BLOCK.DIRT, 3]]]
    case ISLE.BAR: case ISLE.ATOLL: return [sand, [[sand, 3]]]
    default: return [slope >= 5 ? BLOCK.STONE : BLOCK.GRASS, [[BLOCK.DIRT, 3]]]
  }
}

/**
 * Whether a column lies inside a volcano's crater.
 * @param {Isle | null | undefined} isle
 * @param {Column} column
 */
export const isCrater = (isle, [x, z]) => isle?.kind === ISLE.VOLCANO && Math.hypot(x - isle.x, z - isle.z) < isle.r * 0.13

/**
 * Grows whatever the island kind grows at a column, if the ground suits it.
 * @param {Grid} grid
 * @param {Column} column
 * @param {string} kind
 * @param {{ rand: () => number, roll: number }} dice - `roll` decides whether to plant, `rand` shapes the plant
 */
export const plantIsle = (grid, [x, z], kind, { rand, roll }) => {
  const top = grid.top(x, z), ground = grid.get(x, top, z)
  /** @type {import('./voxelGrid').Position} */
  const above = [x, top + 1, z]
  if (top <= SEA) return
  if ((ground === BLOCK.SAND || ground === BLOCK.BLACK_SAND) && top <= SEA + 2) {
    if (roll < (kind === ISLE.ATOLL || kind === ISLE.PLAIN ? 0.45 : 0.3)) palm(grid, above, rand)
    return
  }
  if (kind === ISLE.REDSTACKS && ground === BLOCK.DRY_GRASS) {
    if (roll < 0.25) flatTop(grid, above, rand)
    else if (roll < 0.4) bush(grid, above, rand)
    return
  }
  if (ground !== BLOCK.GRASS) return
  if (kind === ISLE.JUNGLE) {
    if (roll < 0.85) {
      const pick = rand()
      const grow = pick < 0.3 ? bigOak : pick < 0.6 ? oak : bush
      grow(grid, above, rand)
    }
    return
  }
  if (kind === ISLE.PINES) {
    if (roll < 0.65) (rand() < 0.8 ? pine : birch)(grid, above, rand)
    return
  }
  if (kind === ISLE.WOODS) {
    if (roll < 0.75) {
      const pick = rand()
      const grow = pick < 0.5 ? birch : pick < 0.8 ? oak : bigOak
      grow(grid, above, rand)
    }
    return
  }
  if (kind === ISLE.VOLCANO) {
    if (roll < 0.35) (rand() < 0.5 ? bush : oak)(grid, above, rand)
    return
  }
  if (roll < 0.4) (kind === ISLE.PLAIN ? palm : bush)(grid, above, rand)
}
