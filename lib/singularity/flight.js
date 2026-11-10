// @ts-check
// Where you are around the hole and how the keys move you: one small state object, stepped once a frame. The step
// functions change the state they are given (it lives in a ref and is stepped sixty times a second) and touch nothing
// else, so the whole flight runs in a test without a browser. Units as in observer.js.
import { energyFromRest, fallFrame, fallRate, hoverFrame } from './observer'

export const MODE = Object.freeze({ TITLE: 'title', HOVER: 'hover', FALL: 'fall', END: 'end' })

/** As low as the engine is allowed to hold you. Letting go there gives you that much energy for the fall. */
export const EDGE = 1.02
export const FAR = 45
export const START = Object.freeze({ r: 17, around: 0.4, up: 0.14 })
/** Hole-radii of your own time per second on screen. */
export const FALL_RATE = 0.08
/** Half the view, far out: 30 degrees. Deep in it reaches WIDEST_HALF_ANGLE, the whole sky. */
export const NARROW_HALF_ANGLE = 0.5236
export const WIDEST_HALF_ANGLE = Math.PI
/** Seconds the end screen waits before enter exits, so the key that was held on the way down doesn't skip it. */
export const END_PROMPT_DELAY = 1.2

const CROSSING_MARGIN = 0.006
const CENTRE = 0.035
// The view is worked out no closer than this: at the centre itself every formula divides by zero
const NEAREST_EYE = 0.03
const TURN_RATE = Object.freeze({ around: 0.16, up: 0.14 })
const UP_LIMIT = 1.5
const TITLE_DRIFT = 0.03
const SMOOTHING = 2
const WIDEN_SMOOTHING = 2.5
const WIDEN_FROM = 6
const WIDEN_OVER = 4.7
const DRAG_SENSITIVITY = 0.002
const WHEEL_SENSITIVITY = 0.0003
const MOVED = Object.freeze({ drag: 0.05, wheel: 0.1 })
/** Screen brightness: the title is dimmed behind its text, and the end fades to black over END_FADE seconds. */
const TITLE_DIM = 0.45
const END_FADE = 0.6
// One second is four light-crossing times of the hole's radius, so the inner disc turns once every twelve seconds or so
const DISC_TIME_RATE = 4
const FASTEST_W = 0.9995

/**
 * @typedef {{ r: number, around: number, up: number }} Place - distance from the centre, angle around the hole, and
 *   angle up over its top (radians)
 * @typedef {{ inward?: boolean, outward?: boolean, left?: boolean, right?: boolean, up?: boolean, down?: boolean }} FlightInput
 * @typedef {Place & {
 *   mode: string, goal: Place, energy: number, halfAngle: number,
 *   time: number, since: number, moved: number, inside: number,
 * }} Flight - `goal`: where the keys have asked to be, which the place itself eases toward; `since`: seconds in this
 *   mode; `moved`: seconds of steering so far (the key hint fades on it); `inside`: seconds spent past the edge
 */

/** @param {number} value @param {number} low @param {number} high */
const clamp = (value, low, high) => Math.min(high, Math.max(low, value))
/** @param {boolean | undefined} key */
const held = (key) => (key ? 1 : 0)

/** @returns {Flight} on the title screen */
export const createFlight = () => ({
  // `energy` is only read while falling, and the crossing sets it first
  mode: MODE.TITLE, ...START, goal: { ...START }, energy: 0, halfAngle: NARROW_HALF_ANGLE,
  time: 0, since: 0, moved: 0, inside: 0,
})

/** @param {Flight} flight @param {string} mode */
const setMode = (flight, mode) => {
  flight.mode = mode
  flight.since = 0
}

/**
 * Enter: starts the flight from the title screen, and asks to leave once the end screen's prompt is up.
 * @param {Flight} flight
 * @returns {boolean} whether the program should exit
 */
export const enter = (flight) => {
  if (flight.mode === MODE.END) return flight.since > END_PROMPT_DELAY
  if (flight.mode !== MODE.TITLE) return false
  Object.assign(flight, START, { goal: { ...START }, moved: 0, inside: 0 })
  setMode(flight, MODE.HOVER)
  return false
}

/** @param {Flight} flight @param {FlightInput} input @param {number} dt */
const stepHover = (flight, input, dt) => {
  const { goal } = flight
  const inOut = held(input.outward) - held(input.inward)
  // Moving in and out slows as you near the hole, so the last stretch is easy to control
  goal.r = clamp(goal.r + inOut * dt * Math.max(0.03, (goal.r - 1) * 0.15), EDGE, FAR)
  if (inOut || input.left || input.right || input.up || input.down) flight.moved += dt
  // Keep going inward at the edge and you are across. Nothing marks the moment: you start falling from exactly
  // where you are, at rest, so the view does not jump.
  if (input.inward && flight.r < EDGE + CROSSING_MARGIN) {
    setMode(flight, MODE.FALL)
    flight.energy = energyFromRest(flight.r)
  }
}

/** No engine acts here. Your distance shrinks the way a falling body's does, in your own time. */
const stepFall = (/** @type {Flight} */ flight, /** @type {number} */ dt) => {
  flight.r -= fallRate(flight.r, flight.energy) * FALL_RATE * dt
  flight.goal.r = flight.r
  if (flight.r < CENTRE) setMode(flight, MODE.END)
}

