import { describe, expect, it } from 'vitest'
import { Color } from 'three'
import { createCreatureMeshes } from '@/components/rafeyos/apps/minecraft/logic/life/creatureMeshes'
import { SPECIES } from '@/components/rafeyos/apps/minecraft/logic/life/species'

const animal = (species, extra = {}) => ({
  species, x: 10, y: 30, z: 10, yaw: 0, turnTo: 0, mode: 'walk', timer: 1, phase: 1, moving: 1, scale: 1, grow: 1, variant: 0, hop: 0, headPitch: 0, ...extra,
})
const gull = { x: 10, y: 50, z: 10, yaw: 0, wing: 0.4 }
const countOf = (meshes, species) => {
  const parts = SPECIES[species].parts(SPECIES[species].colours[0]).length
  const start = Object.keys(SPECIES).slice(0, Object.keys(SPECIES).indexOf(species)).reduce((sum, name) => sum + SPECIES[name].parts(SPECIES[name].colours[0]).length, 0)
  return meshes.meshes.slice(start, start + parts).map((mesh) => mesh.count)
}

describe('drawing the animals', () => {
  it('draws every part of every animal, one instance each', () => {
    const meshes = createCreatureMeshes()

    meshes.draw([animal('deer'), animal('deer', { x: 12 }), animal('hare')], [], 1)

    expect(new Set(countOf(meshes, 'deer'))).toEqual(new Set([2]))
    expect(new Set(countOf(meshes, 'hare'))).toEqual(new Set([1]))
    expect(new Set(countOf(meshes, 'goat'))).toEqual(new Set([0]))
  })

  it('shows gulls by day and not at night', () => {
    const meshes = createCreatureMeshes()

    meshes.draw([], [gull, gull], 1)
    expect(new Set(countOf(meshes, 'gull'))).toEqual(new Set([2]))
    meshes.draw([], [gull, gull], 0)
    expect(new Set(countOf(meshes, 'gull'))).toEqual(new Set([0]))
  })

  it('never lets three cull animals by where they first stood', () => {
    expect(createCreatureMeshes().meshes.every((mesh) => mesh.frustumCulled === false)).toBe(true)
  })

  it('colours each part as its species says', () => {
    const meshes = createCreatureMeshes()
    meshes.draw([animal('crab')], [], 1)
    const firstCrabPart = Object.keys(SPECIES).slice(0, Object.keys(SPECIES).indexOf('crab'))
      .reduce((sum, name) => sum + SPECIES[name].parts(SPECIES[name].colours[0]).length, 0)

    const colour = new Color()
    meshes.meshes[firstCrabPart].getColorAt(0, colour)

    expect(`#${colour.getHexString()}`).toBe(SPECIES.crab.parts(SPECIES.crab.colours[0])[0].colour)
  })
})
