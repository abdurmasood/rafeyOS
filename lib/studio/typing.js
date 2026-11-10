// One typing timeline, shared by his body and the monitor, so every keystroke puts a character on
// screen (or takes a wrong one away). Seeded, so every visit shows the same session. Times in seconds.

export const HANDS = Object.freeze(['L', 'R'])
export const FINGERS = Object.freeze(['index', 'middle', 'ring', 'little', 'thumb'])
export const BACKSPACE = '\b'

// Touch typing on a US layout: the keys each finger strikes (shifted symbols share their key)
const KEYS = Object.freeze({
  L: { little: '`~1!qQaAzZ', ring: '2@wWsSxX', middle: '3#eEdDcC', index: '4$5%rRtTfFgGvVbB' },
  R: { index: '6^7&yYuUhHjJnNmM', middle: '8*iIkK,<', ring: '9(oOlL.>', little: '0)-_=+pP[{]}\\|;:\'"/?\n\b' },
})
const SPACE = Object.freeze({ hand: 'R', finger: 'thumb' })
const ELSEWHERE = Object.freeze({ hand: 'R', finger: 'little' })
const ROWS = ['qwertyuiop', 'asdfghjkl', 'zxcvbnm']

const FINGER_FOR = new Map()
for (const hand of HANDS) {
  for (const [finger, keys] of Object.entries(KEYS[hand])) {
    for (const key of keys) FINGER_FOR.set(key, Object.freeze({ hand, finger }))
  }
}
FINGER_FOR.set(' ', SPACE)

/** The hand and finger that type `char` (backspace is the right little finger). */
export const fingerFor = (char) => FINGER_FOR.get(char) ?? ELSEWHERE

/** Where a finger's stroke sits in the array `at()` returns: left hand first, fingers in FINGERS order. */
export const strokeSlot = (hand, finger) => HANDS.indexOf(hand) * FINGERS.length + FINGERS.indexOf(finger)

/** Letters next to `char` on its keyboard row: the keys a slipping finger hits instead. */
export const neighbours = (char) => {
  const lower = char.toLowerCase()
  const row = ROWS.find((r) => r.includes(lower))
  if (!row) return []
  const at = row.indexOf(lower)
  const near = [row[at - 1], row[at + 1]].filter(Boolean)
  return char === lower ? near : near.map((c) => c.toUpperCase())
}

// Where each key sits on a US keyboard, in key widths: x across, y toward him (number row -2, home row 0)
const KEY_ROWS = [
  { y: -2, x: 0, keys: ['`~', '1!', '2@', '3#', '4$', '5%', '6^', '7&', '8*', '9(', '0)', '-_', '=+'] },
  { y: -1, x: 1.5, keys: ['qQ', 'wW', 'eE', 'rR', 'tT', 'yY', 'uU', 'iI', 'oO', 'pP', '[{', ']}', '\\|'] },
  { y: 0, x: 1.75, keys: ['aA', 'sS', 'dD', 'fF', 'gG', 'hH', 'jJ', 'kK', 'lL', ';:', '\'"'] },
  { y: 1, x: 2.25, keys: ['zZ', 'xX', 'cC', 'vV', 'bB', 'nN', 'mM', ',<', '.>', '/?'] },
]
const KEY_POSITION = new Map([
  ['\n', [12.9, 0]],
  [BACKSPACE, [13.5, -2]],
])
for (const row of KEY_ROWS) row.keys.forEach((pair, i) => [...pair].forEach((c) => KEY_POSITION.set(c, [row.x + i, row.y])))
const HOME = Object.freeze({
  L: { little: 'a', ring: 's', middle: 'd', index: 'f' },
  R: { index: 'j', middle: 'k', ring: 'l', little: ';' },
})
// The hand drifts part of the way toward the keys it's using; the finger reaches the rest
export const HAND_SHARE = Object.freeze([0.5, 0.7])

