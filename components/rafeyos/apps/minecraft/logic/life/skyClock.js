// The time of day: a 20-minute day that starts each visit at 08:00. From 07:45 to 16:00 everything is exactly the day
// the world had before it had a clock (atmosphere.js's SKY, full sun, unlit blocks at full brightness); around that the
// light warms into sunrise and sunset and cools into a moonlit night.
import { Color, Vector3 } from 'three'
import { SKY } from '@/components/rafeyos/apps/minecraft/logic/atmosphere'

export const DAY_SECONDS = 1200
/** A day as a fraction: 0 is midnight, 0.25 sunrise, 0.5 noon, 0.75 sunset. */
export const START_TIME = 8 / 24

const NIGHT = { light: '#5f6fa2', horizon: '#141c38', zenith: '#05081a', underwater: '#0d2a4a' }
const DAY = { light: '#ffffff', horizon: SKY.horizon, zenith: SKY.zenith, underwater: SKY.underwater }
// [time, light on the blocks, sky at the horizon (and the fog), sky overhead, under the water]
const KEYS = Object.freeze([
  [0, NIGHT],
  [0.2, NIGHT],
  [0.235, { light: '#7d7fb0', horizon: '#3d3f6c', zenith: '#141a3c', underwater: '#163a5e' }],
  [0.268, { light: '#ffc29a', horizon: '#eea67c', zenith: '#3f5e9e', underwater: '#245c8e' }],
  [0.3, { light: '#fff2e2', horizon: '#d4e2ee', zenith: '#5d98d6', underwater: '#296ca6' }],
  [31 / 96, DAY],
  [16 / 24, DAY],
  [0.71, { light: '#fff0dc', horizon: '#dfe1e4', zenith: '#5a90cc', underwater: '#2867a0' }],
  [0.745, { light: '#ffb98c', horizon: '#f2a06c', zenith: '#4a5c98', underwater: '#205283' }],
  [0.775, { light: '#a58aa8', horizon: '#6e5582', zenith: '#1e2350', underwater: '#163a5e' }],
  [0.81, NIGHT],
  [1, NIGHT],
].map(([t, colours]) => Object.freeze({
  t,
  light: new Color(colours.light), horizon: new Color(colours.horizon), zenith: new Color(colours.zenith),
  underwater: new Color(colours.underwater),
})))

// The sun rises behind spawn's left shoulder and sets over the sea it faces (spawn looks along +z)
const RISE = new Vector3(-0.45, 0, -0.9).normalize()
const NOON = new Vector3(0.3, 1, -0.15).normalize()

/** @param {number} from @param {number} to @param {number} x */
const smoothstep = (from, to, x) => {
  const t = Math.min(1, Math.max(0, (x - from) / (to - from)))
  return t * t * (3 - 2 * t)
}

/** @param {number} t */
export const wrapTime = (t) => ((t % 1) + 1) % 1

/**
 * @typedef {{
 *   light: Color, horizon: Color, zenith: Color, underwater: Color, sun: Vector3, moon: Vector3,
 *   glow: number, night: number,
 * }} SkyState - glow: the sun's disc, 0 once it's down; night: 0 by day to 1 when the stars are out
 */

/** @returns {SkyState} */
export const createSkyState = () => ({
  light: new Color(), horizon: new Color(), zenith: new Color(), underwater: new Color(), sun: new Vector3(), moon: new Vector3(),
  glow: 1, night: 0,
})

/**
 * Fills `state` for the time `t`.
 * @param {number} t
 * @param {SkyState} state
 */
export const skyAt = (t, state) => {
  const time = wrapTime(t)
  let i = 0
  while (KEYS[i + 1].t < time) i++
  const from = KEYS[i], to = KEYS[i + 1]
  const k = smoothstep(0, 1, (time - from.t) / (to.t - from.t))
  for (const key of ['light', 'horizon', 'zenith', 'underwater']) state[key].copy(from[key]).lerp(to[key], k)
  const angle = (time - 0.25) * Math.PI * 2
  state.sun.copy(RISE).multiplyScalar(Math.cos(angle)).addScaledVector(NOON, Math.sin(angle)).normalize()
  state.moon.copy(state.sun).negate()
  state.glow = smoothstep(-0.06, 0.08, state.sun.y)
  state.night = 1 - smoothstep(-0.2, 0.02, state.sun.y)
  return state
}

/**
 * The clock itself: starts at `startTime` and runs a day every DAY_SECONDS.
 * @param {number} [startTime]
 */
export const createSkyClock = (startTime = START_TIME) => {
  let time = startTime
  return {
    /** @param {number} dt */
    advance: (dt) => {
      time = wrapTime(time + dt / DAY_SECONDS)
      return time
    },
    time: () => time,
  }
}
