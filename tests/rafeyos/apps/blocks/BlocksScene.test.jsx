// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, fireEvent, screen, within } from '@testing-library/react'
import { clickDock, memoryStorage, quotaError, refusingWrites, renderDesktop, windowsOf } from '@/tests/rafeyos/helpers/renderRafeyOS'
import { BLOCKS_KEY, createBlocksStore } from '@/components/rafeyos/core/blocks/blocksStore'

// The real engine needs WebGL; this stand-in records what the scene hands it and what it asks of it
const engines = vi.hoisted(() => ({ made: [], fail: false }))
vi.mock('@/components/rafeyos/apps/blocks/logic/blocksEngine', () => ({
  createBlocksEngine: (options) => {
    if (engines.fail) throw new Error('no WebGL')
    const engine = { options, setActive: vi.fn(), setPaused: vi.fn(), capture: vi.fn(), dispose: vi.fn() }
    engines.made.push(engine)
    return engine
  },
}))

const engine = () => engines.made.at(-1)
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
})

const openBlocks = async (overrides = {}) => {
  const view = renderDesktop(overrides)
  clickDock('Blocks')
  const [win] = windowsOf(view.container, 'blocks')
  await within(win).findByRole('toolbar', { name: 'Hotbar' }, { timeout: 5000 })
  return { ...view, win, ui: within(win) }
}

describe('Blocks scene', () => {
  it('asks the player to click in, then hands the mouse to the engine', async () => {
    const { ui } = await openBlocks()

    fireEvent.click(ui.getByRole('button', { name: 'Click to play' }))
    expect(engine().capture).toHaveBeenCalled()

    hud({ playing: true })
    expect(ui.queryByRole('button', { name: 'Click to play' })).toBeNull()
  })

  it('shows where the player is and which block is picked', async () => {
    const { win, ui } = await openBlocks()
    hud({ playing: true, selected: 2, position: 'x 1.0 · y 2.0 · z 3.0 · N' })

    expect(ui.getByText('x 1.0 · y 2.0 · z 3.0 · N')).toBeTruthy()
    expect(win.querySelector('.bk-slot[aria-current="true"]').getAttribute('aria-label')).toBe('Stone')
    expect(win.querySelector('.bk-name').textContent).toBe('Stone')
    expect(win.querySelector('.bk-name').classList.contains('on')).toBe(true)
  })

  it('gives the engine the keyboard only while its window is focused, and shows the card again when it is not', async () => {
    const { win, ui } = await openBlocks()
    expect(engine().setActive).toHaveBeenLastCalledWith(true)
    hud({ playing: true })

    clickDock('Terminal')
    expect(engine().setActive).toHaveBeenLastCalledWith(false)
    expect(ui.getByRole('button', { name: 'Click to play' })).toBeTruthy()

    fireEvent.pointerDown(win)
    expect(engine().setActive).toHaveBeenLastCalledWith(true)
  })

  it('pauses the engine while minimized', async () => {
    const { ui } = await openBlocks()
    expect(engine().setPaused).toHaveBeenLastCalledWith(false)

    fireEvent.click(ui.getByRole('button', { name: 'Minimize' }))
    expect(engine().setPaused).toHaveBeenLastCalledWith(true)

    clickDock('Blocks')
    expect(engine().setPaused).toHaveBeenLastCalledWith(false)
  })

  it('stops the engine when the window closes', async () => {
    const { ui } = await openBlocks()
    const running = engine()

    fireEvent.click(ui.getByRole('button', { name: 'Close' }))
    expect(running.dispose).toHaveBeenCalled()
  })

  it("explains when the browser can't show the world", async () => {
    engines.fail = true
    const view = renderDesktop()
    clickDock('Blocks')

    expect((await screen.findByRole('alert', {}, { timeout: 5000 })).textContent).toContain("Blocks can't start")
    expect(within(windowsOf(view.container, 'blocks')[0]).queryByRole('toolbar', { name: 'Hotbar' })).toBeNull()
  })
})

describe('saved builds', () => {
  const build = () => act(() => engine().options.onEdit([1234, 8]))

  it('come back after closing and reopening the window', async () => {
    const disk = memoryStorage()
    const { ui } = await openBlocks({ blocks: createBlocksStore({ storage: disk }) })
    expect(engine().options.edits).toEqual([])
    build()

    fireEvent.click(ui.getByRole('button', { name: 'Close' }))
    clickDock('Blocks')
    await screen.findByRole('toolbar', { name: 'Hotbar' }, { timeout: 5000 })

    expect(engine().options.edits).toEqual([[1234, 8]])
    expect(JSON.parse(disk.getItem(BLOCKS_KEY)).edits).toEqual([[1234, 8]])
  })

  it('come back after reloading the page', async () => {
    const disk = memoryStorage()
    await openBlocks({ blocks: createBlocksStore({ storage: disk }) })
    build()
    act(() => window.dispatchEvent(new Event('pagehide')))

    cleanup()
    await openBlocks({ blocks: createBlocksStore({ storage: disk }) })
    expect(engine().options.edits).toEqual([[1234, 8]])
  })

  it('are saved when the page is hidden', async () => {
    const disk = memoryStorage()
    await openBlocks({ blocks: createBlocksStore({ storage: disk }) })
    build()
    const visibility = vi.spyOn(document, 'visibilityState', 'get')

    visibility.mockReturnValue('visible')
    act(() => document.dispatchEvent(new Event('visibilitychange')))
    expect(disk.getItem(BLOCKS_KEY)).toBeNull()

    visibility.mockReturnValue('hidden')
    act(() => document.dispatchEvent(new Event('visibilitychange')))
    expect(JSON.parse(disk.getItem(BLOCKS_KEY)).edits).toEqual([[1234, 8]])
  })

  it('say so when the browser refuses to save them', async () => {
    const { ui } = await openBlocks({ blocks: createBlocksStore({ storage: refusingWrites(memoryStorage(), quotaError()) }) })
    build()
    act(() => window.dispatchEvent(new Event('pagehide')))

    expect(ui.getByRole('status').textContent).toBe("Not saved: this browser's storage is full.")
  })
})
