// @vitest-environment jsdom
// The start flow over the world: the title, the glide in after Play, the pause and controls panels, and where keyboard
// focus goes as they come and go
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, fireEvent, within } from '@testing-library/react'
import { clickDock } from '@/tests/rafeyos/helpers/renderRafeyOS'
import {
  engine, enterGame, hud, openMinecraft, pausePanel, savedBuilds, setUpScene, tearDownScene,
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

describe('the start flow', () => {
  it('glides in on Play, and shows the game once the engine says it arrived', async () => {
    const { ui } = await openMinecraft()

    fireEvent.click(ui.getByRole('button', { name: 'Play' }))
    expect(engine().play).toHaveBeenCalledTimes(1)
    expect(ui.queryByRole('heading', { name: 'Mainland' })).toBeNull()
    expect(ui.queryByRole('toolbar', { name: 'Hotbar' })).toBeNull()

    act(() => {
      engine().options.onHud({ playing: true, selected: 0, position: '' })
      engine().play.mock.calls[0][0]()
    })
    expect(ui.getByRole('toolbar', { name: 'Hotbar' })).toBeTruthy()
    expect(pausePanel(ui)).toBeNull()
  })

  // The same-tick double click, before React re-renders, is useStartFlow.test.js's: this one proves the later click
  it('ignores a second Play click once the glide has started', async () => {
    const { ui } = await openMinecraft()
    const play = ui.getByRole('button', { name: 'Play' })

    fireEvent.click(play)
    fireEvent.click(play)
    expect(engine().play).toHaveBeenCalledTimes(1)
  })

  it('hides the HUD behind the title, and shows it with the scrim gone in the game', async () => {
    const { win, ui } = await openMinecraft()
    const layer = win.querySelector('.bk-hud')
    expect(layer.classList.contains('off')).toBe(true)
    expect(layer.getAttribute('aria-hidden')).toBe('true')
    expect(win.querySelector('.bk-scrim').classList.contains('off')).toBe(false)

    enterGame(ui)
    expect(layer.classList.contains('off')).toBe(false)
    expect(layer.hasAttribute('aria-hidden')).toBe(false)
    expect(win.querySelector('.bk-scrim').classList.contains('off')).toBe(true)
  })

  it('pauses when the player lets go of the mouse, and Resume takes it back', async () => {
    const { ui } = await openMinecraft()
    enterGame(ui)

    hud({ playing: false })
    const panel = pausePanel(ui)
    expect(within(panel).getAllByRole('button').map((button) => button.textContent)).toEqual(['Resume', 'Controls', 'Back to title'])

    fireEvent.click(within(panel).getByRole('button', { name: 'Resume' }))
    expect(engine().capture).toHaveBeenCalledTimes(1)
    hud({ playing: true })
    expect(pausePanel(ui)).toBeNull()
  })

  it('goes back to the title from the pause panel, with the orbit and the HUD hidden again', async () => {
    const { ui } = await openMinecraft()
    enterGame(ui)
    hud({ playing: false })

    fireEvent.click(within(pausePanel(ui)).getByRole('button', { name: 'Back to title' }))
    expect(engine().toTitle).toHaveBeenCalledTimes(1)
    expect(pausePanel(ui)).toBeNull()
    expect(ui.getByRole('heading', { name: 'Mainland' })).toBeTruthy()
    expect(ui.queryByRole('toolbar', { name: 'Hotbar' })).toBeNull()

    fireEvent.click(ui.getByRole('button', { name: 'Play' }))
    expect(engine().play).toHaveBeenCalledTimes(2)
  })

  it('opens Controls from the title in place of the title, and Back returns to it', async () => {
    const { ui } = await openMinecraft()

    fireEvent.click(ui.getByRole('button', { name: 'Controls' }))
    const controls = ui.getByRole('dialog', { name: 'Controls' })
    expect(controls.querySelectorAll('dt')).toHaveLength(8)
    expect(ui.queryByRole('heading', { name: 'Mainland' })).toBeNull()

    fireEvent.click(within(controls).getByRole('button', { name: 'Back' }))
    expect(ui.queryByRole('dialog', { name: 'Controls' })).toBeNull()
    expect(ui.getByRole('heading', { name: 'Mainland' })).toBeTruthy()
  })

  it('opens Controls from the pause panel, and Back returns to the pause panel', async () => {
    const { ui } = await openMinecraft()
    enterGame(ui)
    hud({ playing: false })

    fireEvent.click(within(pausePanel(ui)).getByRole('button', { name: 'Controls' }))
    expect(pausePanel(ui)).toBeNull()
    const controls = ui.getByRole('dialog', { name: 'Controls' })

    fireEvent.click(within(controls).getByRole('button', { name: 'Back' }))
    expect(ui.queryByRole('dialog', { name: 'Controls' })).toBeNull()
    expect(pausePanel(ui)).toBeTruthy()
  })
})

describe('the title', () => {
  const statusLine = (ui) => ui.getByRole('status').textContent

  it.each([
    [0, '512 × 512 · New world'],
    [1, '512 × 512 · 1 block changed'],
    [1234, '512 × 512 · 1,234 blocks changed'],
  ])('describes a world with %i saved changes as "%s"', async (count, copy) => {
    const { ui } = await openMinecraft({ minecraft: savedBuilds(count) })

    expect(statusLine(ui)).toBe(copy)
  })

  it('counts the blocks changed in the game when it comes back', async () => {
    const { ui } = await openMinecraft()
    enterGame(ui)
    act(() => engine().options.onEdit([10, 8]))
    act(() => engine().options.onEdit([11, 8]))
    hud({ playing: false })

    fireEvent.click(within(pausePanel(ui)).getByRole('button', { name: 'Back to title' }))
    expect(statusLine(ui)).toBe('512 × 512 · 2 blocks changed')
  })
})

describe('keyboard focus', () => {
  // A real click focuses the button; jsdom's fireEvent.click doesn't
  const press = (button) => {
    button.focus()
    fireEvent.click(button)
  }
  const focusInHiddenSurface = () => document.activeElement.closest('[aria-hidden="true"]')
  const controlsBack = (ui) => within(ui.getByRole('dialog', { name: 'Controls' })).getByRole('button', { name: 'Back' })
  // Leaving takes the keyboard from the window first; the real engine then reports that it let go of the mouse
  const leaveForTerminal = () => {
    clickDock('Terminal')
    hud({ playing: false })
  }

  it('leaves the title when Play starts the glide, so no hidden button keeps it', async () => {
    const { ui } = await openMinecraft()

    press(ui.getByRole('button', { name: 'Play' }))
    expect(document.activeElement).toBe(document.body)
  })

  it('moves to Back when Controls opens from the title, and to Play when it closes', async () => {
    const { ui } = await openMinecraft()

    press(ui.getByRole('button', { name: 'Controls' }))
    expect(document.activeElement).toBe(controlsBack(ui))

    press(controlsBack(ui))
    expect(document.activeElement).toBe(ui.getByRole('button', { name: 'Play' }))
  })

  it('moves to Resume when Esc lets go of the mouse in the game', async () => {
    const { ui } = await openMinecraft()
    enterGame(ui)

    hud({ playing: false })
    expect(document.activeElement).toBe(within(pausePanel(ui)).getByRole('button', { name: 'Resume' }))
  })

  it('stays with the window the player went to when leaving brings up the pause panel', async () => {
    const { win, ui } = await openMinecraft()
    enterGame(ui)

    leaveForTerminal()
    expect(pausePanel(ui)).toBeTruthy()
    expect(win.contains(document.activeElement)).toBe(false)
  })

  it('leaves Resume alone when the player comes back to the paused window', async () => {
    const { win, ui } = await openMinecraft()
    enterGame(ui)
    leaveForTerminal()

    fireEvent.pointerDown(win)
    expect(win.classList.contains('backdrop')).toBe(false)
    expect(document.activeElement).not.toBe(within(pausePanel(ui)).getByRole('button', { name: 'Resume' }))
  })

  it('moves between the pause panel and Controls, landing on Resume and Back', async () => {
    const { ui } = await openMinecraft()
    enterGame(ui)
    hud({ playing: false })

    press(within(pausePanel(ui)).getByRole('button', { name: 'Controls' }))
    expect(document.activeElement).toBe(controlsBack(ui))

    press(controlsBack(ui))
    expect(document.activeElement).toBe(within(pausePanel(ui)).getByRole('button', { name: 'Resume' }))
  })

  it('lets go when Resume hands the mouse back to the game', async () => {
    const { ui } = await openMinecraft()
    enterGame(ui)
    hud({ playing: false })

    press(within(pausePanel(ui)).getByRole('button', { name: 'Resume' }))
    hud({ playing: true })
    expect(document.activeElement).toBe(document.body)
  })

  it('lands on Play after Back to title', async () => {
    const { ui } = await openMinecraft()
    enterGame(ui)
    hud({ playing: false })

    press(within(pausePanel(ui)).getByRole('button', { name: 'Back to title' }))
    expect(document.activeElement).toBe(ui.getByRole('button', { name: 'Play' }))
    expect(focusInHiddenSurface()).toBeNull()
  })

  it('ignores Controls pressed on the fading title during the glide', async () => {
    const { ui } = await openMinecraft()
    const controls = ui.getByRole('button', { name: 'Controls' })
    fireEvent.click(ui.getByRole('button', { name: 'Play' }))

    press(controls)
    expect(ui.queryByRole('dialog', { name: 'Controls' })).toBeNull()
  })
})

describe('losing the window during the glide', () => {
  it('does not pause the glide, and shows Paused when it lands', async () => {
    const { ui } = await openMinecraft()
    fireEvent.click(ui.getByRole('button', { name: 'Play' }))

    clickDock('Terminal')
    expect(pausePanel(ui)).toBeNull()

    // The engine lands with input not live, since its window lost the keyboard
    act(() => engine().play.mock.lastCall[0]())
    expect(pausePanel(ui)).toBeTruthy()
  })
})
