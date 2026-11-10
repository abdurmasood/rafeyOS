// @vitest-environment jsdom
// Health over the game, and the death panel: what it says, that it isn't the pause panel, and when Respawn works
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, fireEvent, within } from '@testing-library/react'
import {
  engine, enterGame, hud, openMinecraft, pausePanel, setUpScene, tearDownScene,
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
afterEach(() => {
  vi.useRealTimers()
  tearDownScene()
})

const FELL = { dead: true, health: 0, cause: { kind: 'fall', blocks: 26 } }
const deathPanel = (ui, name = 'You fell 26 blocks') => ui.queryByRole('dialog', { name })
const respawnIn = (ui) => within(deathPanel(ui)).getByRole('button', { name: 'Respawn' })

describe('health on the HUD', () => {
  it('shows a heart for every two halves of health the engine reports', async () => {
    const { ui } = await openMinecraft()
    enterGame(ui)

    expect(ui.getByRole('img', { name: 'Health 10 of 10' })).toBeTruthy()
    hud({ playing: true, health: 13 })
    expect(ui.getByRole('img', { name: 'Health 6.5 of 10' })).toBeTruthy()
  })

  it('flashes red when health drops', async () => {
    const { win, ui } = await openMinecraft()
    enterGame(ui)
    const flash = win.querySelector('.bk-hurt')

    hud({ playing: true, health: 14 })
    expect(flash.classList.contains('on')).toBe(true)
  })

  it('shows air only while it is running out', async () => {
    const { ui } = await openMinecraft()
    enterGame(ui)

    expect(ui.queryByRole('img', { name: /^Air/ })).toBeNull()
    hud({ playing: true, air: 9 })
    expect(ui.getByRole('img', { name: 'Air 5 of 10' })).toBeTruthy()
  })
})

describe('dying', () => {
  it('says how, over the game, with the pause panel kept away though the mouse is free', async () => {
    const { ui } = await openMinecraft()
    enterGame(ui)

    hud(FELL)

    expect(deathPanel(ui)).toBeTruthy()
    expect(within(deathPanel(ui)).getByText('Your builds are kept.')).toBeTruthy()
    expect(pausePanel(ui)).toBeNull()
  })

  it.each([
    [{ kind: 'drown' }, 'You ran out of air'],
    [{ kind: 'shade' }, 'A shade got you'],
    [{ kind: 'creeper' }, 'A creeper got you'],
  ])('names a death by %o "%s"', async (cause, name) => {
    const { ui } = await openMinecraft()
    enterGame(ui)

    hud({ dead: true, health: 0, cause })

    expect(deathPanel(ui, name)).toBeTruthy()
  })

  it('puts focus on Respawn, which does nothing for its first moments', async () => {
    const { ui } = await openMinecraft()
    enterGame(ui)
    vi.useFakeTimers()

    hud(FELL)
    const respawn = respawnIn(ui)
    expect(document.activeElement).toBe(respawn)
    expect(respawn.getAttribute('aria-disabled')).toBe('true')
    fireEvent.click(respawn)
    expect(engine().respawn).not.toHaveBeenCalled()

    act(() => vi.advanceTimersByTime(1700))
    expect(respawn.hasAttribute('aria-disabled')).toBe(false)
    fireEvent.click(respawn)
    expect(engine().respawn).toHaveBeenCalledTimes(1)
  })

  it('goes back to the game once the engine has the mouse again', async () => {
    const { ui } = await openMinecraft()
    enterGame(ui)
    hud(FELL)

    hud({ playing: true, dead: false, cause: null, health: 20 })

    expect(deathPanel(ui)).toBeNull()
    expect(pausePanel(ui)).toBeNull()
    expect(document.activeElement).toBe(document.body)
  })

  it('keeps Controls and the pause buttons from acting under it', async () => {
    const { win, ui } = await openMinecraft()
    enterGame(ui)
    hud(FELL)

    fireEvent.click(win.querySelector('.bk-pause .btn'))

    expect(engine().capture).not.toHaveBeenCalled()
    expect(ui.queryByRole('dialog', { name: 'Controls' })).toBeNull()
  })
})
