// What he does with his night. He codes until a mood gets the better of him, deals with it, and comes back:
// an itch to make music sends him to the synths, boredom to a game on his monitor, tiredness to a nap on his
// lap, leaning back for a break. Things on the desktop nudge him too: music playing starts the itch, Minecraft opening the
// boredom. He only gets up in a pause, so he never leaves mid-word, and the code waits for him while he's away.
//
// Pure and seeded: the same session, pauses and nudges give the same night. Times are seconds on the room's
// clock ("wall"); "code time" is how far through his typing he is, which stands still while he's away.

export const ACTIVITY = Object.freeze({ CODE: 'code', BEAT: 'beat', GAME: 'game', BREAK: 'break' })
export const NUDGE = Object.freeze({ MUSIC: 'music', MINECRAFT: 'minecraft' })

// Each mood fills while he codes (per second, so 1 / rise is a full meter from empty) and has one outlet
export const MOODS = Object.freeze({
  itch: Object.freeze({ outlet: ACTIVITY.BEAT, rise: 1 / 850 }),
  bored: Object.freeze({ outlet: ACTIVITY.GAME, rise: 1 / 1150 }),
  tired: Object.freeze({ outlet: ACTIVITY.BREAK, rise: 1 / 1500 }),
})
const MOOD_OF = Object.freeze(Object.fromEntries(Object.entries(MOODS).map(([mood, { outlet }]) => [outlet, mood])))
const NUDGED_MOOD = Object.freeze({ [NUDGE.MUSIC]: 'itch', [NUDGE.MINECRAFT]: 'bored' })

export const NIGHT = Object.freeze({
  threshold: 0.72, // a mood past this sends him off at the end of the stretch of code
  codeLength: Object.freeze([200, 480]), // s per stretch of code
  lengths: Object.freeze({
    [ACTIVITY.BEAT]: Object.freeze([150, 300]),
    [ACTIVITY.GAME]: Object.freeze([120, 240]),
    [ACTIVITY.BREAK]: Object.freeze([90, 180]),
  }),
  awayRise: 0.4, // moods fill this much slower while he's doing something else
  leavePause: 2.5, // s: he gets up only in a pause at least this long...
  nudgePause: 0.8, // ...or, when something on the desktop calls him, the first short break in his typing
  leaveAfter: 0.5, // s into that pause before he moves
  interrupt: 20, // s: a nudge toward something else cuts what he's doing short to about this
  nudgeCap: 360, // s: music or a game keeps him at it, up to this long
  lead: 1800, // s: a visit walks in up to this far into his night...
  startMood: 0.55, // ...with each mood already up to this full
  horizon: 6 * 3600, // s planned; the night repeats after that
})

