// @vitest-environment jsdom
// The world's own life in the engine: one group of its own in the scene, the block materials patched for wind and
// water, and all of it held still for reduced motion
import { describe, expect, it } from 'vitest'
import { drawn, installEngineHarness, start, track } from './minecraftEngineFakes'

installEngineHarness()

const lifeOf = (scene) => scene.getObjectByName('life')
const solidOf = (scene) => scene.children.find((child) => child.isMesh && child.renderOrder === 0 && child.geometry.type === 'BufferGeometry').material
const waterOf = (scene) => scene.children.find((child) => child.isMesh && child.renderOrder === 1).material

describe('life in the engine', () => {
  it('keeps clouds, tufts and fireflies in one group of its own, laid out around spawn', () => {
    const { scene } = drawn(track(start()))
    const life = lifeOf(scene)

    expect(life.parent).toBe(scene)
    expect(life.children.length).toBeGreaterThan(3)
    expect(life.children.some((child) => child.isInstancedMesh && child.count > 0)).toBe(true)
  })

  it('gives the blocks and the water their own patched programs', () => {
    const { scene } = drawn(track(start()))

    expect(solidOf(scene).customProgramCacheKey()).toBe('mc-solid-sway')
    expect(waterOf(scene).customProgramCacheKey()).toBe('mc-water-drift')
  })

  it('takes its group out of the scene when the engine goes', () => {
    const world = track(start())
    const { scene } = drawn(world)

    world.engine.dispose()

    expect(lifeOf(scene)).toBeUndefined()
  })

  it('drifts the clouds, unless the visitor asked for reduced motion', () => {
    const moving = track(start())
    const still = track(start({ reducedMotion: true }))
    moving.tick(30)
    still.tick(30)
    const clouds = (world) => lifeOf(world.renderer.render.mock.lastCall[0]).children[0]

    expect(clouds(moving).position.x).toBeGreaterThan(0)
    expect(clouds(still).position.x).toBe(0)
  })
})
