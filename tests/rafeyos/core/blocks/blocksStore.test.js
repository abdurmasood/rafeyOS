import { describe, expect, it } from 'vitest'
import { BLOCKS_KEY, browserBlocksStore, createBlocksStore } from '@/components/rafeyos/core/blocks/blocksStore'
import { memoryStorage, quotaError, refusingWrites } from '@/tests/rafeyos/helpers/renderRafeyOS'

const ISLAND = 'island-1'
const stored = (disk) => JSON.parse(disk.getItem(BLOCKS_KEY))

describe('saved builds', () => {
  it('has nothing saved at first', () => {
    expect(createBlocksStore({ storage: memoryStorage() }).load(ISLAND)).toEqual([])
  })

  it('saves edits under the island they belong to, and loads them back', () => {
    const disk = memoryStorage()
    const store = createBlocksStore({ storage: disk })

    expect(store.save(ISLAND, [[12, 8], [40, 0]])).toEqual({ ok: true })

    expect(stored(disk)).toEqual({ v: 1, world: ISLAND, edits: [[12, 8], [40, 0]] })
    expect(createBlocksStore({ storage: disk }).load(ISLAND)).toEqual([[12, 8], [40, 0]])
  })

  it("loads nothing from another island's save, and replaces it on the next save", () => {
    const disk = memoryStorage({ [BLOCKS_KEY]: JSON.stringify({ v: 1, world: 'island-0', edits: [[1, 2]] }) })
    const store = createBlocksStore({ storage: disk })

    expect(store.load(ISLAND)).toEqual([])
    store.save(ISLAND, [[3, 4]])
    expect(stored(disk)).toEqual({ v: 1, world: ISLAND, edits: [[3, 4]] })
  })

  it('drops malformed edits and unreadable saves', () => {
    const messy = memoryStorage({ [BLOCKS_KEY]: JSON.stringify({ v: 1, world: ISLAND, edits: [[1, 2], [-1, 2], [1.5, 2], [3], 'x', [4, 'y'], [5, 6]] }) })

    expect(createBlocksStore({ storage: messy }).load(ISLAND)).toEqual([[1, 2], [5, 6]])
    expect(createBlocksStore({ storage: memoryStorage({ [BLOCKS_KEY]: '{not json' }) }).load(ISLAND)).toEqual([])
    expect(createBlocksStore({ storage: memoryStorage({ [BLOCKS_KEY]: '"text"' }) }).load(ISLAND)).toEqual([])
    expect(createBlocksStore({ storage: memoryStorage({ [BLOCKS_KEY]: JSON.stringify({ v: 1, world: ISLAND }) }) }).load(ISLAND)).toEqual([])
  })

  it("leaves a newer build's save alone: loads nothing from it and never overwrites it", () => {
    const newer = JSON.stringify({ v: 2, world: ISLAND, edits: [[1, 2]], extra: true })
    const disk = memoryStorage({ [BLOCKS_KEY]: newer })
    const store = createBlocksStore({ storage: disk })

    expect(store.load(ISLAND)).toEqual([])
    expect(store.save(ISLAND, [[3, 4]])).toEqual({ ok: false, reason: 'blocked' })
    expect(disk.getItem(BLOCKS_KEY)).toBe(newer)
  })

  it('says why a save failed: storage full, or blocked', () => {
    expect(createBlocksStore({ storage: refusingWrites(memoryStorage(), quotaError()) }).save(ISLAND, [[1, 2]])).toEqual({ ok: false, reason: 'full' })
    expect(createBlocksStore({ storage: refusingWrites(memoryStorage(), { code: 22 }) }).save(ISLAND, [[1, 2]])).toEqual({ ok: false, reason: 'full' })
    expect(createBlocksStore({ storage: refusingWrites(memoryStorage(), new Error('nope')) }).save(ISLAND, [[1, 2]])).toEqual({ ok: false, reason: 'blocked' })
    expect(createBlocksStore({ storage: refusingWrites(memoryStorage(), null) }).save(ISLAND, [[1, 2]])).toEqual({ ok: false, reason: 'blocked' })
    expect(createBlocksStore({ storage: null }).save(ISLAND, [[1, 2]])).toEqual({ ok: false, reason: 'blocked' })
    expect(createBlocksStore({ storage: null }).load(ISLAND)).toEqual([])
  })

  it('uses the window’s localStorage, and saves nothing without a window', () => {
    const disk = memoryStorage()
    browserBlocksStore({ localStorage: disk }).save(ISLAND, [[1, 2]])

    expect(stored(disk).edits).toEqual([[1, 2]])
    expect(browserBlocksStore(undefined).save(ISLAND, [[1, 2]])).toEqual({ ok: false, reason: 'blocked' })
  })
})
