import { describe, expect, it } from 'vitest'
import { Color, DoubleSide, Fog, MeshBasicMaterial, ShaderLib } from 'three'
import { depthBelowSurface, seeWaterFromBelow, setAtmosphereAt } from '@/components/rafeyos/apps/minecraft/logic/atmosphere'
import { BLOCK } from '@/components/rafeyos/apps/minecraft/logic/blockTypes'
import { worldOf } from './minecraftTestWorld'

// The look's table values, written out so a changed constant shows up here
const AIR = { horizon: '#cfe2f0', zenith: '#5f9ddc', near: 55, far: 175 }
const DEEP = '#2a6faa'

// Open sea everywhere: a stone floor up to y = 13, water from 14 to 28 (its drawn surface at 28.88), air above
const SEA = worldOf([], (x, y) => (y <= 13 ? BLOCK.STONE : y <= 28 ? BLOCK.WATER : BLOCK.AIR))
// The same sea frozen over: ice where the top water layer was
const FROZEN = worldOf([], (x, y) => (y <= 13 ? BLOCK.STONE : y <= 27 ? BLOCK.WATER : y === 28 ? BLOCK.ICE : BLOCK.AIR))
// Solid rock with a dry pocket at y 10..12, under the sea
const CAVE = worldOf([], (x, y) => (y >= 10 && y <= 12 ? BLOCK.AIR : y <= 13 ? BLOCK.STONE : y <= 28 ? BLOCK.WATER : BLOCK.AIR))
const at = (y) => ({ x: 4.5, y, z: 4.5 })

// What the engine's view hands setAtmosphereAt: fog, the sky's uniforms, and the colours it lerps between
const minimalView = () => ({
  scene: { fog: new Fog(new Color(AIR.horizon), AIR.near, AIR.far) },
  sky: { material: { uniforms: { horizon: { value: new Color(AIR.horizon) }, zenith: { value: new Color(AIR.zenith) }, glow: { value: 1 } } } },
  horizon: new Color(AIR.horizon), zenith: new Color(AIR.zenith), underwater: new Color(DEEP),
})
const hex = (color) => `#${color.getHexString()}`
const lookOf = (view) => {
  const { fog } = view.scene
  const { horizon, zenith, glow } = view.sky.material.uniforms
  return { fog: [hex(fog.color), fog.near, fog.far], horizon: hex(horizon.value), zenith: hex(zenith.value), glow: glow.value, haze: view.haze }
}

describe('depthBelowSurface', () => {
  it('measures open sea from the surface the mesher draws, 0.88 up the top water block', () => {
    expect(depthBelowSurface(SEA, at(21.62))).toBeCloseTo(7.26)
    expect(depthBelowSurface(SEA, at(28.5))).toBeCloseTo(0.38)
  })

  it('is 0 for an eye above the drawn plane though still inside the top water block', () => {
    expect(depthBelowSurface(SEA, at(28.95))).toBe(0)
  })

  it('is 0 in dry air above the sea and in a dry cave under it', () => {
    expect(depthBelowSurface(SEA, at(40))).toBe(0)
    expect(depthBelowSurface(CAVE, at(11))).toBe(0)
  })

  it('measures to the top water block under an ice roof, not to the ice', () => {
    expect(depthBelowSurface(FROZEN, at(21.62))).toBeCloseTo(6.26)
  })
})

describe('setAtmosphereAt', () => {
  it('gives the clear day look in the open air, back from the deep', () => {
    const view = minimalView()
    setAtmosphereAt(view, SEA, at(15))
    setAtmosphereAt(view, SEA, at(40))

    expect(lookOf(view)).toEqual({ fog: [AIR.horizon, AIR.near, AIR.far], horizon: AIR.horizon, zenith: AIR.zenith, glow: 1, haze: 0 })
  })

  it('reaches the deep look 14 blocks down and stays there below', () => {
    const view = minimalView()
    for (const y of [28.88 - 14, 14.2]) {
      setAtmosphereAt(view, SEA, at(y))

      expect(lookOf(view)).toEqual({ fog: [DEEP, 6, 110], horizon: DEEP, zenith: DEEP, glow: expect.closeTo(0.15), haze: 1 })
    }
  })

  it('follows the square root of depth, so a quarter of the way down is half the haze', () => {
    const view = minimalView()
    setAtmosphereAt(view, SEA, at(28.88 - 3.5))
    const half = (from) => hex(new Color(from).lerp(new Color(DEEP), 0.5))

    expect(lookOf(view)).toEqual({
      fog: [half(AIR.horizon), expect.closeTo(30.5), expect.closeTo(142.5)],
      horizon: half(AIR.horizon), zenith: half(AIR.zenith), glow: expect.closeTo(0.575), haze: expect.closeTo(0.5),
    })
  })

  it('keeps the fog colour and the sky horizon identical at every depth, so fogged land melts into the sky', () => {
    const view = minimalView()
    for (let y = 30; y >= 14; y -= 0.37) {
      setAtmosphereAt(view, SEA, at(y))

      expect(view.sky.material.uniforms.horizon.value.equals(view.scene.fog.color)).toBe(true)
    }
  })

  it('writes into the fog and sky Colors in place, leaving the colours it lerps from alone', () => {
    const view = minimalView()
    const { uniforms } = view.sky.material
    const targets = () => [view.scene.fog.color, uniforms.horizon.value, uniforms.zenith.value]
    const before = targets()
    setAtmosphereAt(view, SEA, at(18))

    targets().forEach((color, i) => expect(color).toBe(before[i]))
    expect(hex(view.scene.fog.color)).not.toBe(AIR.horizon)
    expect(uniforms.horizon.value).not.toBe(view.scene.fog.color)
    expect([hex(view.horizon), hex(view.zenith), hex(view.underwater)]).toEqual([AIR.horizon, AIR.zenith, DEEP])
  })

  it('never pops through the surface: the fog moves a little at a time as the eye sinks', () => {
    const view = minimalView()
    setAtmosphereAt(view, SEA, at(29.5))
    let previous = view.scene.fog.far
    let biggestStep = 0
    for (let step = 1; step <= 100; step++) {
      setAtmosphereAt(view, SEA, at(29.5 - step * 0.02))
      biggestStep = Math.max(biggestStep, Math.abs(view.scene.fog.far - previous))
      previous = view.scene.fog.far
    }

    // 0.02 blocks under the surface is the steepest step, about 2.5 blocks of fog
    expect(biggestStep).toBeLessThan(3)
    expect(previous).toBeLessThan(160)
  })
})

describe('seeWaterFromBelow', () => {
  it('draws water from both sides in one pass, its underside a pale see-through ceiling that still takes fog', () => {
    const water = new MeshBasicMaterial({ transparent: true })
    seeWaterFromBelow(water)
    // What three hands the hook: the built-in shader, its chunks not yet inlined
    const shader = { uniforms: {}, vertexShader: ShaderLib.basic.vertexShader, fragmentShader: ShaderLib.basic.fragmentShader }
    water.onBeforeCompile(shader)
    const source = shader.fragmentShader

    expect([water.side, water.forceSinglePass]).toEqual([DoubleSide, true])
    expect(source).toMatch(/#include <opaque_fragment>\s*if \(!gl_FrontFacing\) \{\s*gl_FragColor\.rgb = mix\(gl_FragColor\.rgb, vec3\(0\.62, 0\.84, 0\.93\), 0\.45\);\s*gl_FragColor\.a = 0\.5;\s*\}/)
    expect(source.indexOf('gl_FrontFacing')).toBeLessThan(source.indexOf('#include <fog_fragment>'))
  })
})
