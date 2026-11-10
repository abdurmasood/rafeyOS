// @vitest-environment jsdom
import { describe, expect, it } from 'vitest'
import { installEngineHarness, loaded, lockedElement, start, sunk, track } from './minecraftEngineFakes'

installEngineHarness()

// Spawn stands on sand at y 33 (mainland.test.js); spawning higher drops the player that far on the first frames
const SPAWN_GROUND = 33
const droppedFrom = (blocks) => ({ ...loaded.island, spawn: { ...loaded.island.spawn, y: SPAWN_GROUND + blocks } })
const play = (world) => {
  world.engine.setActive(true)
  world.engine.capture()
  return world
}
const framesFor = (seconds) => Math.ceil((seconds * 1000) / 16)

describe('health in the engine', () => {
  it('takes half a heart for each block a fall drops past three', () => {
    const world = play(track(start({ island: droppedFrom(14) })))

    world.tick(framesFor(2))

    expect(world.lastHud()).toMatchObject({ health: 20 - 11, dead: false })
  })

  it("doesn't hurt a fall taken while the game isn't being played", () => {
    const world = track(start({ island: droppedFrom(14) }))

    world.tick(framesFor(2))

    expect(world.lastHud().health).toBe(20)
  })

  it('runs out of air under water, a bubble at a time', () => {
    const world = play(track(start({ island: sunk() })))

    world.tick(framesFor(3))

    expect(world.lastHud().air).toBeLessThan(20)
    expect(world.lastHud().health).toBe(20)
  })
})

describe('dying', () => {
  it('says how, then lets go of the mouse without pausing', () => {
    const world = play(track(start({ island: droppedFrom(30) })))

    world.tick(framesFor(3))

    expect(world.lastHud()).toMatchObject({ dead: true, health: 0, playing: false, cause: { kind: 'fall', blocks: 30 } })
    expect(lockedElement()).toBeNull()
  })

  it('names the death before reporting the mouse let go, so the pause panel never shows in between', () => {
    const world = play(track(start({ island: droppedFrom(30) })))

    world.tick(framesFor(3))

    const calls = world.hud.mock.calls.map(([hud]) => hud)
    const deadAt = calls.findIndex((hud) => hud.dead)
    expect(calls[deadAt - 1].playing).toBe(true)
  })

  it("won't respawn in the first moments, so a click meant for the game can't skip the death", () => {
    const world = play(track(start({ island: droppedFrom(30) })))
    // A 30-block fall lands after about 1.46 s
    world.tick(framesFor(1.8))
    expect(world.lastHud().dead).toBe(true)

    world.engine.respawn()

    expect(world.lastHud().dead).toBe(true)
    expect(lockedElement()).toBeNull()
  })

  it('respawns at the spawn point with full health once the mouse is back', () => {
    const world = play(track(start({ island: droppedFrom(30) })))
    world.tick(framesFor(4.5))

    world.engine.respawn()

    expect(lockedElement()).toBe(world.canvas)
    expect(world.lastHud()).toMatchObject({ dead: false, cause: null, playing: true, health: 20 })
    world.tick(8)
    expect(world.lastHud().position).toMatch(/ y 6[23]\.\d /)
  })

  it('keeps the death panel up while the browser refuses the mouse, and asks again on the next press', () => {
    const world = play(track(start({ island: droppedFrom(30) })))
    world.tick(framesFor(4.5))
    const requestPointerLock = HTMLCanvasElement.prototype.requestPointerLock
    HTMLCanvasElement.prototype.requestPointerLock = () => Promise.reject(new Error('refused'))

    world.engine.respawn()
    expect(world.lastHud().dead).toBe(true)

    HTMLCanvasElement.prototype.requestPointerLock = requestPointerLock
    world.engine.respawn()
    expect(world.lastHud()).toMatchObject({ dead: false, health: 20 })
  })

  it('ignores Respawn while alive', () => {
    const world = play(track(start()))
    world.tick()
    const before = world.hud.mock.calls.length

    world.engine.respawn()

    expect(world.hud.mock.calls.length).toBe(before)
  })
})
