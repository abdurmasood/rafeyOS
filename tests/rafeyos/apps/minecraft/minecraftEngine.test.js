// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createMinecraftEngine } from '@/components/rafeyos/apps/minecraft/logic/minecraftEngine'
import { generateIsland, voxelIndex } from '@/components/rafeyos/apps/minecraft/logic/terrain'
import { BLOCK } from '@/components/rafeyos/apps/minecraft/logic/blockTypes'

// jsdom has no WebGL or pointer lock: a fake renderer, a manual frame queue, and a stand-in lock
const fakeRenderer = () => ({
  setPixelRatio: vi.fn(), setSize: vi.fn(), setClearColor: vi.fn(), render: vi.fn(), dispose: vi.fn(), forceContextLoss: vi.fn(),
})
let lockedElement = null
const setLock = (element) => {
  lockedElement = element
  document.dispatchEvent(new Event('pointerlockchange'))
}

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
    host, onHud: hud, onEdit, createRenderer: () => renderer, now: () => time,
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
    const { x, y, z } = generateIsland().spawn
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
    expect(generateIsland().blocks[index]).not.toBe(BLOCK.AIR)
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
    const { x, y, z } = generateIsland().spawn
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

    expect(failing).toThrow('no WebGL')
    expect(host.children).toHaveLength(0)
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
