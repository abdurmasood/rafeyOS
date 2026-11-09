import { beforeAll, describe, expect, it, vi } from 'vitest'
import { BLOCK } from '@/components/rafeyos/apps/minecraft/logic/blockTypes'
import { WORLD, voxelIndex } from '@/components/rafeyos/apps/minecraft/logic/terrain'
import { createWorld } from '@/components/rafeyos/apps/minecraft/logic/world'
import { buildWorld, handleBuildMessage, packWorld, unpackWorld } from '@/components/rafeyos/apps/minecraft/logic/worldBuild'

const ARRAY_NAMES = ['positions', 'uvs', 'colors', 'indices']
const arraysOf = ({ solid, water }) => [solid, water].flatMap((mesh) => ARRAY_NAMES.map((name) => mesh[name]))
const vertices = (positions) => Array.from({ length: positions.length / 3 }, (_, i) => [...positions.subarray(i * 3, i * 3 + 3)])
// What postMessage does with the worker's answer: clones it, moving the listed buffers instead of copying them
const post = ({ message, transfer }) => structuredClone(message, { transfer })
// Lengths and identities are asserted as plain values: a failing diff of a 25 MB world would run out of memory

describe('building the real world', () => {
  // High over the north-west sea: always air, so a brick there can only be the saved build
  const SKY = [10, 60, 10]
  const skyIndex = voxelIndex(...SKY)
  let sent
  let received
  let progress
  let worldPosts

  // The whole 512² world, generated and meshed once for this block, the way the worker does it
  beforeAll(() => {
    const posts = []
    handleBuildMessage({ edits: [[skyIndex, BLOCK.BRICK]] }, (message, transfer) => posts.push({ message, transfer }))
    sent = posts.find(({ message }) => message.type === 'world')
    received = post(sent)
    progress = posts.filter(({ message }) => message.type === 'progress')
    worldPosts = posts.filter(({ message }) => message.type === 'world')
  }, 60000)

  it('reports progress every 16 chunks with nothing to transfer, then posts the world once', () => {
    expect(progress.map(({ message }) => message.done)).toEqual(Array.from({ length: 64 }, (_, i) => (i + 1) * 16))
    expect(progress.every(({ message, transfer }) => message.total === 1024 && transfer.length === 0)).toBe(true)
    expect(worldPosts).toHaveLength(1)
  })

  it('meshes all 1,024 chunks, each with a bounding sphere in plain numbers', () => {
    const { chunks } = received

    expect(chunks.length).toBe(1024)
    expect(new Set(chunks.map(({ cx, cz }) => `${cx},${cz}`)).size).toBe(1024)
    for (const { solid, water } of chunks) {
      for (const { bounds } of [solid, water]) {
        expect(Array.isArray(bounds.center)).toBe(true)
        expect([...bounds.center, bounds.radius].every((value) => typeof value === 'number')).toBe(true)
      }
    }
  })

  it("moves the world's arrays and each chunk's own buffers, every one listed once", () => {
    const { message, transfer } = sent
    const chunkBuffers = message.chunks.flatMap((chunk) => arraysOf(chunk).map((array) => array.buffer))
    const listed = new Set(transfer)

    expect(listed.size).toBe(transfer.length)
    expect(transfer.length).toBe(2 + 1024 * 8)
    expect(new Set(chunkBuffers).size).toBe(1024 * 8)
    expect([message.island.blocks.buffer, message.island.heights.buffer, ...chunkBuffers].every((buffer) => listed.has(buffer))).toBe(true)
    // Moved, not copied: the sender's arrays are left empty
    expect(message.island.blocks.byteLength).toBe(0)
    expect(message.chunks[0].solid.positions.byteLength).toBe(0)
    // Each array fills its own buffer rather than being a window on one shared blob
    for (const array of arraysOf(received.chunks[0])) expect(array.buffer.byteLength).toBe(array.byteLength)
  })

  it('unpacks into the island as generated, plus chunk meshes that show the saved build', () => {
    const { island, chunkArrays } = unpackWorld(received)
    const onBrick = vertices(chunkArrays.get('0,0').solid.positions)
      .filter((vertex) => vertex.every((value, axis) => value >= SKY[axis] && value <= SKY[axis] + 1))

    expect(Object.isFrozen(island)).toBe(true)
    expect(island.blocks.length).toBe(WORLD.SIZE * WORLD.SIZE * WORLD.HEIGHT)
    expect(island.heights.length).toBe(WORLD.SIZE * WORLD.SIZE)
    expect(island.spawn).toEqual(sent.message.island.spawn)
    expect(island.blocks[skyIndex]).toBe(BLOCK.AIR)
    expect(chunkArrays.size).toBe(1024)
    // A lone brick in the sky shows all six faces, four corners each
    expect(onBrick).toHaveLength(24)
  })
})

