// The world's own life, stepped by the engine every frame: the time of day, written into the view before the camera
// and fog are set from it.
import { Color } from 'three'
import { createSkyClock, createSkyState, skyAt } from '@/components/rafeyos/apps/minecraft/logic/life/skyClock'

const WHITE = new Color(0xffffff)
// Water keeps a little of its own brightness at night, so the sea still reads under the moon
const WATER_GLOW = 0.15

/** Relative luminance of a linear colour: how much light there is, for the underwater wash. @param {Color} colour */
const luminance = ({ r, g, b }) => 0.2126 * r + 0.7152 * g + 0.0722 * b

/**
 * @param {{ view: object, startTime?: number }} options - `view`: the engine's view (scene, sky, materials and the
 *   colours setAtmosphereAt reads); `startTime`: the time of day to start at, a fraction from midnight
 */
export const createLife = ({ view, startTime }) => {
  const clock = createSkyClock(startTime)
  const sky = createSkyState()
  let elapsed = 0
  const uniforms = view.sky.material.uniforms
  const applySky = () => {
    view.horizon.copy(sky.horizon)
    view.zenith.copy(sky.zenith)
    view.underwater.copy(sky.underwater)
    view.glow = sky.glow
    view.daylight = luminance(sky.light)
    uniforms.sun.value.copy(sky.sun)
    uniforms.moon.value.copy(sky.moon)
    uniforms.night.value = sky.night
    uniforms.time.value = elapsed
    // The blocks are unlit, so their material's colour is the light falling on them
    view.materials.solid.color.copy(sky.light)
    view.materials.water.color.copy(sky.light).lerp(WHITE, WATER_GLOW)
  }
  return {
    /** Before the camera, fog and sky are set for the frame. @param {number} dt */
    beforeView: (dt) => {
      elapsed += dt
      skyAt(clock.advance(dt), sky)
      applySky()
    },
    time: () => clock.time(),
    sky: () => sky,
    dispose: () => {},
  }
}
