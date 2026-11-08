// @ts-check
// Chunk meshes as plain arrays: only faces that touch air or water, each corner darkened by the blocks around it
// (ambient occlusion), and water as a slightly sunken surface. No three.js here, so it runs in tests.
import { BLOCK, FACE_TILES, TILE, isSolid } from './blockTypes'
import { ATLAS } from './texturePixels'
import { WORLD } from './terrain'

/**
 * @import { World } from './world'
 * @typedef {{ n: number[], shade: number, kind: number, corners: number[][], uv: number[][] }} Face
 * @typedef {{ positions: Float32Array, uvs: Float32Array, colors: Float32Array, indices: Uint32Array }} MeshArrays
 * @typedef {{ positions: number[], uvs: number[], colors: number[], indices: number[] }} MeshBuffer
 */

/**
 * The six faces: outward normal, light level, which tile (0 top, 1 side, 2 bottom), and four corners in the order
 * the two triangles use, with their texture coordinates.
 * @type {ReadonlyArray<Face>}
 */
export const FACES = Object.freeze([
  { n: [-1, 0, 0], shade: 0.8, kind: 1, corners: [[0, 1, 0], [0, 0, 0], [0, 1, 1], [0, 0, 1]], uv: [[0, 1], [0, 0], [1, 1], [1, 0]] },
  { n: [1, 0, 0], shade: 0.8, kind: 1, corners: [[1, 1, 1], [1, 0, 1], [1, 1, 0], [1, 0, 0]], uv: [[0, 1], [0, 0], [1, 1], [1, 0]] },
  { n: [0, -1, 0], shade: 0.52, kind: 2, corners: [[1, 0, 1], [0, 0, 1], [1, 0, 0], [0, 0, 0]], uv: [[1, 0], [0, 0], [1, 1], [0, 1]] },
  { n: [0, 1, 0], shade: 1, kind: 0, corners: [[0, 1, 1], [1, 1, 1], [0, 1, 0], [1, 1, 0]], uv: [[1, 1], [0, 1], [1, 0], [0, 0]] },
  { n: [0, 0, -1], shade: 0.67, kind: 1, corners: [[1, 0, 0], [0, 0, 0], [1, 1, 0], [0, 1, 0]], uv: [[0, 0], [1, 0], [0, 1], [1, 1]] },
  { n: [0, 0, 1], shade: 0.67, kind: 1, corners: [[0, 0, 1], [1, 0, 1], [0, 1, 1], [1, 1, 1]], uv: [[0, 0], [1, 0], [0, 1], [1, 1]] },
].map((face) => Object.freeze(face)))

const TOP_FACE = FACES[3]
/** Corner brightness by occlusion level: 0 when boxed in by three solid blocks, 3 when open. */
export const AO_LEVELS = Object.freeze([0.46, 0.66, 0.84, 1])
export const WATER_SURFACE = 0.88
const UV_INSET = 0.002
const OPEN = Object.freeze([3, 3, 3, 3])

/**
 * How open one corner of a face is: the two blocks beside it and the one across, in the layer the face looks into.
 * @param {World} world
 * @param {number[]} at - [x, y, z] of the block
 * @param {Face} face
 * @param {number[]} corner
 * @returns {number} 0 (boxed in) to 3 (open)
 */
export const cornerOcclusion = (world, [x, y, z], face, corner) => {
  const axis = face.n[0] !== 0 ? 0 : face.n[1] !== 0 ? 1 : 2
  const [u, v] = axis === 0 ? [1, 2] : axis === 1 ? [0, 2] : [0, 1]
  const p = [x + face.n[0], y + face.n[1], z + face.n[2]]
  const du = [0, 0, 0], dv = [0, 0, 0]
  du[u] = corner[u] ? 1 : -1
  dv[v] = corner[v] ? 1 : -1
  /** @param {number[]} offset */
  const solidAt = (offset) => (isSolid(world.get(p[0] + offset[0], p[1] + offset[1], p[2] + offset[2])) ? 1 : 0)
  const side1 = solidAt(du), side2 = solidAt(dv), across = solidAt([du[0] + dv[0], du[1] + dv[1], du[2] + dv[2]])
  return side1 && side2 ? 0 : 3 - (side1 + side2 + across)
}

