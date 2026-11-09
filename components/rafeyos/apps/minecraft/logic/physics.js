// @ts-check
// The player as a 0.6 × 1.8 box with eyes at 1.62: walking, sprinting, jumping, swimming, and sliding along blocks
// one axis at a time. A step changes the player in place, since it is the per-frame simulation state.
import { BLOCK, isSolid } from './blockTypes'
import { WORLD } from './terrain'

export const PLAYER = Object.freeze({
  HALF_WIDTH: 0.3, BODY: 1.8, EYES: 1.62,
  WALK: 4.3, SPRINT: 5.7, GRAVITY: 28, JUMP: 8.6,
  LOOK_SPEED: 0.0024, MAX_PITCH: 1.55,
})
// Climbing out of water: up speed matches swimming up, and the lip push carries the player over the top edge
export const CLIMB = Object.freeze({ SPEED: 3.4, LIP_UP: 2.2, LIP_FORWARD: 2.6, PROBE: 0.08 })
// How far one substep may move, so a fast fall can't pass through a block
const MAX_STEP = 0.35
const SKIN = 1e-4
const EDGE = 1e-6

/**
 * @import { World } from './world'
 * @import { Spawn } from './terrain'
 * @typedef {{ x: number, y: number, z: number }} Vec
 * @typedef {{ pos: Vec, vel: Vec, yaw: number, pitch: number, onGround: boolean, climbing: boolean }} Player
 * @typedef {{ forward: number, strafe: number, jump: boolean, sprint: boolean }} MoveInput - forward/strafe in -1..1
 */

/**
 * @param {Spawn} spawn
 * @returns {Player}
 */
export const createPlayer = (spawn) => ({
  pos: { x: spawn.x, y: spawn.y, z: spawn.z }, vel: { x: 0, y: 0, z: 0 }, yaw: spawn.yaw, pitch: spawn.pitch, onGround: false, climbing: false,
})

/**
 * The first solid block the player's box overlaps, as [x, y, z], or null.
 * @param {{ pos: Vec }} body
 * @param {World} world
 */
const overlapsSolid = ({ pos }, world) => {
  const { HALF_WIDTH, BODY } = PLAYER
  for (let y = Math.floor(pos.y); y <= Math.floor(pos.y + BODY - EDGE); y++) {
    for (let z = Math.floor(pos.z - HALF_WIDTH); z <= Math.floor(pos.z + HALF_WIDTH - EDGE); z++) {
      for (let x = Math.floor(pos.x - HALF_WIDTH); x <= Math.floor(pos.x + HALF_WIDTH - EDGE); x++) {
        if (isSolid(world.get(x, y, z))) return [x, y, z]
      }
    }
  }
  return null
}

/**
 * Moves along one axis, then backs out of whatever that walked into.
 * @param {Player} player
 * @param {World} world
 * @param {'x' | 'y' | 'z'} axis
 * @param {number} delta
 */
const moveAxis = (player, world, axis, delta) => {
  if (delta === 0) return
  const { HALF_WIDTH, BODY } = PLAYER
  player.pos[axis] += delta
  let hit = overlapsSolid(player, world)
  for (let tries = 0; hit && tries < 8; tries++) {
    const [bx, by, bz] = hit
    if (axis === 'x') player.pos.x = delta > 0 ? bx - HALF_WIDTH - SKIN : bx + 1 + HALF_WIDTH + SKIN
    else if (axis === 'z') player.pos.z = delta > 0 ? bz - HALF_WIDTH - SKIN : bz + 1 + HALF_WIDTH + SKIN
    else if (delta < 0) {
      player.pos.y = by + 1
      player.onGround = true
    } else player.pos.y = by - BODY - SKIN
    player.vel[axis] = 0
    hit = overlapsSolid(player, world)
  }
}

/**
 * @param {Player} player
 * @param {World} world
 */
export const isSwimming = ({ pos }, world) =>
  world.get(Math.floor(pos.x), Math.floor(pos.y + 0.4), Math.floor(pos.z)) === BLOCK.WATER

/**
 * Whether the body, nudged a hair toward where the player is steering, would touch a solid block: pushing into a bank.
 * @param {Player} player
 * @param {World} world
 * @param {number} wishX - unit steer vector, or 0
 * @param {number} wishZ
 */
const wallAhead = ({ pos }, world, wishX, wishZ) => {
  if (wishX === 0 && wishZ === 0) return false
  const probed = { pos: { x: pos.x + wishX * CLIMB.PROBE, y: pos.y, z: pos.z + wishZ * CLIMB.PROBE } }
  return overlapsSolid(probed, world) !== null
}

/**
 * Climbing out of the water: holding jump against a wall from the water keeps the player rising, even above the
 * surface where swimming lift has stopped, until the top edge gives a small push onto the bank.
 * @param {Player} player
 * @param {World} world
 * @param {MoveInput} input
 * @param {{ x: number, z: number }} wish - unit steer vector, or 0 with no movement input
 */
