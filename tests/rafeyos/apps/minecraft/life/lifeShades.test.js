import { describe, expect, it } from 'vitest'
import { Color, MeshBasicMaterial, PerspectiveCamera, Scene, Vector3 } from 'three'
import { createLife } from '@/components/rafeyos/apps/minecraft/logic/life/life'
import { floorAt } from '../minecraftTestWorld'

// Just what the life layer reads and writes of the engine's view
const fakeView = () => ({
  scene: new Scene(), camera: new PerspectiveCamera(),
  materials: { solid: new MeshBasicMaterial(), water: new MeshBasicMaterial() },
  sky: { material: { uniforms: { sun: { value: new Vector3() }, moon: { value: new Vector3() }, night: { value: 0 }, time: { value: 0 } } } },
  horizon: new Color(), zenith: new Color(), underwater: new Color(),
})
const lifeOnAField = () => createLife({ view: fakeView(), world: floorAt(30), startTime: 0 })
const EYE = { x: 100.5, y: 32.62, z: 100.5 }
const AHEAD = { x: 0, y: 0, z: 1 }

describe('clicking at a shade', () => {
  it('hits a shade in reach in place of the block behind it', () => {
    const life = lifeOnAField()
    life.shades().add(100.5, 31.7, 103).rise = 1

    expect(life.hitShade({ eye: EYE, look: AHEAD, target: { x: 100, y: 32, z: 106 } })).toBe(true)
  })

  it('leaves a shade behind the aimed-at block alone, so the block breaks', () => {
    const life = lifeOnAField()
    life.shades().add(100.5, 31.7, 104.5).rise = 1

    expect(life.hitShade({ eye: EYE, look: AHEAD, target: { x: 100, y: 32, z: 102 } })).toBe(false)
  })

  it('reaches no further than a few blocks with nothing aimed at', () => {
    const life = lifeOnAField()
    life.shades().add(100.5, 31.7, 108).rise = 1

    expect(life.hitShade({ eye: EYE, look: AHEAD, target: null })).toBe(false)
  })

  it('clears every shade when the player respawns', () => {
    const life = lifeOnAField()
    life.shades().add(100.5, 31, 110)

    life.respawned()

    expect(life.shades().shades).toEqual([])
  })

  it('hits a creeper in reach in place of the block behind it', () => {
    const life = lifeOnAField()
    life.creepers().add(100.5, 31, 103)

    expect(life.hitShade({ eye: EYE, look: AHEAD, target: { x: 100, y: 32, z: 106 } })).toBe(true)
  })

  it('clears every creeper when the player respawns', () => {
    const life = lifeOnAField()
    life.creepers().add(100.5, 31, 110)

    life.respawned()

    expect(life.creepers().creepers).toEqual([])
  })
})
