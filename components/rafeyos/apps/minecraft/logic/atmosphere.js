// The air the camera looks through: the day's haze out of water, and under water a blue haze that thickens with depth.
// Depth is measured to the drawn surface, so it is continuous and diving or surfacing never pops. The water's underside
// shows as a pale, see-through ceiling, so the world above stays in view from below.
import { DoubleSide } from 'three'
import { BLOCK } from './blockTypes'
import { WATER_SURFACE } from './mesher'
import { clamp, lerp } from './noise'

// underwater: the deep water's blue, which the fog and the whole sky reach at HAZE_DEPTH
export const SKY = Object.freeze({ horizon: '#cfe2f0', zenith: '#5f9ddc', underwater: '#2a6faa' })
// near/far: in clear air; deepNear/deepFar: at HAZE_DEPTH and below, still far enough to see land across the sea
export const FOG = Object.freeze({ near: 55, far: 175, deepNear: 6, deepFar: 110 })
// The sea is about 14 blocks deep, so the full haze arrives near the seabed
export const HAZE_DEPTH = 14
// How much of the sun's glow the deep water hides
const SUN_FADE = 0.85

const UNDERSIDE = `#include <opaque_fragment>
  if (!gl_FrontFacing) {
    gl_FragColor.rgb = mix(gl_FragColor.rgb, vec3(0.62, 0.84, 0.93), 0.45);
    gl_FragColor.a = 0.5;
  }`

/**
 * How far `eye` is under the water surface above it, in blocks; 0 out of water. Measured up the eye's own column to
 * the plane the mesher draws, WATER_SURFACE up the top water block, so an eye in that block's top sliver is above the
 * surface it sees. Under ice it is the top water block that counts, not the ice.
 * @param {{ get: (x: number, y: number, z: number) => number }} world
 * @param {{ x: number, y: number, z: number }} eye
 */
export const depthBelowSurface = (world, eye) => {
  const x = Math.floor(eye.x), z = Math.floor(eye.z)
  let y = Math.floor(eye.y)
  if (world.get(x, y, z) !== BLOCK.WATER) return 0
  while (world.get(x, y + 1, z) === BLOCK.WATER) y++
  return Math.max(0, y + WATER_SURFACE - eye.y)
}

/**
 * Sets fog and sky for a camera at `eye`, from clear air to the deep look by depth (HAZE_DEPTH). The sky's horizon is
 * always the fog's colour, so terrain fading into the fog melts into the sky behind it. Runs every frame, so it lerps
 * into the fog's and sky's own Colors in place; view.horizon and view.zenith are the dry-air colours it starts from,
 * never written. Leaves the haze (0..1) in view.haze for the wash over the canvas.
 */
export const setAtmosphereAt = (view, world, eye) => {
  // A square root, so the water shows within the first block of a dive yet still starts from exactly air
  const haze = Math.sqrt(clamp(depthBelowSurface(world, eye) / HAZE_DEPTH, 0, 1))
  const { fog } = view.scene
  const { horizon, zenith, glow } = view.sky.material.uniforms
  fog.color.copy(view.horizon).lerp(view.underwater, haze)
  fog.near = lerp(FOG.near, FOG.deepNear, haze)
  fog.far = lerp(FOG.far, FOG.deepFar, haze)
  horizon.value.copy(fog.color)
  zenith.value.copy(view.zenith).lerp(view.underwater, haze)
  glow.value = 1 - SUN_FADE * haze
  view.haze = haze
}

/**
 * Lets the water material show its underside as a pale, see-through ceiling. Single pass: a flat surface faces the
 * camera from one side at a time, so three's two-pass draw for transparent double-sided materials would only double
 * the water's draw calls. The branch goes before fog is applied, so the ceiling fades into the haze like the rest.
 * @param {import('three').MeshBasicMaterial} material
 */
export const seeWaterFromBelow = (material) => {
  material.side = DoubleSide
  material.forceSinglePass = true
  material.onBeforeCompile = (shader) => {
    shader.fragmentShader = shader.fragmentShader.replace('#include <opaque_fragment>', UNDERSIDE)
  }
}
