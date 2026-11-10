import { describe, expect, it } from 'vitest'
import { Color } from 'three'
import { SKY } from '@/components/rafeyos/apps/minecraft/logic/atmosphere'
import {
  DAY_SECONDS, START_TIME, createSkyClock, createSkyState, skyAt, wrapTime,
} from '@/components/rafeyos/apps/minecraft/logic/life/skyClock'

// Written out again so a changed constant shows up here
const TWENTY_MINUTES = 1200
const hour = (h) => h / 24
const at = (t) => skyAt(t, createSkyState())
const hex = (colour) => `#${colour.getHexString()}`
const brightness = (colour) => colour.r + colour.g + colour.b

describe('the sky clock', () => {
  it('runs a day in twenty minutes, starting each visit at 08:00', () => {
    const clock = createSkyClock()
    expect(DAY_SECONDS).toBe(TWENTY_MINUTES)
    expect(clock.time()).toBeCloseTo(hour(8))
    expect(START_TIME).toBeCloseTo(hour(8))

    clock.advance(TWENTY_MINUTES / 4)

    expect(clock.time()).toBeCloseTo(hour(14))
  })

  it('wraps past midnight', () => {
    const clock = createSkyClock(hour(23))

    clock.advance(TWENTY_MINUTES / 12)

    expect(clock.time()).toBeCloseTo(hour(1))
    expect(wrapTime(-0.25)).toBeCloseTo(0.75)
  })
})

describe('the sky through the day', () => {
  it.each([7.75, 8, 12, 16])('is exactly the old fixed day at %s:00', (h) => {
    const sky = at(hour(h))

    expect([hex(sky.horizon), hex(sky.zenith), hex(sky.underwater), hex(sky.light)])
      .toEqual([SKY.horizon, SKY.zenith, SKY.underwater, '#ffffff'])
    expect(sky.glow).toBe(1)
    expect(sky.night).toBe(0)
  })

  it('is dark at midnight, with the sun down and the stars out', () => {
    const sky = at(0)

    expect(sky.sun.y).toBeLessThan(-0.5)
    expect(sky.glow).toBe(0)
    expect(sky.night).toBe(1)
    expect(brightness(sky.light)).toBeLessThan(brightness(new Color(SKY.horizon)) / 2)
  })

  it('warms the light at sunrise and sunset', () => {
    for (const sky of [at(0.268), at(0.745)]) expect(sky.light.r).toBeGreaterThan(sky.light.b * 1.4)
  })

  it('puts the moon opposite the sun', () => {
    const sky = at(hour(22))

    expect(sky.moon.dot(sky.sun)).toBeCloseTo(-1)
    expect(sky.moon.y).toBeGreaterThan(0)
  })

  it('changes smoothly, with no jump anywhere in the day', () => {
    let previous = at(0)
    for (let step = 1; step <= 2400; step++) {
      const sky = at(step / 2400)
      expect(Math.abs(brightness(sky.light) - brightness(previous.light))).toBeLessThan(0.05)
      expect(sky.sun.distanceTo(previous.sun)).toBeLessThan(0.01)
      previous = sky
    }
  })
})
