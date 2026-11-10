// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest'
import { cleanup, fireEvent, screen, within } from '@testing-library/react'
import { chooseMenuItem, clickDock, dock, fsDisk, fsStoreOn, renderDesktop, rightClick, runFsOp, windowsOf } from '@/tests/rafeyos/helpers/renderRafeyOS'
import { remove } from '@/components/rafeyos/core/vfs/fsOps'
import { trashItemPath } from '@/components/rafeyos/core/vfs/documents'

afterEach(cleanup)

const icon = (container, path) => container.querySelector(`.dicon[data-path="${path}"]`)

const desktopWithNote = () => {
  const disk = fsDisk({ '/home/visitor/Desktop/note.txt': 'desk\n' })
  return renderDesktop({ fs: fsStoreOn(disk) })
}

describe('desktop', () => {
  it('lays out Home and the Desktop entries as icons', () => {
    const { container } = renderDesktop()

    const names = [...container.querySelectorAll('.dicon .nm')].map((node) => node.textContent)

    expect(names).toEqual(['Home'])
  })

  it('desktop hides dotfiles', () => {
    const disk = fsDisk({ '/home/visitor/Desktop/note.txt': 'desk\n', '/home/visitor/Desktop/.hidden': 'x\n' })
    const { container } = renderDesktop({ fs: fsStoreOn(disk) })

    expect([...container.querySelectorAll('.dicon .nm')].map((node) => node.textContent)).toEqual(['Home', 'note.txt'])
    expect(icon(container, '/home/visitor/Desktop/.hidden')).toBeNull()
  })

  it('forgets a deleted icon in the selection, so Enter opens the one left', () => {
    const disk = fsDisk({ '/home/visitor/Desktop/notes.txt': 'buy milk\n', '/home/visitor/Desktop/todo.txt': 'call\n' })
    const { container, services } = renderDesktop({ fs: fsStoreOn(disk) })
    const select = (path, options = {}) => {
      fireEvent.pointerDown(icon(container, path), { button: 0, ...options })
      fireEvent.pointerUp(icon(container, path))
    }
    select('/home/visitor/Desktop/notes.txt')
    select('/home/visitor/Desktop/todo.txt', { ctrlKey: true })
    expect(container.querySelectorAll('.dicon.sel')).toHaveLength(2)

    runFsOp(services, remove, { path: '/home/visitor/Desktop/notes.txt' })
    fireEvent.keyDown(container.querySelector('.dicons'), { key: 'Enter' })

    expect(icon(container, '/home/visitor/Desktop/notes.txt')).toBeNull()
    expect(windowsOf(container, 'editor').map((editor) => editor.getAttribute('aria-label'))).toEqual(['todo.txt'])
  })

  it('opens Home in Files on double click', () => {
    const { container } = renderDesktop()

    fireEvent.doubleClick(icon(container, '/home/visitor'))

    const [files] = windowsOf(container, 'files')
    expect(files.getAttribute('aria-label')).toBe('Home')
  })

  it('opens on a single tap with touch', () => {
    const { container } = renderDesktop()
    const home = icon(container, '/home/visitor')

    fireEvent.pointerDown(home, { button: 0, pointerType: 'touch' })
    fireEvent.click(home)

    expect(windowsOf(container, 'files')).toHaveLength(1)
  })

  it('selects on a single click and clears the selection from the wallpaper', () => {
    const { container } = renderDesktop()

    fireEvent.pointerDown(icon(container, '/home/visitor'), { button: 0 })
    expect(icon(container, '/home/visitor').className).toContain('sel')

    fireEvent.pointerDown(screen.getByTestId('wallpaper'), { button: 0 })
    expect(icon(container, '/home/visitor').className).not.toContain('sel')
  })

  it('adds to the selection with Ctrl held', () => {
    const { container } = desktopWithNote()

    fireEvent.pointerDown(icon(container, '/home/visitor'), { button: 0 })
    fireEvent.pointerDown(icon(container, '/home/visitor/Desktop/note.txt'), { button: 0, ctrlKey: true })

    expect(container.querySelectorAll('.dicon.sel')).toHaveLength(2)
  })

  it('opens a file on the desktop in the Text Editor', () => {
    const { container } = desktopWithNote()

    fireEvent.doubleClick(icon(container, '/home/visitor/Desktop/note.txt'))

    const [editor] = windowsOf(container, 'editor')
    expect(editor.getAttribute('aria-label')).toBe('note.txt')
    expect(windowsOf(container, 'files')).toHaveLength(0)
  })

  it('unfocuses windows when the wallpaper is pressed', () => {
    const { container } = renderDesktop()
    clickDock('Files')
    const [files] = windowsOf(container, 'files')
    expect(files.className).not.toContain('backdrop')

    fireEvent.pointerDown(screen.getByTestId('wallpaper'), { button: 0 })

    expect(files.className).toContain('backdrop')
  })

  it('shows the clock as GNOME does', () => {
    const { container } = renderDesktop()

    expect(container.querySelector('.clock').textContent).toBe('Oct 17  21:04')
  })
})

