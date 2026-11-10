import { describe, expect, it } from 'vitest'
import {
  EDGE, END_PROMPT_DELAY, FALL_RATE, FAR, MODE, NARROW_HALF_ANGLE, START, WIDEST_HALF_ANGLE,
  applyDrag, applyWheel, createFlight, enter, eyeRadius, stepFlight, viewOf,
} from '@/lib/singularity/flight'
import { energyFromRest, hoverFrame } from '@/lib/singularity/observer'

const DT = 1 / 60
const flying = () => {
  const flight = createFlight()
  enter(flight)
  return flight
}
/** Steps `flight` for `seconds` with `input` held; returns the seconds it took for `until` to hold, if it did. */
const hold = (flight, input, seconds, until = () => false) => {
  for (let time = 0; time < seconds; time += DT) {
    if (until(flight)) return time
    stepFlight(flight, input, DT)
  }
  return null
}
/** A flight hovering at rest at `r`. */
const hoveringAt = (r) => {
  const flight = flying()
  flight.r = r
  flight.goal.r = r
  return flight
}
const fallen = () => {
  const flight = hoveringAt(EDGE)
  stepFlight(flight, { inward: true }, DT)
  return flight
}
const length = (vector) => Math.hypot(...vector)
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2]

describe('the flight around the hole', () => {
  it('starts on the title screen, drifting slowly around the hole with a normal view', () => {
    const flight = createFlight()
    hold(flight, { inward: true, up: true }, 10)

    expect(flight).toMatchObject({ mode: MODE.TITLE, r: START.r, up: START.up, halfAngle: NARROW_HALF_ANGLE })
    expect(flight.goal.around).toBeCloseTo(START.around + 0.3, 6)
    expect(viewOf(flight).dim).toBe(0.45)
  })

  it('starts hovering at the start on enter, and enter does nothing more while flying', () => {
    const flight = createFlight()
    hold(flight, {}, 5)

    expect(enter(flight)).toBe(false)
    expect(flight).toMatchObject({ mode: MODE.HOVER, ...START, goal: START, since: 0, moved: 0 })
    stepFlight(flight, { outward: true }, DT)
    expect(enter(flight)).toBe(false)
    expect(flight.mode).toBe(MODE.HOVER)
    expect(flight.goal.r).toBeGreaterThan(START.r)
  })

  it('reaches the edge after about 36 seconds of holding inward from the start', () => {
    const flight = flying()
    const seconds = hold(flight, { inward: true }, 60, ({ mode }) => mode === MODE.FALL)

    expect(seconds).toBeGreaterThan(30)
    expect(seconds).toBeLessThan(40)
  })

  it('slows the approach near the hole, but never below a crawl', () => {
    const far = hoveringAt(11)
    const near = hoveringAt(1.1)
    stepFlight(far, { inward: true }, 1)
    stepFlight(near, { inward: true }, 1)

    expect(far.goal.r).toBeCloseTo(11 - 1.5, 12)
    expect(near.goal.r).toBeCloseTo(1.1 - 0.03, 12)
  })

  it('backs out from just above the floor', () => {
    const flight = hoveringAt(EDGE)
    hold(flight, { outward: true }, 20)

    expect(flight.mode).toBe(MODE.HOVER)
    expect(flight.r).toBeGreaterThan(1.5)
  })

  it('holds at the floor without falling while inward is not held', () => {
    const flight = hoveringAt(EDGE)
    hold(flight, { left: true, up: true }, 10)

    expect(flight.mode).toBe(MODE.HOVER)
    expect(flight.r).toBeCloseTo(EDGE, 12)
  })

  it('falls on holding inward at the floor, with the energy of rest where it is', () => {
    const flight = hoveringAt(1.024)
    stepFlight(flight, { inward: true }, DT)

    expect(flight.mode).toBe(MODE.FALL)
    expect(flight.since).toBe(0)
    // Taken from where it was when it crossed, before that frame's easing moved it
    expect(flight.energy).toBe(energyFromRest(1.024))
  })

  it('does not fall while still easing down toward the floor', () => {
    const flight = hoveringAt(1.05)
    flight.goal.r = EDGE
    stepFlight(flight, { inward: true }, DT)

    expect(flight.mode).toBe(MODE.HOVER)
  })

  it('shows the same view the instant the fall starts', () => {
    const flight = hoveringAt(EDGE)
    const before = viewOf(flight)
    stepFlight(flight, { inward: true }, 0)
    const after = viewOf(flight)

    expect(flight.mode).toBe(MODE.FALL)
    expect(after.w).toBeCloseTo(before.w, 9)
    expect(after.gamma).toBeCloseTo(before.gamma, 9)
    expect(after.position).toEqual(before.position)
  })

  it('ignores outward while falling: the distance only shrinks', () => {
    const flight = fallen()
    let last = flight.r
    for (let i = 0; i < 600; i++) {
      stepFlight(flight, { outward: true }, DT)
      expect(flight.r).toBeLessThan(last)
      last = flight.r
    }
    expect(flight.mode).toBe(MODE.FALL)
  })

  it('still turns while falling', () => {
    const flight = fallen()
    hold(flight, { right: true, down: true }, 2)

    expect(flight.goal.around).toBeGreaterThan(START.around + 0.3)
    expect(flight.goal.up).toBeLessThan(START.up - 0.25)
  })

  it('counts the seconds spent inside the edge', () => {
    const flight = fallen()
    hold(flight, {}, 60, ({ r }) => r < 1.001)
    expect(flight.r).toBeGreaterThan(1)
    expect(flight.inside).toBe(0)

    hold(flight, {}, 60, ({ r }) => r < 1)
    hold(flight, {}, 2)
    expect(flight.inside).toBeCloseTo(2, 1)
  })

  it('ends at the centre after about 20 seconds: the fall time, scaled by the fall rate', () => {
    const flight = fallen()
    const seconds = hold(flight, {}, 120, ({ mode }) => mode === MODE.END)

    // A little under the full fall time: the fall is nudged off its standstill, and ends a hair before the centre
    const fullFall = ((Math.PI / 2) * EDGE ** 1.5) / FALL_RATE
    expect(seconds).toBeGreaterThan(fullFall - 2)
    expect(seconds).toBeLessThan(fullFall)
    expect(flight.r).toBeLessThan(0.035)
    expect(flight.since).toBe(0)
  })

  it('holds still at the end, fades to black, and asks to exit on enter once the prompt is up', () => {
    const flight = fallen()
    hold(flight, {}, 120, ({ mode }) => mode === MODE.END)
    const { r, goal } = flight
    expect(viewOf(flight).dim).toBeCloseTo(0.6, 12)
    expect(enter(flight)).toBe(false)

    hold(flight, { right: true, inward: true }, END_PROMPT_DELAY + 0.1)
    expect(flight.r).toBeCloseTo(r, 12)
    expect(flight.goal.around).toBe(goal.around)
    expect(viewOf(flight).dim).toBe(0)
    expect(Number.isFinite(viewOf(flight).gamma)).toBe(true)
    expect(enter(flight)).toBe(true)
    expect(flight.mode).toBe(MODE.END)
  })

  it('views the hole through 30 degrees far out, and the whole sky deep in', () => {
    const far = hoveringAt(17)
    const deep = hoveringAt(1.1)
    hold(far, {}, 5)
    hold(deep, {}, 5)

    expect(far.halfAngle).toBe(NARROW_HALF_ANGLE)
    expect(NARROW_HALF_ANGLE).toBeCloseTo(Math.PI / 6, 4)
    expect(deep.halfAngle).toBeCloseTo(WIDEST_HALF_ANGLE, 4)
    expect(viewOf(deep).halfAngle).toBe(deep.halfAngle)
  })

  it('widens gradually between 6 radii and the edge', () => {
    const halfAngles = [6, 5, 3.65, 2, 1.3].map((r) => {
      const flight = hoveringAt(r)
      hold(flight, {}, 10)
      return flight.halfAngle
    })

    expect(halfAngles[0]).toBeCloseTo(NARROW_HALF_ANGLE, 6)
    expect(halfAngles[2]).toBeCloseTo((NARROW_HALF_ANGLE + WIDEST_HALF_ANGLE) / 2, 6)
    expect(halfAngles[4]).toBeCloseTo(WIDEST_HALF_ANGLE, 6)
    expect(halfAngles).toEqual([...halfAngles].sort((a, b) => a - b))
  })

  it('stops at the far limit and short of the poles', () => {
    const flight = flying()
    hold(flight, { outward: true, up: true }, 60)
    expect(flight.goal.r).toBe(FAR)
    expect(flight.goal.up).toBe(1.5)

    hold(flight, { down: true }, 60)
    expect(flight.goal.up).toBe(-1.5)
    expect(flight.r).toBeLessThanOrEqual(FAR)
  })

  it('turns around and over at their own rates, easing toward where the keys ask', () => {
    const flight = flying()
    stepFlight(flight, { right: true, up: true }, 1)

    expect(flight.goal.around).toBeCloseTo(START.around + 0.16, 12)
    expect(flight.goal.up).toBeCloseTo(START.up + 0.14, 12)
    expect(flight.around).toBeCloseTo(START.around + 0.16 * (1 - Math.exp(-2)), 12)
    stepFlight(flight, { left: true, right: true }, 1)
    expect(flight.goal.around).toBeCloseTo(START.around + 0.16, 12)
  })

  it('counts steering time for the key hint, from keys, drags and the wheel', () => {
    const flight = flying()
    hold(flight, {}, 1)
    expect(flight.moved).toBe(0)

    hold(flight, { left: true }, 1)
    expect(flight.moved).toBeCloseTo(1, 1)
    const before = flight.moved
    applyDrag(flight, 1, 1)
    applyWheel(flight, 1)
    expect(flight.moved).toBeCloseTo(before + 0.15, 12)
  })

  it('orbits on a drag, within the same limits, and only while flying', () => {
    const flight = flying()
    applyDrag(flight, 100, 50)
    expect(flight.goal.around).toBeCloseTo(START.around - 0.2, 12)
    expect(flight.goal.up).toBeCloseTo(START.up + 0.1, 12)

    applyDrag(flight, 0, 5000)
    expect(flight.goal.up).toBe(1.5)
    applyDrag(flight, 0, -50000)
    expect(flight.goal.up).toBe(-1.5)

    const title = createFlight()
    applyDrag(title, 100, 50)
    expect(title.goal).toEqual(START)
    expect(title.moved).toBe(0)
  })

  it('moves in and out on the wheel while hovering, within the floor and the far limit', () => {
    const flight = flying()
    expect(applyWheel(flight, 100)).toBe(true)
    expect(flight.goal.r).toBeCloseTo(START.r * Math.exp(0.03), 12)

    applyWheel(flight, 1e5)
    expect(flight.goal.r).toBe(FAR)
    applyWheel(flight, -1e5)
    expect(flight.goal.r).toBe(EDGE)
  })

  it('leaves the wheel alone on the title screen and in a fall', () => {
    const title = createFlight()
    const falling = fallen()
    const { r } = falling.goal

    expect(applyWheel(title, 100)).toBe(false)
    expect(applyWheel(falling, 100)).toBe(false)
    expect(title.goal.r).toBe(START.r)
    expect(falling.goal.r).toBe(r)
  })

  it('looks straight at the hole from where it is, with a level horizon', () => {
    const flight = flying()
    const { position, forward, right, up } = viewOf(flight)

    expect(length(position)).toBeCloseTo(START.r, 12)
    expect(position[1]).toBeCloseTo(START.r * Math.sin(START.up), 12)
    expect(forward.map((part) => part * -START.r)).toEqual(position.map((part) => expect.closeTo(part, 12)))
    for (const axis of [forward, right, up]) expect(length(axis)).toBeCloseTo(1, 12)
    expect(dot(forward, right)).toBeCloseTo(0, 12)
    expect(dot(forward, up)).toBeCloseTo(0, 12)
    expect(dot(right, up)).toBeCloseTo(0, 12)
    expect(right[1]).toBe(0)
    expect(up[1]).toBeGreaterThan(0)
    // Right-handed, as a camera's axes are: right × up points back at the eye
    expect(right[1] * up[2] - right[2] * up[1]).toBeCloseTo(-forward[0], 12)
  })

  it('hands the renderer the hovering frame, the disc clock, and full brightness while flying', () => {
    const flight = hoveringAt(3)
    stepFlight(flight, {}, 0.5)
    const view = viewOf(flight)

    expect(view).toMatchObject({ ...hoverFrame(3), dim: 1 })
    expect(view.discTime).toBeCloseTo(2, 12)
  })

  it('keeps the view just under light speed and a hair off the centre', () => {
    const flight = fallen()
    flight.r = 0.001

    expect(eyeRadius(flight)).toBe(0.03)
    expect(viewOf(flight).w).toBeLessThanOrEqual(0.9995)
    expect(length(viewOf(flight).position)).toBeCloseTo(0.03, 12)
  })
})
