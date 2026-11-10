import { describe, expect, it } from 'vitest'
import { Color } from 'three'
import { SHADES } from '@/components/rafeyos/apps/minecraft/logic/life/shades'
import { createShadeMeshes } from '@/components/rafeyos/apps/minecraft/logic/life/shadeMeshes'

const shade = (extra = {}) => ({
  x: 10, y: 30, z: 10, vy: 0, kx: 0, kz: 0, yaw: 0, onGround: true, mode: 'stalk', status: 'stalk', rise: 1, fade: 0,
  phase: 1, moving: 1, side: 1, cooldown: 0, timer: 0, hits: 0, hitClock: 0, flinch: 0, seed: 3, jaw: 0, paceDir: 1,
  paceTimer: 0, lungeYaw: 0, head: 0, ...extra,
})
const NIGHT = new Color('#5f6fa2')

describe('drawing the shades', () => {
  it('draws every part of each shade, and two glowing eyes', () => {
    const meshes = createShadeMeshes(() => 0.5)

    meshes.draw([shade(), shade({ x: 14 })], 1 / 60, NIGHT)

    const [body, , , , , , , , , , , , , , , , , , , , eye] = meshes.meshes
    expect(body.count).toBe(2)
    expect(eye.count).toBe(2)
    expect(meshes.glow.geometry.drawRange.count).toBe(4)
  })

  it('keeps the body readable at night, lighter than the light on the blocks', () => {
    const meshes = createShadeMeshes()

    meshes.draw([shade()], 1 / 60, NIGHT)

    expect(meshes.meshes[0].material.color.r).toBeGreaterThan(NIGHT.r)
  })

  it('smokes as it rises out of the ground', () => {
    const meshes = createShadeMeshes(() => 0)
    const smoke = meshes.meshes.at(-1)

    for (let i = 0; i < 10; i++) meshes.draw([shade({ rise: 0.3 })], 1 / 60, NIGHT)

    expect(smoke.count).toBeGreaterThan(0)
    expect(smoke.count).toBeLessThanOrEqual(220)
  })

  it('has room for every shade there can be', () => {
    expect(createShadeMeshes().meshes[0].instanceMatrix.count).toBe(SHADES.MAX)
  })
})
