// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, fireEvent, screen, within } from '@testing-library/react'
import { BOUNCE_MS } from '@/components/rafeyos/shell/chrome/Dock'
import { clickDock, dock, renderDesktop } from '@/tests/rafeyos/helpers/renderRafeyOS'

const APPS = ['Files', 'Terminal', 'Text Editor', 'Music', 'Mail', 'Minecraft', 'Settings']
// 40px icons sit in 46px buttons; the hovered one grows ×1.72, its neighbours ×1.46, the next ×1.22
const REST = 46

let frames
let nextFrame
let clock

/** requestAnimationFrame and the clock under the test's control: runFrame() plays one 60 fps frame. */
const controlFrames = () => {
  frames = new Map()
  nextFrame = 1
  clock = 0
  vi.spyOn(performance, 'now').mockImplementation(() => clock)
  vi.spyOn(window, 'requestAnimationFrame').mockImplementation((callback) => {
    frames.set(nextFrame, callback)
    return nextFrame++
  })
  vi.spyOn(window, 'cancelAnimationFrame').mockImplementation((id) => frames.delete(id))
}

const runFrame = () => {
  const pending = [...frames.values()]
  frames.clear()
  clock += 1000 / 60
  pending.forEach((callback) => callback(clock))
}

const settle = () => {
  for (let frame = 0; frame < 300 && frames.size > 0; frame++) runFrame()
}

const button = (name) => within(dock()).getByRole('button', { name })
const widthOf = (name) => Math.round(parseFloat(button(name).style.width) * 100) / 100
// React builds pointerenter/leave from pointerover/out
const pointAt = (name, pointerType = 'mouse') => fireEvent.pointerOver(button(name), { pointerType })
const pointAway = (from) => fireEvent.pointerOut(button(from), { relatedTarget: document.body })

beforeEach(controlFrames)

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
})

