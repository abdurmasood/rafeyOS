// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, screen, within } from '@testing-library/react'
import { clickDock, dock, flushTimers, renderDesktop, windowsOf } from '@/tests/rafeyos/helpers/renderRafeyOS'

afterEach(() => {
  cleanup()
  vi.useRealTimers()
})

const TRANSFORM = /^translate\(-?[\d.]+px, -?[\d.]+px\) scale\(0?\.\d+\)$/

const activities = () => screen.getByRole('button', { name: 'Activities' })
const overview = () => screen.queryByRole('region', { name: 'Activities overview' })
const search = () => screen.getByLabelText('Type to search')
const typeSearch = (query) => fireEvent.change(search(), { target: { value: query } })
const root = (container) => container.querySelector('.rafeyos')
const workspace = (container) => container.querySelector('.ws')
const showApps = () => within(dock()).getByRole('button', { name: 'Show Apps' })

const withFilesAndTerminal = (overrides) => {
  const view = renderDesktop(overrides)
  clickDock('Files')
  clickDock('Terminal')
  const [files] = windowsOf(view.container, 'files')
  const [terminal] = windowsOf(view.container, 'terminal')
  return { ...view, files, terminal }
}

describe('Activities overview: windows', () => {
  it('opens from the workspace dots: the workspace becomes a card and the windows spread out', () => {
    const { container, files, terminal } = withFilesAndTerminal()

    fireEvent.click(activities())

    expect(overview()).toBeTruthy()
    expect(root(container).classList.contains('ov')).toBe(true)
    expect(root(container).classList.contains('ovhide')).toBe(false)
    expect(workspace(container).style.transform).toMatch(TRANSFORM)
    expect(files.style.transform).toMatch(/^translate\(.+\) scale\(.+\)$/)
    expect(terminal.style.transform).toMatch(/^translate\(.+\) scale\(.+\)$/)
    expect(files.style.transform).not.toBe(terminal.style.transform)
    expect(files.style.transformOrigin).toBe('0 0')
    expect(activities().getAttribute('aria-pressed')).toBe('true')
  })

  it('closes from the dots again, putting everything back', () => {
    const { container, files } = withFilesAndTerminal()

    fireEvent.click(activities())
    fireEvent.click(activities())

    expect(overview()).toBeNull()
    expect(root(container).classList.contains('ov')).toBe(false)
    expect(workspace(container).style.transform).toBe('')
    expect(files.style.transform).toBe('')
  })

  it('animates with a CSS transition unless motion is reduced', () => {
    const moving = withFilesAndTerminal({ reducedMotion: () => false })
    fireEvent.click(activities())
    expect(moving.files.style.transition).toContain('transform 300ms')
    cleanup()

    const still = withFilesAndTerminal()
    fireEvent.click(activities())
    expect(still.files.style.transition).toBe('')
  })

  it('focuses the window picked and leaves', () => {
    const { files, terminal } = withFilesAndTerminal()
    fireEvent.click(activities())

    fireEvent.pointerDown(files, { button: 0 })

    expect(overview()).toBeNull()
    expect(files.classList.contains('backdrop')).toBe(false)
    expect(terminal.classList.contains('backdrop')).toBe(true)
  })

  it('shows minimized windows too, restoring the one picked', () => {
    const { files } = withFilesAndTerminal()
    fireEvent.click(within(files).getAllByRole('button', { name: 'Minimize' })[0])
    expect(files.hidden).toBe(true)

    fireEvent.click(activities())
    expect(files.hidden).toBe(false)
    fireEvent.pointerDown(files, { button: 0 })

    expect(files.hidden).toBe(false)
    expect(files.hasAttribute('data-minimized')).toBe(false)
  })

  it('hides a minimized window again when leaving without picking it', () => {
    vi.useFakeTimers()
    const { files } = withFilesAndTerminal()
    fireEvent.click(within(files).getAllByRole('button', { name: 'Minimize' })[0])
    fireEvent.click(activities())

    fireEvent.keyDown(document.body, { key: 'Escape' })
    flushTimers(0)

    expect(overview()).toBeNull()
    expect(files.hidden).toBe(true)
  })

  it('labels the window under the pointer with its title', () => {
    const { container, files } = withFilesAndTerminal()
    fireEvent.click(activities())

    fireEvent.pointerOver(files)

    const labels = [...container.querySelectorAll('.ovlab')]
    expect(labels.map((label) => label.textContent).sort()).toEqual(['Home', 'visitor@rafey.ai: ~'])
    expect(container.querySelector('.ovlab.on').textContent).toBe('Home')
    fireEvent.pointerLeave(workspace(container))
    expect(container.querySelector('.ovlab.on')).toBeNull()
  })

  it('leaves on a press on empty space, without touching the desktop', () => {
    const { container } = withFilesAndTerminal()
    fireEvent.click(activities())

    fireEvent.pointerDown(screen.getByTestId('wallpaper'), { button: 0 })

    expect(overview()).toBeNull()
    expect(container.querySelector('.rubber').hidden).toBe(true)
    expect(windowsOf(container, 'terminal')[0].classList.contains('backdrop')).toBe(false)
  })

  it('leaves for the top-bar popups', () => {
    renderDesktop()
    fireEvent.click(activities())

    fireEvent.click(screen.getByRole('button', { name: 'Date and time' }))

    expect(overview()).toBeNull()
  })
})

