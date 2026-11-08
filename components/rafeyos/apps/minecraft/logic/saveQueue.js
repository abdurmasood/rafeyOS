// @ts-check
// Collects block changes and saves them half a second after the last one, so holding the mouse down to break a
// row of blocks writes once rather than four times a second. Closing the window or leaving the page flushes it.

/**
 * @import { BlockChange, BlockEdit } from './world'
 * @typedef {{ ok: true } | { ok: false, reason: 'full' | 'blocked' }} SaveResult
 */

export const SAVE_DELAY = 500

/**
 * @param {{
 *   edits: ReadonlyArray<BlockEdit>,
 *   save: (edits: BlockEdit[]) => SaveResult,
 *   onResult: (result: SaveResult) => void,
 *   delay?: number,
 *   setTimer?: (run: () => void, ms: number) => unknown,
 *   clearTimer?: (timer: unknown) => void,
 * }} options - `edits` is what the save already holds
 */
export const createSaveQueue = ({
  edits, save, onResult, delay = SAVE_DELAY,
  setTimer = (run, ms) => setTimeout(run, ms),
  clearTimer = (timer) => clearTimeout(/** @type {ReturnType<typeof setTimeout>} */ (timer)),
}) => {
  /** @type {Map<number, number>} */
  const all = new Map(edits)
  /** @type {unknown} */
  let timer = null

  const flush = () => {
    if (timer === null) return
    clearTimer(timer)
    timer = null
    onResult(save([...all].sort(([a], [b]) => a - b)))
  }

  return Object.freeze({
    /** Every edit the world starts from: the saved ones. */
    edits: () => /** @type {BlockEdit[]} */ ([...all]),
    /** @param {BlockChange} change - null removes the entry: that block matches the island again */
    record: ([index, block]) => {
      if (block === null) all.delete(index)
      else all.set(index, block)
      if (timer !== null) clearTimer(timer)
      timer = setTimer(flush, delay)
    },
    /** Saves now if anything is waiting. */
    flush,
  })
}