/** Small, fast, seeded PRNG (mulberry32), as typing.js uses. */
const seeded = (seed) => {
  let state = seed >>> 0
  return () => {
    state = (state + 0x6d2b79f5) >>> 0
    let t = Math.imul(state ^ (state >>> 15), 1 | state)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}
const between = ([low, high], unit) => low + (high - low) * unit

/** The first pause at least `minLength` long that starts at or after code time `from`, across repeats of the pass. */
const pauseFinder = (timeline) => {
  const lists = new Map()
  return (from, minLength) => {
    if (!lists.has(minLength)) lists.set(minLength, timeline.pauses(minLength))
    const list = lists.get(minLength)
    if (!list.length) return from
    const lap = Math.floor(from / timeline.duration)
    for (let k = lap; k <= lap + 1; k++) {
      const found = list.find((p) => k * timeline.duration + p.start >= from)
      if (found) return k * timeline.duration + found.start
    }
    return from
  }
}

/** The moment a stretch of code starting at wall `start` (code time `codeStart`) can end, at or after wall `wanted`. */
const endInPause = (findPause, { start, codeStart }, wanted, minLength) => {
  const pause = findPause(codeStart + (wanted - start), minLength) + NIGHT.leaveAfter
  return { end: start + (pause - codeStart), codeEnd: pause }
}

const topMood = (moods) => Object.keys(moods).reduce((a, b) => (moods[a] >= moods[b] ? a : b))

/** Nudges as intervals [start, end) on the wall clock, sorted by start. */
const intervals = (nudges) =>
  nudges.map((n) => ({ kind: n.kind, start: n.start, end: n.end ?? Infinity })).sort((a, b) => a.start - b.start)

/**
 * @param {{ seed: number, timeline: { duration: number, pauses: (min: number) => Array<{ start: number }> },
 *   nudges?: Array<{ kind: string, start: number, end?: number }>, reference?: boolean, first?: string }} options
 *   reference: the comparable session (`?at=`): starts at the top of the night with every mood empty;
 *   first: an activity to start the night with (for checks)
 * @returns {{ blocks: Array<{ activity, start, end, codeStart, reason }>, activityAt: (t: number) => object,
 *   codeTimeAt: (t: number) => number }}
 */
export const planNight = ({ seed, timeline, nudges = [], reference = false, first = null }) => {
  const random = seeded(seed ^ 0x5bd1e995)
  const findPause = pauseFinder(timeline)
  const calls = intervals(nudges)
  const moods = Object.fromEntries(Object.keys(MOODS).map((m) => [m, reference ? 0 : random() * NIGHT.startMood]))
  const lead = reference || first ? 0 : random() * NIGHT.lead
  const blocks = []
  let t = -lead
  let codeTime = 0
  let next = { activity: first ?? ACTIVITY.CODE, reason: first ? 'forced' : null }

  const fill = (seconds, except, factor) => {
    for (const [mood, { rise }] of Object.entries(MOODS)) if (mood !== except) moods[mood] = Math.min(1, moods[mood] + rise * seconds * factor)
  }

  while (t < NIGHT.horizon) {
    const { activity, reason } = next
    if (activity === ACTIVITY.CODE) {
      const call = calls.find((c) => c.start > t && c.start < t + NIGHT.codeLength[1])
      const planned = t + between(NIGHT.codeLength, random())
      const cut = call && call.start < planned ? call : null
      const { end, codeEnd } = cut
        ? endInPause(findPause, { start: t, codeStart: codeTime }, cut.start, NIGHT.nudgePause)
        : endInPause(findPause, { start: t, codeStart: codeTime }, planned, NIGHT.leavePause)
      blocks.push({ activity, start: t, end, codeStart: codeTime, reason })
      fill(end - t, null, 1)
      if (cut) moods[NUDGED_MOOD[cut.kind]] = 1
      const mood = topMood(moods)
      next = cut
        ? { activity: MOODS[NUDGED_MOOD[cut.kind]].outlet, reason: cut.kind }
        : moods[mood] > NIGHT.threshold
          ? { activity: MOODS[mood].outlet, reason: mood }
          : { activity: ACTIVITY.CODE, reason: null }
      t = end
      codeTime = codeEnd
    } else {
      let end = t + between(NIGHT.lengths[activity], random())
      const keeping = calls.find((c) => MOODS[NUDGED_MOOD[c.kind]].outlet === activity && c.start <= end && c.end > t)
      if (keeping) end = Math.min(t + NIGHT.nudgeCap, Math.max(end, keeping.end))
      const other = calls.find((c) => MOODS[NUDGED_MOOD[c.kind]].outlet !== activity && c.start > t && c.start < end)
      if (other) end = Math.min(end, other.start + NIGHT.interrupt)
      blocks.push({ activity, start: t, end, codeStart: codeTime, reason })
      fill(end - t, MOOD_OF[activity], NIGHT.awayRise)
      moods[MOOD_OF[activity]] = 0
      next = other
        ? { activity: MOODS[NUDGED_MOOD[other.kind]].outlet, reason: other.kind }
        : { activity: ACTIVITY.CODE, reason: null }
      if (other) moods[NUDGED_MOOD[other.kind]] = 1
      t = end
    }
  }

  const starts = Float64Array.from(blocks, (b) => b.start)
  const indexAt = (t) => {
    const wrapped = t < NIGHT.horizon ? t : (t % NIGHT.horizon) // past the plan the night repeats
    let low = 0
    let high = starts.length
    while (low < high) {
      const mid = (low + high) >> 1
      if (starts[mid] <= wrapped) low = mid + 1
      else high = mid
    }
    return { index: Math.max(0, low - 1), wrapped }
  }
  /** The block under way at wall `t`, with how far into it (`into`) and how long until it ends (`left`). */
  const activityAt = (t) => {
    const { index, wrapped } = indexAt(t)
    const block = blocks[index]
    return { ...block, index, into: wrapped - block.start, left: block.end - wrapped }
  }
  const codeTimeAt = (t) => {
    const { index, wrapped } = indexAt(t)
    const block = blocks[index]
    return block.activity === ACTIVITY.CODE ? block.codeStart + (wrapped - block.start) : block.codeStart
  }
  return { blocks, activityAt, codeTimeAt }
}

/** What the window title says he's doing. */
export const ACTIVITY_LABEL = Object.freeze({
  [ACTIVITY.CODE]: 'Coding',
  [ACTIVITY.BEAT]: 'Making a beat',
  [ACTIVITY.GAME]: 'Playing Minecraft',
  [ACTIVITY.BREAK]: 'Taking a break',
})
