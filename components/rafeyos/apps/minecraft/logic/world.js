// @ts-check
// The world the player changes: a copy of the generated world with saved edits applied. Each change reports itself as a save
// entry, so only blocks that differ from the generated world are ever stored.
import { isKnownBlock } from './blockTypes'
import { WORLD, blockIn, inBounds, voxelIndex } from './terrain'

/**
 * @import { Island, Spawn } from './terrain'
 * @typedef {[number, number]} BlockEdit - [voxel index, block]
 * @typedef {[number, number | null]} BlockChange - [voxel index, block, or null when it matches the generated world again]
 * @typedef {{
 *   get: (x: number, y: number, z: number) => number,
 *   set: (x: number, y: number, z: number, block: number) => BlockChange | null,
 *   heights: Int16Array,
 *   spawn: Spawn,
 * }} World
 */

/**
 * @param {Island} island
 * @param {ReadonlyArray<BlockEdit>} [edits] - from a save; entries that don't fit this world are skipped
 * @returns {World}
 */
export const createWorld = (island, edits = []) => {
  const blocks = island.blocks.slice()
  for (const [index, block] of edits) {
    if (Number.isInteger(index) && index >= 0 && index < blocks.length && isKnownBlock(block)) blocks[index] = block
  }
  return Object.freeze({
    get: (x, y, z) => blockIn(blocks, x, y, z),
    set: (x, y, z, block) => {
      if (!inBounds(x, y, z)) return null
      const index = voxelIndex(x, y, z)
      if (blocks[index] === block) return null
      blocks[index] = block
      return /** @type {BlockChange} */ ([index, island.blocks[index] === block ? null : block])
    },
    heights: island.heights,
    spawn: island.spawn,
  })
}

/**
 * The chunks whose meshes show block (x, z): its own, plus any neighbour it borders, since faces and corner
 * shading read the blocks next door.
 * @param {number} x
 * @param {number} z
 * @returns {Array<[number, number]>} [cx, cz] pairs inside the world
 */
export const chunksTouching = (x, z) => {
  const last = WORLD.SIZE / WORLD.CHUNK - 1
  const keys = new Set()
  for (const dx of [-1, 0, 1]) {
    for (const dz of [-1, 0, 1]) {
      const cx = Math.floor((x + dx) / WORLD.CHUNK), cz = Math.floor((z + dz) / WORLD.CHUNK)
      if (cx >= 0 && cz >= 0 && cx <= last && cz <= last) keys.add(`${cx},${cz}`)
    }
  }
  return [...keys].map((key) => /** @type {[number, number]} */ (key.split(',').map(Number)))
}
