// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'

const push = vi.fn()
vi.mock('next/navigation', () => ({ useRouter: () => ({ push }) }))
vi.mock('@/lib/loadRafeyOS', () => ({ loadRafeyOS: vi.fn(() => Promise.resolve({})) }))

const { default: Terminal } = await import('@/components/home/Terminal')
const { TerminalProvider } = await import('@/components/home/TerminalProvider')
const { loadRafeyOS } = await import('@/lib/loadRafeyOS')

const renderTerminal = () =>
  render(
    <TerminalProvider>
      <Terminal />
    </TerminalProvider>,
  )

const run = (command) => {
  const input = screen.getByLabelText('terminal input')
  fireEvent.change(input, { target: { value: command } })
  fireEvent.keyDown(input, { key: 'Enter' })
}

beforeEach(() => {
  push.mockClear()
  vi.mocked(loadRafeyOS).mockClear()
  window.sessionStorage.clear()
})

afterEach(() => {
  cleanup()
  vi.useRealTimers()
})

describe('home terminal: startx', () => {
  it('lists startx as the last help row, and never os or rafeyos', () => {
    const { container } = renderTerminal()

    run('help')

    const text = container.textContent
    expect(text).toContain('  startx       start the desktop\n')
    expect(text.indexOf('start the desktop')).toBeGreaterThan(text.indexOf('black hole simulation'))
    expect(text).not.toMatch(/ {2}(os|rafeyos) +\S/)
    expect(text).not.toContain('operating system')
  })

  it('startx prefetches, forgets the session and routes after 450ms', () => {
    vi.useFakeTimers()
    window.sessionStorage.setItem('rafeyos-session', 'desktop')
    const { container } = renderTerminal()

    run('startx')

    expect(container.textContent).toContain('starting rOS…')
    expect(loadRafeyOS).toHaveBeenCalledTimes(1)
    expect(window.sessionStorage.getItem('rafeyos-session')).toBeNull()
    act(() => vi.advanceTimersByTime(449))
    expect(push).not.toHaveBeenCalled()
    act(() => vi.advanceTimersByTime(1))
    expect(push).toHaveBeenCalledWith('/os')
  })

  it.each(['os', 'rafeyos'])('%s is not found, and neither loads nor routes to rafeyOS', (command) => {
    vi.useFakeTimers()
    const { container } = renderTerminal()

    run(command)
    act(() => vi.advanceTimersByTime(1000))

    expect(container.querySelector('.terminal-output .error-text').textContent).toBe(`bash: ${command}: command not found`)
    expect(container.textContent).not.toContain('starting rOS…')
    expect(loadRafeyOS).not.toHaveBeenCalled()
    expect(push).not.toHaveBeenCalled()
  })

  it('does not route if the terminal unmounts first', () => {
    vi.useFakeTimers()
    const { unmount } = renderTerminal()
    run('startx')

    unmount()
    act(() => vi.advanceTimersByTime(1000))

    expect(push).not.toHaveBeenCalled()
  })

  it('leaves no hand-off behind when the terminal unmounts during the delay', () => {
    vi.useFakeTimers()
    const { unmount } = renderTerminal()
    run('nautilus ~')

    act(() => vi.advanceTimersByTime(449))
    unmount()
    act(() => vi.advanceTimersByTime(1000))

    expect(push).not.toHaveBeenCalled()
    expect(window.sessionStorage.getItem('rafeyos-handoff')).toBeNull()
  })

  it('completes "star" to "startx " with Tab', () => {
    renderTerminal()
    const input = screen.getByLabelText('terminal input')
    run('help')

    fireEvent.change(input, { target: { value: 'star' } })
    fireEvent.keyDown(input, { key: 'Tab' })

    expect(input.value).toBe('startx ')
  })

  it('never completes os or rafeyos, so "o" completes straight to open', () => {
    renderTerminal()
    const input = screen.getByLabelText('terminal input')
    run('help')

    for (const typed of ['os', 'rafey']) {
      fireEvent.change(input, { target: { value: typed } })
      fireEvent.keyDown(input, { key: 'Tab' })
      expect(input.value).toBe(typed)
    }
    fireEvent.change(input, { target: { value: 'o' } })
    fireEvent.keyDown(input, { key: 'Tab' })

    expect(input.value).toBe('open ')
  })
})
