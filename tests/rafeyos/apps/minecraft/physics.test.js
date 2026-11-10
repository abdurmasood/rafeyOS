import { describe, expect, it } from 'vitest'
import {
  CLIMB, PLAYER, createPlayer, eyePosition, isSwimming, liftClear, lookDirection, overlapsBlock, stepPlayer, turn,
} from '@/components/rafeyos/apps/minecraft/logic/physics'
import { BLOCK } from '@/components/rafeyos/apps/minecraft/logic/blockTypes'
import { floorAt, worldOf } from './minecraftTestWorld'

const IDLE = Object.freeze({ forward: 0, strafe: 0, jump: false, sprint: false })
const at = (x, y, z, yaw = 0) => createPlayer({ x, y, z, yaw, pitch: 0 })
const run = (player, world, input, seconds, dt = 1 / 60) => {
  for (let t = 0; t < seconds; t += dt) stepPlayer(player, world, input, dt)
  return player
}
// yaw that faces +x: forward is (-sin(yaw), -cos(yaw))
const EAST = -Math.PI / 2

// Stone to y 4, water at y 5-6, and a bank at x >= 8 whose top block is `top`: the shore a swimmer has to climb
const bankWorld = (top, dry = false) => worldOf([], (x, y) => {
  if (x >= 8 && y <= top) return BLOCK.STONE
  if (y <= 4) return BLOCK.STONE
  return y <= 6 && !dry ? BLOCK.WATER : BLOCK.AIR
})
const pushToward = (world, input, seconds, start = at(5.5, 5.2, 5.5, EAST)) => run(start, world, input, seconds)

describe('player physics', () => {
  it('falls onto the ground and stands on it', () => {
    const player = run(at(5.5, 9, 5.5), floorAt(4), IDLE, 1.5)

    expect(player.pos.y).toBe(5)
    expect(player.onGround).toBe(true)
  })

  it("doesn't fall through the floor from a great height", () => {
    const player = run(at(5.5, 60, 5.5), floorAt(4), IDLE, 4, 0.05)

    expect(player.pos.y).toBe(5)
  })

  it('walks forward at walking speed, faster when sprinting', () => {
    const walked = run(at(5.5, 5, 5.5, EAST), floorAt(4), { ...IDLE, forward: 1 }, 1)
    const sprinted = run(at(5.5, 5, 5.5, EAST), floorAt(4), { ...IDLE, forward: 1, sprint: true }, 1)

    expect(walked.pos.x - 5.5).toBeGreaterThan(3.5)
    expect(walked.pos.x - 5.5).toBeLessThan(PLAYER.WALK)
    expect(sprinted.pos.x).toBeGreaterThan(walked.pos.x)
    expect(walked.pos.z).toBeCloseTo(5.5)
  })

  it('stops at a wall instead of walking into it', () => {
    const wall = floorAt(4, [[8, 5, 5, BLOCK.STONE], [8, 6, 5, BLOCK.STONE]])
    const player = run(at(5.5, 5, 5.5, EAST), wall, { ...IDLE, forward: 1 }, 2)

    expect(player.pos.x).toBeCloseTo(8 - PLAYER.HALF_WIDTH, 2)
  })

  it('jumps onto a one-block step', () => {
    const step = floorAt(4, [[7, 5, 5, BLOCK.STONE], [8, 5, 5, BLOCK.STONE], [9, 5, 5, BLOCK.STONE]])
    const player = run(at(5.5, 5, 5.5, EAST), step, { ...IDLE, forward: 1, jump: true }, 0.6)
    run(player, step, IDLE, 1)

    expect(player.pos.y).toBe(6)
    expect(player.pos.x).toBeGreaterThan(7)
    expect(player.onGround).toBe(true)
  })

  it('only jumps from the ground', () => {
    const player = at(5.5, 20, 5.5)
    stepPlayer(player, floorAt(4), { ...IDLE, jump: true }, 1 / 60)

    expect(player.vel.y).toBeLessThan(0)
  })

  it('sinks slowly in water and swims up while jump is held', () => {
    const water = worldOf([], (x, y) => (y <= 4 ? BLOCK.STONE : y <= 10 ? BLOCK.WATER : BLOCK.AIR))
    const sinking = run(at(5.5, 8, 5.5), water, IDLE, 1)
    const swimming = run(at(5.5, 6, 5.5), water, { ...IDLE, jump: true }, 1)

    expect(isSwimming(at(5.5, 8, 5.5), water)).toBe(true)
    expect(isSwimming(at(5.5, 12, 5.5), water)).toBe(false)
    expect(sinking.vel.y).toBeGreaterThanOrEqual(-2.6)
    expect(swimming.pos.y).toBeGreaterThan(6)
  })

  it('turns with the mouse and stops just short of looking straight up or down', () => {
    const player = at(0, 0, 0)
    turn(player, 100, 0)
    expect(player.yaw).toBeCloseTo(-100 * PLAYER.LOOK_SPEED)

    turn(player, 0, -100000)
    expect(player.pitch).toBe(PLAYER.MAX_PITCH)
    turn(player, 0, 100000)
    expect(player.pitch).toBe(-PLAYER.MAX_PITCH)
  })

  it('looks down -z at yaw 0, and sees from eye height', () => {
    const player = at(1, 2, 3)

    expect(lookDirection(player)).toEqual({ x: -0, y: 0, z: -1 })
    expect(eyePosition(player)).toEqual({ x: 1, y: 2 + PLAYER.EYES, z: 3 })
  })

  it('knows which blocks would sit inside it, so they are never placed there', () => {
    const player = at(5.5, 5, 5.5)

    expect(overlapsBlock(player, 5, 5, 5)).toBe(true)
    expect(overlapsBlock(player, 5, 6, 5)).toBe(true)
    expect(overlapsBlock(player, 5, 7, 5)).toBe(false)
    expect(overlapsBlock(player, 6, 5, 5)).toBe(false)
    expect(overlapsBlock(player, 5, 4, 5)).toBe(false)
  })

  it.each([
    ['west', Math.PI / 2, 0.5, 'x', PLAYER.HALF_WIDTH],
    ['north', 0, 0.5, 'z', PLAYER.HALF_WIDTH],
    ['east', EAST, 511.5, 'x', 512 - PLAYER.HALF_WIDTH],
    ['south', Math.PI, 511.5, 'z', 512 - PLAYER.HALF_WIDTH],
  ])('stops at the %s edge of the world as at a wall', (side, yaw, start, axis, limit) => {
    const from = axis === 'x' ? at(start, 5, 5.5, yaw) : at(5.5, 5, start, yaw)

    const player = run(from, floorAt(4), { ...IDLE, forward: 1 }, 1)

    expect(player.pos[axis]).toBeCloseTo(limit, 3)
    expect(player.pos.y).toBe(5)
  })

  it('lifts itself out of a block it starts inside', () => {
    const player = liftClear(at(5.5, 2, 5.5), floorAt(4))

    expect(player.pos.y).toBe(5)
  })
})