describe('dock magnification', () => {
  it('swells the hovered icon and its neighbours, and labels only the hovered one', () => {
    renderDesktop({ reducedMotion: () => false })

    pointAt('Music')
    settle()

    expect(APPS.map(widthOf)).toEqual([46, 56.12, 67.16, 79.12, 67.16, 56.12, 46])
    expect(button('Music').style.height).toBe('79.12px')
    expect(button('Music').classList.contains('hot')).toBe(true)
    expect(button('Mail').classList.contains('hot')).toBe(false)
  })

  it('springs a little past the target before settling', () => {
    renderDesktop({ reducedMotion: () => false })
    const widths = []

    pointAt('Music')
    for (let frame = 0; frame < 30; frame++) {
      runFrame()
      widths.push(widthOf('Music'))
    }

    expect(Math.max(...widths)).toBeGreaterThan(79.12)
  })

  it('stops asking for frames once every icon has settled', () => {
    renderDesktop({ reducedMotion: () => false })

    pointAt('Music')
    settle()

    expect(frames.size).toBe(0)
  })

  it('springs back to rest when the pointer leaves the dock', () => {
    renderDesktop({ reducedMotion: () => false })
    pointAt('Music')
    settle()

    pointAway('Music')
    settle()

    expect(APPS.map(widthOf)).toEqual(APPS.map(() => REST))
    expect(dock().querySelector('.hot')).toBeNull()
  })

  it('swells Trash and Show Apps apart from the apps', () => {
    renderDesktop({ reducedMotion: () => false })

    pointAt('Trash')
    settle()

    expect(widthOf('Trash')).toBe(79.12)
    expect(widthOf('Show Apps')).toBe(67.16)
    expect(widthOf('Settings')).toBe(REST)
  })

  it('ignores touch', () => {
    renderDesktop({ reducedMotion: () => false })

    pointAt('Music', 'touch')

    expect(frames.size).toBe(0)
    expect(button('Music').classList.contains('hot')).toBe(false)
  })

  it('magnifies the icon focused from the keyboard', () => {
    renderDesktop({ reducedMotion: () => false })

    act(() => button('Mail').focus())
    settle()

    expect(widthOf('Mail')).toBe(79.12)
    expect(button('Mail').classList.contains('hot')).toBe(true)
  })

  it('stays swollen under the pointer while its right-click menu takes focus', () => {
    renderDesktop({ reducedMotion: () => false })
    pointAt('Music')
    // Chrome focuses a button on right mouse down
    act(() => button('Music').focus())
    settle()

    fireEvent.contextMenu(button('Music'))
    settle()

    expect(document.activeElement.getAttribute('role')).toBe('menuitem')

    expect(widthOf('Music')).toBe(79.12)
    expect(button('Music').classList.contains('hot')).toBe(true)
  })

  it('holds a right-clicked icon swollen while the pointer moves onto its menu', () => {
    renderDesktop({ reducedMotion: () => false })
    pointAt('Music')
    settle()

    fireEvent.contextMenu(button('Music'))
    pointAway('Music')
    settle()

    expect(APPS.map(widthOf)).toEqual([46, 56.12, 67.16, 79.12, 67.16, 56.12, 46])
  })

  it('lets a held icon go once an item from its menu is chosen', () => {
    renderDesktop({ reducedMotion: () => false })
    pointAt('Music')
    fireEvent.contextMenu(button('Music'))
    pointAway('Music')
    settle()

    fireEvent.click(screen.getByRole('menuitem', { name: 'New Window' }))
    settle()

    expect(APPS.map(widthOf)).toEqual(APPS.map(() => REST))
  })

  it('lets a held icon go when a click elsewhere closes its menu', () => {
    renderDesktop({ reducedMotion: () => false })
    pointAt('Trash')
    fireEvent.contextMenu(button('Trash'))
    pointAway('Trash')
    settle()
    expect(widthOf('Trash')).toBe(79.12)

    fireEvent.pointerDown(document.querySelector('.rafeyos'))
    settle()

    expect(widthOf('Trash')).toBe(REST)
  })

  it('leaves an icon at rest when a mouse-picked menu item hands focus back to it', () => {
    renderDesktop({ reducedMotion: () => false })
    // Chrome doesn't count focus restored after a mouse click as :focus-visible
    const matches = Element.prototype.matches
    vi.spyOn(Element.prototype, 'matches').mockImplementation(function matchesWithoutFocusVisible(selector) {
      return selector === ':focus-visible' ? false : matches.call(this, selector)
    })

    act(() => button('Mail').focus())
    settle()

    expect(widthOf('Mail')).toBe(REST)
    expect(button('Mail').classList.contains('hot')).toBe(false)
  })

  it('springs back to rest when keyboard focus leaves the dock', () => {
    renderDesktop({ reducedMotion: () => false })
    act(() => button('Mail').focus())
    settle()

    act(() => button('Mail').blur())
    settle()

    expect(APPS.map(widthOf)).toEqual(APPS.map(() => REST))
  })

  it('snaps straight to size with reduced motion', () => {
    renderDesktop()

    pointAt('Music')
    runFrame()

    expect(widthOf('Music')).toBe(79.12)
    expect(frames.size).toBe(0)
  })

  it('stops its frame loop on unmount', () => {
    renderDesktop({ reducedMotion: () => false })
    pointAt('Music')

    cleanup()

    expect(window.cancelAnimationFrame).toHaveBeenCalled()
    expect(frames.size).toBe(0)
  })
})

describe('dock launch bounce', () => {
  beforeEach(() => vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] }))
  afterEach(() => vi.useRealTimers())

  it('bounces an app that is not running yet, for one bounce', () => {
    renderDesktop({ reducedMotion: () => false })

    clickDock('Mail')
    expect(button('Mail').classList.contains('bounce')).toBe(true)

    act(() => vi.advanceTimersByTime(BOUNCE_MS))
    expect(button('Mail').classList.contains('bounce')).toBe(false)
  })

  it('does not bounce an app that is already running', () => {
    renderDesktop({ reducedMotion: () => false })
    clickDock('Mail')
    act(() => vi.advanceTimersByTime(BOUNCE_MS))

    clickDock('Mail')

    expect(button('Mail').classList.contains('bounce')).toBe(false)
  })

  it('does not bounce with reduced motion', () => {
    renderDesktop()

    clickDock('Mail')

    expect(button('Mail').classList.contains('bounce')).toBe(false)
  })
})
