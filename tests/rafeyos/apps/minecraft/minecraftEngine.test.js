// @vitest-environment jsdom
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { NearestFilter, NearestMipmapLinearFilter, RepeatWrapping, SRGBColorSpace, ShaderLib, Vector3 } from 'three'
import { WARM_BATCH, WebGLUnavailableError, createMinecraftEngine } from '@/components/rafeyos/apps/minecraft/logic/minecraftEngine'
import { voxelIndex } from '@/components/rafeyos/apps/minecraft/logic/terrain'
import { buildWorld, packWorld, unpackWorld } from '@/components/rafeyos/apps/minecraft/logic/worldBuild'
import { BLOCK, TILE } from '@/components/rafeyos/apps/minecraft/logic/blockTypes'
import { ATLAS, flipRows, paintAtlas, tilePixels } from '@/components/rafeyos/apps/minecraft/logic/texturePixels'

// jsdom has no WebGL or pointer lock: a fake renderer, a manual frame queue, and a stand-in lock
const fakeRenderer = () => ({
  setPixelRatio: vi.fn(), setSize: vi.fn(), setClearColor: vi.fn(), render: vi.fn(), dispose: vi.fn(), forceContextLoss: vi.fn(),
})
let lockedElement = null
const setLock = (element) => {
  lockedElement = element
  document.dispatchEvent(new Event('pointerlockchange'))
}

// One world for every engine here, as the loader hands it over: generating and meshing it takes seconds
let loaded
beforeAll(() => {
  loaded = unpackWorld(packWorld(buildWorld({ edits: [] })).message)
}, 60000)

const start = (options = {}) => {
  const host = document.createElement('div')
  Object.defineProperty(host, 'clientWidth', { value: 800 })
  Object.defineProperty(host, 'clientHeight', { value: 600 })
  document.body.append(host)
  const renderer = fakeRenderer()
  const frames = new Map()
  let nextId = 1
  let time = 0
  const hud = vi.fn()
  const onEdit = vi.fn()
  const engine = createMinecraftEngine({
    // A map of its own each time, since the engine empties the one it's given
    host, island: loaded.island, chunkArrays: new Map(loaded.chunkArrays),
    onHud: hud, onEdit, createRenderer: () => renderer, now: () => time,
    requestFrame: (run) => { frames.set(nextId, run); return nextId++ },
    cancelFrame: (id) => frames.delete(id),
    ...options,
  })
  const canvas = host.querySelector('canvas')
  /** Runs the waiting frame `count` times, 16 ms apart. */
  const tick = (count = 1) => {
    for (let i = 0; i < count; i++) {
      time += 16
      const [id, run] = [...frames][0] ?? []
      if (!run) return
      frames.delete(id)
      run(time)
    }
  }
  return { host, canvas, engine, renderer, frames, tick, hud, onEdit, lastHud: () => hud.mock.lastCall[0] }
}

let running = []
const track = (world) => {
  running.push(world)
  return world
}
beforeEach(() => {
  Object.defineProperty(document, 'pointerLockElement', { configurable: true, get: () => lockedElement })
  document.exitPointerLock = vi.fn(() => setLock(null))
  HTMLCanvasElement.prototype.requestPointerLock = function requestPointerLock() {
    setLock(this)
  }
})
afterEach(() => {
  running.forEach(({ engine, host }) => {
    engine.dispose()
    host.remove()
  })
  running = []
  lockedElement = null
  delete HTMLCanvasElement.prototype.requestPointerLock
})

const play = (world) => {
  world.engine.setActive(true)
  world.engine.capture()
  return world
}
const lookDown = () => document.dispatchEvent(new MouseEvent('mousemove', { movementX: 0, movementY: 400, bubbles: true }))

/** Draws one frame and returns what the renderer was handed. */
const drawn = ({ renderer, tick }) => {
  tick()
  const [scene, camera] = renderer.render.mock.lastCall
  return { scene, camera }
}
// Chunk meshes are the scene's plain BufferGeometry meshes; the sky is a sphere and the outline is lines
const chunkMeshes = (scene) => scene.children.filter((child) => child.isMesh && child.geometry.type === 'BufferGeometry')

