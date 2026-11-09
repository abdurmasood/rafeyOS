// @ts-check
// The world: a 512 × 512 × 96 block grid, a continent ringed by islands in open sea, plus where the player starts.
// worldLoader.js has mainland.js generate it, in a worker or on the main thread where there's none; this file has its
// size and how to index it.
import { BLOCK } from './blockTypes'

export const WORLD = Object.freeze({ SIZE: 512, HEIGHT: 96, CHUNK: 16, WATER_LEVEL: 28 })

/** Saved builds name the world they were made on. Bump it whenever generation changes, or old builds land wrong. */
export const WORLD_ID = 'mainland-1'

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
 * The block at (x, y, z); outside the world it's air, and below it solid stone.
 * @param {Uint8Array} blocks
 * @param {number} x
 * @param {number} y
 * @param {number} z
 */
export const blockIn = (blocks, x, y, z) => (inBounds(x, y, z) ? blocks[voxelIndex(x, y, z)] : y < 0 ? BLOCK.STONE : BLOCK.AIR)
