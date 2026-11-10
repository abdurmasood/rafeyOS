// @ts-check
// Health and air, in halves (20 health is 10 hearts): falls, drowning and healing, stepped once a frame. Plain state and
// no three.js, so the HUD and menus can import the limits without the engine.

export const MAX_HEALTH = 20
export const MAX_AIR = 20

export const VITALS = Object.freeze({
  // Blocks a fall may drop before it hurts; each block past that costs half a heart
  SAFE_FALL: 3,
  // Healing: half a heart every REGEN_EVERY seconds, once REGEN_DELAY seconds have passed without a hurt
  REGEN_DELAY: 5,
  REGEN_EVERY: 3,
  // Air: half a bubble every AIR_EVERY seconds with the head under water, then DROWN_DAMAGE every DROWN_EVERY seconds
  AIR_EVERY: 0.6,
  DROWN_EVERY: 1,
  DROWN_DAMAGE: 2,
  // Halves of air back per second once the head is out
  AIR_REFILL: 12,
  // Seconds after dying before Respawn works, so a click meant for the game can't skip the death panel
  RESPAWN_DELAY: 1.5,
})

export const CAUSE = Object.freeze({ FALL: 'fall', DROWN: 'drown', SHADE: 'shade', CREEPER: 'creeper' })

/**
 * @typedef {{ kind: string, blocks?: number }} Cause - blocks: how far a fatal fall dropped
 * @typedef {{
 *   health: number, air: number, peakY: number | null, sinceHurt: number, regenClock: number, airClock: number,
 *   drownClock: number, dead: boolean, deadFor: number, cause: Cause | null,
 * }} Vitals
 * @typedef {{ y: number, onGround: boolean, inWater: boolean, headUnder: boolean, playing: boolean }} VitalsSample
 *   y: the feet; playing: the game has the mouse, the only time anything can hurt or heal
 * @typedef {{ type: 'hurt', amount: number } | { type: 'dead', cause: Cause }} VitalsEvent
 */

/** @returns {Vitals} */
export const createVitals = () => ({
  health: MAX_HEALTH, air: MAX_AIR, peakY: null, sinceHurt: Infinity, regenClock: 0, airClock: 0, drownClock: 0,
  dead: false, deadFor: 0, cause: null,
})

/** Back to full, for a respawn. @param {Vitals} vitals */
export const resetVitals = (vitals) => Object.assign(vitals, createVitals())

/** Halves of health a fall of `distance` blocks costs. @param {number} distance */
export const fallDamage = (distance) => Math.max(0, Math.ceil(distance - VITALS.SAFE_FALL))

/**
 * Takes `amount` halves of health; the last of it kills.
 * @param {Vitals} vitals
 * @param {number} amount
 * @param {Cause} cause
 * @returns {VitalsEvent[]}
 */
export const hurt = (vitals, amount, cause) => {
  if (amount <= 0 || vitals.dead) return []
  vitals.health = Math.max(0, vitals.health - amount)
  vitals.sinceHurt = 0
  vitals.regenClock = 0
  if (vitals.health > 0) return [{ type: 'hurt', amount }]
  vitals.dead = true
  vitals.cause = cause
  return [{ type: 'hurt', amount }, { type: 'dead', cause }]
}

/**
 * Falls: the highest point since leaving the ground, kept every frame so Esc in mid-air can't save a stale peak for a
 * later landing; water clears it, so diving in is always safe. A landing only hurts while playing.
 * @param {Vitals} vitals
 * @param {VitalsSample} sample
 */
const trackFall = (vitals, sample) => {
  if (sample.inWater) {
    vitals.peakY = null
    return []
  }
  if (!sample.onGround) {
    vitals.peakY = vitals.peakY === null ? sample.y : Math.max(vitals.peakY, sample.y)
    return []
  }
  if (vitals.peakY === null) return []
  const blocks = vitals.peakY - sample.y
  vitals.peakY = null
  if (!sample.playing) return []
  return hurt(vitals, fallDamage(blocks), { kind: CAUSE.FALL, blocks: Math.round(blocks) })
}

/**
 * Air drains only with the head under water and refills once it's out; at zero, drowning hurts.
 * @param {Vitals} vitals
 * @param {VitalsSample} sample
 * @param {number} dt
 */
const breathe = (vitals, sample, dt) => {
  if (!sample.headUnder) {
    vitals.airClock = 0
    vitals.drownClock = 0
    vitals.air = Math.min(MAX_AIR, vitals.air + dt * VITALS.AIR_REFILL)
    return []
  }
  if (!sample.playing) return []
  vitals.airClock += dt
  while (vitals.airClock >= VITALS.AIR_EVERY && vitals.air > 0) {
    vitals.airClock -= VITALS.AIR_EVERY
    vitals.air = Math.max(0, vitals.air - 1)
  }
  if (vitals.air > 0) return []
  vitals.drownClock += dt
  if (vitals.drownClock < VITALS.DROWN_EVERY) return []
  vitals.drownClock = 0
  return hurt(vitals, VITALS.DROWN_DAMAGE, { kind: CAUSE.DROWN })
}

/** @param {Vitals} vitals @param {number} dt */
const heal = (vitals, dt) => {
  if (vitals.health >= MAX_HEALTH || vitals.sinceHurt < VITALS.REGEN_DELAY) return
  vitals.regenClock += dt
  if (vitals.regenClock < VITALS.REGEN_EVERY) return
  vitals.regenClock = 0
  vitals.health += 1
}

/**
 * One frame of health and air.
 * @param {Vitals} vitals
 * @param {VitalsSample} sample
 * @param {number} dt
 * @returns {VitalsEvent[]}
 */
export const stepVitals = (vitals, sample, dt) => {
  if (vitals.dead) {
    vitals.deadFor += dt
    return []
  }
  const events = trackFall(vitals, sample)
  if (vitals.dead) return events
  events.push(...breathe(vitals, sample, dt))
  if (vitals.dead || !sample.playing) return events
  vitals.sinceHurt += dt
  heal(vitals, dt)
  return events
}
