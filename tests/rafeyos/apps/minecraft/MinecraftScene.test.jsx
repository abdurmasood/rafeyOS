// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, fireEvent, screen, within } from '@testing-library/react'
import { clickDock, memoryStorage, quotaError, refusingWrites, renderDesktop, windowsOf } from '@/tests/rafeyos/helpers/renderRafeyOS'
import { MINECRAFT_KEY, createMinecraftStore } from '@/components/rafeyos/core/minecraft/minecraftStore'

// The real engine needs WebGL; this stand-in records what the scene hands it and what it asks of it
const engines = vi.hoisted(() => ({ made: [], fail: false }))
vi.mock('@/components/rafeyos/apps/minecraft/logic/minecraftEngine', () => {
  class WebGLUnavailableError extends Error {}
  return { WebGLUnavailableError, createMinecraftEngine: (options) => {
    if (engines.fail === 'webgl') throw new WebGLUnavailableError('no WebGL')
    if (engines.fail === 'other') throw new Error('boom')
    const engine = { options, setActive: vi.fn(), setPaused: vi.fn(), capture: vi.fn(), dispose: vi.fn() }
    engines.made.push(engine)
    return engine
  } }
})

// Building the world happens in a worker; this stand-in settles on the next microtask, unless a test settles it by hand.
// Like the real loader, a cancelled load never settles.
const loads = vi.hoisted(() => ({ made: [], manual: false, world: { island: { spawn: {} }, chunkArrays: new Map() } }))
vi.mock('@/components/rafeyos/apps/minecraft/logic/worldLoader', () => ({
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
}))

// The real save queue, with its flush watched
const queues = vi.hoisted(() => ({ made: [] }))
vi.mock('@/components/rafeyos/apps/minecraft/logic/saveQueue', async (importOriginal) => {
  const actual = await importOriginal()
  return {
    ...actual,
    createSaveQueue: (options) => {
      const queue = actual.createSaveQueue(options)
      const watched = { ...queue, flush: vi.fn(queue.flush) }
      queues.made.push(watched)
      return watched
    },
  }
})

const engine = () => engines.made.at(-1)
const load = () => loads.made.at(-1)
const hud = (patch) => act(() => engine().options.onHud({ playing: false, selected: 0, position: '', ...patch }))

beforeEach(() => {
  // jsdom can't draw; the hotbar icons skip drawing without a 2D context
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(null)
})
afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
  engines.made.length = 0
  engines.fail = false
  loads.made.length = 0
  loads.manual = false
  queues.made.length = 0
})

const openMinecraft = async (overrides = {}) => {
  const view = renderDesktop(overrides)
  clickDock('Minecraft')
  const [win] = windowsOf(view.container, 'minecraft')
  await within(win).findByRole('toolbar', { name: 'Hotbar' }, { timeout: 5000 })
  return { ...view, win, ui: within(win) }
}