/** Where `char` is from the home key of the finger that types it, in key widths [across, toward him]. */
export const keyOffset = (char) => {
  const { hand, finger } = fingerFor(char)
  const key = KEY_POSITION.get(char)
  if (finger === 'thumb' || !key) return [0, 0]
  const home = KEY_POSITION.get(HOME[hand][finger])
  return [key[0] - home[0], key[1] - home[1]]
}

/** How far (in key widths, [across, toward him]) the hand typing `char` would shift from home. Thumbs never move it. */
export const handReach = (char) => {
  const [across, toward] = keyOffset(char)
  return [HAND_SHARE[0] * across, HAND_SHARE[1] * toward]
}

// Coding pace, not transcription: bursts inside words, slower symbols, beats at line ends, stops to think,
// the odd typo. Averages about 3 characters a second, as people writing code do.
export const RHYTHM = Object.freeze({
  charsPerSecond: 5, // inside a word
  wordGap: Object.freeze([1.1, 1.6]), // the beat after a space, in keystrokes
  symbolSlow: Object.freeze([1.3, 1.9]), // symbols take longer to find
  newlinePause: Object.freeze([0.5, 1.4]),
  punctuationPause: 0.25,
  thinkChance: 1 / 60,
  thinkPause: Object.freeze([2.5, 5]),
  typoChance: 1 / 35, // per letter
  noticeDelay: Object.freeze([0.3, 0.6]),
  backspaceGap: Object.freeze([0.09, 0.14]),
  glanceGap: Object.freeze([12, 30]),
  holdAtEnd: 6, // the finished shader stays up (he sits back) before he starts again
})
export const GLANCE = Object.freeze({ keys: 1.3, phone: 1.7 }) // how long each kind of glance lasts
// A glance goes a touch past its mark and settles, holds, and comes back slower. The shoulders start
// later, move slower, and finish with the head.
export const GLANCE_SHAPE = Object.freeze({ out: 0.45, back: 0.6, trail: 0.12, trailOut: 0.6, overshoot: 0.05 })
const OVERSHOOT_PEAK = 0.7 // share of a move spent getting to its furthest point
// A hand drifts toward the average of the keys it's using around now (a smooth window this wide, in s),
// pulled home by this much weight, so it glides instead of hopping from key to key
export const HAND_DRIFT = Object.freeze({ sigma: 0.55, home: 1.2 })
// A finger turns toward its key a little before pressing and relaxes back after
const AIM_LEAD = 0.08
// Typing intensity: a smooth sum over recent keystrokes (peaking `tau` after each), full at this many a second
const PACE = Object.freeze({ tau: 0.6, window: 8, full: 4.5 })
// "Active" time only runs while he's hitting keys: a gap this long is a stop (hands still), after a moment's grace
export const ACTIVE = Object.freeze({ stop: 0.7, grace: 0.15 })

// A keystroke, the way fingers really type: the finger presses down from where it rests (the character
// appears as the key bottoms out), springs back up a touch past rest, and settles
export const STROKE = Object.freeze({ down: 0.07, up: 0.09, settle: 0.12, rebound: 0.25 })
const STROKE_AFTER = STROKE.up + STROKE.settle

/** Stroke shape at `dt` seconds from the key landing: 0 resting, 1 pressed fully down, below 0 the lift after. */
export const strokeAt = (dt) => {
  if (dt <= -STROKE.down || dt >= STROKE_AFTER) return 0
  if (dt < 0) return smooth((dt + STROKE.down) / STROKE.down)
  if (dt < STROKE.up) return 1 - (1 + STROKE.rebound) * smooth(dt / STROKE.up)
  return -STROKE.rebound * (1 - smooth((dt - STROKE.up) / STROKE.settle))
}

/** How turned toward its key a finger is, `dt` s from the key landing: 1 from just before the press to the release. */
const aimAt = (dt) => {
  if (dt < -STROKE.down) return smooth((dt + STROKE.down + AIM_LEAD) / AIM_LEAD)
  return dt <= STROKE.up ? 1 : 1 - smooth((dt - STROKE.up) / STROKE.settle)
}

