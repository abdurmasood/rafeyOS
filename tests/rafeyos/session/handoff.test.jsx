// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { flushTimers, memoryStorage, renderDesktop, renderRafeyOS, windowsOf } from '@/tests/rafeyos/helpers/renderRafeyOS'
import { resetSharedStore } from '@/tests/home/helpers/homeStore'
import { HANDOFF_KEY, SESSION_KEY } from '@/components/rafeyos/session/logic/sessionStore'
import { BOOT_MS } from '@/components/rafeyos/session/logic/useSession'
import { sharedFsStore } from '@/components/rafeyos/core/vfs/fsStore'
import { HOME } from '@/components/rafeyos/core/vfs/buildVfs'

const push = vi.fn()
vi.mock('next/navigation', () => ({ useRouter: () => ({ push }) }))
vi.mock('@/lib/loadRafeyOS', () => ({ loadRafeyOS: vi.fn(() => Promise.resolve({})) }))

const { default: Terminal } = await import('@/components/home/Terminal')
const { TerminalProvider } = await import('@/components/home/TerminalProvider')

// The homepage's 'starting rOS…' pause before it routes
const ROUTE_DELAY_MS = 450

const run = (command) => {
  const input = screen.getByLabelText('terminal input')
  fireEvent.change(input, { target: { value: command } })
  fireEvent.keyDown(input, { key: 'Enter' })
}

/** Runs `command` on the homepage, waits for it to route to /os, then leaves the page as the router does. */
const handOffFromHome = (command) => {
  const home = render(<TerminalProvider><Terminal /></TerminalProvider>)
  run(command)
  flushTimers(ROUTE_DELAY_MS)
  expect(push).toHaveBeenCalledWith('/os')
  home.unmount()
}

/** rafeyOS in this tab, as /os mounts it: the tab's sessionStorage and the window's shared store, with the boot shown. */
const bootRafeyOS = () =>
  renderRafeyOS({ storage: window.sessionStorage, fs: sharedFsStore(window), reducedMotion: () => false })

const handoffOf = (open) => JSON.stringify(open)

beforeEach(() => {
  vi.useFakeTimers()
  resetSharedStore()
  push.mockClear()
})

afterEach(() => {
  cleanup()
  vi.useRealTimers()
})

describe('hand-off from the homepage to rafeyOS', () => {
  it('nautilus ~ on the homepage boots rafeyOS with Files on Home', () => {
    handOffFromHome('nautilus ~')
    const { container } = bootRafeyOS()

    expect(screen.getByRole('status', { name: 'Starting rafeyOS' })).toBeTruthy()
    expect(windowsOf(container, 'files')).toHaveLength(0)

    flushTimers(BOOT_MS)

    const [files] = windowsOf(container, 'files')
    expect(windowsOf(container, 'files')).toHaveLength(1)
    expect(files.getAttribute('aria-label')).toBe('Home')
    expect(window.sessionStorage.getItem(HANDOFF_KEY)).toBeNull()
  })

  it('xdg-open of Rafey\'s bio.txt on the homepage opens the Text Editor on it after the boot', () => {
    handOffFromHome('xdg-open /home/rafey/bio.txt')
    const { container } = bootRafeyOS()

    flushTimers(BOOT_MS)

    expect(windowsOf(container, 'editor')).toHaveLength(1)
    expect(windowsOf(container, 'editor')[0].getAttribute('aria-label')).toBe('bio.txt')
  })

  it('startx lands on an empty desktop and clears an old hand-off', () => {
    window.sessionStorage.setItem(HANDOFF_KEY, handoffOf({ app: 'files', path: HOME }))

    handOffFromHome('startx')

    expect(window.sessionStorage.getItem(HANDOFF_KEY)).toBeNull()
    const { container } = bootRafeyOS()
    flushTimers(BOOT_MS)
    expect(container.querySelectorAll('.win')).toHaveLength(0)
  })

  it('uses a hand-off once under strict mode, so Files (which can have many windows) opens one', () => {
    const storage = memoryStorage({ [SESSION_KEY]: 'desktop', [HANDOFF_KEY]: handoffOf({ app: 'files', path: HOME }) })

    const { container } = renderDesktop({ storage })

    expect(windowsOf(container, 'files')).toHaveLength(1)
    expect(storage.has(HANDOFF_KEY)).toBe(false)
  })
})
