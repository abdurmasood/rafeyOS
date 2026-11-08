import { describe, expect, it, vi } from 'vitest'
import { SAVE_DELAY, createSaveQueue } from '@/components/rafeyos/apps/blocks/logic/saveQueue'

/** A queue on a manual timer: `fire()` runs whatever is waiting. */
const manualQueue = (edits = []) => {
  let pending = null
  const save = vi.fn(() => ({ ok: true }))
  const onResult = vi.fn()
  const queue = createSaveQueue({
    edits, save, onResult,
    setTimer: (run, ms) => {
      pending = { run, ms }
      return pending
    },
    clearTimer: (timer) => {
      if (pending === timer) pending = null
    },
  })
  return { queue, save, onResult, fire: () => pending?.run(), waiting: () => pending }
}

describe('the save queue', () => {
  it('starts from what is already saved', () => {
    const { queue } = manualQueue([[5, 8], [2, 1]])

    expect(queue.edits()).toEqual([[5, 8], [2, 1]])
  })

  it('saves once, half a second after the last change, with every edit sorted', () => {
    const { queue, save, onResult, fire, waiting } = manualQueue([[9, 3]])
    queue.record([4, 8])
    queue.record([7, 1])

    expect(save).not.toHaveBeenCalled()
    expect(waiting().ms).toBe(SAVE_DELAY)
    fire()

    expect(save).toHaveBeenCalledTimes(1)
    expect(save).toHaveBeenCalledWith([[4, 8], [7, 1], [9, 3]])
    expect(onResult).toHaveBeenCalledWith({ ok: true })
  })

  it('drops a block that matches the island again', () => {
    const { queue, save, fire } = manualQueue([[9, 3]])
    queue.record([9, null])
    fire()

    expect(save).toHaveBeenCalledWith([])
  })

  it('saves straight away on flush, and only when something is waiting', () => {
    const { queue, save, waiting } = manualQueue()
    queue.flush()
    expect(save).not.toHaveBeenCalled()

    queue.record([1, 2])
    queue.flush()
    queue.flush()

    expect(save).toHaveBeenCalledTimes(1)
    expect(waiting()).toBeNull()
  })

  it('reports a refused save', () => {
    const onResult = vi.fn()
    const queue = createSaveQueue({ edits: [], save: () => ({ ok: false, reason: 'full' }), onResult })
    queue.record([1, 2])
    queue.flush()

    expect(onResult).toHaveBeenCalledWith({ ok: false, reason: 'full' })
  })

  it('uses real timers by default', () => {
    vi.useFakeTimers()
    try {
      const save = vi.fn(() => ({ ok: true }))
      createSaveQueue({ edits: [], save, onResult: () => {} }).record([1, 2])
      vi.advanceTimersByTime(SAVE_DELAY)

      expect(save).toHaveBeenCalledWith([[1, 2]])
    } finally {
      vi.useRealTimers()
    }
  })
})
