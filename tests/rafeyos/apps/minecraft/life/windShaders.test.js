import { describe, expect, it } from 'vitest'
import { MeshBasicMaterial, ShaderLib } from 'three'
import { LEAF_TILES, driftWater, extendCompile, swayLeaves } from '@/components/rafeyos/apps/minecraft/logic/life/windShaders'
import { TILE } from '@/components/rafeyos/apps/minecraft/logic/blockTypes'

const basicShader = () => ({ vertexShader: ShaderLib.basic.vertexShader, fragmentShader: ShaderLib.basic.fragmentShader })
const uniforms = { time: { value: 0 }, wind: { value: 1 }, sun: { value: 1 } }

describe('patching a block material', () => {
  it('runs the hook it had first, then the patch', () => {
    const material = new MeshBasicMaterial()
    const order = []
    material.onBeforeCompile = () => order.push('own')
    extendCompile(material, 'key', () => order.push('patch'))

    material.onBeforeCompile(basicShader())

    expect(order).toEqual(['own', 'patch'])
  })

  it('gives each patched material a program of its own', () => {
    const solid = new MeshBasicMaterial(), water = new MeshBasicMaterial()
    swayLeaves(solid, uniforms)
    driftWater(water, uniforms)

    expect(solid.customProgramCacheKey()).not.toBe(water.customProgramCacheKey())
  })

  it('copes with a shader that came without uniforms', () => {
    const material = new MeshBasicMaterial()
    swayLeaves(material, uniforms)
    const shader = basicShader()

    material.onBeforeCompile(shader)

    expect(shader.uniforms.uTime).toBe(uniforms.time)
  })
})

describe('the wind and the water', () => {
  it('sways only the leaf tiles, each named in the atlas', () => {
    const material = new MeshBasicMaterial()
    swayLeaves(material, uniforms)
    const shader = { ...basicShader(), uniforms: {} }
    material.onBeforeCompile(shader)

    expect(LEAF_TILES).toEqual([TILE.LEAVES, TILE.PINE_NEEDLES, TILE.BIRCH_LEAVES, TILE.PALM_LEAVES, TILE.MARSH_LEAVES])
    for (const tile of LEAF_TILES) expect(shader.vertexShader).toContain(`tile == ${tile}.0`)
    expect(shader.vertexShader).toMatch(/uniform float uWind;[\s\S]*transformed\.x \+= leaf \* uWind/)
  })

  it('drifts and ripples the water texture, glinting only in the sun', () => {
    const material = new MeshBasicMaterial()
    driftWater(material, uniforms)
    const shader = { ...basicShader(), uniforms: {} }
    material.onBeforeCompile(shader)

    expect(shader.fragmentShader).not.toContain('#include <map_fragment>')
    expect(shader.fragmentShader).toMatch(/texture2D\( map, driftUv \)/)
    expect(shader.fragmentShader).toContain('glint * 0.18 * uSun')
    expect(shader.uniforms.uSun).toBe(uniforms.sun)
  })

  it('asks three to compile the material again', () => {
    const material = new MeshBasicMaterial()
    const version = material.version

    swayLeaves(material, uniforms)

    expect(material.version).toBeGreaterThan(version)
  })
})
