// Motion the GPU does on its own: leaves that sway in the wind and water that drifts and ripples. Both patch the
// built-in block materials, wrapping their compile hooks rather than replacing them (the centroid fix on the blocks,
// the see-from-below patch on the water).
import { TILE } from '@/components/rafeyos/apps/minecraft/logic/blockTypes'

// The leaf tiles. The shader reads a face's tile back from its UV, which sits inside the tile (mesher.js insets it),
// 8 tiles to a row of the atlas.
export const LEAF_TILES = Object.freeze([TILE.LEAVES, TILE.PINE_NEEDLES, TILE.BIRCH_LEAVES, TILE.PALM_LEAVES, TILE.MARSH_LEAVES])

const LEAF_SWAY = `#include <begin_vertex>
  {
    float tile = floor(uv.x * 8.0) + (7.0 - floor(uv.y * 8.0)) * 8.0;
    float leaf = ${LEAF_TILES.map((tile) => `tile == ${tile}.0`).join(' || ')} ? 1.0 : 0.0;
    float phase = uTime * 1.7 + position.x * 0.31 + position.z * 0.23 + position.y * 0.19;
    transformed.x += leaf * uWind * (sin(phase) * 0.045 + sin(phase * 2.7) * 0.018);
    transformed.z += leaf * uWind * cos(phase * 0.83) * 0.035;
    transformed.y += leaf * uWind * sin(phase * 1.3) * 0.012;
  }`

const WATER_DRIFT = `
  vec2 driftUv = vMapUv + vec2(uTime * 0.035, uTime * 0.018);
  driftUv.x += sin(floor(driftUv.y * 16.0) * 0.9 + uTime * 1.6) * 0.035;
  vec4 sampledDiffuseColor = texture2D( map, driftUv );
  float glint = step(0.985, fract(sin(dot(floor(vMapUv * 16.0), vec2(12.9, 78.2)) + floor(uTime * 2.0)) * 43758.5));
  sampledDiffuseColor.rgb += glint * 0.18 * uSun;
  diffuseColor *= sampledDiffuseColor;`

/**
 * Runs `patch` after the material's own compile hook, and gives its program a cache key of its own: three shares
 * compiled programs between materials whose keys match, and the default key is the hook's source, the same for every
 * material patched here.
 * @param {import('three').Material} material
 * @param {string} key
 * @param {(shader: { vertexShader: string, fragmentShader: string, uniforms: object }) => void} patch
 */
export const extendCompile = (material, key, patch) => {
  const before = material.onBeforeCompile
  material.onBeforeCompile = (shader, renderer) => {
    before.call(material, shader, renderer)
    shader.uniforms ??= {}
    patch(shader)
  }
  material.customProgramCacheKey = () => key
  material.needsUpdate = true
}

/**
 * @param {import('three').Material} material - the solid blocks
 * @param {{ time: { value: number }, wind: { value: number } }} uniforms - shared, written once a frame
 */
export const swayLeaves = (material, { time, wind }) => extendCompile(material, 'mc-solid-sway', (shader) => {
  shader.uniforms.uTime = time
  shader.uniforms.uWind = wind
  shader.vertexShader = `uniform float uTime;\nuniform float uWind;\n${shader.vertexShader.replace('#include <begin_vertex>', LEAF_SWAY)}`
})

/**
 * @param {import('three').Material} material - the water
 * @param {{ time: { value: number }, sun: { value: number } }} uniforms - sun: 0..1, how much the surface glints
 */
export const driftWater = (material, { time, sun }) => extendCompile(material, 'mc-water-drift', (shader) => {
  shader.uniforms.uTime = time
  shader.uniforms.uSun = sun
  shader.fragmentShader = `uniform float uTime;\nuniform float uSun;\n${shader.fragmentShader.replace('#include <map_fragment>', WATER_DRIFT)}`
})
