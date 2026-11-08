import { describe, expect, it, vi } from 'vitest'
import { createServices } from '@/components/rafeyos/core/services/createServices'
import { localStorageOrNull, sessionStorageOrNull } from '@/lib/browserStorage'
import { FS_KEY, LEGACY_KEY } from '@/components/rafeyos/core/vfs/fsStore'
import { SETTINGS_KEY } from '@/components/rafeyos/core/settings/settingsStore'
import { BLOCKS_KEY } from '@/components/rafeyos/core/blocks/blocksStore'
import { memoryStorage } from '@/tests/rafeyos/helpers/renderRafeyOS'

const fakeWindow = (overrides = {}) => ({
  sessionStorage: { getItem: () => null },
  open: vi.fn(),
  matchMedia: vi.fn((query) => ({ matches: query.includes('reduce') })),
  ...overrides,
})

describe('services', () => {
  it('routes, opens external links without an opener, and reads media queries', () => {
    const router = { push: vi.fn() }
    const win = fakeWindow()
    const services = createServices({ router, win })

    services.navigate('/')
    services.openExternal('https://x')

    expect(router.push).toHaveBeenCalledWith('/')
    expect(win.open).toHaveBeenCalledWith('https://x', '_blank', 'noopener,noreferrer')
    expect(services.reducedMotion()).toBe(true)
    expect(services.prefersDark()).toBe(false)
    expect(services.now()).toBeInstanceOf(Date)
    expect(services.storage).toBe(win.sessionStorage)
    expect(Object.keys(services.fs.getState().nodes)).toEqual(['/home/visitor/Desktop', '/home/visitor/Documents', '/home/visitor/Downloads'])
  })

  it('saves documents in localStorage, migrating the old key, through one store per window', () => {
    const legacy = JSON.stringify({ files: { 'old.txt': 'old\n' }, trash: {} })
    const localStorage = { getItem: vi.fn((key) => (key === LEGACY_KEY ? legacy : null)), setItem: vi.fn(), removeItem: vi.fn() }
    const win = fakeWindow({ localStorage })
    const services = createServices({ router: { push: vi.fn() }, win })

    expect(services.fs.saveFile('/home/visitor/Documents', 'notes', 'hello\n')).toMatchObject({ ok: true, path: '/home/visitor/Documents/notes.txt' })
    const [key, value] = localStorage.setItem.mock.calls[0]
    expect(key).toBe(FS_KEY)
    expect(JSON.parse(value).nodes).toMatchObject({
      '/home/visitor/Documents/old.txt': { type: 'text', text: 'old\n' },
      '/home/visitor/Documents/notes.txt': { type: 'text', text: 'hello\n' },
    })
    expect(localStorage.removeItem).toHaveBeenCalledWith(LEGACY_KEY)
    expect(createServices({ router: { push: vi.fn() }, win }).fs).toBe(services.fs)
  })

  it('copies through the window clipboard', async () => {
    const writeText = vi.fn(() => Promise.resolve())
    const services = createServices({ router: { push: vi.fn() }, win: fakeWindow({ navigator: { clipboard: { writeText } } }) })

    await services.clipboard.writeText('hi')

    expect(writeText).toHaveBeenCalledWith('hi')
  })

  it('builds audio from the window Audio constructor', () => {
    const Audio = vi.fn(function FakeAudio(src) {
      this.src = src
    })
    const services = createServices({ router: { push: vi.fn() }, win: fakeWindow({ Audio }) })

    services.createAudio('/song.mp3')

    expect(Audio).toHaveBeenCalledWith('/song.mp3')
  })

  it('falls back when matchMedia is missing', () => {
    const services = createServices({ router: { push: vi.fn() }, win: fakeWindow({ matchMedia: undefined }) })

    expect(services.reducedMotion()).toBe(false)
    expect(services.prefersDark()).toBe(true)
    expect(services.watchColorScheme(vi.fn())).toEqual(expect.any(Function))
  })

  it('saves settings in localStorage, through one store per window', () => {
    const win = fakeWindow({ localStorage: memoryStorage() })
    const services = createServices({ router: { push: vi.fn() }, win })

    expect(services.settings.set('accent', '#0073E5').ok).toBe(true)

    expect(JSON.parse(win.localStorage.getItem(SETTINGS_KEY))).toEqual({ v: 1, values: { accent: '#0073E5' } })
    expect(createServices({ router: { push: vi.fn() }, win }).settings).toBe(services.settings)
  })

  it('saves Blocks builds in localStorage', () => {
    const win = fakeWindow({ localStorage: memoryStorage() })
    const services = createServices({ router: { push: vi.fn() }, win })

    expect(services.blocks.save('island-1', [[3, 8]]).ok).toBe(true)

    expect(JSON.parse(win.localStorage.getItem(BLOCKS_KEY))).toEqual({ v: 1, world: 'island-1', edits: [[3, 8]] })
    expect(services.blocks.load('island-1')).toEqual([[3, 8]])
  })

  it('watches the colour scheme for changes until unsubscribed', () => {
    const list = new EventTarget()
    const services = createServices({ router: { push: vi.fn() }, win: fakeWindow({ matchMedia: () => list }) })
    const listener = vi.fn()

    const unsubscribe = services.watchColorScheme(listener)
    list.dispatchEvent(new Event('change'))
    unsubscribe()
    list.dispatchEvent(new Event('change'))

    expect(listener).toHaveBeenCalledTimes(1)
  })

  it('watches the colour scheme through addListener where the list has no addEventListener', () => {
    const list = { matches: true, addListener: vi.fn(), removeListener: vi.fn() }
    const services = createServices({ router: { push: vi.fn() }, win: fakeWindow({ matchMedia: () => list }) })
    const listener = vi.fn()

    services.watchColorScheme(listener)()

    expect(list.addListener).toHaveBeenCalledWith(listener)
    expect(list.removeListener).toHaveBeenCalledWith(listener)
  })

  it('watches nothing when the media list has no listener methods', () => {
    const services = createServices({ router: { push: vi.fn() }, win: fakeWindow() })

    expect(() => services.watchColorScheme(vi.fn())()).not.toThrow()
  })
})

describe('sessionStorageOrNull', () => {
  it('returns null when reading sessionStorage throws', () => {
    const blocked = Object.defineProperty({}, 'sessionStorage', {
      get: () => {
        throw new Error('SecurityError')
      },
    })

    expect(sessionStorageOrNull(blocked)).toBeNull()
    expect(sessionStorageOrNull(undefined)).toBeNull()
  })
})

describe('localStorageOrNull', () => {
  it('returns null when reading localStorage throws', () => {
    const blocked = Object.defineProperty({}, 'localStorage', {
      get: () => {
        throw new Error('SecurityError')
      },
    })

    expect(localStorageOrNull(blocked)).toBeNull()
    expect(localStorageOrNull(undefined)).toBeNull()
  })
})
