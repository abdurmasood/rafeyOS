// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { NearestFilter } from 'three'
import { RAMP, WebGLUnavailableError, createSingularityEngine, gridFor } from '@/components/singularity/singularityEngine'

const VIEW = Object.freeze({
  position: [3, 4, 0], forward: [-0.6, -0.8, 0], right: [0, 0, -1], up: [-0.8, 0.6, 0],
  w: 0.25, gamma: 1.5, halfAngle: 0.7, discTime: 8, dim: 0.45,
})

const fakeRenderer = () => ({
  setPixelRatio: vi.fn(), setSize: vi.fn(), setClearColor: vi.fn(), setRenderTarget: vi.fn(), render: vi.fn(),
  dispose: vi.fn(), forceContextLoss: vi.fn(),
})
const fake2d = () => ({ fillRect: vi.fn(), fillText: vi.fn() })

// jsdom has no ResizeObserver; this one is told when the host changed size
let observers = []
class FakeResizeObserver {
  constructor(callback) {
    this.callback = callback
    this.disconnect = vi.fn()
    observers.push(this)
  }

  observe(element) {
    this.element = element
  }
}

let running = []
let context = null
let hidden = false

const start = ({ width = 800, height = 600, ...options } = {}) => {
  const host = document.createElement('div')
  const box = { width, height }
  Object.defineProperty(host, 'clientWidth', { get: () => box.width })
  Object.defineProperty(host, 'clientHeight', { get: () => box.height })
  document.body.append(host)
  const renderer = fakeRenderer()
  const frames = new Map()
  let nextId = 1
  let time = 0
  const onFrame = vi.fn(() => VIEW)
  const engine = createSingularityEngine({
    host, onFrame, createRenderer: () => renderer, now: () => time,
    requestFrame: (run) => { frames.set(nextId, run); return nextId++ },
    cancelFrame: (id) => frames.delete(id),
    ...options,
  })
  /** Runs the waiting frame `count` times, `ms` apart. */
  const tick = (count = 1, ms = 16) => {
    for (let i = 0; i < count; i++) {
      time += ms
      const [id, run] = [...frames][0] ?? []
      if (!run) return
      frames.delete(id)
      run(time)
    }
  }
  const resizeTo = (nextWidth, nextHeight) => {
    Object.assign(box, { width: nextWidth, height: nextHeight })
    observers.find((observer) => observer.element === host).callback()
  }
  const world = { host, box, canvas: host.querySelector('canvas'), engine, renderer, frames, tick, onFrame, resizeTo }
  running.push(world)
  return world
}

/** What one drawn frame handed the renderer: the cell texture's target, and each pass's material. */
const drawn = ({ renderer, tick }) => {
  tick()
  const [[cells], [screen]] = renderer.setRenderTarget.mock.calls.slice(-2)
  const [[viewMesh], [printMesh]] = renderer.render.mock.calls.slice(-2)
  return { cells, screen, view: viewMesh.material, print: printMesh.material }
}

const countDisposals = (...things) => {
  const disposed = vi.fn()
  things.forEach((thing) => thing.addEventListener('dispose', disposed))
  return disposed
}

beforeEach(() => {
  context = fake2d()
  hidden = false
  vi.stubGlobal('ResizeObserver', FakeResizeObserver)
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockImplementation(() => context)
  Object.defineProperty(document, 'hidden', { configurable: true, get: () => hidden })
})

