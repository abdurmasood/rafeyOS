// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { resetSharedStore, sharedVfs } from '@/tests/home/helpers/homeStore'
import { HOME, RAFEY_HOME } from '@/components/rafeyos/core/vfs/buildVfs'

vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn() }) }))
vi.mock('@/lib/loadRafeyOS', () => ({ loadRafeyOS: vi.fn(() => Promise.resolve({})) }))

const { default: Terminal } = await import('@/components/home/Terminal')
const { TerminalProvider } = await import('@/components/home/TerminalProvider')

const SAVE_QUESTION = 'Save modified buffer?  Y Yes  N No  ^C Cancel'

const Page = () => <TerminalProvider><Terminal /></TerminalProvider>

const input = () => screen.getByLabelText('terminal input')
const queryInput = () => screen.queryByLabelText('terminal input')
const buffer = () => screen.getByLabelText('nano buffer')
const queryBuffer = () => screen.queryByLabelText('nano buffer')

const run = (command) => {
  fireEvent.change(input(), { target: { value: command } })
  return fireEvent.keyDown(input(), { key: 'Enter' })
}
const edit = (text) => fireEvent.change(buffer(), { target: { value: text } })
const ctrl = (key) => fireEvent.keyDown(buffer(), { key, ctrlKey: true })
const press = (key) => fireEvent.keyDown(buffer(), { key })

const nano = (container) => container.querySelector('.nano')
const title = (container) => nano(container).querySelector('.nano-title').textContent
const status = (container) => nano(container).querySelector('.nano-status').textContent
const fileText = (path) => sharedVfs()[path]?.text

/** In the visitor's home, with `a.txt` holding `hi`. */
const withFile = () => {
  const view = render(<Page />)
  run('cd ~')
  run('echo hi > a.txt')
  return view
}

beforeEach(() => {
  resetSharedStore()
})

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
})