describe('Activities overview: search', () => {
  it('focuses the search field on opening', () => {
    renderDesktop()
    fireEvent.click(activities())

    expect(document.activeElement).toBe(search())
  })

  it('finds files, with the folder they sit in', () => {
    const { container } = renderDesktop()
    fireEvent.click(activities())

    typeSearch('bio')

    const files = within(screen.getByRole('group', { name: 'Files' }))
    const row = files.getByRole('button', { name: /bio\.txt/ })
    expect(row.querySelector('small').textContent).toBe('/home/rafey')
    expect(row.classList.contains('on')).toBe(true)
    expect(root(container).classList.contains('ovhide')).toBe(true)
  })

  it('finds apps, and Enter launches the first result', () => {
    const { container } = renderDesktop()
    fireEvent.click(activities())

    typeSearch('term')
    expect(within(screen.getByRole('group', { name: 'Apps' })).getByRole('button', { name: 'Terminal' })).toBeTruthy()
    fireEvent.keyDown(search(), { key: 'Enter' })

    expect(overview()).toBeNull()
    expect(windowsOf(container, 'terminal')).toHaveLength(1)
  })

  it('opens a Settings page from its result', () => {
    const { container } = renderDesktop()
    fireEvent.click(activities())

    typeSearch('appearance')
    fireEvent.click(within(screen.getByRole('group', { name: 'Settings' })).getByRole('button', { name: /Appearance/ }))

    expect(overview()).toBeNull()
    expect(windowsOf(container, 'settings')[0].getAttribute('aria-label')).toBe('Appearance')
  })

  it('opens a file result in its app', () => {
    const { container } = renderDesktop()
    fireEvent.click(activities())

    typeSearch('bio')
    fireEvent.keyDown(search(), { key: 'Enter' })

    expect(windowsOf(container, 'editor')[0].getAttribute('aria-label')).toBe('bio.txt')
  })

  it('says so when nothing matches, and Enter does nothing', () => {
    const { container } = renderDesktop()
    fireEvent.click(activities())

    typeSearch('zzzz')
    fireEvent.keyDown(search(), { key: 'Enter' })

    expect(screen.getByText('No results.')).toBeTruthy()
    expect(overview()).toBeTruthy()
    expect(container.querySelectorAll('.win')).toHaveLength(0)
  })

  it('brings the windows back when the query is cleared', () => {
    const { files } = withFilesAndTerminal()
    fireEvent.click(activities())

    typeSearch('te')
    expect(files.style.transform).toBe('')
    typeSearch('')

    expect(files.style.transform).toMatch(/scale/)
    expect(search().value).toBe('')
  })

  it('sends typing anywhere in the overview to the search field', () => {
    renderDesktop()
    fireEvent.click(activities())
    search().blur()

    fireEvent.keyDown(document.body, { key: 'b' })

    expect(document.activeElement).toBe(search())
  })

  it('leaves with Esc', () => {
    renderDesktop()
    fireEvent.click(activities())

    fireEvent.keyDown(search(), { key: 'Escape' })

    expect(overview()).toBeNull()
  })
})

describe('Activities overview: app grid', () => {
  it('opens from Show Apps with every app, and Show Apps shows as active', () => {
    const { container } = renderDesktop()

    fireEvent.click(showApps())

    const grid = within(screen.getByRole('group', { name: 'Applications' }))
    expect(grid.getAllByRole('button').map((tile) => tile.textContent)).toEqual([
      'Files', 'Terminal', 'Text Editor', 'Music', 'Mail', 'Projects', 'Settings', 'Blocks',
    ])
    expect(showApps().classList.contains('focused')).toBe(true)
    expect(showApps().getAttribute('aria-pressed')).toBe('true')
    expect(root(container).classList.contains('ovhide')).toBe(true)
  })

  it('closes from Show Apps again', () => {
    renderDesktop()

    fireEvent.click(showApps())
    fireEvent.click(showApps())

    expect(overview()).toBeNull()
    expect(showApps().classList.contains('focused')).toBe(false)
  })

  it('switches from the windows to the grid', () => {
    renderDesktop()
    fireEvent.click(activities())

    fireEvent.click(showApps())

    expect(screen.getByRole('group', { name: 'Applications' })).toBeTruthy()
  })

  it('launches the app clicked, or the first one with Enter', () => {
    const { container } = renderDesktop()
    fireEvent.click(showApps())
    fireEvent.click(within(screen.getByRole('group', { name: 'Applications' })).getByRole('button', { name: 'Mail' }))
    expect(windowsOf(container, 'mail')).toHaveLength(1)
    expect(overview()).toBeNull()

    fireEvent.click(showApps())
    fireEvent.keyDown(search(), { key: 'Enter' })
    expect(windowsOf(container, 'files')).toHaveLength(1)
  })

  it('leaves on a click on the grid between the apps', () => {
    renderDesktop()
    fireEvent.click(showApps())

    fireEvent.click(screen.getByRole('group', { name: 'Applications' }))

    expect(overview()).toBeNull()
  })

  it('leaves before a dock click does its usual thing', () => {
    const { container } = renderDesktop()
    fireEvent.click(showApps())

    clickDock('Terminal')

    expect(overview()).toBeNull()
    expect(windowsOf(container, 'terminal')).toHaveLength(1)
  })

  it('leaves before opening the Trash from the dock', () => {
    const { container } = renderDesktop()
    fireEvent.click(activities())

    clickDock('Trash')

    expect(overview()).toBeNull()
    expect(windowsOf(container, 'files')[0].getAttribute('aria-label')).toBe('Trash')
  })
})