describe('building with a stand-in generator and mesher', () => {
  // One stone block in a world of air, in chunk (1, 2)
  const GROUND = [20, 5, 40]
  const groundIndex = voxelIndex(...GROUND)
  const generate = () => {
    const blocks = new Uint8Array(WORLD.SIZE * WORLD.SIZE * WORLD.HEIGHT)
    blocks[groundIndex] = BLOCK.STONE
    return Object.freeze({ blocks, heights: new Int16Array(WORLD.SIZE * WORLD.SIZE), spawn: { x: 1.5, y: 6, z: 1.5, yaw: 0, pitch: 0 } })
  }
  const meshArrays = () => ({
    positions: new Float32Array(3), uvs: new Float32Array(2), colors: new Float32Array(3), indices: new Uint32Array(3),
    bounds: { center: [0, 0, 0], radius: 0 },
  })
  const mesh = () => ({ solid: meshArrays(), water: meshArrays() })

  it('meshes every chunk with the saved builds in, but hands back the island exactly as generated', () => {
    const island = generate()
    let shown
    const { island: built, chunks } = buildWorld({
      edits: [[groundIndex, BLOCK.BRICK]],
      generate: () => island,
      mesh: (world, cx, cz) => {
        if (cx === 1 && cz === 2) shown = world.get(...GROUND)
        return mesh()
      },
    })

    expect(shown).toBe(BLOCK.BRICK)
    expect(built.blocks[groundIndex]).toBe(BLOCK.STONE)
    expect(built === island).toBe(true)
    expect(chunks.length).toBe(1024)
    expect(chunks[33]).toMatchObject({ cx: 1, cz: 1 })
  })

  it('reports the chunks done so far, out of 1,024, every 16 chunks', () => {
    const onProgress = vi.fn()
    buildWorld({ edits: [], generate, mesh, onProgress })

    expect(onProgress).toHaveBeenCalledTimes(64)
    expect(onProgress.mock.calls[0]).toEqual([16, 1024])
    expect(onProgress.mock.calls[63]).toEqual([1024, 1024])
  })

  it('lists a buffer once even when chunks share it, since postMessage throws on a repeat', () => {
    const shared = mesh()
    const packed = packWorld(buildWorld({ edits: [], generate, mesh: () => shared }))

    expect(packed.transfer.length).toBe(2 + 8)
    expect(() => post(packed)).not.toThrow()
  })

  // The lost-save bug: had the build handed back the island with the saved brick in it, placing that brick again
  // would look like "back to how the world was made", report null, and the save would drop it
  it('keeps a saved block that is broken and placed again in the save', () => {
    const edits = [[groundIndex, BLOCK.BRICK]]
    const { island } = unpackWorld(post(packWorld(buildWorld({ edits, generate, mesh }))))
    const world = createWorld(island, edits)

    expect(world.set(...GROUND, BLOCK.AIR)).toEqual([groundIndex, BLOCK.AIR])
    expect(world.set(...GROUND, BLOCK.BRICK)).toEqual([groundIndex, BLOCK.BRICK])
  })
})
