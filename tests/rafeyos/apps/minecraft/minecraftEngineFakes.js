// The Minecraft engine's test harness: jsdom has no WebGL or pointer lock, so a fake renderer, a manual frame queue and a
// stand-in lock. A test file calls installEngineHarness() once at its top level.
import { afterEach, beforeAll, beforeEach, expect, vi } from 'vitest'
import { Color } from 'three'
import { createMinecraftEngine } from '@/components/rafeyos/apps/minecraft/logic/minecraftEngine'
import { FOG, HAZE_DEPTH, SKY } from '@/components/rafeyos/apps/minecraft/logic/atmosphere'
import { WATER_SURFACE } from '@/components/rafeyos/apps/minecraft/logic/mesher'
import { WORLD } from '@/components/rafeyos/apps/minecraft/logic/terrain'
import { buildWorld, packWorld, unpackWorld } from '@/components/rafeyos/apps/minecraft/logic/worldBuild'

export const fakeRenderer = () => ({
  setPixelRatio: vi.fn(), setSize: vi.fn(), setClearColor: vi.fn(), render: vi.fn(), dispose: vi.fn(), forceContextLoss: vi.fn(),
})
let locked = null
const setLock = (element) => {
  locked = element
  document.dispatchEvent(new Event('pointerlockchange'))
}
/** The element the stand-in pointer lock currently holds. */
export const lockedElement = () => locked

// One world for every engine in a file, as the loader hands it over: generating and meshing it takes seconds. A live
// binding, so importers see it once beforeAll has built it.
export let loaded

export const start = (options = {}) => {
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
export const track = (world) => {
  running.push(world)
  return world
}

/** Builds the shared world once, and gives every test a pointer lock to capture and engines to dispose of. */
export const installEngineHarness = () => {
  beforeAll(() => {
    loaded = unpackWorld(packWorld(buildWorld({ edits: [] })).message)
  }, 60000)
  beforeEach(() => {
    Object.defineProperty(document, 'pointerLockElement', { configurable: true, get: () => locked })
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
    locked = null
    delete HTMLCanvasElement.prototype.requestPointerLock
  })
}

/** Draws one frame and returns what the renderer was handed. */
export const drawn = ({ renderer, tick }) => {
  tick()
  const [scene, camera] = renderer.render.mock.lastCall
  return { scene, camera }
}

export const fakeDirector = (shot = null) => ({ frame: vi.fn(() => shot), toPlayer: vi.fn(), toOrbit: vi.fn() })

// Open sea deep enough to sink in, and a player who swam out there and sank: its eyes are under water
export const SEA = { x: 4.5, z: 4.5 }
export const sunk = () => ({ ...loaded.island, spawn: { ...SEA, y: 20, yaw: 0, pitch: 0 } })
export const shotOver = ({ x, z }, y, extra) => fakeDirector({ camera: { x, y, z, yaw: 0, pitch: -0.5 }, ...extra })
export const fogOf = ({ fog }) => [`#${fog.color.getHexString()}`, fog.near, fog.far]

/** How hazy the open sea is for a camera at height `y`, worked out again from the look's constants (atmosphere.js). */
export const seaHazeAt = (y) => Math.sqrt(Math.min(1, Math.max(0, WORLD.WATER_LEVEL + WATER_SURFACE - y) / HAZE_DEPTH))
/** The fog a camera at height `y` in the open sea should get, as fogOf reports it. */
export const seaFogAt = (y) => {
  const haze = seaHazeAt(y)
  const color = new Color(SKY.horizon).lerp(new Color(SKY.underwater), haze)
  const near = FOG.near + (FOG.deepNear - FOG.near) * haze, far = FOG.far + (FOG.deepFar - FOG.far) * haze
  return [`#${color.getHexString()}`, expect.closeTo(near), expect.closeTo(far)]
}
