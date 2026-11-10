// @vitest-environment jsdom
// Accessibility audit through RTL's role queries: names, roles and keyboard paths
import { afterEach, describe, expect, it } from 'vitest'
import { act, cleanup, fireEvent, screen, within } from '@testing-library/react'
import { clickDock, dock, openPowerMenu, renderDesktop, rightClick, settle, windowsOf } from '@/tests/rafeyos/helpers/renderRafeyOS'
import { overviewApps } from '@/components/rafeyos/shell/overview/logic/overviewSearch'
import { getApp } from '@/components/rafeyos/core/catalog/apps'

afterEach(cleanup)

// Pinned apps from the dock, the rest (like Studio) from the app grid
const launch = (name) => {
  if (within(dock()).queryByRole('button', { name })) return clickDock(name)
  fireEvent.click(within(dock()).getByRole('button', { name: 'Show Apps' }))
  fireEvent.click(within(screen.getByRole('group', { name: 'Applications' })).getByRole('button', { name }))
}

const openEveryApp = () => {
  const view = renderDesktop()
  overviewApps().forEach((id) => launch(getApp(id).name))
  return view
}

describe('accessible names', () => {
  it('gives every button a name, with every app open', () => {
    openEveryApp()

    expect(screen.queryAllByRole('button', { name: '' })).toEqual([])
  })

  it('names the shell popovers and the overview controls too', () => {
    renderDesktop()
    fireEvent.click(screen.getByRole('button', { name: 'System menu' }))
    fireEvent.click(screen.getByRole('button', { name: 'Power Off / Log Out' }))
    expect(screen.queryAllByRole('button', { name: '' })).toEqual([])

    fireEvent.click(screen.getByRole('button', { name: 'Date and time' }))
    expect(screen.queryAllByRole('button', { name: '' })).toEqual([])

    fireEvent.click(within(dock()).getByRole('button', { name: 'Show Apps' }))
    expect(screen.queryAllByRole('button', { name: '' })).toEqual([])
  })

  it('labels every slider and text field', () => {
    openEveryApp()
    fireEvent.click(screen.getByRole('button', { name: 'System menu' }))

    expect(screen.getAllByRole('slider').every((slider) => slider.getAttribute('aria-label'))).toBe(true)
    expect(screen.getByRole('slider', { name: 'Volume' })).toBeTruthy()
    expect(screen.getByRole('slider', { name: 'Position' })).toBeTruthy()
    expect(screen.queryAllByRole('textbox', { name: '' })).toEqual([])
  })
})

describe('roles', () => {
  it('makes each window a dialog named by its title', () => {
    const { container } = openEveryApp()

    const windows = [...container.querySelectorAll('.win')]
    windows.forEach((win) => {
      expect(win.getAttribute('role')).toBe('dialog')
      expect(screen.getAllByRole('dialog', { name: win.getAttribute('aria-label') })).toContain(win)
    })
    expect(screen.getByRole('dialog', { name: 'Home' })).toBe(windowsOf(container, 'files')[0])
  })

  it('uses switches with a checked state', () => {
    renderDesktop()
    fireEvent.click(screen.getByRole('button', { name: 'Date and time' }))

    const dnd = screen.getByRole('switch', { name: 'Do Not Disturb' })
    expect(dnd.getAttribute('aria-checked')).toBe('false')
    fireEvent.click(dnd)
    expect(dnd.getAttribute('aria-checked')).toBe('true')
  })

  it('announces banners politely', async () => {
    renderDesktop()
    clickDock('Music')
    fireEvent.click(screen.getByRole('button', { name: 'Play' }))
    await settle()

    expect(screen.getByRole('status').getAttribute('aria-live')).toBe('polite')
  })

  it('labels the overview as a region with a search field', () => {
    renderDesktop()
    fireEvent.click(screen.getByRole('button', { name: 'Activities' }))

    expect(within(screen.getByRole('region', { name: 'Activities overview' })).getByRole('textbox', { name: 'Type to search' })).toBeTruthy()
  })
})

