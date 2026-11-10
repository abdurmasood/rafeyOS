import { describe, expect, it } from 'vitest'
import { REFERENCE_OPENING_LINE, REFERENCE_SEED, sessionFromUrl } from '@/lib/studio/session'

const LINES = 160
const never = () => {
  throw new Error('should not roll a new session')
}

describe('which night a visitor walks in on', () => {
  it('rolls a new session for a plain visit', () => {
    const { seed, openingLine } = sessionFromUrl('', LINES, () => 0.5)
    expect(seed).toBe(2 ** 31)
    expect(openingLine).toBeGreaterThanOrEqual(REFERENCE_OPENING_LINE)
    expect(openingLine).toBeLessThanOrEqual(LINES - 40)
  })

  it('gives different visits different nights', () => {
    const lines = new Set([0.1, 0.35, 0.6, 0.85].map((r) => sessionFromUrl('', LINES, () => r).openingLine))
    expect(lines.size).toBeGreaterThan(1)
  })

  it('replays a session from ?seed=, starting at the same line every time', () => {
    const first = sessionFromUrl('?seed=42', LINES, never)
    expect(first.seed).toBe(42)
    expect(sessionFromUrl('?seed=42', LINES, never)).toEqual(first)
  })

  it('keeps the reference session for ?at=, so frozen moments stay comparable', () => {
    expect(sessionFromUrl('?at=45.19', LINES, never)).toEqual({ seed: REFERENCE_SEED, openingLine: REFERENCE_OPENING_LINE })
  })

  it('lets ?seed= pick the session for a frozen moment too', () => {
    expect(sessionFromUrl('?at=3&seed=5', LINES, never).seed).toBe(5)
  })

  it('ignores a seed that is not a whole number', () => {
    expect(sessionFromUrl('?seed=abc', LINES, () => 0.25).seed).toBe(2 ** 30)
  })

  it('opens at the reference line when the code is too short to start later', () => {
    expect(sessionFromUrl('?seed=9', 30, never).openingLine).toBe(REFERENCE_OPENING_LINE)
  })
})
