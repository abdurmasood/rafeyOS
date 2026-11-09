// @ts-check
// Chunk meshes as plain arrays: only faces that touch air or water, each corner darkened by the blocks around it
// (ambient occlusion), and water as a slightly sunken surface, merged into rectangles per layer. No three.js here, so
// it runs in tests.
import { BLOCK, FACE_TILES, isSolid } from './blockTypes'
import { ATLAS } from './texturePixels'
import { WORLD } from './terrain'

/**
 * @import { World } from './world'
 * @typedef {{ n: number[], shade: number, kind: number, corners: number[][], uv: number[][] }} Face
 * @typedef {{ center: number[], radius: number }} Bounds - a sphere around a mesh, as plain numbers
 * @typedef {{ positions: Float32Array, uvs: Float32Array, colors: Float32Array, indices: Uint32Array, bounds: Bounds }} MeshArrays
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

/** Corner brightness by occlusion level: 0 when boxed in by three solid blocks, 3 when open. */
export const AO_LEVELS = Object.freeze([0.46, 0.66, 0.84, 1])
export const WATER_SURFACE = 0.88
const UV_INSET = 0.002

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
 * @param {{ at: number[], face: Face, tile: number, occlusion: readonly number[] }} quad
 */
const addQuad = (buffer, { at, face, tile, occlusion }) => {
  const first = buffer.positions.length / 3
  const u0 = (tile % ATLAS.COLS) / ATLAS.COLS
  const v0 = 1 - (Math.floor(tile / ATLAS.COLS) + 1) / ATLAS.COLS
  face.corners.forEach((corner, i) => {
    buffer.positions.push(at[0] + corner[0], at[1] + corner[1], at[2] + corner[2])
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

/**
 * Appends one water rectangle: a top face's corner order and triangles, unshaded, and UVs counted in blocks from the
 * chunk's corner, so the water texture (set to repeat) lands once on every block however big the rectangle is.
 * @param {MeshBuffer} buffer
 * @param {{ origin: number[], rectangle: number[] }} surface - origin: [x, y, z] of the layer's first block;
 *   rectangle: chunk-local [x, z, width, depth]
 */
const addWaterRectangle = (buffer, { origin: [x0, y, z0], rectangle: [x, z, width, depth] }) => {
  const first = buffer.positions.length / 3
  const surface = y + WATER_SURFACE
  for (const [u, v] of [[x, z + depth], [x + width, z + depth], [x, z], [x + width, z]]) {
    buffer.positions.push(x0 + u, surface, z0 + v)
    buffer.uvs.push(u, v)
    buffer.colors.push(1, 1, 1)
  }
  buffer.indices.push(first, first + 1, first + 2, first + 2, first + 1, first + 3)
}

/** @returns {MeshBuffer} */
const emptyBuffer = () => ({ positions: [], uvs: [], colors: [], indices: [] })

/**
 * A sphere around every corner: centred on their box, out to its far corner. It travels with the arrays, so the
 * engine can cull a chunk without ever reading its positions back.
 * @param {Float32Array} positions - x, y, z triples
 * @returns {Bounds}
 */
const boundsOf = (positions) => {
  if (!positions.length) return { center: [0, 0, 0], radius: 0 }
  const min = [Infinity, Infinity, Infinity], max = [-Infinity, -Infinity, -Infinity]
  for (let i = 0; i < positions.length; i++) {
    const axis = i % 3
    if (positions[i] < min[axis]) min[axis] = positions[i]
    if (positions[i] > max[axis]) max[axis] = positions[i]
  }
  return {
    center: [(min[0] + max[0]) / 2, (min[1] + max[1]) / 2, (min[2] + max[2]) / 2],
    radius: Math.hypot(max[0] - min[0], max[1] - min[1], max[2] - min[2]) / 2,
  }
}

/**
 * @param {MeshBuffer} buffer
 * @returns {MeshArrays}
 */
const toArrays = (buffer) => {
  const positions = Float32Array.from(buffer.positions)
  return {
    positions,
    uvs: Float32Array.from(buffer.uvs),
    colors: Float32Array.from(buffer.colors),
    // A busy chunk can pass 65,535 vertices, so never 16-bit
    indices: Uint32Array.from(buffer.indices),
    // From the float32 positions, so the sphere holds exactly what the GPU draws
    bounds: boundsOf(positions),
  }
}

/**
 * The faces one solid block shows.
 * @param {World} world
 * @param {number[]} at
 * @param {number} block
 * @param {MeshBuffer} solid
 */
const meshBlock = (world, at, block, solid) => {
  const [x, y, z] = at
  for (const face of FACES) {
    if (isSolid(world.get(x + face.n[0], y + face.n[1], z + face.n[2]))) continue
    const occlusion = face.corners.map((corner) => cornerOcclusion(world, at, face, corner))
    addQuad(solid, { at, face, tile: FACE_TILES[block][face.kind], occlusion })
  }
}

/**
 * One y layer of a chunk: solid faces go straight into `solid`, and the cells whose water surface shows are marked
 * in `open` for merging.
 * @param {World} world
 * @param {number[]} origin - [x, y, z] of the layer's first block
 * @param {MeshBuffer} solid
 * @param {Uint8Array} open - CHUNK × CHUNK, indexed z * CHUNK + x, rewritten whole
 * @returns {number} how many cells show water, so the many dry layers can skip merging
 */
const meshLayer = (world, [x0, y, z0], solid, open) => {
  let showing = 0
  for (let dz = 0; dz < WORLD.CHUNK; dz++) {
    for (let dx = 0; dx < WORLD.CHUNK; dx++) {
      const x = x0 + dx, z = z0 + dz, cell = dz * WORLD.CHUNK + dx
      const block = world.get(x, y, z)
      // Water shows only its top, and only to air: anything on it, even ice, hides it
      open[cell] = block === BLOCK.WATER && world.get(x, y + 1, z) === BLOCK.AIR ? 1 : 0
      showing += open[cell]
      if (isSolid(block)) meshBlock(world, [x, y, z], block, solid)
    }
  }
  return showing
}

/**
 * @param {Uint8Array} open
 * @param {{ x: number, z: number, width: number }} row
 */
const rowOpen = (open, { x, z, width }) => open.subarray(z * WORLD.CHUNK + x, z * WORLD.CHUNK + x + width).every((cell) => cell === 1)

/**
 * Covers a layer's open water with few rectangles, greedily: a run along x, then grown along z while the whole next
 * row is open too. Each cell is cleared as it's covered, so none is drawn twice.
 * @param {Uint8Array} open - CHUNK × CHUNK, indexed z * CHUNK + x; left all zero
 * @returns {Array<[number, number, number, number]>} chunk-local [x, z, width, depth]
 */
const mergeSurface = (open) => {
  /** @type {Array<[number, number, number, number]>} */
  const rectangles = []
  for (let z = 0; z < WORLD.CHUNK; z++) {
    for (let x = 0; x < WORLD.CHUNK; x++) {
      if (!open[z * WORLD.CHUNK + x]) continue
      let width = 1
      while (x + width < WORLD.CHUNK && open[z * WORLD.CHUNK + x + width]) width++
      let depth = 1
      while (z + depth < WORLD.CHUNK && rowOpen(open, { x, z: z + depth, width })) depth++
      for (let row = z; row < z + depth; row++) open.fill(0, row * WORLD.CHUNK + x, row * WORLD.CHUNK + x + width)
      rectangles.push([x, z, width, depth])
    }
  }
  return rectangles
}

/**
 * Geometry for one 16 × 16 column of the world, each mesh with a bounding sphere.
 * @param {World} world
 * @param {number} cx
 * @param {number} cz
 * @returns {{ solid: MeshArrays, water: MeshArrays }}
 */
export const meshChunk = (world, cx, cz) => {
  const buffers = { solid: emptyBuffer(), water: emptyBuffer() }
  const open = new Uint8Array(WORLD.CHUNK * WORLD.CHUNK)
  // Bottom layer up, so lower water surfaces come first, as they did block by block
  for (let y = 0; y < WORLD.HEIGHT; y++) {
    const origin = [cx * WORLD.CHUNK, y, cz * WORLD.CHUNK]
    if (!meshLayer(world, origin, buffers.solid, open)) continue
    for (const rectangle of mergeSurface(open)) addWaterRectangle(buffers.water, { origin, rectangle })
  }
  return { solid: toArrays(buffers.solid), water: toArrays(buffers.water) }
}
