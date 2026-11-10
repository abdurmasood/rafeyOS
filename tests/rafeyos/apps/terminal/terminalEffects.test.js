import { describe, expect, it, vi } from 'vitest'
import { applyTerminalEffects } from '@/components/rafeyos/apps/terminal/logic/terminalEffects'
import { realVfs } from '@/tests/rafeyos/helpers/testVfs'

const handlers = (overrides = {}) => ({
  vfs: realVfs,
  windowManager: { openApp: vi.fn(() => true), openPath: vi.fn(() => true), close: vi.fn(), forceClose: vi.fn() },
  openExternal: vi.fn(),
  openLink: vi.fn(),
  play: vi.fn(),
  closeSelf: vi.fn(),
  logout: vi.fn(),
  clearHistory: vi.fn(),
  ...overrides,
})

describe('terminal effects', () => {
  it('runs window and browser effects without notes', () => {
    const deps = handlers()

    const outcome = applyTerminalEffects(
      [
        { type: 'openApp', app: 'files', path: '/home/visitor' },
        { type: 'openPath', path: '/home/rafey/blog' },
        { type: 'openLink', href: 'https://x' },
        { type: 'openExternal', href: '/projects' },
        { type: 'closeSelf' },
        { type: 'logout' },
        { type: 'clearHistory' },
      ],
      deps,
    )

    expect(outcome).toEqual({ notes: [], clear: false })
    expect(deps.clearHistory).toHaveBeenCalledTimes(1)
    expect(deps.windowManager.openApp).toHaveBeenCalledWith('files', { path: '/home/visitor' })
    expect(deps.openLink).not.toHaveBeenCalled()
    expect(deps.openExternal).toHaveBeenCalledWith('https://x')
    expect(deps.openExternal).toHaveBeenCalledWith('/projects')
    expect(deps.closeSelf).toHaveBeenCalled()
    expect(deps.logout).toHaveBeenCalled()
  })

  it('kills a window by closing it, past its guard for KILL', () => {
    const deps = handlers()

    const outcome = applyTerminalEffects([{ type: 'kill', pid: 1003, force: false }, { type: 'kill', pid: 1004, force: true }], deps)

    expect(outcome).toEqual({ notes: [], clear: false })
    expect(deps.windowManager.close).toHaveBeenCalledWith(3)
    expect(deps.windowManager.forceClose).toHaveBeenCalledWith(4)
  })

  it('notes apps and file types that have no UI yet', () => {
    const deps = handlers({ windowManager: { openApp: () => false, openPath: () => false } })

    const { notes } = applyTerminalEffects(
      [{ type: 'openApp', app: 'minecraft' }, { type: 'openPath', path: '/home/rafey/bio.txt' }],
      deps,
    )

    expect(notes.map((line) => line.text)).toEqual(["Minecraft isn't available yet", "Text Editor isn't available yet"])
  })

  it('notes a path that vanished before it could open, without throwing', () => {
    const deps = handlers({ windowManager: { openApp: vi.fn(() => true), openPath: () => false } })

    const { notes } = applyTerminalEffects([{ type: 'openPath', path: '/home/visitor/Documents/gone.txt' }], deps)

    expect(notes.map((line) => line.text)).toEqual(["Opening links isn't available yet"])
  })

  it('plays without a window, and plays an opened audio file as Music opens', () => {
    const deps = handlers()

    const quiet = applyTerminalEffects([{ type: 'play' }], deps)
    expect(quiet.notes).toEqual([])
    expect(deps.play).toHaveBeenCalledTimes(1)
    expect(deps.windowManager.openApp).not.toHaveBeenCalled()

    applyTerminalEffects([{ type: 'openPath', path: '/home/rafey/Music/storms-ahead.mp3' }], deps)
    expect(deps.play).toHaveBeenCalledTimes(2)
    expect(deps.windowManager.openPath).toHaveBeenCalledWith('/home/rafey/Music/storms-ahead.mp3', { vfs: realVfs })
  })

  it('asks before opening a web link file', () => {
    const deps = handlers()

    const { notes } = applyTerminalEffects([{ type: 'openPath', path: '/home/rafey/contact/linkedin.desktop' }], deps)

    expect(notes).toEqual([])
    expect(deps.openLink).toHaveBeenCalledTimes(1)
    expect(deps.windowManager.openPath).not.toHaveBeenCalled()
  })

  it('flags clear', () => {
    expect(applyTerminalEffects([{ type: 'clear' }], handlers()).clear).toBe(true)
  })

  it('rejects effects it does not know', () => {
    expect(() => applyTerminalEffects([{ type: 'beep' }], handlers())).toThrow('Unknown terminal effect: beep')
  })
})
