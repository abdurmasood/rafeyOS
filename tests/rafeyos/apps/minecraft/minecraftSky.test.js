// @vitest-environment jsdom
import { describe, expect, it } from 'vitest'
import { Color } from 'three'
import { SKY } from '@/components/rafeyos/apps/minecraft/logic/atmosphere'
import { SEA, drawn, fakeDirector, fogOf, installEngineHarness, seaFogAt, seaHazeAt, shotOver, start, sunk, track } from './minecraftEngineFakes'

installEngineHarness()

const DAY_HORIZON = '#cfe2f0'
const DAY_ZENITH = '#5f9ddc'

// The dome is the scene's only sphere
const skyOf = ({ children }) => children.find((child) => child.geometry?.type === 'SphereGeometry')
const skyColours = ({ scene }) => {
  const { horizon, zenith, glow } = skyOf(scene).material.uniforms
  return [`#${horizon.value.getHexString()}`, `#${zenith.value.getHexString()}`, glow.value]
}

describe('the Minecraft sky', () => {
  // The sunk player's eyes sit about 7.3 blocks under the surface, so the haze is about 0.72 of the way to deep
  it('takes the fog colour as its horizon at depth, so fogged land melts into it', () => {
    const view = drawn(track(start({ island: sunk() })))
    const haze = seaHazeAt(view.camera.position.y)
    const [horizon, zenith] = skyColours(view)

    expect(haze).toBeCloseTo(0.72, 1)
    expect(horizon).toBe(fogOf(view.scene)[0])
    expect(horizon).toBe(seaFogAt(view.camera.position.y)[0])
    expect(zenith).toBe(`#${new Color(SKY.zenith).lerp(new Color(SKY.underwater), haze).getHexString()}`)
  })

  it('dims the sun with depth, to 1 - 0.85 of the haze', () => {
    const view = drawn(track(start({ island: sunk() })))

    expect(skyColours(view)[2]).toBeCloseTo(1 - 0.85 * seaHazeAt(view.camera.position.y))
  })

  it('gives a shot above the water the clear day sky though the player is sunk, and the haze back after', () => {
    const director = shotOver(SEA, 80)
    const world = track(start({ island: sunk(), director }))
    expect(skyColours(drawn(world))).toEqual([DAY_HORIZON, DAY_ZENITH, 1])

    director.frame.mockReturnValue(null)
    const view = drawn(world)
    expect(skyColours(view)[0]).toBe(seaFogAt(view.camera.position.y)[0])
  })

  // The sky's horizon colour must not be the fog's own Color, or the dive would tint the clear-air fog for good
  it('keeps the fog\'s clear-air colour after a dive', () => {
    const director = fakeDirector()
    const world = track(start({ island: sunk(), director }))
    drawn(world)

    director.frame.mockReturnValue(shotOver(SEA, 80).frame())
    expect(fogOf(drawn(world).scene)).toEqual([DAY_HORIZON, 55, 175])
  })
})
