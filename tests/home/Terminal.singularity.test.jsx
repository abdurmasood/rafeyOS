// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { resetSharedStore } from '@/tests/home/helpers/homeStore'

vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn() }) }))
vi.mock('@/lib/loadRafeyOS', () => ({ loadRafeyOS: vi.fn(() => Promise.resolve({})) }))
// The real chunk needs WebGL; this stands in for it and shows what it was given
vi.mock('@/lib/loadSingularity', () => ({
  loadSingularity: () => Promise.resolve({
    default: ({ onExit, ownsKey }) => (
      <div data-testid="scene" data-owns={String(ownsKey({}))}>
        <button type="button" onClick={() => onExit({})}>leave</button>
        <button type="button" onClick={() => onExit({ failed: true })}>fail</button>
      </div>
    ),
  }),
}))

const { default: Terminal } = await import('@/components/home/Terminal')
const { TerminalProvider } = await import('@/components/home/TerminalProvider')

const NEEDS_WEBGL = "singularity: this needs WebGL, which isn't available here"

const Page = () => <TerminalProvider><Terminal /></TerminalProvider>

const input = () => screen.getByLabelText('terminal input')
const queryInput = () => screen.queryByLabelText('terminal input')
const run = (command) => {
  fireEvent.change(input(), { target: { value: command } })
  fireEvent.keyDown(input(), { key: 'Enter' })
}
const echoes = (container) => [...container.querySelectorAll('.terminal-output > .echo')].map((row) => row.textContent)
const cover = (container) => container.querySelector('.singularity-cover')

beforeEach(() => {
  resetSharedStore()
})

afterEach(cleanup)

describe('home terminal: singularity', () => {
  it('takes the page in place of the prompt, with every key its own', async () => {
    const { container } = render(<Page />)

    run('singularity')
    const scene = await screen.findByTestId('scene')

    expect(queryInput()).toBeNull()
    expect(cover(container).contains(scene)).toBe(true)
    expect(cover(container).closest('.terminal')).toBeTruthy()
    expect(scene.dataset.owns).toBe('true')
  })

  it('gives the prompt back when left, keeping the echoed row and nothing else', async () => {
    const { container } = render(<Page />)
    run('singularity')

    fireEvent.click(await screen.findByText('leave'))

    expect(cover(container)).toBeNull()
    expect(screen.queryByTestId('scene')).toBeNull()
    expect(document.activeElement).toBe(input())
    expect(echoes(container)).toEqual(['visitor@rafey.ai:~$ singularity'])
    expect(container.querySelector('.terminal-output').lastElementChild.className).toBe('echo')
    run('echo back')
    expect(container.querySelector('.terminal-output').lastElementChild.textContent).toBe('back')
  })

  it('says so in dim output where there is no WebGL', async () => {
    const { container } = render(<Page />)
    run('singularity')

    fireEvent.click(await screen.findByText('fail'))

    const last = container.querySelector('.terminal-output').lastElementChild
    expect(last.textContent).toBe(NEEDS_WEBGL)
    expect(last.className).toBe('grey')
    expect(cover(container)).toBeNull()
    expect(echoes(container)).toEqual(['visitor@rafey.ai:~$ singularity'])
    expect(queryInput()).toBeTruthy()
  })

  it('lists it in help, before os', () => {
    const { container } = render(<Page />)

    run('help')

    expect(container.textContent).toContain('  contact      get in touch\n  singularity  a black hole\n  os           operating system\n')
  })

  it('refuses a pipe and keeps the prompt', () => {
    const { container } = render(<Page />)

    run('singularity | cat')

    expect(container.querySelector('.terminal-output .error-text').textContent).toBe('singularity: needs a terminal')
    expect(cover(container)).toBeNull()
    expect(queryInput()).toBeTruthy()
  })
})
