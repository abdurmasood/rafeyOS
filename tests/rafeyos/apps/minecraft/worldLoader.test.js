import { afterEach, describe, expect, it, vi } from 'vitest'
import { loadWorld } from '@/components/rafeyos/apps/minecraft/logic/worldLoader'

const PENDING = Symbol('pending')
/** What a promise has done by now: its value, or PENDING if it hasn't settled. */
const stateOf = (promise) => Promise.race([promise, Promise.resolve(PENDING)])

const meshArrays = () => ({
  positions: new Float32Array(3), uvs: new Float32Array(2), colors: new Float32Array(3), indices: new Uint32Array(3),
  bounds: { center: [0, 0, 0], radius: 1 },
})
/** A tiny stand-in for what the worker posts back: one chunk. */
const builtWorld = () => ({
  island: { blocks: new Uint8Array(4), heights: new Int16Array(2), spawn: { x: 1, y: 2, z: 3, yaw: 0, pitch: 0 } },
  chunks: [{ cx: 0, cz: 0, solid: meshArrays(), water: meshArrays() }],
})

/** Stands in for a Worker: records what it's sent and lets the test fire its events. */
const fakeWorker = () => {
  const listeners = new Map()
  return {
    postMessage: vi.fn(),
    terminate: vi.fn(),
    addEventListener: (type, listener) => listeners.set(type, listener),
    fire: (type, event = {}) => listeners.get(type)?.(event),
  }
}

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('loading the world', () => {
  it('builds it in a worker from the saved edits, then lets the worker go', async () => {
    const worker = fakeWorker()
    const edits = [[5, 8]]
    const { promise } = loadWorld({ edits, createWorker: () => worker })
    expect(worker.postMessage).toHaveBeenCalledWith({ edits })

    const message = builtWorld()
    worker.fire('message', { data: message })
    const { island, chunkArrays } = await promise

    expect(worker.terminate).toHaveBeenCalled()
    expect(Object.isFrozen(island)).toBe(true)
    expect(island).toEqual(message.island)
    expect([...chunkArrays.keys()]).toEqual(['0,0'])
    expect(chunkArrays.get('0,0')).toEqual({ solid: message.chunks[0].solid, water: message.chunks[0].water })
  })

  it('passes the worker\'s progress on and keeps waiting for the world', async () => {
    const worker = fakeWorker()
    const onProgress = vi.fn()
    const { promise } = loadWorld({ edits: [], createWorker: () => worker, onProgress })
    worker.fire('message', { data: { type: 'progress', done: 16, total: 1024 } })

    expect(onProgress).toHaveBeenCalledWith(16, 1024)
    expect(worker.terminate).not.toHaveBeenCalled()
    expect(await stateOf(promise)).toBe(PENDING)
    worker.fire('message', { data: { type: 'world', ...builtWorld() } })
    expect((await promise).chunkArrays.has('0,0')).toBe(true)
  })

  it('starts the worker from its own module', () => {
    const worker = fakeWorker()
    const Worker = vi.fn(function Worker() {
      return worker
    })
    vi.stubGlobal('Worker', Worker)
    loadWorld({ edits: [] })

    expect(String(Worker.mock.calls[0][0])).toMatch(/\/logic\/worldWorker\.js$/)
    expect(worker.postMessage).toHaveBeenCalledWith({ edits: [] })
  })

  it('builds it here instead, on a later turn, when the worker fails', async () => {
    const worker = fakeWorker()
    const schedule = vi.fn()
    const build = vi.fn(builtWorld)
    const edits = [[5, 8]]
    const { promise } = loadWorld({ edits, createWorker: () => worker, schedule, build })
    worker.fire('error')

    expect(worker.terminate).toHaveBeenCalled()
    expect(build).not.toHaveBeenCalled()
    schedule.mock.calls[0][0]()
    expect(build).toHaveBeenCalledWith({ edits })
    expect((await promise).chunkArrays.has('0,0')).toBe(true)
  })

  it('builds it here when the browser has no workers, after the next paint so the loading card shows first', async () => {
    vi.stubGlobal('Worker', undefined)
    const frames = []
    vi.stubGlobal('requestAnimationFrame', vi.fn((run) => frames.push(run)))
    const build = vi.fn(builtWorld)
    const { promise } = loadWorld({ edits: [], build })

    expect(frames).toHaveLength(1)
    frames[0]()
    // Still not: the frame callback runs before the paint, and the build waits for a timeout after it
    expect(build).not.toHaveBeenCalled()
    expect((await promise).island.spawn).toEqual({ x: 1, y: 2, z: 3, yaw: 0, pitch: 0 })
    expect(build).toHaveBeenCalledTimes(1)
  })

  it('builds it here after a timeout where there are no animation frames either', async () => {
    vi.stubGlobal('Worker', undefined)
    vi.stubGlobal('requestAnimationFrame', undefined)
    const build = vi.fn(builtWorld)
    const { promise } = loadWorld({ edits: [], build })

    expect(build).not.toHaveBeenCalled()
    expect((await promise).chunkArrays.size).toBe(1)
  })

  it('builds it here when the browser refuses to start a worker', async () => {
    const refuse = () => {
      throw new DOMException('blocked', 'SecurityError')
    }
    let load
    expect(() => {
      load = loadWorld({ edits: [], createWorker: refuse, schedule: (run) => run(), build: builtWorld })
    }).not.toThrow()

    expect((await load.promise).chunkArrays.size).toBe(1)
  })

  it('rejects when building here fails', async () => {
    const failure = new Error('out of memory')
    const { promise } = loadWorld({
      edits: [], createWorker: () => null, schedule: (run) => run(), build: () => { throw failure },
    })

    await expect(promise).rejects.toBe(failure)
  })
})

describe('cancelling a load', () => {
  it('before its turn comes builds nothing and never settles', async () => {
    const schedule = vi.fn()
    const build = vi.fn(builtWorld)
    const { promise, cancel } = loadWorld({ edits: [], createWorker: () => null, schedule, build })
    cancel()
    schedule.mock.calls[0][0]()

    expect(build).not.toHaveBeenCalled()
    expect(await stateOf(promise)).toBe(PENDING)
  })

  it('ignores progress that arrives after it', () => {
    const worker = fakeWorker()
    const onProgress = vi.fn()
    const { cancel } = loadWorld({ edits: [], createWorker: () => worker, onProgress })
    cancel()
    worker.fire('message', { data: { type: 'progress', done: 16, total: 1024 } })

    expect(onProgress).not.toHaveBeenCalled()
  })

  it('stops the worker, and ignores an answer already on its way', async () => {
    const worker = fakeWorker()
    const { promise, cancel } = loadWorld({ edits: [], createWorker: () => worker })
    cancel()
    worker.fire('message', { data: builtWorld() })

    expect(worker.terminate).toHaveBeenCalled()
    expect(await stateOf(promise)).toBe(PENDING)
  })
})
