// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, screen, within } from '@testing-library/react'
import { clickDock, headerTitle, renderDesktop, settle, windowsOf } from '@/tests/rafeyos/helpers/renderRafeyOS'

// The real scene needs WebGL. This stand-in shows the props the window hands it.
vi.mock('@/lib/loadBlocks', () => ({
  loadBlocks: async () => ({
    default: function FakeScene({ active, paused }) {
      return <div data-testid="blocks-scene" data-active={String(active)} data-paused={String(paused)} />
    },
  }),
}))

afterEach(cleanup)

const sceneIn = (win) => within(win).getByTestId('blocks-scene')

const openBlocks = async () => {
  const view = renderDesktop()
  clickDock('Blocks')
  await settle()
  const [win] = windowsOf(view.container, 'blocks')
  return { ...view, win, ui: within(win) }
}

describe('Blocks app', () => {
  it('opens from the dock with the scene under a single "Blocks" header bar', async () => {
    const { container, win } = await openBlocks()

    expect(windowsOf(container, 'blocks')).toHaveLength(1)
    expect(win.querySelectorAll('.hb')).toHaveLength(1)
    expect(headerTitle(win)).toBe('Blocks')
    expect(win.getAttribute('aria-label')).toBe('Blocks')
    expect(sceneIn(win).dataset).toMatchObject({ active: 'true', paused: 'false' })
  })

  it('has a close button, since the scene draws no chrome of its own', async () => {
    const { ui } = await openBlocks()

    expect(ui.getByRole('button', { name: 'Close' })).toBeTruthy()
  })

  it('only takes the keyboard while its window is focused', async () => {
    const { win } = await openBlocks()

    clickDock('Terminal')
    expect(sceneIn(win).dataset.active).toBe('false')

    fireEvent.pointerDown(win)
    expect(sceneIn(win).dataset.active).toBe('true')
  })

  it('leaves the keyboard to the Activities overview while it is open', async () => {
    const { win } = await openBlocks()

    fireEvent.click(screen.getByRole('button', { name: 'Activities' }))
    expect(sceneIn(win).dataset.active).toBe('false')
  })

  it('pauses the scene while minimized, and resumes when restored', async () => {
    const { win, ui } = await openBlocks()

    fireEvent.click(ui.getByRole('button', { name: 'Minimize' }))
    expect(sceneIn(win).dataset.paused).toBe('true')

    clickDock('Blocks')
    expect(sceneIn(win).dataset.paused).toBe('false')
  })
})
