// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, screen, within } from '@testing-library/react'
import { clickDock, dock, headerTitle, renderDesktop, settle, windowsOf } from '@/tests/rafeyos/helpers/renderRafeyOS'

// The real room needs WebGL. This stand-in shows what the window hands it.
vi.mock('@/lib/loadStudio', () => ({
  loadStudio: async () =>
    function FakeRoom({ paused }) {
      return <div data-testid="studio-room" data-paused={String(paused)} />
    },
}))

afterEach(() => {
  cleanup()
  window.history.replaceState(null, '', '/')
})

const roomIn = (win) => within(win).getByTestId('studio-room')

const openFromAppGrid = async () => {
  const view = renderDesktop()
  fireEvent.click(within(dock()).getByRole('button', { name: 'Show Apps' }))
  fireEvent.click(within(screen.getByRole('group', { name: 'Applications' })).getByRole('button', { name: 'Rafey' }))
  await settle()
  const [win] = windowsOf(view.container, 'studio')
  return { ...view, win, ui: within(win) }
}

describe('Studio app', () => {
  it('opens from the app grid: the live room under a "Rafey" header bar', async () => {
    const { container, win } = await openFromAppGrid()
    expect(windowsOf(container, 'studio')).toHaveLength(1)
    expect(headerTitle(win)).toBe('Rafey')
    expect(win.getAttribute('aria-label')).toBe('Rafey')
    expect(roomIn(win).dataset.paused).toBe('false')
  })

  it('is not pinned to the dock, but shows there while it is open', async () => {
    renderDesktop()
    expect(within(dock()).queryByRole('button', { name: 'Rafey' })).toBeNull()
    cleanup()
    await openFromAppGrid()
    expect(within(dock()).getByRole('button', { name: 'Rafey' })).toBeTruthy()
  })

  it('stops drawing the room while minimized, and starts again when restored', async () => {
    const { win, ui } = await openFromAppGrid()
    fireEvent.click(ui.getByRole('button', { name: 'Minimize' }))
    expect(roomIn(win).dataset.paused).toBe('true')
    clickDock('Rafey')
    expect(roomIn(win).dataset.paused).toBe('false')
  })

  it('opens straight away from a link to /os?app=studio', async () => {
    window.history.replaceState(null, '', '/os?app=studio&at=45.19')
    const { container } = renderDesktop()
    await settle()
    expect(windowsOf(container, 'studio')).toHaveLength(1)
  })

  it('ignores a link to an app rafeyOS does not have', async () => {
    window.history.replaceState(null, '', '/os?app=photoshop')
    const { container } = renderDesktop()
    await settle()
    expect(container.querySelectorAll('.win')).toHaveLength(0)
  })
})
