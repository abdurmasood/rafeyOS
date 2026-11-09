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
 * @typedef {{ island: Island, chunks: BuiltChunk[] }} BuiltWorld - also the shape of the message posted back
 * @typedef {{ island: Readonly<Island>, chunkArrays: Map<string, ChunkArrays> }} LoadedWorld - chunks keyed "cx,cz"
 */

const CHUNKS_PER_SIDE = WORLD.SIZE / WORLD.CHUNK

/**
 * The world and every chunk's meshes, saved builds included.
 * @param {{ edits: ReadonlyArray<BlockEdit>, generate?: () => Island, mesh?: typeof meshChunk }} options
 * @returns {BuiltWorld} `island` exactly as generated, never with the edits in it: the engine compares changes
 *   against it to spot a block that's back to how the world made it, and drops that entry from the save
 */
export const buildWorld = ({ edits, generate = generateMainland, mesh = meshChunk }) => {
  const island = generate()
  const world = createWorld(island, edits)
  /** @type {BuiltChunk[]} */
  const chunks = []
  for (let cz = 0; cz < CHUNKS_PER_SIDE; cz++) {
    for (let cx = 0; cx < CHUNKS_PER_SIDE; cx++) chunks.push({ cx, cz, ...mesh(world, cx, cz) })
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
 * @returns {{ message: BuiltWorld, transfer: ArrayBuffer[] }}
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
 * @param {BuiltWorld} message
 * @returns {LoadedWorld}
 */
export const unpackWorld = ({ island, chunks }) => ({
  island: Object.freeze({ blocks: island.blocks, heights: island.heights, spawn: island.spawn }),
  chunkArrays: new Map(chunks.map(({ cx, cz, solid, water }) => /** @type {[string, ChunkArrays]} */ ([`${cx},${cz}`, { solid, water }]))),
})

/**
 * The worker's whole job: build the world with the saved edits and post it back.
 * @param {{ edits: ReadonlyArray<BlockEdit> }} data
 * @param {(message: BuiltWorld, transfer: ArrayBuffer[]) => void} post
 */
export const handleBuildMessage = ({ edits }, post) => {
  const { message, transfer } = packWorld(buildWorld({ edits }))
  post(message, transfer)
}
