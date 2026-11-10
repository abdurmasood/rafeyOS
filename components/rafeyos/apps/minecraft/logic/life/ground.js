// @ts-check
// The ground under a column: the top block a creature or a tuft could stand on, found in the voxels themselves, since
// world.heights counts tree tops and never changes after the world is generated. Cached per column; an edit clears it.
import { BLOCK, isSolid } from '@/components/rafeyos/apps/minecraft/logic/blockTypes'
import { TREE } from '@/components/rafeyos/apps/minecraft/logic/spawn'
import { WORLD } from '@/components/rafeyos/apps/minecraft/logic/terrain'

/**
 * @typedef {{ y: number, block: number, wet: boolean, depth: number }} Ground - y: the top block; wet: water sits on
 *   it; depth: how many blocks of water (0 when dry)
 */

/**
 * @param {{ get: (x: number, y: number, z: number) => number, heights?: ArrayLike<number> }} world - without heights
 *   (a test world) every column is searched from the top
 */
export const createGround = (world) => {
  /** @type {Map<number, Ground | null>} */
  const cache = new Map()
  /**
   * @param {number} x
   * @param {number} z
   */
  const find = (x, z) => {
    let y = world.heights ? world.heights[z * WORLD.SIZE + x] : WORLD.HEIGHT - 1
    // Built up since generation: climb to the top of whatever was placed
    while (y < WORLD.HEIGHT - 1 && isSolid(world.get(x, y + 1, z))) y++
    let block = world.get(x, y, z)
    while (y > 0 && (block === BLOCK.AIR || block === BLOCK.WATER || TREE.has(block))) block = world.get(x, --y, z)
    let top = y + 1
    while (top < WORLD.HEIGHT && world.get(x, top, z) === BLOCK.WATER) top++
    const depth = top - y - 1
    return { y, block, wet: depth > 0, depth }
  }
  /**
   * @param {number} x - a whole block column
   * @param {number} z
   * @returns {Ground | null} null past the world's edge
   */
  const ground = (x, z) => {
    if (x < 0 || z < 0 || x >= WORLD.SIZE || z >= WORLD.SIZE) return null
    const key = z * WORLD.SIZE + x
    let found = cache.get(key)
    if (found === undefined) {
      found = find(x, z)
      cache.set(key, found)
    }
    return found
  }
  /** @param {number} x @param {number} z */
  ground.forget = (x, z) => cache.delete(z * WORLD.SIZE + x)
  return ground
}
