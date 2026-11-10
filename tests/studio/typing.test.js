import { describe, expect, it } from 'vitest'
import { roomFragment } from '@/components/studio/shaders/room.glsl'
import { lineStarts, normaliseSource } from '@/lib/studio/code'
import {
  BACKSPACE,
  FINGERS,
  GLANCE_SHAPE,
  HANDS,
  HAND_SHARE,
  STROKE,
  createTypingTimeline,
  fingerFor,
  handReach,
  keyOffset,
  neighbours,
  overshootEase,
  strokeAt,
  strokeSlot,
} from '@/lib/studio/typing'

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
  it('rests before and after, presses down as the character appears, then lifts a touch and settles', () => {
    expect(strokeAt(-STROKE.down - 0.01)).toBe(0)
    expect(strokeAt(-STROKE.down / 2)).toBeCloseTo(0.5)
    expect(strokeAt(0)).toBe(1)
    expect(strokeAt(STROKE.up)).toBeCloseTo(-STROKE.rebound)
    expect(strokeAt(STROKE.up + STROKE.settle + 0.01)).toBe(0)
    let previous = strokeAt(-0.2)
    for (let dt = -0.2; dt < 0.4; dt += 0.001) {
      expect(Math.abs(strokeAt(dt) - previous)).toBeLessThan(0.05) // no snaps
      previous = strokeAt(dt)
    }
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

  it('presses the finger that types the next character down just before it appears', () => {
    const timeline = createTypingTimeline('j', { thinkChance: 0, typoChance: 0 })
    let appears = 0
    while (timeline.at(appears).typed < 1) appears += 0.001
    const { strokes } = timeline.at(appears - 0.01)
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

describe('the same keystrokes as before the motion pass', () => {
  it('keeps the seed-7 session on the room shader exactly as it was', () => {
    // Fingerprint of the schedule from before hands, pace and shaped glances were added. Re-recorded
    // deliberately, whenever the room shader he types gains layers (P1: figure gone, screen off; P2: him up, guitar off)
    const timeline = createTypingTimeline(normaliseSource(roomFragment))
    let checksum = 0
    for (let i = 0; i < 4000; i++) {
      const { typed, extra } = timeline.at(i * 0.377)
      checksum = (checksum * 31 + typed * 7 + extra.length) % 1000000007
    }
    expect(timeline.duration).toBeCloseTo(1929.6825382623651, 9)
    expect(checksum).toBe(801999114)
  })
})

describe('where his hands go on the keyboard', () => {
  it('stays home for the home keys, the space bar and keys it does not know', () => {
    for (const key of ['a', 's', 'd', 'f', 'j', 'k', 'l', ';', ' ', '\u00e9']) expect(handReach(key)).toEqual([0, 0])
  })

  it('shifts part of the way toward a key: across for g, away for the top row, toward him for the bottom', () => {
    expect(handReach('g')).toEqual([HAND_SHARE[0], 0])
    expect(handReach('h')).toEqual([-HAND_SHARE[0], 0])
    expect(handReach('e')[1]).toBeCloseTo(-HAND_SHARE[1])
    expect(handReach('m')[1]).toBeCloseTo(HAND_SHARE[1])
  })

  it('reaches out right and up for Enter and backspace, and the same for a shifted key', () => {
    expect(handReach('\n')[0]).toBeGreaterThan(1)
    expect(handReach(BACKSPACE)[0]).toBeGreaterThan(1)
    expect(handReach(BACKSPACE)[1]).toBeLessThan(-1)
    expect(handReach('(')).toEqual(handReach('9'))
  })

  it('moves smoothly between keys and goes home when he stops', () => {
    const timeline = createTypingTimeline(normaliseSource(roomFragment))
    let previous = timeline.at(0).hands
    for (let t = 0.01; t < 120; t += 0.01) {
      const { hands } = timeline.at(t)
      for (const hand of HANDS) {
        // half a key width in 10 ms is under 1 m/s
        expect(Math.hypot(hands[hand][0] - previous[hand][0], hands[hand][1] - previous[hand][1])).toBeLessThan(0.5)
      }
      previous = hands
    }
    const end = timeline.at(timeline.duration - 1)
    expect(end.hands).toEqual({ L: [0, 0], R: [0, 0] })
  })
})

describe('what the fingers reach for', () => {
  it('measures each key from the home key of the finger that types it', () => {
    expect(keyOffset('f')).toEqual([0, 0])
    expect(keyOffset('g')).toEqual([1, 0])
    expect(keyOffset('e')).toEqual([-0.25, -1])
    expect(handReach('e')).toEqual([-0.25 * HAND_SHARE[0], -HAND_SHARE[1]])
  })

  it('aims the striking finger at its key: the finger covers what the hand has not', () => {
    const timeline = createTypingTimeline('feel', { thinkChance: 0, typoChance: 0 })
    let t = 0
    while (timeline.at(t).typed < 2) t += 0.001 // the first e lands
    const { aims, hands } = timeline.at(t)
    const slot = strokeSlot('L', 'middle')
    expect(aims[2 * slot] + hands.L[0]).toBeCloseTo(keyOffset('e')[0], 1)
    expect(aims[2 * slot + 1] + hands.L[1]).toBeCloseTo(keyOffset('e')[1], 1)
  })

  it('relaxes every finger back once he stops', () => {
    const timeline = createTypingTimeline('feel', { thinkChance: 0, typoChance: 0 })
    expect([...timeline.at(timeline.duration - 1).aims].every((v) => v === 0)).toBe(true)
  })
})

describe('how hard he is typing', () => {
  const timeline = createTypingTimeline(normaliseSource(roomFragment))

  it('stays between 0 and 1 and changes smoothly', () => {
    let previous = timeline.at(0).pace
    for (let t = 0.01; t < 120; t += 0.01) {
      const { pace } = timeline.at(t)
      expect(pace).toBeGreaterThanOrEqual(0)
      expect(pace).toBeLessThanOrEqual(1)
      expect(Math.abs(pace - previous)).toBeLessThan(0.05)
      previous = pace
    }
  })

  it('is high in a run of keys and falls away in a long pause', () => {
    let t = 1
    while (timeline.at(t).pause.length < 2.5) t += 0.05
    const stopped = timeline.at(t)
    const late = timeline.at(t + stopped.pause.until - 0.01)
    expect(stopped.pace).toBeGreaterThan(0.4)
    expect(late.pace).toBeLessThan(0.15)
  })

  it('names each pause by the keystroke it follows, the same all the way through', () => {
    let t = 1
    while (timeline.at(t).pause.length < 1) t += 0.05
    const { pause } = timeline.at(t)
    const later = timeline.at(t + pause.until - 0.01).pause
    expect(later.index).toBe(pause.index)
    expect(timeline.at(t + pause.until + 0.001).pause.index).toBe(pause.index + 1)
  })
})

describe('the shape of a glance', () => {
  const timeline = createTypingTimeline(normaliseSource(roomFragment))
  const firstGlance = () => {
    let t = 0
    while (!timeline.at(t).glance) t += 0.01
    return t
  }

  it('starts and stops gently and goes only a touch past its mark', () => {
    expect(overshootEase(0)).toBe(0)
    expect(overshootEase(1)).toBe(1)
    let peak = 0
    for (let x = 0; x <= 1; x += 0.001) peak = Math.max(peak, overshootEase(x))
    expect(peak).toBeCloseTo(1 + GLANCE_SHAPE.overshoot, 3)
    expect(overshootEase(0.01)).toBeLessThan(0.01)
  })

  it('turns out quicker than it comes back, with the shoulders behind the head', () => {
    const start = firstGlance()
    const samples = []
    for (let t = start; timeline.at(t).glance; t += 0.01) samples.push(timeline.at(t).glance)
    const peakAt = samples.findIndex((g) => g.amount >= 1)
    const backFrom = samples.length - samples.slice().reverse().findIndex((g) => g.amount >= 1)
    expect(peakAt).toBeLessThan(samples.length - backFrom)
    expect(samples[peakAt].trail).toBeLessThan(samples[peakAt].amount)
    expect(Math.max(...samples.map((g) => g.amount))).toBeLessThanOrEqual(1 + GLANCE_SHAPE.overshoot + 1e-9)
    expect(samples.at(-1).trail).toBeLessThan(0.05)
  })
})

describe('pauses', () => {
  it('lists every gap at least as long as asked, where at() sees it', () => {
    const room = normaliseSource(roomFragment)
    const timeline = createTypingTimeline(room, { startAt: lineStarts(room)[12] })
    const pauses = timeline.pauses(2.5)
    expect(pauses.length).toBeGreaterThan(40)
    for (const { start, length } of pauses) {
      expect(length).toBeGreaterThanOrEqual(2.5)
      expect(start).toBeGreaterThanOrEqual(0)
      expect(start).toBeLessThan(timeline.duration)
      expect(timeline.at(start + 0.01).pause.length).toBeCloseTo(length, 6)
    }
  })
})

describe('active typing time', () => {
  it('runs only while he is hitting keys: it stands still through a stop, keeps going through a quick gap', () => {
    const room = normaliseSource(roomFragment)
    const timeline = createTypingTimeline(room, { startAt: lineStarts(room)[12] })
    const [stop] = timeline.pauses(2.5)
    const a = timeline.at(stop.start + 0.5).active
    const b = timeline.at(stop.start + stop.length - 0.1).active
    expect(b).toBeCloseTo(a, 9) // a long stop: still
    let previous = timeline.at(0).active
    for (let t = 0.01; t < 60; t += 0.01) {
      const now = timeline.at(t).active
      expect(now - previous).toBeGreaterThanOrEqual(-1e-9) // never runs backwards
      expect(now - previous).toBeLessThanOrEqual(0.01 + 1e-9) // never faster than the clock
      previous = now
    }
  })
})
