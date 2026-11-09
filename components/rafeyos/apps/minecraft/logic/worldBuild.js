// @ts-check
// Everything the world worker does: generate the world, mesh every chunk with the saved edits in place, and pack the
// result to post back. No worker globals and no three.js here, so tests run it directly and the loader can run it on
// the main thread where there's no worker.
import { generateMainland } from './mainland'
import { meshChunk } from './mesher'
import { WORLD } from './terrain'
import { createWorld } from './world'

/**
 * @import { Island } from './terrain'
 * @import { BlockEdit } from './world'
 * @import { MeshArrays } from './mesher'
 * @typedef {{ solid: MeshArrays, water: MeshArrays }} ChunkArrays
 * @typedef {ChunkArrays & { cx: number, cz: number }} BuiltChunk
 * @typedef {{ island: Island, chunks: BuiltChunk[] }} BuiltWorld
 * @typedef {BuiltWorld & { type?: 'world' }} WorldMessage - what the worker posts last; `type` is what tells it from progress
 * @typedef {{ type: 'progress', done: number, total: number }} ProgressMessage
 * @typedef {{ island: Readonly<Island>, chunkArrays: Map<string, ChunkArrays> }} LoadedWorld - chunks keyed "cx,cz"
 */

const CHUNKS_PER_SIDE = WORLD.SIZE / WORLD.CHUNK
// Often enough for a smooth count, rarely enough that 1,024 chunks don't mean 1,024 messages
const PROGRESS_EVERY = 16

/**
 * The world and every chunk's meshes, saved builds included.
 * @param {{ edits: ReadonlyArray<BlockEdit>, generate?: () => Island, mesh?: typeof meshChunk,
 *   onProgress?: (done: number, total: number) => void }} options
 * @returns {BuiltWorld} `island` exactly as generated, never with the edits in it: the engine compares changes
 *   against it to spot a block that's back to how the world made it, and drops that entry from the save
 */
export const buildWorld = ({ edits, generate = generateMainland, mesh = meshChunk, onProgress = () => {} }) => {
  const island = generate()
  const world = createWorld(island, edits)
  /** @type {BuiltChunk[]} */
  const chunks = []
  for (let cz = 0; cz < CHUNKS_PER_SIDE; cz++) {
    for (let cx = 0; cx < CHUNKS_PER_SIDE; cx++) {
      chunks.push({ cx, cz, ...mesh(world, cx, cz) })
      if (chunks.length % PROGRESS_EVERY === 0) onProgress(chunks.length, CHUNKS_PER_SIDE * CHUNKS_PER_SIDE)
    }
  }
  return { island, chunks }
}

/**
 * @param {MeshArrays} arrays
 * @returns {MeshArrays}
 */
const packArrays = ({ positions, uvs, colors, indices, bounds }) => ({
  positions, uvs, colors, indices, bounds: { center: [...bounds.center], radius: bounds.radius },
})

/**
 * The message to post back, and the buffers to move rather than copy. Each chunk keeps its own buffers instead of
 * sharing one packed blob, so the engine can free a chunk's arrays as soon as the GPU has them.
 * @param {BuiltWorld} built
 * @returns {{ message: WorldMessage, transfer: ArrayBuffer[] }}
 */
export const packWorld = ({ island, chunks }) => {
  const message = {
    island: { blocks: island.blocks, heights: island.heights, spawn: { ...island.spawn } },
    chunks: chunks.map(({ cx, cz, solid, water }) => ({ cx, cz, solid: packArrays(solid), water: packArrays(water) })),
  }
  // A set, because postMessage throws on a buffer listed twice
  /** @type {Set<ArrayBufferLike>} */
  const buffers = new Set([island.blocks.buffer, island.heights.buffer])
  for (const { solid, water } of chunks) {
    for (const { positions, uvs, colors, indices } of [solid, water]) {
      for (const array of [positions, uvs, colors, indices]) buffers.add(array.buffer)
    }
  }
  return { message, transfer: /** @type {ArrayBuffer[]} */ ([...buffers]) }
}

/**
 * What the engine starts from, out of the posted message.
 * @param {WorldMessage} message
 * @returns {LoadedWorld}
 */
export const unpackWorld = ({ island, chunks }) => ({
  island: Object.freeze({ blocks: island.blocks, heights: island.heights, spawn: island.spawn }),
  chunkArrays: new Map(chunks.map(({ cx, cz, solid, water }) => /** @type {[string, ChunkArrays]} */ ([`${cx},${cz}`, { solid, water }]))),
})

/**
 * The worker's whole job: build the world with the saved edits, reporting progress, and post it back.
 * @param {{ edits: ReadonlyArray<BlockEdit> }} data
 * @param {(message: WorldMessage | ProgressMessage, transfer: ArrayBuffer[]) => void} post
 */
export const handleBuildMessage = ({ edits }, post) => {
  const built = buildWorld({ edits, onProgress: (done, total) => post({ type: 'progress', done, total }, []) })
  const { message, transfer } = packWorld(built)
  post({ type: 'world', ...message }, transfer)
}
