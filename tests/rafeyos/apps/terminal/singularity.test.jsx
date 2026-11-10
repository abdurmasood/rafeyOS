// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, within } from '@testing-library/react'
import { openTerminal, renderDesktop, typeCommand } from '@/tests/rafeyos/helpers/renderRafeyOS'

// The real chunk needs WebGL; this stands in for it, and reports whether a key typed where focus is would be its own
vi.mock('@/lib/loadSingularity', () => ({
  loadSingularity: () => Promise.resolve({
    default: ({ onExit, ownsKey }) => (
      <div data-testid="scene">
        <button type="button" onClick={() => onExit({})}>leave</button>
        <button type="button" onClick={() => onExit({ failed: true })}>fail</button>
        <button type="button" onClick={(event) => { event.currentTarget.textContent = String(ownsKey({ target: document.activeElement })) }}>owns?</button>
      </div>
    ),
  }),
}))

afterEach(cleanup)

const NEEDS_WEBGL = "singularity: this needs WebGL, which isn't available here"

const log = (win) => win.querySelector('.tlog')
const cover = (root) => root.querySelector('.singularity-cover')
const promptInput = (win) => win.querySelector('.tline input')

/** A Terminal window with `singularity` running in it. */
const launch = async () => {
  const { container } = renderDesktop()
  const { win, input } = openTerminal(container)
  typeCommand(input, 'singularity')
  await within(win).findByTestId('scene')
  return { container, win }
}

describe('Terminal app: singularity', () => {
  it('covers the Terminal window body, not the desktop, in place of the prompt', async () => {
    const { container, win } = await launch()

    expect(promptInput(win)).toBeNull()
    expect(container.querySelectorAll('.singularity-cover')).toHaveLength(1)
    expect(win.contains(cover(container))).toBe(true)
    // Under the header bar: inside the box that wraps the scrolling pane, which is what the cover is placed against
    expect(cover(win).closest('.term-body')).toBe(win.querySelector('.term-body'))
    expect(win.querySelector('.hb').contains(cover(win))).toBe(false)
    expect(win.querySelector('.term-body').parentElement).toBe(win.querySelector('.wcontent'))
  })

  it('holds the keyboard in its own window: the pane has focus, and its keys are the program\'s', async () => {
    const { win } = await launch()

    expect(document.activeElement).toBe(win.querySelector('.term'))
    fireEvent.click(within(win).getByText('owns?'))
    expect(within(win).getByText('true')).toBeTruthy()

    document.activeElement.blur()
    fireEvent.click(within(win).getByText('true'))
    expect(within(win).getByText('false')).toBeTruthy()
  })

  it('gives the prompt back when left, keeping the echoed row and nothing else', async () => {
    const { win } = await launch()

    fireEvent.click(within(win).getByText('leave'))

    expect(cover(win)).toBeNull()
    expect(within(win).queryByTestId('scene')).toBeNull()
    expect(document.activeElement).toBe(promptInput(win))
    expect(log(win).lastElementChild.textContent).toBe('visitor@rafey.ai:~$ singularity')
    typeCommand(promptInput(win), 'echo back')
    expect(log(win).lastElementChild.textContent).toBe('back')
  })

  it('says so in dim output where there is no WebGL', async () => {
    const { win } = await launch()

    fireEvent.click(within(win).getByText('fail'))

    expect(log(win).lastElementChild.textContent).toBe(NEEDS_WEBGL)
    expect(log(win).lastElementChild.className).toBe('dm')
    expect(cover(win)).toBeNull()
    expect(promptInput(win)).toBeTruthy()
  })

  it('lists it in help and refuses a pipe', () => {
    const { container } = renderDesktop()
    const { win, input } = openTerminal(container)

    typeCommand(input, 'help')
    expect(log(win).textContent).toContain('  contact      get in touch\n  singularity  a black hole\n')
    typeCommand(input, 'singularity | cat')

    expect(log(win).querySelector('.er').textContent).toBe('singularity: needs a terminal')
    expect(cover(win)).toBeNull()
    expect(promptInput(win)).toBeTruthy()
  })
})