/** Small, fast, seeded PRNG (mulberry32). */
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
const clamp01 = (x) => Math.min(1, Math.max(0, x))
const smooth = (x) => {
  const t = clamp01(x)
  return t * t * (3 - 2 * t)
}
const HOME_REACH = Object.freeze([0, 0])
/**
 * A move that starts and stops gently but goes `overshoot` (a fraction) past its mark and settles back:
 * 0 at 0, 1 at 1, still at both ends and at its furthest point.
 */
export const overshootEase = (x, overshoot = GLANCE_SHAPE.overshoot) => {
  const t = clamp01(x)
  if (t < OVERSHOOT_PEAK) return (1 + overshoot) * smooth(t / OVERSHOOT_PEAK)
  return 1 + overshoot * (1 - smooth((t - OVERSHOOT_PEAK) / (1 - OVERSHOOT_PEAK)))
}
const isWordChar = (c) => /\w/.test(c)

/** How many of `times` are at or before `t`. */
const countUpTo = (times, t) => {
  let low = 0
  let high = times.length
  while (low < high) {
    const mid = (low + high) >> 1
    if (times[mid] <= t) low = mid + 1
    else high = mid
  }
  return low
}

/** Seconds from the previous keystroke to the one typing text[i]. */
const gapBefore = (text, i, rhythm, random) => {
  const previous = text[i - 1]
  let gap = (0.7 + 0.5 * random()) / rhythm.charsPerSecond
  if (previous === ' ') gap *= between(rhythm.wordGap, random())
  else if (!isWordChar(text[i]) && !' \n'.includes(text[i])) gap *= between(rhythm.symbolSlow, random())
  if (previous === '\n') gap += between(rhythm.newlinePause, random())
  else if (previous && ';{}'.includes(previous)) gap += rhythm.punctuationPause
  if (random() < rhythm.thinkChance) gap += between(rhythm.thinkPause, random())
  return gap
}

/** Every keystroke: when, which key, and what's on screen after it (correct characters, then a wrong tail). */
const scheduleKeystrokes = (text, rhythm, random) => {
  const keystrokes = []
  let t = 0
  let typed = 0
  const press = (key, gap, extra, after = typed) => {
    t += gap
    keystrokes.push({ time: t, key, typed: after, extra })
  }
  const quick = () => (0.7 + 0.5 * random()) / rhythm.charsPerSecond
  while (typed < text.length) {
    const char = text[typed]
    let gap = gapBefore(text, typed, rhythm, random)
    if (/[a-z]/i.test(char) && random() < rhythm.typoChance) {
      // a slip to the next key, sometimes one more character before he notices, then back over them
      const slips = neighbours(char)
      let extra = slips[Math.floor(random() * slips.length)]
      press(extra, gap, extra)
      const following = text[typed + 1]
      if (random() < 0.4 && following && following !== '\n') press(following, quick(), (extra += following))
      for (let pause = between(rhythm.noticeDelay, random()); extra; pause = between(rhythm.backspaceGap, random())) {
        extra = extra.slice(0, -1)
        press(BACKSPACE, pause, extra)
      }
      gap = quick()
    }
    let next = typed + 1
    if (char === '\n') while (text[next] === ' ') next++ // the editor auto-indents
    press(char, gap, '', next)
    typed = next
  }
  return { keystrokes, end: t }
}

const scheduleGlances = (end, rhythm, random) => {
  const glances = []
  for (let t = between(rhythm.glanceGap, random()); t < end; t += between(rhythm.glanceGap, random())) {
    const kind = random() < 0.6 ? 'keys' : 'phone'
    glances.push({ start: t, length: GLANCE[kind], kind })
  }
  return glances
}

/** How far into a glance window [start, start + length] he has turned: out, settle, hold, back slower. */
const glanceCurve = (t, start, length, out) => {
  const into = t - start
  const left = length - into
  if (into <= 0 || left <= 0) return 0
  return Math.min(overshootEase(into / out), smooth(left / GLANCE_SHAPE.back))
}