describe('the Minecraft engine', () => {
  it('fills its host with a canvas sized to it, and renders every frame', () => {
    const { host, canvas, renderer, tick } = track(start())

    expect(canvas.parentElement).toBe(host)
    expect(canvas.className).toBe('bk-canvas')
    expect(renderer.setSize).toHaveBeenCalledWith(800, 600, false)
    tick(3)
    expect(renderer.render).toHaveBeenCalledTimes(3)
  })

  it('reports where the player stands, which block is picked, and whether it is playing', () => {
    const { x, y, z } = loaded.island.spawn
    const { lastHud } = track(start())

    expect(lastHud()).toEqual({ playing: false, selected: 0, position: expect.stringMatching(new RegExp(`^x ${x.toFixed(1)} · y ${y.toFixed(1)} · z ${z.toFixed(1)} · [NESW]$`)) })
  })

  it('starts playing on capture, and picks a block with the number keys', () => {
    const world = play(track(start()))
    document.dispatchEvent(new KeyboardEvent('keydown', { code: 'Digit4', bubbles: true }))

    expect(world.lastHud()).toMatchObject({ playing: true, selected: 3 })
  })

  it('breaks the block the crosshair is on and reports the change for saving', () => {
    const world = play(track(start()))
    lookDown()
    world.tick()
    world.canvas.dispatchEvent(new MouseEvent('mousedown', { button: 0, bubbles: true }))

    expect(world.onEdit).toHaveBeenCalledTimes(1)
    const [[index, block]] = world.onEdit.mock.calls[0]
    expect(block).toBe(BLOCK.AIR)
    expect(loaded.island.blocks[index]).not.toBe(BLOCK.AIR)
  })

  it('places the picked block on the face it points at', () => {
    const world = play(track(start()))
    document.dispatchEvent(new KeyboardEvent('keydown', { code: 'Digit8', bubbles: true }))
    lookDown()
    world.tick()
    world.canvas.dispatchEvent(new MouseEvent('mousedown', { button: 2, bubbles: true }))

    expect(world.onEdit).toHaveBeenCalledWith([expect.any(Number), BLOCK.BRICK])
  })

  it('starts from saved edits, lifting the player out of anything built where it stands', () => {
    const { x, y, z } = loaded.island.spawn
    const { lastHud } = track(start({ edits: [[voxelIndex(Math.floor(x), y, Math.floor(z)), BLOCK.BRICK]] }))

    expect(lastHud().position).toContain(`y ${(y + 1).toFixed(1)}`)
  })

  it('stops rendering while paused and picks up again after', () => {
    const { engine, frames, renderer, tick } = track(start())
    engine.setPaused(true)
    expect(frames.size).toBe(0)
    tick(2)
    expect(renderer.render).not.toHaveBeenCalled()

    engine.setPaused(false)
    engine.setPaused(false)
    expect(frames.size).toBe(1)
    tick()
    expect(renderer.render).toHaveBeenCalledTimes(1)
  })

  it('lets go of the mouse when its window stops being active', () => {
    const world = play(track(start()))
    world.engine.setActive(false)

    expect(document.exitPointerLock).toHaveBeenCalled()
    expect(world.lastHud().playing).toBe(false)
  })

  it('cleans up after itself: canvas, GPU memory, frames and listeners', () => {
    const world = start()
    play(world)
    world.engine.dispose()
    world.host.remove()

    expect(world.canvas.isConnected).toBe(false)
    expect(world.renderer.dispose).toHaveBeenCalled()
    expect(world.renderer.forceContextLoss).toHaveBeenCalled()
    expect(world.frames.size).toBe(0)
    document.dispatchEvent(new KeyboardEvent('keydown', { code: 'Digit5', bubbles: true }))
    expect(world.lastHud().selected).toBe(0)
  })

  it("throws when the browser can't make a renderer, leaving nothing behind", () => {
    const host = document.createElement('div')
    const failing = () => createMinecraftEngine({ host, createRenderer: () => { throw new Error('no WebGL') } })

    expect(failing).toThrow(WebGLUnavailableError)
    expect(host.children).toHaveLength(0)
  })

  it('keeps the original renderer error as the cause of the WebGL error', () => {
    const original = new Error('no WebGL')
    const failing = () => createMinecraftEngine({ host: document.createElement('div'), createRenderer: () => { throw original } })

    expect(failing).toThrow(expect.objectContaining({ cause: original }))
  })

  it('leaves the host empty and frees the renderer when building fails after the renderer was made', () => {
    const renderer = fakeRenderer()
    const host = document.createElement('div')

    // A world without a spawn throws as the engine sets the player up, after the renderer is mounted
    const failing = () => createMinecraftEngine({
      host, island: { ...loaded.island, spawn: null }, chunkArrays: new Map(), createRenderer: () => renderer,
    })

    expect(failing).toThrow()
    expect(host.children).toHaveLength(0)
    expect(renderer.dispose).toHaveBeenCalled()
    expect(renderer.forceContextLoss).toHaveBeenCalled()
  })

  it('sees out to 175 blocks: fog ends there, the far plane just past it, and the sky dome inside it', () => {
    const { scene, camera } = drawn(track(start()))
    const sky = scene.children.find((child) => child.geometry?.type === 'SphereGeometry')

    expect([scene.fog.near, scene.fog.far]).toEqual([55, 175])
    expect(camera.far).toBe(scene.fog.far + 8)
    expect(sky.geometry.parameters.radius).toBeLessThan(camera.far)
  })

  it('samples blocks through a tile-safe mip chain and water through its own repeating tile, and frees both', () => {
    const world = start()
    const meshes = chunkMeshes(drawn(world).scene)
    const blocks = meshes.find((mesh) => mesh.renderOrder === 0).material.map
    const water = meshes.find((mesh) => mesh.renderOrder === 1).material.map
    const disposed = vi.fn()
    blocks.addEventListener('dispose', disposed)
    water.addEventListener('dispose', disposed)

    expect(blocks.mipmaps.map(({ width }) => width)).toEqual([128, 64, 32, 16, 8])
    expect(blocks.mipmaps[0].data).toBe(blocks.image.data)
    expect([blocks.generateMipmaps, blocks.minFilter, blocks.magFilter]).toEqual([false, NearestMipmapLinearFilter, NearestFilter])
    expect(water.mipmaps.map(({ width }) => width)).toEqual([16, 8, 4, 2, 1])
    expect(water.image.data).toEqual(new Uint8Array(flipRows(tilePixels(paintAtlas(), TILE.WATER), ATLAS.TILE).buffer))
    expect([water.wrapS, water.wrapT, water.colorSpace]).toEqual([RepeatWrapping, RepeatWrapping, SRGBColorSpace])
    world.engine.dispose()
    world.host.remove()
    expect(disposed).toHaveBeenCalledTimes(2)
  })

  it('shades blocks with their vertex colour and fog depth read at the centroid, so no antialiased sliver turns black', () => {
    const solid = chunkMeshes(drawn(track(start())).scene).find((mesh) => mesh.renderOrder === 0).material
    // What three hands the hook: the built-in shader, its chunks not yet inlined
    const shader = { vertexShader: ShaderLib.basic.vertexShader, fragmentShader: ShaderLib.basic.fragmentShader }

    solid.onBeforeCompile(shader)

    for (const source of [shader.vertexShader, shader.fragmentShader]) {
      expect(source).toContain('centroid varying vec3 vColor;')
      expect(source).toContain('centroid varying float vFogDepth;')
      // Both stages must agree, or the program won't link
      expect(source.match(/(?<!centroid )varying \w+ (vColor|vFogDepth);/g)).toBeNull()
    }
  })

  it('starts from the prebuilt chunks, taking them out of the map so nothing else keeps their arrays alive', () => {
    const chunkArrays = new Map(loaded.chunkArrays)
    const prebuilt = loaded.chunkArrays.get('16,16').solid.positions
    const shown = [...loaded.chunkArrays.values()].flatMap(({ solid, water }) => [solid, water]).filter(({ indices }) => indices.length)
    const meshes = chunkMeshes(drawn(track(start({ chunkArrays }))).scene)

    expect(chunkArrays.size).toBe(0)
    expect(meshes.length).toBe(shown.length)
    expect(meshes.some((mesh) => mesh.geometry.attributes.position.array === prebuilt)).toBe(true)
  })

  it('draws every chunk once within a few frames, out of sight too, so three uploads it and its arrays can go', () => {
    const world = track(start())
    const meshes = chunkMeshes(drawn(world).scene)
    const unculled = () => meshes.filter((mesh) => !mesh.frustumCulled)
    const firstBatch = unculled()
    expect(firstBatch.length).toBe(WARM_BATCH)

    // three calls this right after drawing each mesh
    firstBatch.forEach((mesh) => mesh.onAfterRender())
    expect(firstBatch.every((mesh) => mesh.frustumCulled && !Object.hasOwn(mesh, 'onAfterRender'))).toBe(true)

    const warmed = new Set(firstBatch)
    for (let frame = 1; frame < Math.ceil(meshes.length / WARM_BATCH); frame++) {
      world.tick()
      for (const mesh of unculled()) {
        warmed.add(mesh)
        mesh.onAfterRender()
      }
    }
    expect(warmed.size).toBe(meshes.length)
    world.tick()
    expect(unculled().length).toBe(0)
  })

  it("sets each chunk's bounds up front, then lets go of its arrays once the GPU has them", () => {
    const [{ geometry }] = chunkMeshes(drawn(track(start())).scene)
    const buffers = [...Object.values(geometry.attributes), geometry.index]
    const positions = geometry.attributes.position.array

    for (let i = 0; i < positions.length; i += 3) {
      expect(geometry.boundingSphere.containsPoint(new Vector3(positions[i], positions[i + 1], positions[i + 2]))).toBe(true)
    }
    // three.js calls this right after gl.bufferData, from its own copy of the array
    buffers.forEach((buffer) => buffer.onUploadCallback())
    buffers.forEach((buffer) => expect(buffer.array).toBeNull())
    expect(geometry.boundingSphere.radius).toBeGreaterThan(0)
  })

  // Meshes all 1,024 chunks here on the main thread, a couple of seconds and more under coverage
  it('rebuilds every chunk when the WebGL context comes back, since the freed arrays cannot be sent again', { timeout: 20000 }, () => {
    const world = track(start())
    const { scene } = drawn(world)
    const before = chunkMeshes(scene)
    const disposed = vi.fn()
    before[0].geometry.addEventListener('dispose', disposed)
    world.canvas.dispatchEvent(new Event('webglcontextrestored'))
    const after = chunkMeshes(scene)

    expect(after).toHaveLength(before.length)
    expect(after.filter((mesh) => before.includes(mesh))).toHaveLength(0)
    expect(after.every((mesh) => mesh.geometry.attributes.position.array.length > 0)).toBe(true)
    expect(disposed).toHaveBeenCalled()
    // The new meshes are warmed from the start again, and none of the dropped ones still waiting take a turn
    world.tick()
    expect(after.filter((mesh) => !mesh.frustumCulled).length).toBe(WARM_BATCH)
  })

  it('stops listening for a restored context once disposed', () => {
    const world = start()
    const { scene } = drawn(world)
    world.engine.dispose()
    world.host.remove()
    world.canvas.dispatchEvent(new Event('webglcontextrestored'))

    expect(chunkMeshes(scene)).toHaveLength(0)
  })

  it('follows the window size when the browser has no ResizeObserver', () => {
    const { renderer } = track(start())
    window.dispatchEvent(new Event('resize'))

    expect(renderer.setSize).toHaveBeenCalledTimes(2)
  })

  it('watches its host with a ResizeObserver where there is one', () => {
    const observe = vi.fn(), disconnect = vi.fn()
    const win = { devicePixelRatio: 2, ResizeObserver: vi.fn(function ResizeObserver() { return { observe, disconnect } }), addEventListener: vi.fn(), removeEventListener: vi.fn() }
    const world = start({ win })
    world.engine.dispose()
    world.host.remove()

    expect(observe).toHaveBeenCalledWith(world.host)
    expect(disconnect).toHaveBeenCalled()
    expect(world.renderer.setPixelRatio).toHaveBeenCalledWith(2)
  })
})