describe('climbing out of the water', () => {
  const PUSH_UP = { ...IDLE, forward: 1, jump: true }

  it('climbs onto a bank level with the water and stands on it', () => {
    const player = pushToward(bankWorld(6), PUSH_UP, 3)
    run(player, bankWorld(6), IDLE, 1)

    expect(player.pos.y).toBe(7)
    expect(player.pos.x).toBeGreaterThan(8)
    expect(player.onGround).toBe(true)
  })

  it('climbs a three-block wall from the water and stands on top', () => {
    const world = bankWorld(9)
    const player = pushToward(world, PUSH_UP, 3)
    run(player, world, IDLE, 1)

    expect(player.pos.y).toBe(10)
    expect(player.pos.x).toBeGreaterThan(8)
    expect(player.onGround).toBe(true)
  })

  it('stays in the water when pushing into the bank without holding jump', () => {
    const world = bankWorld(9)
    const player = pushToward(world, { ...IDLE, forward: 1 }, 3)

    expect(player.pos.y).toBeLessThan(6)
    expect(player.climbing).toBe(false)
    expect(isSwimming(player, world)).toBe(true)
  })

  it('never climbs a wall from dry land', () => {
    const world = floorAt(4, [[8, 5, 5, BLOCK.STONE], [8, 6, 5, BLOCK.STONE]])
    const player = pushToward(world, PUSH_UP, 3, at(5.5, 5, 5.5, EAST))

    expect(player.climbing).toBe(false)
    expect(player.pos.y).toBeLessThan(7)
    expect(player.pos.x).toBeCloseTo(8 - PLAYER.HALF_WIDTH, 1)
  })

  it('keeps rising at climbing speed against the wall once above the water', () => {
    const world = bankWorld(9)
    const player = pushToward(world, PUSH_UP, 1.5)
    stepPlayer(player, world, PUSH_UP, 1 / 60)

    expect(player.pos.y).toBeGreaterThan(7)
    expect(player.climbing).toBe(true)
    expect(player.vel.y).toBeCloseTo(3.4)
  })

  it('pushes up and forward on the frame the wall ends under the climber', () => {
    const world = bankWorld(9)
    const player = pushToward(world, PUSH_UP, 0.5)
    let pushed = false
    for (let frame = 0; frame < 240 && !pushed; frame++) {
      const wasClimbing = player.climbing
      stepPlayer(player, world, PUSH_UP, 1 / 60)
      pushed = wasClimbing && !player.climbing
    }

    expect(pushed).toBe(true)
    expect(player.vel.y).toBeGreaterThanOrEqual(CLIMB.LIP_UP)
    expect(Math.hypot(player.vel.x, player.vel.z)).toBeCloseTo(CLIMB.LIP_FORWARD, 1)
  })

  it('does not kick upward when forward is released against the wall', () => {
    const world = bankWorld(9)
    const player = pushToward(world, PUSH_UP, 1)
    player.vel.y = 0
    stepPlayer(player, world, { ...IDLE, jump: true }, 1 / 60)

    expect(player.climbing).toBe(false)
    expect(player.vel.y).toBeLessThan(0)
  })

  it('starts a new player not climbing', () => {
    expect(at(0, 0, 0).climbing).toBe(false)
  })
})
