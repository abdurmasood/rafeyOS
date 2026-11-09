// @vitest-environment jsdom
// The scene's world and engine: starting and stopping them, loading, saving, and what draws over them. The title,
// pause and controls flow is in MinecraftMenus.test.jsx.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { ServicesContext } from '@/components/rafeyos/state/logic/contexts'
import { MinecraftScene } from '@/components/rafeyos/apps/minecraft/MinecraftScene'
import { clickDock, memoryStorage, quotaError, refusingWrites, renderDesktop, windowsOf } from '@/tests/rafeyos/helpers/renderRafeyOS'
import { MINECRAFT_KEY, createMinecraftStore } from '@/components/rafeyos/core/minecraft/minecraftStore'
import {
  directors, engine, engines, enterGame, hud, load, loads, openMinecraft, pausePanel, queues, runFrames, setUpScene, tearDownScene,
} from '@/tests/rafeyos/apps/minecraft/minecraftSceneFakes'

vi.mock('@/components/rafeyos/apps/minecraft/logic/minecraftEngine', async () =>
  (await import('@/tests/rafeyos/apps/minecraft/minecraftSceneFakes')).fakeEngineModule())
vi.mock('@/components/rafeyos/apps/minecraft/logic/startDirector', async (importOriginal) =>
  (await import('@/tests/rafeyos/apps/minecraft/minecraftSceneFakes')).fakeDirectorModule(await importOriginal()))
vi.mock('@/components/rafeyos/apps/minecraft/logic/worldLoader', async () =>
  (await import('@/tests/rafeyos/apps/minecraft/minecraftSceneFakes')).fakeLoaderModule())
vi.mock('@/components/rafeyos/apps/minecraft/logic/saveQueue', async (importOriginal) =>
  (await import('@/tests/rafeyos/apps/minecraft/minecraftSceneFakes')).fakeSaveQueueModule(await importOriginal()))

beforeEach(setUpScene)
afterEach(tearDownScene)

describe('Minecraft scene', () => {
  it('shows where the player is and which block is picked', async () => {
    const { win, ui } = await openMinecraft()
    enterGame(ui)
    hud({ playing: true, selected: 2, position: 'x 1.0 · y 2.0 · z 3.0 · N' })

    expect(ui.getByText('x 1.0 · y 2.0 · z 3.0 · N')).toBeTruthy()
    expect(win.querySelector('.bk-slot[aria-current="true"]').getAttribute('aria-label')).toBe('Stone')
    expect(win.querySelector('.bk-name').textContent).toBe('Stone')
    expect(win.querySelector('.bk-name').classList.contains('on')).toBe(true)
  })

  it('gives the engine the keyboard only while its window is focused, and pauses the game when it is not', async () => {
    const { win, ui } = await openMinecraft()
    expect(engine().setActive).toHaveBeenLastCalledWith(true)
    enterGame(ui)

    clickDock('Terminal')
    expect(engine().setActive).toHaveBeenLastCalledWith(false)
    expect(pausePanel(ui)).toBeTruthy()
    // As the real engine does: losing the window let go of the mouse
    hud({ playing: false })

    fireEvent.pointerDown(win)
    expect(engine().setActive).toHaveBeenLastCalledWith(true)
    expect(pausePanel(ui)).toBeTruthy()
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

  it("hands the engine a director of its own, made with the visitor's reduced-motion setting", async () => {
    await openMinecraft({ reducedMotion: () => false })

    expect(directors.made).toHaveLength(1)
    expect(directors.made[0].options).toEqual({ reducedMotion: false })
    expect(engine().options.director).toBe(directors.made[0].director)
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
    const status = await ui.findByText('Shaping terrain', {}, { timeout: 5000 })
    return { win, ui, status }
  }
  const report = (done, total) => act(() => load().options.onProgress(done, total))
  // The scene alone, without the desktop, so a test can swap the store under it
  const sceneOn = (store) => (
    <ServicesContext.Provider value={{ minecraft: store, reducedMotion: () => true }}><MinecraftScene active paused={false} /></ServicesContext.Provider>
  )
  const freshStore = () => createMinecraftStore({ storage: memoryStorage() })

  it('shows the Mainland title and nothing to play with, then Play on the same title once the world is built', async () => {
    const { win, ui, status } = await openLoading()
    const title = win.querySelector('.bk-title')

    expect(ui.getByRole('heading', { name: 'Mainland' })).toBeTruthy()
    expect(status.getAttribute('role')).toBe('status')
    expect(win.querySelector('.bk-cover')).toBeNull()
    expect(win.querySelector('.bk-hud')).toBeNull()
    expect(ui.queryByRole('button', { name: 'Play' })).toBeNull()
    expect(engines.made).toHaveLength(0)

    await act(async () => load().resolve(loads.world))
    expect(win.querySelector('.bk-title')).toBe(title)
    expect(ui.getByRole('button', { name: 'Play' })).toBeTruthy()
    expect(ui.queryByText('Shaping terrain')).toBeNull()
    expect(engines.made).toHaveLength(1)
  })

  it('lifts the blackout on the first frame after the world is ready', async () => {
    const { win } = await openLoading()
    const blackout = win.querySelector('.bk-blackout')
    runFrames()
    expect(blackout.classList.contains('lift')).toBe(false)

    await act(async () => load().resolve(loads.world))
    expect(blackout.classList.contains('lift')).toBe(false)

    runFrames()
    expect(blackout.classList.contains('lift')).toBe(true)
  })

  it('shows the real chunk count as the worker reports it', async () => {
    const { ui } = await openLoading()

    await report(608, 1024)
    expect(ui.getByRole('status').textContent).toBe('Building chunks · 608 / 1,024')

    await report(1024, 1024)
    expect(ui.getByRole('status').textContent).toBe('Building chunks · 1,024 / 1,024')
  })

  it('starts again from "Shaping terrain" when the scene restarts on another store', async () => {
    loads.manual = true
    const { rerender } = render(sceneOn(freshStore()))
    await act(async () => load().options.onProgress(1024, 1024))
    expect(screen.getByRole('status').textContent).toBe('Building chunks · 1,024 / 1,024')

    rerender(sceneOn(freshStore()))
    expect(screen.getByRole('status').textContent).toBe('Shaping terrain')
  })

  it('brings the blackout back when the scene restarts on another store', async () => {
    loads.manual = true
    const { container, rerender } = render(sceneOn(freshStore()))
    await act(async () => load().resolve(loads.world))
    runFrames()
    expect(container.querySelector('.bk-blackout').classList.contains('lift')).toBe(true)

    rerender(sceneOn(freshStore()))
    expect(container.querySelector('.bk-blackout').classList.contains('lift')).toBe(false)
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
    expect(ui.getByText('Shaping terrain')).toBeTruthy()

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
    await screen.findByRole('button', { name: 'Play' }, { timeout: 5000 })

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

  it('say so when the browser refuses to save them, even on the title where the HUD is hidden', async () => {
    const { win, ui } = await openMinecraft({ minecraft: createMinecraftStore({ storage: refusingWrites(memoryStorage(), quotaError()) }) })
    build()
    act(() => window.dispatchEvent(new Event('pagehide')))

    const note = ui.getByText("Not saved: this browser's storage is full.")
    expect(win.querySelector('.bk-hud').classList.contains('off')).toBe(true)
    expect(note.closest('[aria-hidden="true"]')).toBeNull()
  })
})