/** The glance under way at `t`, or null. `trail` is the shoulders: they start later but finish with the head. */
const glanceAt = (glances, starts, t) => {
  const glance = glances[countUpTo(starts, t) - 1]
  if (!glance || t >= glance.start + glance.length) return null
  return {
    kind: glance.kind,
    amount: glanceCurve(t, glance.start, glance.length, GLANCE_SHAPE.out),
    trail: glanceCurve(t, glance.start + GLANCE_SHAPE.trail, glance.length - GLANCE_SHAPE.trail, GLANCE_SHAPE.trailOut),
  }
}

/** One hand's keys (thumbs excluded): when each lands and how far the hand would shift for it. */
const handTrack = (keystrokes, hand) => {
  const own = keystrokes.filter((k) => {
    const typist = fingerFor(k.key)
    return typist.hand === hand && typist.finger !== 'thumb'
  })
  return { times: Float64Array.from(own, (k) => k.time), reach: own.map((k) => handReach(k.key)) }
}

/** Where a hand is at `t` (key widths from home): a smooth average of the keys it's using around now. */
const handAt = ({ times, reach }, t) => {
  const span = 4 * HAND_DRIFT.sigma // weights past this are under 0.04%
  let across = 0
  let toward = 0
  let weight = HAND_DRIFT.home
  for (let i = countUpTo(times, t - span); i < times.length && times[i] < t + span; i++) {
    const w = Math.exp(-0.5 * ((times[i] - t) / HAND_DRIFT.sigma) ** 2)
    across += w * reach[i][0]
    toward += w * reach[i][1]
    weight += w
  }
  return [across / weight, toward / weight]
}

/** What's left for each finger to reach once the hand has drifted: its key's offset minus the hand's, per keystroke. */
const fingerReaches = (keystrokes, tracks) =>
  keystrokes.map(({ key, time }) => {
    const { hand, finger } = fingerFor(key)
    if (finger === 'thumb') return HOME_REACH
    const offset = keyOffset(key)
    const drifted = handAt(tracks[hand], time)
    return [offset[0] - drifted[0], offset[1] - drifted[1]]
  })

/** 0..1: how hard he is typing right now, smooth in time (each keystroke's share rises from 0, then fades). */
const paceAt = (times, last, t) => {
  let sum = 0
  for (let i = last; i >= 0 && t - times[i] < PACE.window * PACE.tau; i--) {
    const x = (t - times[i]) / PACE.tau
    sum += x * Math.exp(1 - x)
  }
  return Math.min(1, sum / (PACE.full * Math.E * PACE.tau))
}

/**
 * @param {string} text what he types, exactly as the monitor shows it
 * @param {{ seed?: number, startAt?: number }} options startAt: characters already on screen at time 0
 * @returns {{ text: string, duration: number, at: (time: number) => TypingState }}
 * TypingState: { typed, extra, strokes: Float32Array (1 pressed down), aims: Float32Array (per finger [across, toward]
 *   key widths still to reach), pause: { since, until, length, index },
 *   glance: { kind, amount, trail } | null, hands: { L: [x, y], R: [x, y] } (key widths from home), pace: 0..1,
 *   active: s of actual typing so far in this pass (stops of ACTIVE.stop or more don't count, past ACTIVE.grace) }
 */
