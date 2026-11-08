import { describe, expect, it } from 'vitest'
import { roomFragment } from '@/components/studio/shaders/room.glsl'
import { normaliseSource } from '@/lib/studio/code'
import { BACKSPACE, FINGERS, HANDS, STROKE, createTypingTimeline, fingerFor, neighbours, strokeAt, strokeSlot } from '@/lib/studio/typing'

const CODE = 'void main() {\n  float x = 1.0;\n}'

describe('which finger types a key', () => {
  it('follows touch typing on a US layout', () => {
    expect(fingerFor('a')).toEqual({ hand: 'L', finger: 'little' })
    expect(fingerFor('F')).toEqual({ hand: 'L', finger: 'index' })
    expect(fingerFor('j')).toEqual({ hand: 'R', finger: 'index' })
    expect(fingerFor('(')).toEqual({ hand: 'R', finger: 'ring' })
  })

  it('takes space with the right thumb, Enter and backspace with the right little finger', () => {
    expect(fingerFor(' ')).toEqual({ hand: 'R', finger: 'thumb' })
    expect(fingerFor('\n')).toEqual({ hand: 'R', finger: 'little' })
    expect(fingerFor(BACKSPACE)).toEqual({ hand: 'R', finger: 'little' })
  })

  it('slips onto the keys either side on the same row, keeping the case', () => {
    expect(neighbours('s')).toEqual(['a', 'd'])
    expect(neighbours('Q')).toEqual(['W'])
    expect(neighbours('1')).toEqual([])
  })

  it('sends keys it does not know to the right little finger', () => {
    expect(fingerFor('§')).toEqual({ hand: 'R', finger: 'little' })
  })

  it('gives every finger of both hands its own stroke slot', () => {
    const slots = HANDS.flatMap((hand) => FINGERS.map((finger) => strokeSlot(hand, finger)))
    expect(new Set(slots).size).toBe(HANDS.length * FINGERS.length)
    expect(Math.min(...slots)).toBe(0)
  })
})

describe('a keystroke', () => {
  it('rests before and after, lifts before the character appears and sinks with the key', () => {
    expect(strokeAt(-STROKE.lift - 0.01)).toBe(0)
    expect(strokeAt(-STROKE.lift / 2)).toBeCloseTo(1)
    expect(strokeAt(STROKE.travel / 2)).toBeCloseTo(-STROKE.sink)
    expect(strokeAt(STROKE.travel + 0.01)).toBe(0)
  })
})

describe('typing timeline', () => {
  it('starts with nothing on screen and fills it in order', () => {
    const timeline = createTypingTimeline(CODE)
    expect(timeline.at(0).typed).toBe(0)
    const counts = [0.5, 1, 2, 3, 4].map((t) => timeline.at(t).typed)
    expect(counts).toEqual([...counts].sort((a, b) => a - b))
    expect(timeline.at(timeline.duration - 0.01).typed).toBe(CODE.length)
  })

  it('shows the same rhythm on every visit', () => {
    const a = createTypingTimeline(CODE, { seed: 3 })
    const b = createTypingTimeline(CODE, { seed: 3 })
    expect(a.duration).toBe(b.duration)
    expect(a.at(1.234).typed).toBe(b.at(1.234).typed)
  })

  it('starts over once the finished code has been up a while', () => {
    const timeline = createTypingTimeline(CODE)
    expect(timeline.at(timeline.duration + 0.001).typed).toBe(0)
  })

  it('auto-indents: the spaces after a newline need no keystrokes', () => {
    const timeline = createTypingTimeline('a\n    b', { thinkChance: 0, typoChance: 0 })
    let newlineAt = 0
    while (timeline.at(newlineAt).typed < 2) newlineAt += 0.001
    expect(timeline.at(newlineAt).typed).toBe(6) // the newline and its four spaces arrive together
  })

  it('lifts the finger that types the next character just before it appears', () => {
    const timeline = createTypingTimeline('j', { thinkChance: 0, typoChance: 0 })
    let appears = 0
    while (timeline.at(appears).typed < 1) appears += 0.001
    const { strokes } = timeline.at(appears - STROKE.lift / 2)
    expect(strokes[strokeSlot('R', 'index')]).toBeGreaterThan(0.9)
    expect(strokes[strokeSlot('L', 'index')]).toBe(0)
  })
})

describe('arriving mid-session', () => {
  it('opens with the first characters already on screen', () => {
    const timeline = createTypingTimeline(CODE, { startAt: 14 })
    expect(timeline.at(0).typed).toBeGreaterThanOrEqual(14)
    expect(timeline.at(0).typed).toBeLessThan(CODE.length)
  })
})

const sample = (timeline, step = 0.01) => {
  const moments = []
  for (let t = 0; t < timeline.duration; t += step) moments.push({ t, ...timeline.at(t) })
  return moments
}

describe('typos', () => {
  const text = 'hello world'
  const moments = sample(createTypingTimeline(text, { typoChance: 1, thinkChance: 0 }))

  it('shows a wrong character, then backspaces it away and finishes the text', () => {
    expect(moments.some((m) => m.extra !== '')).toBe(true)
    expect(Math.max(...moments.map((m) => m.extra.length))).toBeLessThanOrEqual(2)
    const done = moments.at(-1)
    expect(done.typed).toBe(text.length)
    expect(done.extra).toBe('')
  })

  it('never moves on past a slip it has not fixed', () => {
    for (let i = 1; i < moments.length; i++) {
      if (moments[i].typed > moments[i - 1].typed) expect(moments[i - 1].extra).toBe('')
    }
  })

  it('backspaces with the right little finger', () => {
    // no letter in "hello world" is the right little finger's, so any stroke there is a backspace
    expect(moments.some((m) => m.strokes[strokeSlot('R', 'little')] > 0.5)).toBe(true)
  })
})

describe('pace, pauses and glances on the room shader', () => {
  const code = normaliseSource(roomFragment)
  const timeline = createTypingTimeline(code)

  it('averages a coding pace of 2.5 to 3.5 characters a second', () => {
    const pace = code.length / timeline.duration
    expect(pace).toBeGreaterThan(2.5)
    expect(pace).toBeLessThan(3.5)
  })

  it('reports how long he has paused and how long until the next keystroke', () => {
    let t = 1
    const before = timeline.at(t).typed
    while (timeline.at(t).typed === before) t += 0.001
    expect(timeline.at(t).pause.since).toBeLessThan(0.002)
    const { pause } = timeline.at(t + 0.05)
    expect(pause.since + pause.until).toBeCloseTo(pause.length)
  })

  it('glances at the keys or the phone now and then, the same way every visit', () => {
    const again = createTypingTimeline(code)
    let t = 0
    while (!timeline.at(t).glance && t < timeline.duration) t += 0.5
    const { glance } = timeline.at(t)
    expect(['keys', 'phone']).toContain(glance.kind)
    expect(glance.amount).toBeGreaterThan(0)
    expect(again.at(t).glance).toEqual(glance)
  })
})
