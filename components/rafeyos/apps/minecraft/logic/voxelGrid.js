// @ts-check
// A block grid the generators draw into, plus the helpers that fill columns and scatter things over it
import { BLOCK } from './blockTypes'
import { hash01, hashInt, mulberry32 } from './random'

/**
 * @typedef {object} Grid
 * @property {number} size
 * @property {number} height
 * @property {Uint8Array} blocks
 * @property {Int16Array} heights
 * @property {(x: number, y: number, z: number) => number} index
 * @property {(x: number, y: number, z: number) => boolean} inside
 * @property {(x: number, y: number, z: number) => number} get - air outside the grid
 * @property {(x: number, y: number, z: number, block: number) => void} set - ignored outside the grid
 * @property {(x: number, y: number, z: number, block: number) => void} setIfAir
 * @property {(x: number, z: number) => number} top - the measured ground height of a column
 */

/** @typedef {[number, number]} Column - a map position as [x, z] */
/** @typedef {[number, number, number]} Position - a block position as [x, y, z] */
/** @typedef {Array<[number, number]>} Layers - blocks under a surface, top-down, as [block, depth] */

/**
 * @param {number} size
 * @param {number} height
 * @returns {Grid}
 */
export const createGrid = (size, height) => {
  const blocks = new Uint8Array(size * size * height)
  const heights = new Int16Array(size * size)
  const index = (/** @type {number} */ x, /** @type {number} */ y, /** @type {number} */ z) => (y * size + z) * size + x
  const inside = (/** @type {number} */ x, /** @type {number} */ y, /** @type {number} */ z) =>
    x >= 0 && z >= 0 && y >= 0 && x < size && z < size && y < height
  return {
    size, height, blocks, heights, index, inside,
    get: (x, y, z) => (inside(x, y, z) ? blocks[index(x, y, z)] : BLOCK.AIR),
    set: (x, y, z, block) => { if (inside(x, y, z)) blocks[index(x, y, z)] = block },
    setIfAir: (x, y, z, block) => { if (inside(x, y, z) && blocks[index(x, y, z)] === BLOCK.AIR) blocks[index(x, y, z)] = block },
    top: (x, z) => heights[z * size + x],
  }
}

/**
 * Records the highest solid (non-air, non-water) block of every column.
 * @param {Grid} grid
 */
export const measureHeights = (grid) => {
  for (let z = 0; z < grid.size; z++) {
    for (let x = 0; x < grid.size; x++) {
      let y = grid.height - 1
      while (y > 0) {
        const block = grid.blocks[grid.index(x, y, z)]
        if (block !== BLOCK.AIR && block !== BLOCK.WATER) break
        y--
      }
      grid.heights[z * grid.size + x] = y
    }
  }
}

/**
 * One jittered candidate per cell: even, natural spacing without a quadratic overlap check.
 * Candidates keep a margin from the edge so trees never hang off the world.
 * @param {Grid} grid
 * @param {number} seed
 * @param {number} cellSize
 * @param {(column: Column, rand: () => number, roll: number) => void} visit
 */
export const scatter = (grid, seed, cellSize, visit) => {
  const margin = 3
  for (let cellZ = 0; cellZ < grid.size; cellZ += cellSize) {
    for (let cellX = 0; cellX < grid.size; cellX += cellSize) {
      const x = cellX + Math.floor(hash01(seed, cellX, 1, cellZ) * cellSize)
      const z = cellZ + Math.floor(hash01(seed, cellX, 2, cellZ) * cellSize)
      if (x < margin || z < margin || x >= grid.size - margin || z >= grid.size - margin) continue
      visit([x, z], mulberry32(hashInt(seed, x, 3, z)), hash01(seed, cellX, 4, cellZ))
    }
  }
}

/**
 * @typedef {object} ColumnSpec
 * @property {number} x
 * @property {number} z
 * @property {number} top - y of the surface block
 * @property {number} surface - the surface block
 * @property {Layers} layers - blocks under the surface, top-down
 * @property {number} sea - water fills from above `top` up to this y
 */

/**
 * Writes one column: stone core, `layers` under the surface, the surface block, then water up to `sea`.
 * @param {Grid} grid
 * @param {ColumnSpec} column
 */
export const fillColumn = (grid, { x, z, top, surface, layers, sea }) => {
  const { blocks, index } = grid
  let y = top
  blocks[index(x, y, z)] = surface
  y--
  for (const [block, depth] of layers) for (let d = 0; d < depth && y >= 0; d++, y--) blocks[index(x, y, z)] = block
  for (; y >= 0; y--) blocks[index(x, y, z)] = BLOCK.STONE
  for (let water = top + 1; water <= sea; water++) blocks[index(x, water, z)] = BLOCK.WATER
  grid.heights[z * grid.size + x] = top
}

/**
 * Largest height step to a 4-neighbour: steep columns become rock faces.
 * @param {Int16Array} heights
 * @param {number} size
 * @param {Column} column
 */
export const slopeAt = (heights, size, [x, z]) => {
  const here = heights[z * size + x]
  let slope = 0
  if (x > 0) slope = Math.max(slope, Math.abs(here - heights[z * size + x - 1]))
  if (x < size - 1) slope = Math.max(slope, Math.abs(here - heights[z * size + x + 1]))
  if (z > 0) slope = Math.max(slope, Math.abs(here - heights[(z - 1) * size + x]))
  if (z < size - 1) slope = Math.max(slope, Math.abs(here - heights[(z + 1) * size + x]))
  return slope
}
