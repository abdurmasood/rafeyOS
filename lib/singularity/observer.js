// @ts-check
// The physics of whoever is looking at the hole. Units: the hole's radius is 1 and the speed of light is 1, so every
// distance is in hole-radii and every speed is a fraction of light speed. No DOM, no three.

/** Seconds light takes to cross one hole-radius, for a hole of four million suns like the one in our galaxy. */
export const SECONDS_PER_RADIUS = 42

// The fall never quite stops: at the instant of release the true rate is zero, and the fall would not start
const SLOWEST_FALL_SQUARED = 4e-4

/**
 * How fast something dropped from far away is falling as it passes `r`. Every frame below is measured against that
 * falling frame, because unlike a hovering one it exists on both sides of the edge.
 * @param {number} r
 */
export const fallingSpeed = (r) => Math.sqrt(1 / r)

/**
 * An observer held still at `r` by an engine: moving outward, relative to the falling frame, at exactly the falling
 * speed. `gamma` grows without limit toward r = 1, which is why nothing can hover at the edge.
 * @param {number} r - above 1
 * @returns {{ w: number, gamma: number }} `w`: outward speed relative to the falling frame
 */
export const hoverFrame = (r) => {
  const w = fallingSpeed(r)
  return { w, gamma: 1 / Math.sqrt(1 - w * w) }
}

/**
 * An observer falling freely with `energy`, on either side of the edge.
 * @param {number} r
 * @param {number} energy - see energyFromRest
 * @returns {{ w: number, gamma: number }} as hoverFrame
 */
export const fallFrame = (r, energy) => {
  const falling = fallingSpeed(r)
  // The textbook form divides by 1 - 1/r, which is zero at the edge; this one is the same number and stays finite
  const inward = Math.sqrt(Math.max(0, energy * energy - 1 + falling * falling))
  const gamma = (energy * energy + falling * falling) / (energy + falling * inward)
  return { w: Math.sqrt(Math.max(0, 1 - 1 / (gamma * gamma))), gamma }
}

/**
 * The energy of something let go from a standstill at `r`. Falling with it from that same `r` starts in exactly the
 * hovering frame (same `w`, same `gamma`), so the view does not jump when the engine gives out.
 * @param {number} r - above 1
 */
export const energyFromRest = (r) => Math.sqrt(1 - 1 / r)

/**
 * How fast `r` shrinks per unit of the faller's own time.
 * @param {number} r
 * @param {number} energy
 */
export const fallRate = (r, energy) => Math.sqrt(Math.max(SLOWEST_FALL_SQUARED, energy * energy - 1 + 1 / r))

/**
 * The faller's own time left before the centre, in hole-radii of light travel. Exact: a fall from rest is a cycloid,
 * so the integral of 1 / fall rate has a closed form, and the instant of release (where the rate is zero and a sum
 * would undercount) costs nothing. It ignores fallRate's floor, which only gets the fall started.
 * @param {number} r
 * @param {number} energy - below 1, as energyFromRest gives: let go from a standstill somewhere
 */
export const timeLeft = (r, energy) => {
  const rest = 1 / (1 - energy * energy)
  // How far along the fall is: 0 at the centre, a quarter turn at the radius it started from
  const phase = Math.asin(Math.sqrt(Math.min(1, Math.max(0, r) / rest)))
  return rest ** 1.5 * (phase - Math.sin(phase) * Math.cos(phase))
}

/**
 * timeLeft in seconds on the faller's clock.
 * @param {number} r
 * @param {number} energy
 */
export const secondsLeft = (r, energy) => Math.max(0, timeLeft(r, energy) * SECONDS_PER_RADIUS)

/**
 * How fast a clock held at `r` runs next to one far away: 1 far out, 0 at the edge.
 * @param {number} r - above 1
 */
export const clockRate = (r) => Math.sqrt(1 - 1 / r)
