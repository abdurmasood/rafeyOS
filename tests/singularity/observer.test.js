import { describe, expect, it } from 'vitest'
import {
  SECONDS_PER_RADIUS, clockRate, energyFromRest, fallFrame, fallRate, fallingSpeed, hoverFrame, secondsLeft, timeLeft,
} from '@/lib/singularity/observer'

describe('the observer at the hole', () => {
  it.each([1.02, 1.026, 1.5, 3, 17])('sees no jump when let go from rest at %s radii', (r) => {
    const hovering = hoverFrame(r)
    const falling = fallFrame(r, energyFromRest(r))

    // Equal on paper; a rounding error under the square root is all that separates them
    expect(falling.w).toBeCloseTo(hovering.w, 6)
    expect(falling.gamma).toBeCloseTo(hovering.gamma, 5)
  })

  it('falls at the speed of light at the edge, and slower further out', () => {
    expect(fallingSpeed(1)).toBe(1)
    expect(fallingSpeed(4)).toBe(0.5)
  })

  it('runs a clock at 71% of a distant one at 2 radii, and stops it at the edge', () => {
    expect(clockRate(2)).toBeCloseTo(Math.SQRT1_2, 12)
    expect(clockRate(1)).toBe(0)
    expect(clockRate(1e9)).toBeCloseTo(1, 6)
  })

  it('needs ever more to hover as the edge nears', () => {
    const gammas = [3, 1.5, 1.1, 1.01, 1.0001].map((r) => hoverFrame(r).gamma)

    expect(gammas).toEqual([...gammas].sort((a, b) => a - b))
    expect(gammas.at(-1)).toBeGreaterThan(99)
    expect(hoverFrame(1).gamma).toBe(Infinity)
  })

  it('keeps the falling frame finite across the edge and down to the centre', () => {
    const energy = energyFromRest(1.02)
    for (const r of [1.02, 1.001, 1, 0.999, 0.5, 0.03]) {
      const { w, gamma } = fallFrame(r, energy)
      expect(Number.isFinite(gamma)).toBe(true)
      expect(gamma).toBeGreaterThanOrEqual(1)
      expect(w).toBeGreaterThanOrEqual(0)
      expect(w).toBeLessThan(1)
    }
  })

  it('has about 68 seconds on the clock from rest at 1.02 radii', () => {
    const energy = energyFromRest(1.02)

    // A fall from rest takes pi/2 * r^1.5 of the faller's own time
    const exact = (Math.PI / 2) * 1.02 ** 1.5
    expect(timeLeft(1.02, energy)).toBeCloseTo(exact, 9)
    expect(secondsLeft(1.02, energy)).toBeCloseTo(67.96, 2)
    // Part way down, against the integral of 1 / fall rate summed finely
    const steps = 200000
    let summed = 0
    for (let i = 0; i < steps; i += 1) summed += 0.5 / steps / Math.sqrt(energy * energy - 1 + 1 / ((0.5 * (i + 0.5)) / steps))
    expect(timeLeft(0.5, energy)).toBeCloseTo(summed, 5)
    expect(SECONDS_PER_RADIUS).toBe(42)
  })

  it('counts the time left down to nothing at the centre', () => {
    const energy = energyFromRest(1.02)
    const left = [1.02, 1, 0.8, 0.5, 0.2, 0.05, 0.001].map((r) => secondsLeft(r, energy))

    expect(left).toEqual([...left].sort((a, b) => b - a))
    expect(new Set(left).size).toBe(left.length)
    expect(left.at(-1)).toBeLessThan(0.01)
    expect(secondsLeft(0, energy)).toBe(0)
  })

  it('starts the fall slowly rather than not at all, and speeds it up toward the centre', () => {
    const energy = energyFromRest(1.02)

    expect(fallRate(1.02, energy)).toBeCloseTo(0.02, 12)
    expect(fallRate(0.5, energy)).toBeGreaterThan(fallRate(1, energy))
    expect(fallRate(1, energy)).toBeCloseTo(Math.sqrt(1 - 1 / 1.02), 12)
  })
})
