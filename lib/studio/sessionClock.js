// The room's own clock. It counts only the frames that are drawn, so minimising the window (which stops
// drawing) holds his night where it was instead of rewinding it: three.js's clock restarts from 0 whenever
// the frame loop is switched off and on. `frozenAt` (the `?at=` moment) pins it.

/** @param {number | null} frozenAt */
export const createSessionClock = (frozenAt = null) => {
  let time = frozenAt ?? 0
  return {
    get time() {
      return time
    },
    /** Moves the clock on by one drawn frame and returns the new time. */
    tick(delta) {
      if (frozenAt === null) time += delta
      return time
    },
  }
}
