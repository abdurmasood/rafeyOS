// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { Singularity } from '@/components/singularity/Singularity'

// The real chunk needs WebGL; this stands in for it and shows what it was given
vi.mock('@/lib/loadSingularity', () => ({
  loadSingularity: () => Promise.resolve({
    default: ({ onExit, ownsKey }) => (
      <div data-testid="scene" data-owns={String(ownsKey({}))}>
        <button type="button" onClick={() => onExit({})}>leave</button>
        <button type="button" onClick={() => onExit({ failed: true })}>fail</button>
        <button type="button" onClick={() => onExit()}>vanish</button>
      </div>
    ),
  }),
}))

afterEach(cleanup)

const NEEDS_WEBGL = "singularity: this needs WebGL, which isn't available here"

describe('the singularity panel', () => {
  it('covers the terminal with the simulation while it runs', async () => {
    const { container } = render(<Singularity active onDone={() => {}} className="cover" />)
    const scene = await screen.findByTestId('scene')

    expect(container.children).toHaveLength(1)
    expect(container.firstChild.className).toBe('cover')
    expect(container.firstChild.style.background).toBe('rgb(0, 0, 0)')
    expect(scene.parentElement).toBe(container.firstChild)
    expect(scene.dataset.owns).toBe('true')
  })

  it('hands the simulation the terminal it belongs to', async () => {
    render(<Singularity active onDone={() => {}} ownsKey={() => false} />)

    expect((await screen.findByTestId('scene')).dataset.owns).toBe('false')
  })

  it('renders nothing once it has been left', () => {
    const { container } = render(<Singularity active={false} onDone={() => {}} className="cover" />)

    expect(container.innerHTML).toBe('')
  })

  it('says why it did not run where there is no WebGL', () => {
    const { container } = render(<Singularity active={false} failed onDone={() => {}} className="cover" />)

    expect(container.textContent).toBe(NEEDS_WEBGL)
    expect(container.querySelector('.cover')).toBeNull()
  })

  it('keeps running while active, whatever `failed` says', async () => {
    const { container } = render(<Singularity active failed onDone={() => {}} />)
    await screen.findByTestId('scene')

    expect(container.textContent).not.toContain(NEEDS_WEBGL)
  })

  it.each([['leave', {}], ['fail', { failed: true }], ['vanish', {}]])('tells the terminal when the simulation is over: %s', async (name, result) => {
    const onDone = vi.fn()
    render(<Singularity active onDone={onDone} />)
    fireEvent.click(await screen.findByText(name))

    expect(onDone).toHaveBeenCalledTimes(1)
    expect(onDone).toHaveBeenCalledWith(result)
  })
})