describe('dock', () => {
  it('shows the favourites, then Trash and Show Apps', () => {
    renderDesktop()

    const names = within(dock()).getAllByRole('button').map((button) => button.getAttribute('aria-label'))

    expect(names).toEqual(['Files', 'Terminal', 'Text Editor', 'Music', 'Mail', 'Minecraft', 'Settings', 'Trash', 'Show Apps'])
  })

  it('launches Files, minimizes it on a second click and restores it on a third', () => {
    const { container } = renderDesktop()

    clickDock('Files')
    const [files] = windowsOf(container, 'files')
    expect(files.hidden).toBe(false)
    expect(screen.getByTestId('dots-files').children).toHaveLength(1)
    expect(within(dock()).getByRole('button', { name: 'Files' }).className).toContain('focused')

    clickDock('Files')
    expect(files.dataset.minimized).toBe('true')
    expect(files.hidden).toBe(true)

    clickDock('Files')
    expect(files.dataset.minimized).toBeUndefined()
    expect(files.hidden).toBe(false)
    expect(windowsOf(container, 'files')).toHaveLength(1)
  })

  it('brings an unfocused app forward instead of minimizing it', () => {
    const { container } = renderDesktop()
    clickDock('Files')
    clickDock('Terminal')

    clickDock('Files')

    const [files] = windowsOf(container, 'files')
    expect(files.className).not.toContain('backdrop')
    expect(files.dataset.minimized).toBeUndefined()
  })

  it('opens Trash in Files', () => {
    const { container } = renderDesktop()

    clickDock('Trash')

    const [files] = windowsOf(container, 'files')
    expect(files.getAttribute('aria-label')).toBe('Trash')
    expect(within(files).getByText('Trash is Empty')).toBeTruthy()
  })

  it('puts a sheet in the dock bin while Trash holds a file', () => {
    const disk = fsDisk({ '/home/visitor/Desktop/note.txt': 'desk\n' })
    const { container } = renderDesktop({ fs: fsStoreOn(disk) })
    const paper = () => within(dock()).getByRole('button', { name: 'Trash' }).querySelector('[data-paper]')

    expect(paper()).toBeNull()
    rightClick(icon(container, '/home/visitor/Desktop/note.txt'))
    chooseMenuItem('Move to Trash')
    expect(paper()).toBeTruthy()

    clickDock('Trash')
    const files = windowsOf(container, 'files')[0]
    rightClick(files.querySelector(`[data-path="${trashItemPath('/home/visitor/Desktop/note.txt')}"]`))
    chooseMenuItem('Restore')

    expect(paper()).toBeNull()
    expect(within(files).getByText('Trash is Empty')).toBeTruthy()
  })
})