describe('Minecraft scene', () => {
  it('asks the player to click in, then hands the mouse to the engine', async () => {
    const { ui } = await openMinecraft()

    fireEvent.click(ui.getByRole('button', { name: 'Click to play' }))
    expect(engine().capture).toHaveBeenCalled()

    hud({ playing: true })
    expect(ui.queryByRole('button', { name: 'Click to play' })).toBeNull()
  })

  it('shows where the player is and which block is picked', async () => {
    const { win, ui } = await openMinecraft()
    hud({ playing: true, selected: 2, position: 'x 1.0 · y 2.0 · z 3.0 · N' })

    expect(ui.getByText('x 1.0 · y 2.0 · z 3.0 · N')).toBeTruthy()
    expect(win.querySelector('.bk-slot[aria-current="true"]').getAttribute('aria-label')).toBe('Stone')
    expect(win.querySelector('.bk-name').textContent).toBe('Stone')
    expect(win.querySelector('.bk-name').classList.contains('on')).toBe(true)
  })

  it('gives the engine the keyboard only while its window is focused, and shows the card again when it is not', async () => {
    const { win, ui } = await openMinecraft()
    expect(engine().setActive).toHaveBeenLastCalledWith(true)
    hud({ playing: true })

    clickDock('Terminal')
    expect(engine().setActive).toHaveBeenLastCalledWith(false)
    expect(ui.getByRole('button', { name: 'Click to play' })).toBeTruthy()

    fireEvent.pointerDown(win)
    expect(engine().setActive).toHaveBeenLastCalledWith(true)
  })

  it('pauses the engine while minimized', async () => {
    const { ui } = await openMinecraft()
    expect(engine().setPaused).toHaveBeenLastCalledWith(false)

    fireEvent.click(ui.getByRole('button', { name: 'Minimize' }))
    expect(engine().setPaused).toHaveBeenLastCalledWith(true)

    clickDock('Minecraft')
    expect(engine().setPaused).toHaveBeenLastCalledWith(false)
  })

  it('stops the engine when the window closes', async () => {
    const { ui } = await openMinecraft()
    const running = engine()

    fireEvent.click(ui.getByRole('button', { name: 'Close' }))
    expect(running.dispose).toHaveBeenCalled()
  })

  it("opens once under StrictMode: the first mount's load is cancelled before it builds anything", async () => {
    await openMinecraft()

    expect(loads.made).toHaveLength(2)
    expect(loads.made[0].cancel).toHaveBeenCalled()
    expect(loads.made[1].cancel).not.toHaveBeenCalled()
    expect(engines.made).toHaveLength(1)
    expect(engine().options).toMatchObject({ island: loads.world.island, chunkArrays: loads.world.chunkArrays })
  })

  it("explains when the browser can't show the world", async () => {
    engines.fail = 'webgl'
    vi.spyOn(console, 'error').mockImplementation(() => {})
    const view = renderDesktop()
    clickDock('Minecraft')

    expect((await screen.findByRole('alert', {}, { timeout: 5000 })).textContent).toContain("Minecraft can't start")
    expect(within(windowsOf(view.container, 'minecraft')[0]).queryByRole('toolbar', { name: 'Hotbar' })).toBeNull()
  })

  it("says it couldn't build the world, and logs why, for any other engine error", async () => {
    engines.fail = 'other'
    const logged = vi.spyOn(console, 'error').mockImplementation(() => {})
    renderDesktop()
    clickDock('Minecraft')

    expect((await screen.findByRole('alert', {}, { timeout: 5000 })).textContent).toContain("Minecraft couldn't build its world")
    expect(logged).toHaveBeenCalledWith(expect.any(String), expect.objectContaining({ message: 'boom' }))
    logged.mockRestore()
  })
})

