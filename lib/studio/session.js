// Which night a visitor walks in on. Every visit gets its own session (different pauses, glances and
// postures, a different point in the code and in his night); `?seed=` replays one, and `?at=` alone keeps
// the reference session so frozen moments stay comparable. `?activity=beat|game|nap` starts the night on
// that activity, to check it.
import { ACTIVITY } from './moods'

export const REFERENCE_SEED = 7
export const REFERENCE_OPENING_LINE = 12
const LAST_LINES_KEPT = 40 // never start so late that the code is nearly done

const parsedSeed = (value) => {
  if (value === null || value.trim() === '') return null
  const seed = Number(value)
  return Number.isInteger(seed) ? seed >>> 0 : null
}

/** The line he's already on when the visit starts, chosen from the seed. */
const openingLineFor = (seed, lineCount) => {
  const latest = Math.max(REFERENCE_OPENING_LINE, lineCount - LAST_LINES_KEPT)
  const span = latest - REFERENCE_OPENING_LINE + 1
  return REFERENCE_OPENING_LINE + (Math.imul(seed, 2654435761) >>> 0) % span
}

const forcedActivity = (value) => (Object.values(ACTIVITY).includes(value) && value !== ACTIVITY.CODE ? value : null)

/**
 * @param {string} search  window.location.search
 * @param {number} lineCount  lines in the code he types
 * @param {() => number} random  in [0, 1)
 * @returns {{ seed: number, openingLine: number, reference: boolean, first: string | null }}
 *   reference: the comparable session, whose night opens with plain typing; first: an activity to open on
 */
export const sessionFromUrl = (search, lineCount, random = Math.random) => {
  const params = new URLSearchParams(search)
  const chosen = parsedSeed(params.get('seed'))
  const first = forcedActivity(params.get('activity'))
  if (chosen === null && params.has('at')) {
    return { seed: REFERENCE_SEED, openingLine: REFERENCE_OPENING_LINE, reference: true, first }
  }
  const seed = chosen ?? Math.floor(random() * 2 ** 32) >>> 0
  return { seed, openingLine: openingLineFor(seed, lineCount), reference: false, first }
}