/** Turning works on both sides of the edge: only the way out is gone. */
const turn = (/** @type {Flight} */ { goal }, /** @type {FlightInput} */ input, /** @type {number} */ dt) => {
  goal.around += (held(input.right) - held(input.left)) * dt * TURN_RATE.around
  goal.up = clamp(goal.up + (held(input.up) - held(input.down)) * dt * TURN_RATE.up, -UP_LIMIT, UP_LIMIT)
}

/** Far out, a normal view. From about 6 radii inward it widens, until the whole sky is on screen. */
const widen = (/** @type {Flight} */ flight, /** @type {number} */ dt) => {
  const deep = clamp((WIDEN_FROM - eyeRadius(flight)) / WIDEN_OVER, 0, 1)
  const wide = flight.mode === MODE.TITLE ? 0 : deep * deep * (3 - 2 * deep)
  const wanted = NARROW_HALF_ANGLE + (WIDEST_HALF_ANGLE - NARROW_HALF_ANGLE) * wide
  flight.halfAngle += (wanted - flight.halfAngle) * (1 - Math.exp(-WIDEN_SMOOTHING * dt))
}

/**
 * One frame of flight.
 * @param {Flight} flight - changed in place
 * @param {FlightInput} input - the keys held this frame
 * @param {number} dt - seconds
 * @returns {Flight} the same object
 */
export const stepFlight = (flight, input, dt) => {
  flight.time += dt
  flight.since += dt
  if (flight.mode === MODE.HOVER) stepHover(flight, input, dt)
  else if (flight.mode === MODE.FALL) stepFall(flight, dt)
  else if (flight.mode === MODE.TITLE) flight.goal.around += dt * TITLE_DRIFT
  if (flight.mode === MODE.HOVER || flight.mode === MODE.FALL) turn(flight, input, dt)
  const ease = 1 - Math.exp(-SMOOTHING * dt)
  // A fall is not eased: its distance is the physics, not a goal being approached
  if (flight.mode !== MODE.FALL) flight.r += (flight.goal.r - flight.r) * ease
  flight.around += (flight.goal.around - flight.around) * ease
  flight.up += (flight.goal.up - flight.up) * ease
  widen(flight, dt)
  if (flight.mode === MODE.FALL) flight.inside = eyeRadius(flight) < 1 ? flight.inside + dt : 0
  return flight
}

/**
 * A pointer drag: orbits the hole. Nothing on the title and end screens, where a press is enter instead.
 * @param {Flight} flight @param {number} dx @param {number} dy - CSS pixels since the last move
 */
export const applyDrag = (flight, dx, dy) => {
  if (flight.mode !== MODE.HOVER && flight.mode !== MODE.FALL) return
  flight.goal.around -= dx * DRAG_SENSITIVITY
  flight.goal.up = clamp(flight.goal.up + dy * DRAG_SENSITIVITY, -UP_LIMIT, UP_LIMIT)
  flight.moved += MOVED.drag
}

/**
 * The wheel: in and out, while an engine is holding you.
 * @param {Flight} flight @param {number} deltaY
 * @returns {boolean} whether the wheel was used, so the page behind should not scroll
 */
export const applyWheel = (flight, deltaY) => {
  if (flight.mode !== MODE.HOVER) return false
  flight.goal.r = clamp(flight.goal.r * Math.exp(deltaY * WHEEL_SENSITIVITY), EDGE, FAR)
  flight.moved += MOVED.wheel
  return true
}

/** The distance the view and the readout are worked out at. @param {Flight} flight */
export const eyeRadius = (flight) => Math.max(NEAREST_EYE, flight.r)

/** @param {Flight} flight */
const dimOf = ({ mode, since }) => {
  if (mode === MODE.TITLE) return TITLE_DIM
  return mode === MODE.END ? Math.max(0, END_FADE - since) : 1
}

/**
 * What the renderer needs for this frame: the eye, looking straight at the hole with the world's up as its up, and
 * the observer's motion.
 * @param {Flight} flight
 * @returns {{
 *   position: number[], forward: number[], right: number[], up: number[],
 *   w: number, gamma: number, halfAngle: number, discTime: number, dim: number,
 * }} vectors as [x, y, z]; `w` and `gamma` as observer.js's frames, `w` held just under light speed
 */
export const viewOf = (flight) => {
  const r = eyeRadius(flight)
  const falling = flight.mode === MODE.FALL || flight.mode === MODE.END
  const { w, gamma } = falling ? fallFrame(r, flight.energy) : hoverFrame(r)
  const level = Math.cos(flight.up)
  // Unit vector from the hole to the eye; `up` is clamped short of the pole, so `flat` is never zero
  const out = [Math.cos(flight.around) * level, Math.sin(flight.up), Math.sin(flight.around) * level]
  const flat = Math.hypot(out[0], out[2])
  const right = [out[2] / flat, 0, -out[0] / flat]
  return {
    position: out.map((part) => part * r),
    forward: out.map((part) => -part),
    right,
    up: [out[1] * right[2], out[2] * right[0] - out[0] * right[2], -out[1] * right[0]],
    w: Math.min(FASTEST_W, w), gamma, halfAngle: flight.halfAngle, discTime: flight.time * DISC_TIME_RATE, dim: dimOf(flight),
  }
}
