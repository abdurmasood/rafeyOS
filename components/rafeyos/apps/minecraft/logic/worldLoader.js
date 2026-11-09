// @ts-check
// Builds the world in a worker, so opening Minecraft never freezes the desktop. Where there's no worker, or it fails
// to start, the world is built on the main thread instead, once the loading card has had a frame to show.
import { buildWorld, packWorld, unpackWorld } from './worldBuild'

/**
 * @import { BlockEdit } from './world'
 * @import { LoadedWorld } from './worldBuild'
 */

/** @returns {Worker | null} */
const defaultCreateWorker = () =>
  typeof Worker === 'function' ? new Worker(new URL('./worldWorker.js', import.meta.url)) : null

/**
 * Runs `run` after the next paint, so the loading card is on screen before a main-thread build blocks it.
 * @param {() => void} run
 */
const afterPaint = (run) => {
  if (typeof requestAnimationFrame !== 'function') return setTimeout(run, 0)
  // A frame callback runs before that frame paints; the timeout lands after it
  return requestAnimationFrame(() => setTimeout(run, 0))
}

/**
 * @param {() => Worker | null} createWorker
 * @returns {Worker | null} null too where the browser refuses one (a SecurityError, say): that means build here
 */
const startWorker = (createWorker) => {
  try {
    return createWorker()
  } catch {
    return null
  }
}

/**
 * @param {{
 *   edits: ReadonlyArray<BlockEdit>,
 *   createWorker?: () => Worker | null,
 *   schedule?: (run: () => void) => unknown,
 *   build?: typeof buildWorld,
 *   onProgress?: (done: number, total: number) => void,
 * }} options - `edits`: the saved ones, meshed in so saved builds show from the first frame; `onProgress`: chunks
 *   meshed so far, from the worker only (a main-thread build blocks, so there's nothing to report until it's done)
 * @returns {{ promise: Promise<LoadedWorld>, cancel: () => void }} a cancelled load never settles
 */
export const loadWorld = ({
  edits, createWorker = defaultCreateWorker, schedule = afterPaint, build = buildWorld, onProgress = () => {},
}) => {
  let cancelled = false
  const worker = startWorker(createWorker)
  /** @type {Promise<LoadedWorld>} */
  const promise = new Promise((resolve, reject) => {
    const buildHere = () => schedule(() => {
      // Checked before building: StrictMode cancels its first mount at once, and that one should cost nothing
      if (cancelled) return
      try {
        resolve(unpackWorld(packWorld(build({ edits })).message))
      } catch (error) {
        reject(error)
      }
    })
    if (!worker) {
      buildHere()
      return
    }
    worker.addEventListener('message', (event) => {
      if (event.data.type === 'progress') {
        if (!cancelled) onProgress(event.data.done, event.data.total)
        return
      }
      worker.terminate()
      if (!cancelled) resolve(unpackWorld(event.data))
    })
    worker.addEventListener('error', () => {
      worker.terminate()
      buildHere()
    })
    worker.postMessage({ edits })
  })
  return {
    promise,
    cancel: () => {
      cancelled = true
      worker?.terminate()
    },
  }
}