const climbOut = (player, world, input, wish) => {
  const { vel } = player
  if (!input.jump || player.onGround) { player.climbing = false; return }
  const wall = wallAhead(player, world, wish.x, wish.z)
  if (!player.climbing && wall && isSwimming(player, world)) player.climbing = true
  if (!player.climbing) return
  if (wall) { vel.y = Math.max(vel.y, CLIMB.SPEED); return }
  // No input means the player let go mid-wall: drop back rather than get pushed up the wall
  if (wish.x !== 0 || wish.z !== 0) {
    vel.y = Math.max(vel.y, CLIMB.LIP_UP)
    vel.x = wish.x * CLIMB.LIP_FORWARD
    vel.z = wish.z * CLIMB.LIP_FORWARD
  }
  player.climbing = false
}

/**
 * Turns input into velocity: quick to answer on the ground, loose in the air, slow and floaty in water.
 * @param {Player} player
 * @param {World} world
 * @param {MoveInput} input
 * @param {number} dt
 */
const steer = (player, world, input, dt) => {
  const { vel } = player
  const sin = Math.sin(player.yaw), cos = Math.cos(player.yaw)
  let wishX = -sin * input.forward + cos * input.strafe, wishZ = -cos * input.forward - sin * input.strafe
  const length = Math.hypot(wishX, wishZ)
  if (length > 0) { wishX /= length; wishZ /= length }
  const swimming = isSwimming(player, world)
  const speed = (input.sprint ? PLAYER.SPRINT : PLAYER.WALK) * (swimming ? 0.55 : 1)
  const grip = Math.min(1, (player.onGround ? 18 : swimming ? 8 : 4) * dt)
  vel.x += (wishX * speed - vel.x) * grip
  vel.z += (wishZ * speed - vel.z) * grip
  if (swimming) {
    vel.y = Math.max(vel.y - 9 * dt, -2.6)
    if (input.jump) vel.y = Math.min(vel.y + 24 * dt, 3.4)
  } else {
    vel.y = Math.max(vel.y - PLAYER.GRAVITY * dt, -56)
    if (input.jump && player.onGround) vel.y = PLAYER.JUMP
  }
  climbOut(player, world, input, { x: wishX, z: wishZ })
}

/**
 * Advances the player by `dt` seconds.
 * @param {Player} player
 * @param {World} world
 * @param {MoveInput} input
 * @param {number} dt
 */
export const stepPlayer = (player, world, input, dt) => {
  steer(player, world, input, dt)
  const { vel } = player
  const substeps = Math.max(1, Math.ceil((Math.hypot(vel.x, vel.y, vel.z) * dt) / MAX_STEP))
  const h = dt / substeps
  for (let i = 0; i < substeps; i++) {
    player.onGround = false
    moveAxis(player, world, 'y', vel.y * h)
    moveAxis(player, world, 'x', vel.x * h)
    moveAxis(player, world, 'z', vel.z * h)
  }
  return player
}

/**
 * Mouse movement to view direction; looking straight up or down stops just short of flipping over.
 * @param {Player} player
 * @param {number} dx
 * @param {number} dy
 */
export const turn = (player, dx, dy) => {
  player.yaw -= dx * PLAYER.LOOK_SPEED
  player.pitch = Math.max(-PLAYER.MAX_PITCH, Math.min(PLAYER.MAX_PITCH, player.pitch - dy * PLAYER.LOOK_SPEED))
}

/**
 * The unit vector the player looks along.
 * @param {Player} player
 * @returns {Vec}
 */
export const lookDirection = ({ yaw, pitch }) => ({
  x: -Math.sin(yaw) * Math.cos(pitch), y: Math.sin(pitch), z: -Math.cos(yaw) * Math.cos(pitch),
})

/**
 * @param {Player} player
 * @returns {Vec}
 */
export const eyePosition = ({ pos }) => ({ x: pos.x, y: pos.y + PLAYER.EYES, z: pos.z })

/**
 * Whether a block at (x, y, z) would sit inside the player, which placing must not allow.
 * @param {Player} player
 * @param {number} x
 * @param {number} y
 * @param {number} z
 */
export const overlapsBlock = ({ pos }, x, y, z) => {
  const { HALF_WIDTH, BODY } = PLAYER
  return x + 1 > pos.x - HALF_WIDTH && x < pos.x + HALF_WIDTH && z + 1 > pos.z - HALF_WIDTH && z < pos.z + HALF_WIDTH &&
    y + 1 > pos.y && y < pos.y + BODY
}

/**
 * Raises the player until it stands free, so starting where a build now stands never traps it inside.
 * @param {Player} player
 * @param {World} world
 */
export const liftClear = (player, world) => {
  for (let i = 0; overlapsSolid(player, world) && i < WORLD.HEIGHT; i++) player.pos.y = Math.floor(player.pos.y) + 1
  return player
}