describe('menus', () => {
  it('focuses the first item, moves with the arrows (wrapping) and Home/End, and runs one with Enter', () => {
    const { container } = renderDesktop()
    rightClick(screen.getByTestId('wallpaper'))
    const menu = screen.getByRole('menu')
    const enabled = within(menu).getAllByRole('menuitem').filter((item) => !item.disabled)

    expect(document.activeElement).toBe(enabled[0])
    fireEvent.keyDown(document.activeElement, { key: 'ArrowDown' })
    expect(document.activeElement).toBe(enabled[1])
    fireEvent.keyDown(document.activeElement, { key: 'ArrowUp' })
    fireEvent.keyDown(document.activeElement, { key: 'ArrowUp' })
    expect(document.activeElement).toBe(enabled[enabled.length - 1])
    fireEvent.keyDown(document.activeElement, { key: 'Home' })
    expect(document.activeElement).toBe(enabled[0])
    fireEvent.keyDown(document.activeElement, { key: 'End' })
    expect(document.activeElement).toBe(enabled[enabled.length - 1])

    fireEvent.keyDown(document.activeElement, { key: 'Home' })
    fireEvent.keyDown(document.activeElement, { key: 'ArrowDown' })
    fireEvent.keyDown(document.activeElement, { key: 'ArrowDown' })
    expect(document.activeElement.textContent).toBe('Show Desktop in Files')
    fireEvent.keyDown(document.activeElement, { key: 'Enter' })

    expect(screen.queryByRole('menu')).toBeNull()
    expect(windowsOf(container, 'files')).toHaveLength(1)
  })

  it('lights the focused item only once a key is pressed', () => {
    renderDesktop()
    rightClick(screen.getByTestId('wallpaper'))
    const menu = screen.getByRole('menu')

    expect(document.activeElement.textContent).toBe('New Folder…')
    expect(menu.classList.contains('kbd')).toBe(false)
    fireEvent.keyDown(document.activeElement, { key: 'ArrowDown' })
    expect(menu.classList.contains('kbd')).toBe(true)
  })

  it('closes on Tab', () => {
    renderDesktop()
    rightClick(screen.getByTestId('wallpaper'))

    fireEvent.keyDown(document.activeElement, { key: 'Tab' })

    expect(screen.queryByRole('menu')).toBeNull()
  })
})

describe('dialogs', () => {
  it('take focus, keep Tab inside, and close with Esc', () => {
    renderDesktop()
    openPowerMenu()
    fireEvent.click(screen.getByRole('button', { name: 'Log Out…' }))
    const dialog = screen.getByRole('dialog', { name: 'Log Out' })
    const buttons = within(dialog).getAllByRole('button')

    expect(dialog.getAttribute('aria-modal')).toBe('true')
    expect(document.activeElement).toBe(buttons[0])
    buttons[buttons.length - 1].focus()
    fireEvent.keyDown(document.activeElement, { key: 'Tab' })
    expect(document.activeElement).toBe(buttons[0])
    fireEvent.keyDown(document.activeElement, { key: 'Tab', shiftKey: true })
    expect(document.activeElement).toBe(buttons[buttons.length - 1])
    document.body.focus()
    fireEvent.keyDown(document.body, { key: 'Tab' })
    expect(document.activeElement).toBe(buttons[0])

    fireEvent.keyDown(document.activeElement, { key: 'Escape' })
    expect(screen.queryByRole('dialog', { name: 'Log Out' })).toBeNull()
  })

  it('give focus back to where it was', () => {
    const { container } = renderDesktop()
    clickDock('Files')
    const [files] = windowsOf(container, 'files')
    fireEvent.click(within(files).getByRole('button', { name: 'contact' }))
    const body = within(files).getByLabelText('Files')
    act(() => body.focus())
    fireEvent.keyDown(body, { key: 'End' })
    fireEvent.keyDown(body, { key: 'Enter' })
    expect(document.activeElement).toBe(within(screen.getByRole('dialog', { name: 'Open Link' })).getByRole('button', { name: 'Cancel' }))

    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }))

    expect(document.activeElement).toBe(body)
  })
})

describe('keyboard selection', () => {
  it('reaches the desktop icons with Tab; arrows select, Enter opens', () => {
    const { container } = renderDesktop()
    const desktop = screen.getByRole('listbox', { name: 'Desktop' })
    expect(desktop.tabIndex).toBe(0)
    act(() => desktop.focus())

    fireEvent.keyDown(desktop, { key: 'ArrowDown' })
    expect(within(desktop).getByRole('option', { selected: true }).textContent).toBe('Home')
    fireEvent.keyDown(desktop, { key: 'ArrowDown' })
    expect(within(desktop).getByRole('option', { selected: true }).textContent).toBe('Home')
    fireEvent.keyDown(desktop, { key: 'Enter' })

    expect(windowsOf(container, 'files')[0].getAttribute('aria-label')).toBe('Home')
  })

  it('moves through the Files grid with the arrows, and Enter opens', () => {
    const { container } = renderDesktop()
    clickDock('Files')
    const [files] = windowsOf(container, 'files')
    const body = within(files).getByLabelText('Files')
    const options = within(files).getAllByRole('option')

    fireEvent.keyDown(body, { key: 'ArrowRight' })
    expect(options[0].getAttribute('aria-selected')).toBe('true')
    fireEvent.keyDown(body, { key: 'ArrowRight' })
    expect(options[1].getAttribute('aria-selected')).toBe('true')
    fireEvent.keyDown(body, { key: 'ArrowLeft' })
    fireEvent.keyDown(body, { key: 'Enter' })

    expect(files.getAttribute('aria-label')).toBe(options[0].textContent)
  })

  it('ignores other keys and Alt+arrows in the Files grid', () => {
    const { container } = renderDesktop()
    clickDock('Files')
    const [files] = windowsOf(container, 'files')
    const body = within(files).getByLabelText('Files')

    fireEvent.keyDown(body, { key: 'x' })
    fireEvent.keyDown(body, { key: 'ArrowRight', altKey: true })

    expect(within(files).queryAllByRole('option', { selected: true })).toEqual([])
  })
})
