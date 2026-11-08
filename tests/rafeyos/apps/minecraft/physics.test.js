import { describe, expect, it } from 'vitest'
import {
  PLAYER, createPlayer, eyePosition, isSwimming, liftClear, lookDirection, overlapsBlock, stepPlayer, turn,
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

  it('lifts itself out of a block it starts inside', () => {
    const player = liftClear(at(5.5, 2, 5.5), floorAt(4))

    expect(player.pos.y).toBe(5)
  })
})