describe('nano in the homepage terminal', () => {
  it('opens a file under a dim rule and footer, writes it back with ^O, and leaves nothing behind on ^X', () => {
    const { container } = withFile()

    run('nano a.txt')

    expect(buffer().value).toBe('hi\n')
    expect(title(container)).toBe('──── a.txt ────')
    expect(status(container)).toBe('[ Read 1 line ]')
    expect(nano(container).querySelector('.nano-keys').textContent).toBe('^O Write Out   ^X Exit')
    expect(queryInput()).toBeNull()

    edit('hello\nthere')
    expect(ctrl('o')).toBe(false)

    expect(status(container)).toBe('[ Wrote 2 lines ]')
    expect(fileText(`${HOME}/a.txt`)).toBe('hello\nthere\n')

    ctrl('x')

    expect(queryBuffer()).toBeNull()
    expect(nano(container)).toBeNull()
    expect(input()).not.toBeNull()
  })

  it('^S saves too', () => {
    const { container } = withFile()
    run('nano a.txt')

    edit('bye\n')
    expect(ctrl('s')).toBe(false)

    expect(status(container)).toBe('[ Wrote 1 line ]')
    expect(fileText(`${HOME}/a.txt`)).toBe('bye\n')
  })

  it('a missing file opens empty as a new file and is created on write', () => {
    const { container } = render(<Page />)
    run('cd ~')
    run('nano fresh.txt')

    expect(buffer().value).toBe('')
    expect(status(container)).toBe('[ New File ]')

    edit('one')
    ctrl('o')

    expect(fileText(`${HOME}/fresh.txt`)).toBe('one\n')
  })

  it('on Rafey\'s file reports permission denied and stays open', () => {
    const { container } = render(<Page />)
    run(`nano ${RAFEY_HOME}/bio.txt`)
    expect(buffer().value).toBe(sharedVfs()[`${RAFEY_HOME}/bio.txt`].text)

    edit('mine now')
    ctrl('o')

    expect(status(container)).toBe('[ Error writing bio.txt: Permission denied ]')
    expect(buffer().value).toBe('mine now')
  })

  it('^X on changes asks to save; N leaves the file as it was', () => {
    const { container } = withFile()
    run('nano a.txt')
    edit('changed')

    ctrl('x')

    expect(status(container)).toBe(SAVE_QUESTION)
    expect(buffer()).not.toBeNull()

    press('n')

    expect(queryBuffer()).toBeNull()
    expect(fileText(`${HOME}/a.txt`)).toBe('hi\n')
  })

  it('^X on changes then Y writes and exits; ^C cancels and keeps editing', () => {
    const { container } = withFile()
    run('nano a.txt')
    edit('changed')

    ctrl('x')
    ctrl('c')
    expect(status(container)).toBe('[ Cancelled ]')
    expect(buffer().value).toBe('changed')

    ctrl('x')
    press('y')

    expect(queryBuffer()).toBeNull()
    expect(fileText(`${HOME}/a.txt`)).toBe('changed\n')
  })

  it('keys other than Y, N and ^C leave the question and the buffer alone', () => {
    const { container } = withFile()
    run('nano a.txt')
    edit('changed')
    ctrl('x')

    expect(press('q')).toBe(false)

    expect(status(container)).toBe(SAVE_QUESTION)
    expect(buffer().value).toBe('changed')
  })

  it('without a name asks for one, then writes there against the folder', () => {
    const { container } = render(<Page />)
    run('cd ~')
    run('nano')
    expect(title(container)).toBe('──── New Buffer ────')

    edit('note')
    ctrl('o')

    const fileName = screen.getByLabelText('File Name to Write')
    expect(nano(container).querySelector('.nano-status').textContent).toBe('File Name to Write: ')
    fireEvent.change(fileName, { target: { value: 'n.txt' } })
    expect(fireEvent.keyDown(fileName, { key: 'Enter' })).toBe(false)

    expect(fileText(`${HOME}/n.txt`)).toBe('note\n')
    expect(status(container)).toBe('[ Wrote 1 line ]')
    expect(title(container)).toBe('──── n.txt ────')
  })

  it('^C at the file name prompt cancels without writing', () => {
    const { container } = render(<Page />)
    run('cd ~')
    run('nano')
    edit('note')
    ctrl('o')

    fireEvent.keyDown(screen.getByLabelText('File Name to Write'), { key: 'c', ctrlKey: true })

    expect(status(container)).toBe('[ Cancelled ]')
    expect(buffer().value).toBe('note')
  })

  it('^X with changes and no name asks to save, then for the name, then exits once written', () => {
    render(<Page />)
    run('cd ~')
    run('nano')
    edit('note')

    ctrl('x')
    press('y')
    const fileName = screen.getByLabelText('File Name to Write')
    fireEvent.change(fileName, { target: { value: 'later.txt' } })
    fireEvent.keyDown(fileName, { key: 'Enter' })

    expect(fileText(`${HOME}/later.txt`)).toBe('note\n')
    expect(queryBuffer()).toBeNull()
  })

  it('the Enter that ran nano is not typed into it, and the buffer has the keyboard', () => {
    render(<Page />)
    run('cd ~')

    expect(run('nano x.txt')).toBe(false)

    expect(buffer().value).toBe('')
    expect(document.activeElement).toBe(buffer())
  })

  it('vim prints the note, then opens nano on the file', () => {
    const { container } = withFile()

    run('vim a.txt')

    const dimRows = [...container.querySelectorAll('.terminal-output .grey')].map((row) => row.textContent)
    expect(dimRows.at(-1)).toBe("vim isn't installed here, opened nano instead")
    expect(buffer().value).toBe('hi\n')
  })

  it('a saved file shows up in the store, and so to cat and to /os', () => {
    const { container } = render(<Page />)
    run('cd ~')
    run('nano saved.txt')
    edit('kept\n')
    ctrl('s')
    ctrl('x')

    expect(sharedVfs()[`${HOME}/saved.txt`]).toMatchObject({ type: 'text', text: 'kept\n' })
    run('cat saved.txt')
    expect(container.querySelector('.terminal-output').lastElementChild.textContent).toBe('kept')
  })

  it('on a phone, [ save ] writes and [ exit ] leaves', () => {
    const { container } = withFile()
    run('nano a.txt')
    edit('tapped')

    fireEvent.click(screen.getByRole('button', { name: '[ save ]' }))
    expect(fileText(`${HOME}/a.txt`)).toBe('tapped\n')
    expect(status(container)).toBe('[ Wrote 1 line ]')

    fireEvent.click(screen.getByRole('button', { name: '[ exit ]' }))
    expect(queryBuffer()).toBeNull()
  })

  it('a long line that wraps grows the buffer to its full height, so nothing is cut off', () => {
    // jsdom has no layout: the wrapped height is whatever scrollHeight says
    let wrappedHeight = 40
    vi.spyOn(HTMLTextAreaElement.prototype, 'scrollHeight', 'get').mockImplementation(() => wrappedHeight)
    withFile()
    run('nano a.txt')
    expect(buffer().style.height).toBe('40px')

    wrappedHeight = 120
    edit('x'.repeat(400))

    expect(buffer().style.height).toBe('120px')
  })

  it('the footer does not move when the status line is empty', () => {
    const { container } = render(<Page />)
    run('nano')

    expect(status(container)).toBe('\u00a0')
  })
})
