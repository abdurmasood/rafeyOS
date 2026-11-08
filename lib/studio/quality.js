// Quality tiers the studio steps through when drei's PerformanceMonitor reports a slow GPU.
// Sharpness is the last thing to go: the first step only thins the haze samples and the dust.
export const TIERS = Object.freeze([
  Object.freeze({ name: 'low', dprFactor: 0.85, hazeSteps: 0, dust: 60 }),
  Object.freeze({ name: 'medium', dprFactor: 1, hazeSteps: 10, dust: 150 }),
  Object.freeze({ name: 'high', dprFactor: 1, hazeSteps: 16, dust: 300 }),
])

export const TOP_TIER = TIERS.length - 1

export const QUALITY_EVENTS = Object.freeze({ DECLINE: 'decline', INCLINE: 'incline', FALLBACK: 'fallback' })

/** The tier index after a PerformanceMonitor event. A fallback (it couldn't settle) keeps the current tier. */
export const nextTier = (tier, event) => {
  if (event === QUALITY_EVENTS.FALLBACK) return tier
  if (event === QUALITY_EVENTS.DECLINE) return Math.max(0, tier - 1)
  if (event === QUALITY_EVENTS.INCLINE) return Math.min(TOP_TIER, tier + 1)
  throw new Error(`Unknown quality event: ${event}`)
}