describe('while the world is being built', () => {
  const openLoading = async () => {
    loads.manual = true
    const view = renderDesktop()
    clickDock('Minecraft')
    const [win] = windowsOf(view.container, 'minecraft')
    const ui = within(win)
    const card = await ui.findByRole('status', {}, { timeout: 5000 })
    return { win, ui, card }
  }

  it('shows a loading card and nothing to play with, then the hotbar once the world is built', async () => {
    const { win, ui, card } = await openLoading()

    expect(card.textContent).toBe('Building the world…')
    expect(win.querySelector('.bk-cover').classList.contains('bk-still')).toBe(true)
    expect(ui.queryByRole('toolbar', { name: 'Hotbar' })).toBeNull()
    expect(ui.queryByRole('button', { name: 'Click to play' })).toBeNull()
    expect(win.querySelector('.bk-pos')).toBeNull()
    expect(engines.made).toHaveLength(0)

    await act(async () => load().resolve(loads.world))
    expect(ui.getByRole('toolbar', { name: 'Hotbar' })).toBeTruthy()
    expect(ui.queryByRole('status')).toBeNull()
    expect(engines.made).toHaveLength(1)
  })

  it('stops loading when the window closes, and never starts an engine', async () => {
    const { ui } = await openLoading()
    const pending = load()

    fireEvent.click(ui.getByRole('button', { name: 'Close' }))
    expect(pending.cancel).toHaveBeenCalled()

    // Even a world that turns up afterwards is ignored
    await act(async () => pending.resolve(loads.world))
    expect(engines.made).toHaveLength(0)
  })

  it('flushes the saves and unhooks them from the page when the window closes mid-load', async () => {
    const { ui } = await openLoading()
    fireEvent.click(ui.getByRole('button', { name: 'Close' }))

    // StrictMode's first mount and the real one each flush once on the way out
    expect(queues.made).toHaveLength(2)
    queues.made.forEach((queue) => expect(queue.flush).toHaveBeenCalledTimes(1))

    vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('hidden')
    act(() => window.dispatchEvent(new Event('pagehide')))
    act(() => document.dispatchEvent(new Event('visibilitychange')))
    queues.made.forEach((queue) => expect(queue.flush).toHaveBeenCalledTimes(1))
  })

  it('shows no failed card for a load it gave up on', async () => {
    const { ui } = await openLoading()

    // StrictMode's first mount cancelled its load at once; a failure from it changes nothing
    await act(async () => loads.made[0].reject(new Error('late')))
    expect(ui.queryByRole('alert')).toBeNull()
    expect(ui.getByRole('status').textContent).toBe('Building the world…')

    const pending = load()
    fireEvent.click(ui.getByRole('button', { name: 'Close' }))
    await act(async () => pending.reject(new Error('late')))
    expect(screen.queryByRole('alert')).toBeNull()
  })

  it("says so when the world couldn't be built", async () => {
    const { ui } = await openLoading()

    await act(async () => load().reject(new Error('out of memory')))
    const alert = ui.getByRole('alert')
    expect(alert.querySelector('h2').textContent).toBe("Minecraft couldn't build its world")
    expect(alert.querySelector('p').textContent).toBe('Close the window and open it again.')
    expect(ui.queryByRole('toolbar', { name: 'Hotbar' })).toBeNull()
  })
})

describe('saved builds', () => {
  const build = () => act(() => engine().options.onEdit([1234, 8]))

  it('come back after closing and reopening the window', async () => {
    const disk = memoryStorage()
    const { ui } = await openMinecraft({ minecraft: createMinecraftStore({ storage: disk }) })
    expect(engine().options.edits).toEqual([])
    build()

    fireEvent.click(ui.getByRole('button', { name: 'Close' }))
    clickDock('Minecraft')
    await screen.findByRole('toolbar', { name: 'Hotbar' }, { timeout: 5000 })

    expect(engine().options.edits).toEqual([[1234, 8]])
    expect(load().options.edits).toEqual([[1234, 8]])
    expect(JSON.parse(disk.getItem(MINECRAFT_KEY)).edits).toEqual([[1234, 8]])
  })

  it('come back after reloading the page', async () => {
    const disk = memoryStorage()
    await openMinecraft({ minecraft: createMinecraftStore({ storage: disk }) })
    build()
    act(() => window.dispatchEvent(new Event('pagehide')))

    cleanup()
    await openMinecraft({ minecraft: createMinecraftStore({ storage: disk }) })
    expect(engine().options.edits).toEqual([[1234, 8]])
  })

  it('are saved when the page is hidden', async () => {
    const disk = memoryStorage()
    await openMinecraft({ minecraft: createMinecraftStore({ storage: disk }) })
    build()
    const visibility = vi.spyOn(document, 'visibilityState', 'get')

    visibility.mockReturnValue('visible')
    act(() => document.dispatchEvent(new Event('visibilitychange')))
    expect(disk.getItem(MINECRAFT_KEY)).toBeNull()

    visibility.mockReturnValue('hidden')
    act(() => document.dispatchEvent(new Event('visibilitychange')))
    expect(JSON.parse(disk.getItem(MINECRAFT_KEY)).edits).toEqual([[1234, 8]])
  })

  it('say so when the browser refuses to save them', async () => {
    const { ui } = await openMinecraft({ minecraft: createMinecraftStore({ storage: refusingWrites(memoryStorage(), quotaError()) }) })
    build()
    act(() => window.dispatchEvent(new Event('pagehide')))

    expect(ui.getByRole('status').textContent).toBe("Not saved: this browser's storage is full.")
  })
})