afterEach(() => {
  running.forEach(({ engine, host }) => {
    engine.dispose()
    host.remove()
  })
  running = []
  observers = []
  delete document.hidden
  delete document.fonts
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

describe('the singularity engine', () => {
  it('counts character cells of 4 by 8 pixels, and never fewer than 40 by 20', () => {
    expect(gridFor(800, 600)).toEqual({ cols: 200, rows: 75 })
    expect(gridFor(1141, 683)).toEqual({ cols: 285, rows: 85 })
    expect(gridFor(100, 100)).toEqual({ cols: 40, rows: 20 })
  })

  it('fills its host with a canvas sized to it, one texel per character cell', () => {
    const world = start()
    const { cells, screen, view, print } = drawn(world)

    expect(world.canvas.parentElement).toBe(world.host)
    expect(world.renderer.setSize).toHaveBeenCalledWith(800, 600, false)
    expect([cells.width, cells.height]).toEqual([200, 75])
    expect(cells.texture.minFilter).toBe(NearestFilter)
    expect(cells.texture.magFilter).toBe(NearestFilter)
    expect(screen).toBeNull()
    expect(print.uniforms.uGrid.value.toArray()).toEqual([200, 75])
    expect(print.uniforms.uBrightness.value).toBe(cells.texture)
    expect(print.uniforms.uGlyphCount.value).toBe(RAMP.length)
    expect(view.uniforms.uAspect.value).toBeCloseTo(800 / 600, 12)
  })

  it('caps the device pixel ratio at 2', () => {
    vi.stubGlobal('devicePixelRatio', 3)
    expect(start().renderer.setPixelRatio).toHaveBeenCalledWith(2)

    vi.stubGlobal('devicePixelRatio', 1.5)
    expect(start().renderer.setPixelRatio).toHaveBeenCalledWith(1.5)
  })

  it('follows its host as it is resized', () => {
    const world = start()
    world.resizeTo(400, 320)
    const { cells, view, print } = drawn(world)

    expect(world.renderer.setSize).toHaveBeenLastCalledWith(400, 320, false)
    expect([cells.width, cells.height]).toEqual([100, 40])
    expect(print.uniforms.uGrid.value.toArray()).toEqual([100, 40])
    expect(view.uniforms.uAspect.value).toBe(1.25)
  })

  it('follows the window instead where there is no ResizeObserver', () => {
    vi.stubGlobal('ResizeObserver', undefined)
    const world = start()
    world.box.width = 1000
    window.dispatchEvent(new Event('resize'))
    expect(world.renderer.setSize).toHaveBeenLastCalledWith(1000, 600, false)

    world.engine.dispose()
    window.dispatchEvent(new Event('resize'))
    expect(world.renderer.setSize).toHaveBeenCalledTimes(2)
  })

  it('asks where the eye is every frame and draws both passes from the answer', () => {
    const world = start()
    const { view, print } = drawn(world)

    expect(world.onFrame).toHaveBeenCalledTimes(1)
    expect(world.onFrame).toHaveBeenCalledWith(0.016)
    expect(world.renderer.render).toHaveBeenCalledTimes(2)
    expect(view.uniforms.uEye.value.toArray()).toEqual(VIEW.position)
    expect(view.uniforms.uForward.value.toArray()).toEqual(VIEW.forward)
    expect(view.uniforms.uRight.value.toArray()).toEqual(VIEW.right)
    expect(view.uniforms.uUp.value.toArray()).toEqual(VIEW.up)
    expect(view.uniforms).toMatchObject({
      uOutwardSpeed: { value: 0.25 }, uGamma: { value: 1.5 }, uHalfAngle: { value: 0.7 }, uDiscTime: { value: 8 },
    })
    expect(print.uniforms.uDim.value).toBe(0.45)
    expect(view).not.toBe(print)
  })

  it('never hands the flight a frame longer than a twentieth of a second', () => {
    const world = start()
    world.tick(1, 5000)

    expect(world.onFrame).toHaveBeenLastCalledWith(0.05)
  })

  it('neither draws nor moves the flight while its host has no size, and picks up when it has one again', () => {
    const world = start({ width: 0, height: 0 })
    world.tick(3)
    expect(world.renderer.setSize).not.toHaveBeenCalled()
    expect(world.renderer.render).not.toHaveBeenCalled()
    expect(world.onFrame).not.toHaveBeenCalled()

    world.resizeTo(800, 600)
    world.tick()
    expect(world.renderer.render).toHaveBeenCalledTimes(2)

    world.resizeTo(0, 0)
    world.tick(3)
    expect(world.renderer.render).toHaveBeenCalledTimes(2)
    expect(world.onFrame).toHaveBeenCalledTimes(1)
  })

  it('does not draw while the tab is hidden', () => {
    const world = start()
    hidden = true
    world.tick(3)
    expect(world.renderer.render).not.toHaveBeenCalled()
    expect(world.onFrame).not.toHaveBeenCalled()

    hidden = false
    world.tick()
    expect(world.onFrame).toHaveBeenCalledTimes(1)
  })

  it('stops drawing while paused and picks up again after, without one giant frame', () => {
    const world = start()
    world.engine.setPaused(true)
    world.engine.setPaused(true)
    expect(world.frames.size).toBe(0)
    world.tick(2, 4000)
    expect(world.onFrame).not.toHaveBeenCalled()

    world.engine.setPaused(false)
    world.engine.setPaused(false)
    expect(world.frames.size).toBe(1)
    world.tick()
    expect(world.onFrame).toHaveBeenCalledWith(0.016)
  })

  it('paints the ramp into the glyph atlas in the terminal font at weight 400', () => {
    const world = start()
    const { print } = drawn(world)
    const atlas = print.uniforms.uGlyphs.value.image

    expect([atlas.width, atlas.height]).toEqual([RAMP.length * 24, 48])
    expect(context.font).toBe('400 38px ui-monospace, Menlo, monospace')
    expect(context.fillText).toHaveBeenCalledTimes(RAMP.length)
    expect(context.fillText).toHaveBeenNthCalledWith(2, '.', 36, 26)
    expect(context.fillText).toHaveBeenLastCalledWith('@', (RAMP.length - 1) * 24 + 12, 26)
  })

  it("uses the page's terminal font, and paints again once it has loaded", async () => {
    let loaded
    document.fonts = { load: vi.fn(() => new Promise((resolve) => { loaded = resolve })) }
    const host = document.createElement('div')
    host.style.setProperty('--font-terminal', "'__JetBrains_Mono_1a2b3c'")
    const world = start()
    world.engine.dispose()
    context = fake2d()
    document.body.append(host)
    const renderer = fakeRenderer()
    const engine = createSingularityEngine({ host, onFrame: () => VIEW, createRenderer: () => renderer, requestFrame: () => 1, cancelFrame: () => {} })
    running.push({ engine, host })

    const font = "400 38px '__JetBrains_Mono_1a2b3c', ui-monospace, Menlo, monospace"
    expect(document.fonts.load).toHaveBeenLastCalledWith(font)
    expect(context.font).toBe(font)
    expect(context.fillText).toHaveBeenCalledTimes(RAMP.length)
    loaded()
    await Promise.resolve()
    expect(context.fillText).toHaveBeenCalledTimes(RAMP.length * 2)
  })

  it('keeps the first paint when the font fails to load, and paints nothing after it is disposed', async () => {
    let fail
    document.fonts = { load: vi.fn(() => new Promise((resolve, reject) => { fail = reject })) }
    const failing = start()
    fail(new Error('offline'))
    await Promise.resolve()
    expect(context.fillText).toHaveBeenCalledTimes(RAMP.length)

    let loaded
    document.fonts = { load: vi.fn(() => new Promise((resolve) => { loaded = resolve })) }
    context = fake2d()
    const world = start()
    world.engine.dispose()
    loaded()
    await Promise.resolve()
    expect(context.fillText).toHaveBeenCalledTimes(RAMP.length)
    expect(failing.canvas.isConnected).toBe(true)
  })

  it('runs without a 2D canvas, leaving the cells blank', () => {
    context = null
    const world = start()
    world.tick()

    expect(world.renderer.render).toHaveBeenCalledTimes(2)
  })

  it('cleans up after itself exactly once: canvas, GPU memory, frames and the size watch', () => {
    const world = start()
    const { cells, view, print } = drawn(world)
    const disposed = countDisposals(cells, view, print, print.uniforms.uGlyphs.value)
    world.engine.dispose()
    world.engine.dispose()

    expect(disposed).toHaveBeenCalledTimes(4)
    expect(world.renderer.dispose).toHaveBeenCalledTimes(1)
    expect(world.renderer.forceContextLoss).toHaveBeenCalledTimes(1)
    expect(world.canvas.isConnected).toBe(false)
    expect(world.frames.size).toBe(0)
    expect(observers[0].disconnect).toHaveBeenCalledTimes(1)
    world.tick(2)
    expect(world.onFrame).toHaveBeenCalledTimes(1)
  })

  it("throws when the browser can't make a renderer, leaving nothing behind", () => {
    const host = document.createElement('div')
    const original = new Error('no WebGL')
    const failing = () => createSingularityEngine({ host, onFrame: () => VIEW, createRenderer: () => { throw original } })

    expect(failing).toThrow(WebGLUnavailableError)
    expect(failing).toThrow(expect.objectContaining({ cause: original, name: 'WebGLUnavailableError' }))
    expect(host.children).toHaveLength(0)
  })

  it('leaves the host empty and frees the renderer when building fails after the renderer was made', () => {
    const renderer = fakeRenderer()
    const host = document.createElement('div')
    const broken = new Error('no size')
    Object.defineProperty(host, 'clientWidth', { get: () => { throw broken } })

    expect(() => createSingularityEngine({ host, onFrame: () => VIEW, createRenderer: () => renderer })).toThrow(broken)
    expect(host.children).toHaveLength(0)
    expect(renderer.dispose).toHaveBeenCalledTimes(1)
  })
})
