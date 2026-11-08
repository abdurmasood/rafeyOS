// @ts-check
// What the crosshair points at: walks the block grid from the eye along the view ray, one cell boundary at a time
import { isSolid } from './blockTypes'
import { inBounds } from './terrain'

/**
 * @import { World } from './world'
 * @import { Vec } from './physics'
 * @typedef {{ x: number, y: number, z: number, normal: [number, number, number] }} RayHit - the block, and the face hit
 */

export const REACH = 5

/**
 * One axis of the grid walk: which way it steps, how far along the ray each cell is, and where the next boundary is.
 * @param {number} origin
 * @param {number} direction
 */
const axisWalk = (origin, direction) => {
  const cell = Math.floor(origin)
  const step = Math.sign(direction)
  const delta = step ? Math.abs(1 / direction) : Infinity
  const next = step > 0 ? (cell + 1 - origin) * delta : step < 0 ? (origin - cell) * delta : Infinity
  return { cell, step, delta, next }
}

/**
 * The first solid block within `reach` of `origin` along `direction` (a unit vector), and the face the ray entered.
 * @param {World} world
 * @param {Vec} origin
 * @param {Vec} direction
 * @param {number} [reach]
 * @returns {RayHit | null}
 */
export const castRay = (world, origin, direction, reach = REACH) => {
  const x = axisWalk(origin.x, direction.x), y = axisWalk(origin.y, direction.y), z = axisWalk(origin.z, direction.z)
  /** @type {[number, number, number]} */
  let normal = [0, 0, 0]
  let t = 0
  while (t <= reach) {
    if (inBounds(x.cell, y.cell, z.cell) && isSolid(world.get(x.cell, y.cell, z.cell))) {
      return { x: x.cell, y: y.cell, z: z.cell, normal }
    }
    if (x.next < y.next && x.next < z.next) {
      x.cell += x.step; t = x.next; x.next += x.delta; normal = [-x.step, 0, 0]
    } else if (y.next < z.next) {
      y.cell += y.step; t = y.next; y.next += y.delta; normal = [0, -y.step, 0]
    } else {
      z.cell += z.step; t = z.next; z.next += z.delta; normal = [0, 0, -z.step]
    }
  }
  return null
}
