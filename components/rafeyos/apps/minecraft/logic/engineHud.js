// What the engine tells the HUD: whether the game has the mouse, the picked hotbar slot, and where the player is.
import { HOTBAR } from './blockTypes'

const HUD_INTERVAL = 100
const COMPASS = Object.freeze(['N', 'W', 'S', 'E'])

/** @param {{ pos: { x: number, y: number, z: number }, yaw: number }} player */
const positionText = ({ pos, yaw }) => {
  const heading = COMPASS[((Math.round(yaw / (Math.PI / 2)) % 4) + 4) % 4]
  return `x ${pos.x.toFixed(1)} · y ${pos.y.toFixed(1)} · z ${pos.z.toFixed(1)} · ${heading}`
}

/** HUD state, sent whole to `onHud` on every change; the position at most every HUD_INTERVAL ms. */
export const createHud = (onHud, player) => {
  const hud = { playing: false, selected: 0, position: positionText(player) }
  let positionAt = -Infinity
  const emit = (patch) => {
    Object.assign(hud, patch)
    onHud({ ...hud })
  }
  return {
    emit,
    selected: () => hud.selected,
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
  }
}
