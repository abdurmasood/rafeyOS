// @ts-check
// Every word the simulation shows, as plain data: strings, or segments where a key's name is drawn as a key cap.
import { END_PROMPT_DELAY, MODE, eyeRadius } from './flight'
import { clockRate, secondsLeft } from './observer'

/**
 * @typedef {{ text: string, key?: boolean }} Segment - `key`: a key's name, drawn as a key cap
 * @typedef {import('./flight').Flight} Flight
 */

export const TITLE = Object.freeze({
  line: 'this is a real physics simulation of a black hole.',
  prompt: 'press enter',
})

export const END = Object.freeze({
  line: 'you reached the centre.',
  detail: 'known physics ends here, and so does the simulation.',
  prompt: 'press enter to exit',
})

/** @param {string} text @returns {Segment} */
const key = (text) => Object.freeze({ text, key: true })
/** @param {string} text @returns {Segment} */
const plain = (text) => Object.freeze({ text })
// A non-breaking space between the groups, so the gap survives the browser collapsing spaces
const GAP = '   '

/** @type {ReadonlyArray<Segment>} */
export const KEY_HINT = Object.freeze([
  key('W'), key('S'), plain(` closer, further${GAP}`),
  key('A'), key('D'), plain(` around${GAP}`),
  key('↑'), key('↓'), plain(` over the top${GAP}`),
  key('q'), plain(' quit'),
])

export const STATUS = Object.freeze({
  nearEdge: 'the edge is at 1.00. past it, nothing comes back.',
  falling: 'this close, the engine cannot hold you. you are falling toward the edge.',
  pastEdge: 'you are past the edge. there is no way back.',
  outwardInside: ' does nothing here. every direction leads to the centre.',
})

/** Under this many radii, a hovering observer is told where the edge is. */
const NEAR_EDGE = 1.6
/** Seconds the "past the edge" line stays up. */
const PAST_EDGE_SECONDS = 5

/** @param {number} r */
const hoverReadout = (r) =>
  `${r.toFixed(r < 2 ? 2 : 1)} radii from the centre   your clock runs at ${(clockRate(r) * 100).toFixed(0)}% of a distant one`

/** @param {number} r @param {number} energy */
const fallReadout = (r, energy) =>
  `${r < 1 ? 'inside the edge   ' : 'falling   '}${r.toFixed(2)} radii from the centre   about ${secondsLeft(r, energy).toFixed(0)} s left on your clock`

/**
 * The line at the bottom left: where you are and what your clock is doing.
 * @param {Flight} flight
 * @returns {string} empty on the title and end screens
 */
export const readoutLine = (flight) => {
  const r = eyeRadius(flight)
  if (flight.mode === MODE.HOVER) return hoverReadout(r)
  return flight.mode === MODE.FALL ? fallReadout(r, flight.energy) : ''
}

/** @param {Flight} flight @param {boolean} outwardHeld */
const fallStatus = (flight, outwardHeld) => {
  if (eyeRadius(flight) >= 1) return [plain(STATUS.falling)]
  if (outwardHeld) return [key('S'), plain(STATUS.outwardInside)]
  return flight.inside < PAST_EDGE_SECONDS ? [plain(STATUS.pastEdge)] : []
}

/**
 * The line at the top: what is happening to you, when there is something to say.
 * @param {Flight} flight
 * @param {{ outward?: boolean }} [input] - the keys held
 * @returns {ReadonlyArray<Segment>} empty when there is nothing to say
 */
export const statusLine = (flight, input = {}) => {
  if (flight.mode === MODE.FALL) return fallStatus(flight, Boolean(input.outward))
  return flight.mode === MODE.HOVER && eyeRadius(flight) < NEAR_EDGE ? [plain(STATUS.nearEdge)] : []
}

/**
 * The centred screen: the title before the flight and the end after it.
 * @param {Flight} flight
 * @returns {{ line: string, detail: string, prompt: string } | null} null while flying; `detail` and `prompt` are
 *   empty where the screen has none (the end's prompt comes up after a moment)
 */
export const screenText = (flight) => {
  if (flight.mode === MODE.TITLE) return { line: TITLE.line, detail: '', prompt: TITLE.prompt }
  if (flight.mode !== MODE.END) return null
  return { line: END.line, detail: END.detail, prompt: flight.since > END_PROMPT_DELAY ? END.prompt : '' }
}
