// Test helpers: rafeyOS rendered with fake services (in-memory storage, navigate spy, fake audio, no motion)
import { StrictMode } from 'react'
import { act, fireEvent, render, screen, within } from '@testing-library/react'
import { vi } from 'vitest'
import { RafeyOSRoot } from '@/components/rafeyos/RafeyOSRoot'
import { SESSION_KEY } from '@/components/rafeyos/session/logic/sessionStore'
import { fakeAudioFactory } from '@/tests/rafeyos/helpers/fakeAudio'
import { FS_KEY, createFsStore } from '@/components/rafeyos/core/vfs/fsStore'
import { createSettingsStore } from '@/components/rafeyos/core/settings/settingsStore'
import { createMinecraftStore } from '@/components/rafeyos/core/minecraft/minecraftStore'
import { mergeState, seedState, serializeState } from '@/components/rafeyos/core/vfs/fsState'
import { realVfs } from '@/tests/rafeyos/helpers/testVfs'

export const memoryStorage = (entries = {}) => {
  const map = new Map(Object.entries(entries))
  return {
    getItem: (key) => (map.has(key) ? map.get(key) : null),
    setItem: (key, value) => map.set(key, String(value)),
    removeItem: (key) => map.delete(key),
    has: (key) => map.has(key),
  }
}

// 17 Oct 2026, 21:04 local time
export const FIXED_NOW = new Date(2026, 9, 17, 21, 4)

// A rising ramp, so the waveform's bars get taller from left to right
export const FAKE_SAMPLES = Float32Array.from({ length: 4800 }, (_, i) => i / 4800)

/** The visitor's store on `disk` (a memoryStorage, or null for blocked storage), at the fixed time. */
export const fsStoreOn = (disk) => createFsStore({ storage: disk, now: () => FIXED_NOW.getTime() })

/** A memoryStorage already holding the seeded folders plus these files and trash entries (path -> text). */
export const fsDisk = (files = {}, trash = {}) => {
  const mtime = FIXED_NOW.getTime()
  const seed = seedState(mtime)
  const nodes = { ...seed.nodes }
  Object.entries(files).forEach(([path, text]) => {
    nodes[path] = { type: 'text', text, mtime }
  })
  const trashed = Object.fromEntries(Object.entries(trash).map(([path, text]) => [path, { node: { type: 'text', text, mtime }, mtime }]))
  return memoryStorage({ [FS_KEY]: serializeState({ ...seed, nodes, trash: trashed }) })
}

/** `disk` with every write refused by throwing `error`, as a full or locked-down browser does. Reads still work. */
export const refusingWrites = (disk, error) => ({
  ...disk,
  setItem: () => {
    throw error
  },
})

/** The error a browser throws when localStorage has no room left. */
export const quotaError = () => new DOMException('', 'QuotaExceededError')

const storedState = (disk) => JSON.parse(disk.getItem(FS_KEY))

/** The visitor's files written to `disk`, as path -> text. */
export const fsFiles = (disk) =>
  Object.fromEntries(Object.entries(storedState(disk).nodes).flatMap(([path, node]) => (node.type === 'text' ? [[path, node.text]] : [])))

/** The trash written to `disk`, as original path -> text. */
export const fsTrash = (disk) =>
  Object.fromEntries(Object.entries(storedState(disk).trash).map(([path, entry]) => [path, entry.node.text]))

/**
 * Runs one fsOps call (`op`) through the visitor's store inside act, as the shell does: against the merged tree,
 * so the GUI re-renders around a file changing underneath it. Returns the store's result.
 */
export const runFsOp = (services, op, args) => {
  let result
  act(() => {
    result = services.fs.commit((state, now) => op(mergeState(realVfs, state), state, args, now))
  })
  return result
}

export const fakeServices = (overrides = {}) => ({
  navigate: vi.fn(),
  storage: memoryStorage(),
  fs: fsStoreOn(memoryStorage()),
  settings: createSettingsStore({ storage: memoryStorage() }),
  minecraft: createMinecraftStore({ storage: memoryStorage() }),
  now: () => FIXED_NOW,
  openExternal: vi.fn(),
  clipboard: { writeText: vi.fn(() => Promise.resolve()) },
  createAudio: fakeAudioFactory(),
  loadAudioSamples: () => Promise.resolve(FAKE_SAMPLES),
  mediaSession: null,
  reducedMotion: () => true,
  prefersDark: () => true,
  watchColorScheme: () => () => {},
  ...overrides,
})

/** Renders in StrictMode, so double-run effects are exercised too. */
export const renderRafeyOS = (overrides = {}) => {
  const services = fakeServices(overrides)
  const view = render(
    <StrictMode>
      <RafeyOSRoot services={services} />
    </StrictMode>,
  )
  return { services, ...view }
}

/** Straight to the desktop: the session is remembered, as after a refresh. */
export const renderDesktop = (overrides = {}) =>
  renderRafeyOS({ storage: memoryStorage({ [SESSION_KEY]: 'desktop' }), ...overrides })

export const dock = () => screen.getByRole('toolbar', { name: 'Dock' })

export const clickDock = (name) => fireEvent.click(within(dock()).getByRole('button', { name }))

export const windowsOf = (container, appId) => [...container.querySelectorAll(`.win[data-app="${appId}"]`)]

export const openTerminal = (container) => {
  clickDock('Terminal')
  const [win] = windowsOf(container, 'terminal')
  return { win, input: within(win).getByLabelText('Terminal input') }
}

export const typeCommand = (input, command) => {
  fireEvent.change(input, { target: { value: command } })
  fireEvent.keyDown(input, { key: 'Enter' })
}

export const flushTimers = (ms) => act(() => vi.advanceTimersByTime(ms))

/** Lets pending promises settle (e.g. audio play()) and React apply what they dispatched. */
export const settle = () => act(async () => {})

/** Right-click, as a mouse would at (200, 200). */
export const rightClick = (element, point = { clientX: 200, clientY: 200 }) => fireEvent.contextMenu(element, point)

export const openMenu = () => screen.getByRole('menu')

/** The open menu's entries (separators and headings aside), as their labels. Choice items count too. */
export const menuLabels = () =>
  [...openMenu().querySelectorAll('[role="menuitem"], [role="menuitemradio"]')].map((entry) => entry.textContent)

export const menuEntry = (name) =>
  within(openMenu()).queryByRole('menuitem', { name }) ?? within(openMenu()).getByRole('menuitemradio', { name })

export const chooseMenuItem = (name) => fireEvent.click(menuEntry(name))

/** A Files window to /home/rafey the way a visitor gets there: the projects place, then "rafey" in the pathbar. */
export const goToRafeyHome = (filesWindow) => {
  fireEvent.click(within(within(filesWindow).getByRole('navigation', { name: 'Places' })).getByText('projects'))
  fireEvent.click(within(filesWindow.querySelector('.pathbar')).getByText('rafey'))
}

export const desktopIcon = (container, path) => container.querySelector(`.dicon[data-path="${path}"]`)

export const openPowerMenu = () => {
  fireEvent.click(screen.getByRole('button', { name: 'System menu' }))
  fireEvent.click(screen.getByRole('button', { name: 'Power Off / Log Out' }))
}

/** The title shown in a window's header bar (it can differ from the window title, e.g. the editor's "• "). */
export const headerTitle = (win) => win.querySelector('.hb .ttl b').textContent
