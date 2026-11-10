// @ts-check
// The engine's frame loop, apart from what each frame does.

/** Longest frame the physics will take in one go, so a stall can't fling the player through the world. */
const MAX_FRAME = 0.05

/**
 * The frame loop: `step(time, dt)` once per frame. Stopping cancels the next frame; starting again resets the clock,
 * so coming back from a minimized window isn't one giant frame.
 * @param {{
 *   requestFrame: (run: (time: number) => void) => number, cancelFrame: (id: number) => void, now: () => number,
 *   step: (time: number, dt: number) => void,
 * }} options
 */
export const createLoop = ({ requestFrame, cancelFrame, now, step }) => {
  /** @type {number | null} */
  let frameId = null
  let last = 0
  /** @param {number} time */
  const frame = (time) => {
    frameId = null
    const dt = Math.min(MAX_FRAME, Math.max(0, (time - last) / 1000))
    last = time
    step(time, dt)
    frameId = requestFrame(frame)
  }
  return {
    start: () => {
      if (frameId !== null) return
      last = now()
      frameId = requestFrame(frame)
    },
    stop: () => {
      if (frameId === null) return
      cancelFrame(frameId)
      frameId = null
    },
  }
}
