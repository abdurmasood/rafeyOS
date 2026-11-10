// Stand-ins for the Minecraft scene's heavy parts, and the steps tests take through its start flow. vi.mock has to sit
// in each test file, so they hand these modules over from their factories:
//   vi.mock('…/logic/minecraftEngine', async () => (await import('…/minecraftSceneFakes')).fakeEngineModule())
import { vi } from 'vitest'
import { act, cleanup, fireEvent, within } from '@testing-library/react'
import { clickDock, renderDesktop, windowsOf } from '@/tests/rafeyos/helpers/renderRafeyOS'

export const engines = { made: [], fail: false }
export const directors = { made: [] }
export const loads = { made: [], manual: false, world: { island: { spawn: {} }, chunkArrays: new Map() } }
export const queues = { made: [] }

/** The real engine needs WebGL; this stand-in records what the scene hands it and what it asks of it. */
export const fakeEngineModule = () => {
  class WebGLUnavailableError extends Error {}
  return { WebGLUnavailableError, createMinecraftEngine: (options) => {
    if (engines.fail === 'webgl') throw new WebGLUnavailableError('no WebGL')
    if (engines.fail === 'other') throw new Error('boom')
    const engine = {
      options, setActive: vi.fn(), setPaused: vi.fn(), capture: vi.fn(), play: vi.fn(), toTitle: vi.fn(), respawn: vi.fn(), dispose: vi.fn(),
    }
    engines.made.push(engine)
    return engine
  } }
}

/** The real director, with the options each one was made with. */
export const fakeDirectorModule = (actual) => ({ ...actual, createStartDirector: (options) => {
  const director = actual.createStartDirector(options)
  directors.made.push({ options, director })
  return director
} })

/**
 * Building the world happens in a worker; this stand-in settles on the next microtask, unless `loads.manual` has a test
 * settle it by hand. Like the real loader, a cancelled load never settles.
 */
export const fakeLoaderModule = () => ({
  loadWorld: (options) => {
    const load = { options, cancelled: false }
    const promise = new Promise((resolve, reject) => Object.assign(load, { resolve, reject }))
    load.cancel = vi.fn(() => {
      load.cancelled = true
    })
    loads.made.push(load)
    if (!loads.manual) {
      queueMicrotask(() => {
        if (!load.cancelled) load.resolve(loads.world)
      })
    }
    return { promise, cancel: load.cancel }
  },
})

/** The real save queue, with its flush watched. */
export const fakeSaveQueueModule = (actual) => ({ ...actual, createSaveQueue: (options) => {
  const queue = actual.createSaveQueue(options)
  const watched = { ...queue, flush: vi.fn(queue.flush) }
  queues.made.push(watched)
  return watched
} })

// Animation frames run only when a test plays them, so the blackout lifts on cue
let frames = new Map()
export const runFrames = () => act(() => {
  const pending = [...frames.values()]
  frames.clear()
  pending.forEach((run) => run(0))
})

export const setUpScene = () => {
  // jsdom can't draw; the hotbar icons skip drawing without a 2D context
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(null)
  frames = new Map()
  let nextFrame = 1
  vi.spyOn(window, 'requestAnimationFrame').mockImplementation((run) => {
    frames.set(nextFrame, run)
    return nextFrame++
  })
  vi.spyOn(window, 'cancelAnimationFrame').mockImplementation((id) => frames.delete(id))
}

export const tearDownScene = () => {
  cleanup()
  vi.restoreAllMocks()
  engines.made.length = 0
  engines.fail = false
  directors.made.length = 0
  loads.made.length = 0
  loads.manual = false
  queues.made.length = 0
}

export const engine = () => engines.made.at(-1)
export const load = () => loads.made.at(-1)
export const hud = (patch) => act(() => engine().options.onHud({ playing: false, selected: 0, position: '', ...patch }))

/** Opens the window from the dock and waits for the title's Play button. */
export const openMinecraft = async (overrides = {}) => {
  const view = renderDesktop(overrides)
  clickDock('Minecraft')
  const [win] = windowsOf(view.container, 'minecraft')
  await within(win).findByRole('button', { name: 'Play' }, { timeout: 5000 })
  return { ...view, win, ui: within(win) }
}

/** What the real engine does when the glide lands: input goes live, then it reports the arrival. */
export const arrive = () => act(() => {
  engine().options.onHud({ playing: true, selected: 0, position: '' })
  engine().play.mock.lastCall[0]()
})
export const enterGame = (ui) => {
  fireEvent.click(ui.getByRole('button', { name: 'Play' }))
  arrive()
}
export const pausePanel = (ui) => ui.queryByRole('dialog', { name: 'Paused' })

/** A store holding `count` changed blocks. */
export const savedBuilds = (count) => ({ load: () => Array.from({ length: count }, (_, i) => [i, 8]), save: () => ({ ok: true }) })
