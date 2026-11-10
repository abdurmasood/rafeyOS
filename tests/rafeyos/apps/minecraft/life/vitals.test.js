import { describe, expect, it } from 'vitest'
import {
  CAUSE, MAX_AIR, MAX_HEALTH, VITALS, createVitals, fallDamage, hurt, resetVitals, stepVitals,
} from '@/components/rafeyos/apps/minecraft/logic/life/vitals'

// Written out again so a changed rule shows up here
const SAFE_FALL = 3
const FRAME = 1 / 60
const standing = (y, extra = {}) => ({ y, onGround: true, inWater: false, headUnder: false, playing: true, ...extra })
const airborne = (y, extra = {}) => ({ ...standing(y, extra), onGround: false })

/** Falls from `top` to land at `floor`, a frame at the top and one on landing. */
const fall = (vitals, top, floor, extra = {}) => {
  stepVitals(vitals, airborne(top, extra), FRAME)
  stepVitals(vitals, airborne((top + floor) / 2, extra), FRAME)
  return stepVitals(vitals, standing(floor, extra), FRAME)
}
const forSeconds = (vitals, seconds, sample) => {
  const events = []
  for (let t = 0; t < seconds - 1e-9; t += FRAME) events.push(...stepVitals(vitals, sample, FRAME))
  return events
}

describe('fall damage', () => {
  it.each([
    [SAFE_FALL, 0],
    [SAFE_FALL + 0.2, 1],
    [4, 1],
    [14, 11],
  ])('costs %s blocks of fall %i halves of health', (blocks, cost) => {
    expect(fallDamage(blocks)).toBe(cost)
  })

  it('takes the halves off on landing, measured from the highest point', () => {
    const vitals = createVitals()

    const events = fall(vitals, 64, 50)

    expect(vitals.health).toBe(MAX_HEALTH - 11)
    expect(events).toEqual([{ type: 'hurt', amount: 11 }])
  })

  it('kills from 26 blocks up, naming how far it was', () => {
    const vitals = createVitals()

    const events = fall(vitals, 76, 50)

    expect(vitals.dead).toBe(true)
    expect(vitals.health).toBe(0)
    expect(events.at(-1)).toEqual({ type: 'dead', cause: { kind: CAUSE.FALL, blocks: 26 } })
  })

  it('is safe to dive into water from any height', () => {
    const vitals = createVitals()
    stepVitals(vitals, airborne(80), FRAME)
    stepVitals(vitals, airborne(30, { inWater: true }), FRAME)

    const events = stepVitals(vitals, standing(20, { inWater: true }), FRAME)

    expect(events).toEqual([])
    expect(vitals.health).toBe(MAX_HEALTH)
  })

  it("doesn't hurt a landing made while the game isn't being played, nor save it for later", () => {
    const vitals = createVitals()
    fall(vitals, 70, 50, { playing: false })

    const later = fall(vitals, 51, 50)

    expect(vitals.health).toBe(MAX_HEALTH)
    expect(later).toEqual([])
  })
})

describe('air', () => {
  it('drains with the head under water, then drowning costs a heart a second', () => {
    const vitals = createVitals()
    const under = standing(10, { inWater: true, headUnder: true })

    forSeconds(vitals, (MAX_AIR * VITALS.AIR_EVERY), under)
    expect(vitals.air).toBe(0)
    expect(vitals.health).toBe(MAX_HEALTH)

    forSeconds(vitals, VITALS.DROWN_EVERY + FRAME, under)
    expect(vitals.health).toBe(MAX_HEALTH - VITALS.DROWN_DAMAGE)
  })

  it('refills once the head is out', () => {
    const vitals = createVitals()
    vitals.air = 4

    forSeconds(vitals, 2, standing(30))

    expect(vitals.air).toBe(MAX_AIR)
  })

  it('names drowning as the cause when it kills', () => {
    const vitals = createVitals()
    vitals.health = 2
    vitals.air = 0

    const events = forSeconds(vitals, VITALS.DROWN_EVERY + FRAME, standing(10, { headUnder: true }))

    expect(events.at(-1)).toEqual({ type: 'dead', cause: { kind: CAUSE.DROWN } })
  })

  it("holds the air while the game isn't being played", () => {
    const vitals = createVitals()

    forSeconds(vitals, 5, standing(10, { headUnder: true, playing: false }))

    expect(vitals.air).toBe(MAX_AIR)
  })
})

describe('healing', () => {
  it('waits REGEN_DELAY seconds after a hurt, then heals half a heart every REGEN_EVERY', () => {
    const vitals = createVitals()
    hurt(vitals, 4, { kind: CAUSE.FALL })

    forSeconds(vitals, VITALS.REGEN_DELAY, standing(5))
    expect(vitals.health).toBe(MAX_HEALTH - 4)

    forSeconds(vitals, VITALS.REGEN_EVERY + FRAME, standing(5))
    expect(vitals.health).toBe(MAX_HEALTH - 3)
  })

  it("doesn't heal while the game isn't being played", () => {
    const vitals = createVitals()
    hurt(vitals, 4, { kind: CAUSE.FALL })

    forSeconds(vitals, 30, standing(5, { playing: false }))

    expect(vitals.health).toBe(MAX_HEALTH - 4)
  })
})

describe('death and respawn', () => {
  it('counts the time since death, and nothing else changes while dead', () => {
    const vitals = createVitals()
    hurt(vitals, MAX_HEALTH, { kind: CAUSE.SHADE })

    forSeconds(vitals, 2, standing(5))

    expect(vitals.deadFor).toBeCloseTo(2, 1)
    expect(vitals.health).toBe(0)
    expect(hurt(vitals, 3, { kind: CAUSE.FALL })).toEqual([])
  })

  it('comes back full, with no fall in progress', () => {
    const vitals = createVitals()
    hurt(vitals, MAX_HEALTH, { kind: CAUSE.FALL })
    vitals.peakY = 90

    resetVitals(vitals)

    expect(vitals).toEqual(createVitals())
  })
})
