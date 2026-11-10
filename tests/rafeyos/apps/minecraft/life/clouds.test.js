import { describe, expect, it } from 'vitest'
import { Matrix4, Vector3 } from 'three'
import { CLOUDS, createClouds, isCloud } from '@/components/rafeyos/apps/minecraft/logic/life/clouds'
import { createSkyState, skyAt } from '@/components/rafeyos/apps/minecraft/logic/life/skyClock'

const ORBIT_HEIGHT = 90 // startDirector.js: the title camera, which looks under the clouds
const heightOf = (mesh, i) => new Vector3().setFromMatrixPosition(new Matrix4().fromArray(mesh.instanceMatrix.array, i * 16)).y

describe('the clouds', () => {
  it('cover part of the sky, the same cells every time', () => {
    const cells = Array.from({ length: 4000 }, (_, k) => isCloud(k % 80, Math.floor(k / 80)))
    const cover = cells.filter(Boolean).length / cells.length

    expect(cover).toBeGreaterThan(0.08)
    expect(cover).toBeLessThan(0.45)
    expect(cells).toEqual(Array.from({ length: 4000 }, (_, k) => isCloud(k % 80, Math.floor(k / 80))))
  })

  it('sit above the title camera, all around wherever the camera is', () => {
    const clouds = createClouds()

    clouds.update(0, { x: 256, z: 256 })

    expect(clouds.mesh.count).toBeGreaterThan(50)
    expect(heightOf(clouds.mesh, 0) - CLOUDS.THICK / 2).toBeGreaterThan(ORBIT_HEIGHT + 10)
  })

  it('drift with the wind, and lay out again only as the camera moves a whole cell', () => {
    const clouds = createClouds()
    clouds.update(0, { x: 256, z: 256 })
    const first = clouds.mesh.instanceMatrix.array.slice()

    clouds.update(1, { x: 256, z: 256 })
    expect(clouds.mesh.position.x).toBeCloseTo(CLOUDS.SPEED)
    expect(clouds.mesh.instanceMatrix.array).toEqual(first)
  })

  it('go grey at night and stay white by day', () => {
    const clouds = createClouds()

    clouds.tint(skyAt(0.5, createSkyState()))
    expect(clouds.mesh.material.color.getHexString()).toBe('ffffff')
    clouds.tint(skyAt(0, createSkyState()))
    expect(clouds.mesh.material.color.r).toBeLessThan(0.1)
  })
})
