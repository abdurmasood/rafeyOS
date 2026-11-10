// What the engine tells the HUD: whether the game has the mouse, the picked hotbar slot, where the player is, and their
// health and air, and whether they've died and how.
import { HOTBAR } from './blockTypes'
import { MAX_AIR, MAX_HEALTH } from './life/vitals'

const HUD_INTERVAL = 100
const COMPASS = Object.freeze(['N', 'W', 'S', 'E'])

/**
 * @typedef {{
 *   playing: boolean, selected: number, position: string, health: number, air: number, dead: boolean,
 *   cause: import('./life/vitals').Cause | null,
 * }} HudState - health and air in halves (MAX_HEALTH, MAX_AIR); cause is set while dead
 */

/** @param {{ pos: { x: number, y: number, z: number }, yaw: number }} player */
const positionText = ({ pos, yaw }) => {
  const heading = COMPASS[((Math.round(yaw / (Math.PI / 2)) % 4) + 4) % 4]
  return `x ${pos.x.toFixed(1)} · y ${pos.y.toFixed(1)} · z ${pos.z.toFixed(1)} · ${heading}`
}

/**
 * HUD state, sent whole to `onHud` on every change; the position at most every HUD_INTERVAL ms, health and air only
 * when a half heart or a half bubble changes.
 */
export const createHud = (onHud, player) => {
  /** @type {HudState} */
  const hud = {
    playing: false, selected: 0, position: positionText(player), health: MAX_HEALTH, air: MAX_AIR, dead: false, cause: null,
  }
  let positionAt = -Infinity
  /** @param {Partial<HudState>} patch */
  const emit = (patch) => {
    Object.assign(hud, patch)
    onHud({ ...hud })
  }
  return {
    emit,
    selected: () => hud.selected,
    isDead: () => hud.dead,
    select: (slot) => {
      const next = ((slot % HOTBAR.length) + HOTBAR.length) % HOTBAR.length
      if (next !== hud.selected) emit({ selected: next })
    },
    /** @param {number} time */
    track: (time) => {
      if (time - positionAt < HUD_INTERVAL) return
      positionAt = time
      const position = positionText(player)
      if (position !== hud.position) emit({ position })
    },
    /** @param {{ health: number, air: number }} vitals */
    vitals: ({ health, air }) => {
      const shownAir = Math.ceil(air)
      if (health !== hud.health || shownAir !== hud.air) emit({ health, air: shownAir })
    },
  }
}
