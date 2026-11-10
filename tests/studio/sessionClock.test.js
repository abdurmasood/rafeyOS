import { describe, expect, it } from 'vitest'
import { createSessionClock } from '@/lib/studio/sessionClock'

describe('the room clock', () => {
  it('counts only the frames that are drawn, so a minimised window carries on where it left off', () => {
    const clock = createSessionClock()
    clock.tick(0.5)
    clock.tick(0.25)
    // minimised: no frames, no ticks; restored: three's clock restarts at 0, but this one doesn't
    expect(clock.tick(0.016)).toBeCloseTo(0.766, 9)
  })

  it('holds a frozen moment', () => {
    const clock = createSessionClock(45.19)
    clock.tick(1)
    expect(clock.time).toBe(45.19)
  })
})