export const createTypingTimeline = (text, { seed = 7, startAt = 0, ...overrides } = {}) => {
  const rhythm = { ...RHYTHM, ...overrides }
  const random = seeded(seed)
  const { keystrokes, end } = scheduleKeystrokes(text, rhythm, random)
  const times = Float64Array.from(keystrokes, (k) => k.time)
  const duration = end + rhythm.holdAtEnd
  const glances = scheduleGlances(end, rhythm, random)
  const glanceStarts = Float64Array.from(glances, (g) => g.start)
  const tracks = Object.fromEntries(HANDS.map((hand) => [hand, handTrack(keystrokes, hand)]))
  const reaches = fingerReaches(keystrokes, tracks)
  const opening = startAt > 0 ? (keystrokes.find((k) => k.typed >= startAt)?.time ?? 0) : 0
  // the stops in one pass (pass time), with how much stopped time came before each, for active()
  const stops = []
  let stopped = 0
  const addStop = (start, length) => {
    if (length < ACTIVE.stop) return
    stops.push({ from: start + ACTIVE.grace, to: start + length, before: stopped })
    stopped += length - ACTIVE.grace
  }
  addStop(0, times.length ? times[0] : duration)
  for (let i = 0; i + 1 < times.length; i++) addStop(times[i], times[i + 1] - times[i])
  if (times.length) addStop(times[times.length - 1], duration - times[times.length - 1])
  const stopFroms = Float64Array.from(stops, (s) => s.from)
  /** Seconds of actual typing in this pass up to pass time `local`. */
  const activeAt = (local) => {
    const k = countUpTo(stopFroms, local) - 1
    if (k < 0) return local
    const stop = stops[k]
    return local - stop.before - (Math.min(local, stop.to) - stop.from)
  }

  const at = (time) => {
    // Wrap into one pass; adding `duration` only when negative keeps exact times exact
    const wrapped = (time + opening) % duration
    const local = wrapped < 0 ? wrapped + duration : wrapped
    const last = countUpTo(times, local) - 1
    const shown = last >= 0 ? keystrokes[last] : { typed: 0, extra: '' }
    const strokes = new Float32Array(HANDS.length * FINGERS.length)
    const aims = new Float32Array(2 * HANDS.length * FINGERS.length) // per finger: [across, toward] still to reach
    const aimWeights = new Float32Array(HANDS.length * FINGERS.length)
    const strike = (i) => {
      const { hand, finger } = fingerFor(keystrokes[i].key)
      const slot = strokeSlot(hand, finger)
      const amount = strokeAt(local - times[i])
      if (Math.abs(amount) > Math.abs(strokes[slot])) strokes[slot] = amount
      const aim = aimAt(local - times[i])
      aims[2 * slot] += aim * reaches[i][0]
      aims[2 * slot + 1] += aim * reaches[i][1]
      aimWeights[slot] += aim
    }
    for (let i = last; i >= 0 && local - times[i] < STROKE_AFTER; i--) strike(i)
    for (let i = last + 1; i < times.length && times[i] - local < STROKE.down + AIM_LEAD; i++) strike(i)
    // overlapping aims of one finger blend instead of switching, so the finger never jumps
    aimWeights.forEach((w, slot) => {
      if (w > 1) {
        aims[2 * slot] /= w
        aims[2 * slot + 1] /= w
      }
    })
    const since = local - (last >= 0 ? times[last] : 0)
    const until = (last + 1 < times.length ? times[last + 1] : duration) - local
    return {
      typed: shown.typed,
      extra: shown.extra,
      strokes,
      aims,
      pause: { since, until, length: since + until, index: last },
      glance: glanceAt(glances, glanceStarts, local),
      hands: { L: handAt(tracks.L, local), R: handAt(tracks.R, local) },
      pace: paceAt(times, last, local),
      active: activeAt(local),
    }
  }

  /**
   * Every gap between keystrokes at least `minLength` s long, in this timeline's own time (as `at` takes it),
   * over one pass from 0, sorted. The hold at the end counts. Reads the schedule only: no random draws.
   */
  const pauses = (minLength) => {
    const found = []
    const keep = (start, length) => {
      if (length < minLength) return
      const shifted = (start - opening) % duration
      found.push({ start: shifted < 0 ? shifted + duration : shifted, length })
    }
    keep(0, times.length ? times[0] : duration)
    for (let i = 0; i + 1 < times.length; i++) keep(times[i], times[i + 1] - times[i])
    if (times.length) keep(times[times.length - 1], duration - times[times.length - 1])
    return found.sort((a, b) => a.start - b.start)
  }

  return { text, duration, at, pauses }
}
