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
export const GLANCE = Object.freeze({ keys: 0.8, phone: 1.2 }) // how long each kind of glance lasts
const GLANCE_EASE = 0.2

// A keystroke: the finger lifts, comes down as the character appears, and sinks with the key's travel
export const STROKE = Object.freeze({ lift: 0.12, travel: 0.06, sink: 0.25 })

/** Stroke shape at `dt` seconds from the key landing: 0 resting, 1 fully lifted, below 0 pressing. */
export const strokeAt = (dt) => {
  if (dt <= -STROKE.lift || dt >= STROKE.travel) return 0
  if (dt < 0) return Math.sin((Math.PI * (dt + STROKE.lift)) / STROKE.lift)
  return -STROKE.sink * Math.sin((Math.PI * dt) / STROKE.travel)
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

/** The glance under way at `t`, eased in and out, or null. */
const glanceAt = (glances, starts, t) => {
  const glance = glances[countUpTo(starts, t) - 1]
  if (!glance || t > glance.start + glance.length) return null
  const into = Math.min(t - glance.start, glance.start + glance.length - t)
  return { kind: glance.kind, amount: Math.min(1, into / GLANCE_EASE) }
}

/**
 * @param {string} text what he types, exactly as the monitor shows it
 * @param {{ seed?: number, startAt?: number }} options startAt: characters already on screen at time 0
 * @returns {{ text: string, duration: number, at: (time: number) => TypingState }}
 * TypingState: { typed, extra, strokes: Float32Array, pause: { since, until, length }, glance: { kind, amount } | null }
 */
export const createTypingTimeline = (text, { seed = 7, startAt = 0, ...overrides } = {}) => {
  const rhythm = { ...RHYTHM, ...overrides }
  const random = seeded(seed)
  const { keystrokes, end } = scheduleKeystrokes(text, rhythm, random)
  const times = Float64Array.from(keystrokes, (k) => k.time)
  const duration = end + rhythm.holdAtEnd
  const glances = scheduleGlances(end, rhythm, random)
  const glanceStarts = Float64Array.from(glances, (g) => g.start)
  const opening = startAt > 0 ? (keystrokes.find((k) => k.typed >= startAt)?.time ?? 0) : 0

  const at = (time) => {
    // Wrap into one pass; adding `duration` only when negative keeps exact times exact
    const wrapped = (time + opening) % duration
    const local = wrapped < 0 ? wrapped + duration : wrapped
    const last = countUpTo(times, local) - 1
    const shown = last >= 0 ? keystrokes[last] : { typed: 0, extra: '' }
    const strokes = new Float32Array(HANDS.length * FINGERS.length)
    const strike = (i) => {
      const { hand, finger } = fingerFor(keystrokes[i].key)
      const slot = strokeSlot(hand, finger)
      const amount = strokeAt(local - times[i])
      if (Math.abs(amount) > Math.abs(strokes[slot])) strokes[slot] = amount
    }
    for (let i = last; i >= 0 && local - times[i] < STROKE.travel; i--) strike(i)
    for (let i = last + 1; i < times.length && times[i] - local < STROKE.lift; i++) strike(i)
    const since = local - (last >= 0 ? times[last] : 0)
    const until = (last + 1 < times.length ? times[last + 1] : duration) - local
    return { typed: shown.typed, extra: shown.extra, strokes, pause: { since, until, length: since + until }, glance: glanceAt(glances, glanceStarts, local) }
  }

  return { text, duration, at }
}
