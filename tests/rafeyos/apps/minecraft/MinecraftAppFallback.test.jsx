// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, within } from '@testing-library/react'
import { clickDock, renderDesktop, windowsOf } from '@/tests/rafeyos/helpers/renderRafeyOS'

// The scene's chunk never arrives, so the Suspense fallback stays on screen. Its own file because the app
// lazy-loads the chunk once per module, so a resolved load in another test would hide the fallback.
vi.mock('@/lib/loadMinecraft', () => ({ loadMinecraft: () => new Promise(() => {}) }))

afterEach(cleanup)

describe('Minecraft app while its scene chunk loads', () => {
  it('shows the Mainland title and "Shaping terrain"', () => {
    const view = renderDesktop()
    clickDock('Minecraft')
    const [win] = windowsOf(view.container, 'minecraft')
    const ui = within(win)

    expect(ui.getByRole('heading', { name: 'Mainland' })).toBeTruthy()
    expect(ui.getByRole('status').textContent).toBe('Shaping terrain')
    expect(win.querySelector('.minecraft .bk-title')).toBeTruthy()
  })
})