/**
 * Appends one textured, shaded quad.
 * @param {MeshBuffer} buffer
 * @param {{ at: number[], face: Face, tile: number, occlusion: readonly number[], top?: number }} quad
 */
const addQuad = (buffer, { at, face, tile, occlusion, top = 1 }) => {
  const first = buffer.positions.length / 3
  const u0 = (tile % ATLAS.COLS) / ATLAS.COLS
  const v0 = 1 - (Math.floor(tile / ATLAS.COLS) + 1) / ATLAS.COLS
  face.corners.forEach((corner, i) => {
    buffer.positions.push(at[0] + corner[0], at[1] + corner[1] * top, at[2] + corner[2])
    const [cu, cv] = face.uv[i]
    buffer.uvs.push(u0 + (UV_INSET + cu * (1 - 2 * UV_INSET)) / ATLAS.COLS, v0 + (UV_INSET + cv * (1 - 2 * UV_INSET)) / ATLAS.COLS)
    // Vertex colours are linear; raising to 2.2 keeps the darkening seen on screen at the chosen level
    const light = Math.pow(face.shade * AO_LEVELS[occlusion[i]], 2.2)
    buffer.colors.push(light, light, light)
  })
  // Split along the brighter diagonal so one dark corner doesn't streak across the whole face
  if (occlusion[0] + occlusion[3] > occlusion[1] + occlusion[2]) {
    buffer.indices.push(first, first + 1, first + 3, first, first + 3, first + 2)
  } else {
    buffer.indices.push(first, first + 1, first + 2, first + 2, first + 1, first + 3)
  }
}

/** @returns {MeshBuffer} */
const emptyBuffer = () => ({ positions: [], uvs: [], colors: [], indices: [] })

/**
 * @param {MeshBuffer} buffer
 * @returns {MeshArrays}
 */
const toArrays = (buffer) => ({
  positions: Float32Array.from(buffer.positions),
  uvs: Float32Array.from(buffer.uvs),
  colors: Float32Array.from(buffer.colors),
  // A busy chunk can pass 65,535 vertices, so never 16-bit
  indices: Uint32Array.from(buffer.indices),
})

/**
 * The faces one block shows.
 * @param {World} world
 * @param {number[]} at
 * @param {{ solid: MeshBuffer, water: MeshBuffer }} buffers
 */
const meshBlock = (world, at, { solid, water }) => {
  const [x, y, z] = at
  const block = world.get(x, y, z)
  if (block === BLOCK.AIR) return
  if (block === BLOCK.WATER) {
    if (world.get(x, y + 1, z) === BLOCK.AIR) addQuad(water, { at, face: TOP_FACE, tile: TILE.WATER, occlusion: OPEN, top: WATER_SURFACE })
    return
  }
  for (const face of FACES) {
    if (isSolid(world.get(x + face.n[0], y + face.n[1], z + face.n[2]))) continue
    const occlusion = face.corners.map((corner) => cornerOcclusion(world, at, face, corner))
    addQuad(solid, { at, face, tile: FACE_TILES[block][face.kind], occlusion })
  }
}

/**
 * Geometry for one 16 × 16 column of the world.
 * @param {World} world
 * @param {number} cx
 * @param {number} cz
 * @returns {{ solid: MeshArrays, water: MeshArrays }}
 */
export const meshChunk = (world, cx, cz) => {
  const buffers = { solid: emptyBuffer(), water: emptyBuffer() }
  for (let y = 0; y < WORLD.HEIGHT; y++) {
    for (let z = cz * WORLD.CHUNK; z < (cz + 1) * WORLD.CHUNK; z++) {
      for (let x = cx * WORLD.CHUNK; x < (cx + 1) * WORLD.CHUNK; x++) meshBlock(world, [x, y, z], buffers)
    }
  }
  return { solid: toArrays(buffers.solid), water: toArrays(buffers.water) }
}
