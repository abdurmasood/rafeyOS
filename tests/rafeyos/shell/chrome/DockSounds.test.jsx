// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, fireEvent, screen, within } from '@testing-library/react'
import { playSound } from '@/components/ui/sensory-ui/config/engine'
import { packRegistry } from '@/components/ui/sensory-ui/config/registry'
import { clickDock, dock, renderDesktop, rightClick } from '@/tests/rafeyos/helpers/renderRafeyOS'

// Web Audio is the boundary: jsdom has none, so the engine's playSound stands in for the speakers
vi.mock('@/components/ui/sensory-ui/config/engine', async (importOriginal) => ({
  ...(await importOriginal()),
  playSound: vi.fn(async () => null),
}))

// The default pack's sounds, as the engine receives them
const TICK = packRegistry.aero['interaction.subtle']
// The click is a rising tonal pop, unlike the hover's noise tick
const CLICK = packRegistry.aero['navigation.tab']

const button = (name) => within(dock()).getByRole('button', { name })
// React builds pointerenter/leave from pointerover/out
const pointAt = (name, pointerType = 'mouse') => fireEvent.pointerOver(button(name), { pointerType })
const leaveDock = (from) => fireEvent.pointerOut(button(from), { relatedTarget: document.body })
const setVolume = (value) => {
  fireEvent.click(screen.getByRole('button', { name: 'System menu' }))
  const slider = within(screen.getByRole('dialog', { name: 'Quick settings' })).getByRole('slider', { name: 'Volume' })
  fireEvent.change(slider, { target: { value: String(value) } })
}
/** The volume of every play of `sound` so far, in order. */
const playsOf = (sound) => playSound.mock.calls.filter(([source]) => source === sound).map(([, options]) => options.volume)
const ticks = () => playsOf(TICK)
const clicks = () => playsOf(CLICK)
const prefersReducedMotion = () =>
  Object.defineProperty(window, 'matchMedia', {
    configurable: true,
    value: (query) => ({ matches: query.includes('reduce'), addEventListener: () => {}, removeEventListener: () => {} }),
  })

afterEach(() => {
  cleanup()
  vi.clearAllMocks()
  delete window.matchMedia
})

describe('dock hover tick', () => {
  it('ticks once at the system volume when the pointer reaches an icon', () => {
    renderDesktop()

    pointAt('Files')

    // 0.35 (sensory-ui's own level) at the default volume of 70%
    expect(ticks()).toEqual([expect.closeTo(0.245, 5)])
  })

  it('ticks again for each icon the pointer crosses', () => {
    renderDesktop()

    pointAt('Files')
    pointAt('Terminal')
    pointAt('Music')

    expect(ticks()).toHaveLength(3)
  })

  it('stays silent for touch', () => {
    renderDesktop()

    pointAt('Music', 'touch')

    expect(ticks()).toEqual([])
  })

  it('stays silent when the pointer leaves the dock', () => {
    renderDesktop()

    pointAt('Files')
    leaveDock('Files')

    expect(ticks()).toHaveLength(1)
  })

  it('ticks for the icon focused from the keyboard', () => {
    renderDesktop()

    act(() => button('Mail').focus())

    expect(ticks()).toHaveLength(1)
  })

  it('follows the volume slider', () => {
    renderDesktop()

    setVolume(40)
    pointAt('Files')

    expect(ticks()).toEqual([expect.closeTo(0.14, 5)])
  })

  it('does not tick again when the volume changes under a resting pointer', () => {
    renderDesktop()

    pointAt('Files')
    setVolume(40)

    expect(ticks()).toHaveLength(1)
  })

  it('ticks even when the visitor prefers reduced motion', () => {
    prefersReducedMotion()
    renderDesktop()

    pointAt('Files')

    expect(ticks()).toHaveLength(1)
  })
})

describe('dock click sound', () => {
  it('clicks at the system volume when an app icon is clicked', () => {
    renderDesktop()

    clickDock('Files')

    expect(clicks()).toEqual([expect.closeTo(0.245, 5)])
  })

  it('clicks for Trash and Show Apps, the dock buttons that are not apps', () => {
    renderDesktop()

    clickDock('Trash')
    clickDock('Show Apps')

    expect(clicks()).toHaveLength(2)
  })

  it('stays silent on right-click', () => {
    renderDesktop()

    rightClick(button('Files'))

    expect(clicks()).toEqual([])
  })

  it('stays silent for a click on the dock between icons', () => {
    renderDesktop()

    fireEvent.click(dock())
    fireEvent.click(dock().querySelector('.dsep'))

    expect(clicks()).toEqual([])
  })
})
