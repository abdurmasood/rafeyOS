import { describe, expect, it } from 'vitest'
import { Color } from 'three'
import { CREEPERS } from '@/components/rafeyos/apps/minecraft/logic/life/creepers'
import { createCreeperMeshes, skinnedBox } from '@/components/rafeyos/apps/minecraft/logic/life/creeperMeshes'
import { CREEPER_UV } from '@/components/rafeyos/apps/minecraft/logic/life/creeperSkin'

const creeper = (extra = {}) => ({
  x: 10, y: 30, z: 10, vy: 0, kx: 0, kz: 0, yaw: 0, onGround: true, status: 'walk', fuse: 0,
  phase: 1, moving: 1, side: 1, hits: 0, hitClock: 0, flinch: 0, seed: 3, dead: false, ...extra,
})
const NIGHT = new Color('#5f6fa2')

describe('drawing the creepers', () => {
  it('draws six UV limbs per creeper plus smoke, with a skin map', () => {
    const meshes = createCreeperMeshes(() => 0.5)

    meshes.draw([creeper(), creeper({ x: 14 })], 1 / 60, NIGHT)

    expect(meshes.meshes).toHaveLength(7)
    expect(meshes.meshes[0].count).toBe(2)
    expect(meshes.material.map).toBeTruthy()
    meshes.dispose()
  })

  it('keeps the body readable at night', () => {
    const meshes = createCreeperMeshes()

    meshes.draw([creeper()], 1 / 60, NIGHT)

    expect(meshes.material.color.r).toBeGreaterThan(NIGHT.r)
    meshes.dispose()
  })

  it('smokes while fusing', () => {
    const meshes = createCreeperMeshes(() => 0)
    const smoke = meshes.meshes.at(-1)

    for (let i = 0; i < 20; i++) meshes.draw([creeper({ fuse: 0.5 })], 1 / 60, NIGHT)

    expect(smoke.count).toBeGreaterThan(0)
    expect(smoke.count).toBeLessThanOrEqual(80)
    meshes.dispose()
  })

  it('has room for every creeper there can be', () => {
    const meshes = createCreeperMeshes()
    expect(meshes.meshes[0].instanceMatrix.count).toBe(CREEPERS.MAX)
    meshes.dispose()
  })

  it('builds a skinned box with UVs in 0..1', () => {
    const geo = skinnedBox(CREEPER_UV.HEAD.w, CREEPER_UV.HEAD.h, CREEPER_UV.HEAD.d, CREEPER_UV.HEAD.u, CREEPER_UV.HEAD.v)
    const uv = geo.attributes.uv
    expect(uv.count).toBe(24)
    for (let i = 0; i < uv.count; i++) {
      expect(uv.getX(i)).toBeGreaterThanOrEqual(0)
      expect(uv.getX(i)).toBeLessThanOrEqual(1)
      expect(uv.getY(i)).toBeGreaterThanOrEqual(0)
      expect(uv.getY(i)).toBeLessThanOrEqual(1)
    }
    geo.dispose()
  })
})
