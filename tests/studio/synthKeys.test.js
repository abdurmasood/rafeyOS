import { describe, expect, it } from 'vitest'
import { KEY_EASE, KEY_REACH, createKeyPresser, keyUnder } from '@/lib/studio/synthKeys'

// Three white keys side by side along z, pointing along +x (back at x 0, front at x 0.15), tops at y 0.8,
// and a black key over the gap between the first two, shorter and higher
const white = (z) => ({ back: [0, 0.8, z], front: [0.15, 0.8, z], half: 0.011, black: false })
const KEYS = [white(0), { back: [0, 0.81, 0.0115], front: [0.09, 0.81, 0.0115], half: 0.006, black: true }, white(0.023), white(0.046)]

describe("Synth A's keys under his fingers", () => {
  const { frames } = createKeyPresser(KEYS)

  it('finds the white key a fingertip is over, and none beside, behind or high above the keys', () => {
    expect(keyUnder(frames, [0.12, 0.8, 0.023])).toBe(2)
    expect(keyUnder(frames, [0.12, 0.8, 0.046])).toBe(3)
    expect(keyUnder(frames, [0.12, 0.8, 0.09])).toBe(-1) // past the last key
    expect(keyUnder(frames, [-0.02, 0.8, 0.023])).toBe(-1) // behind the keys
    expect(keyUnder(frames, [0.12, 0.8 + KEY_REACH.above + 0.01, 0.023])).toBe(-1) // hovering well above
  })

  it('takes the black key when a fingertip is on it, the white key in front of it otherwise', () => {
    expect(keyUnder(frames, [0.05, 0.81, 0.0115])).toBe(1)
    expect(keyUnder(frames, [0.13, 0.8, 0.008])).toBe(0) // in front of the black key: the white one
  })

  it('presses a key quickly, lets it up a little slower, and only the keys a finger is down on', () => {
    const presser = createKeyPresser(KEYS)
    const tips = [[0.12, 0.8, 0.023], [0.12, 0.8, 0.046]]
    let press = presser.update(tips, [1, 0], KEY_EASE.down)
    expect(press[2]).toBeCloseTo(1, 6) // down within its down time
    expect(press[3]).toBe(0) // that finger isn't down
    press = presser.update(tips, [0, 0], KEY_EASE.down)
    expect(press[2]).toBeGreaterThan(0.5) // still on its way up: up is slower than down
    for (let i = 0; i < 10; i++) press = presser.update(tips, [0, 0], KEY_EASE.up)
    expect(press[2]).toBeCloseTo(0, 6)
  })

  it('presses a key only as far as the finger is down', () => {
    const presser = createKeyPresser(KEYS)
    const press = presser.update([[0.12, 0.8, 0]], [0.4], 1)
    expect(press[0]).toBeCloseTo(0.4, 6)
  })
})
