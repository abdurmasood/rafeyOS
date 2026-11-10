// The world's own life, stepped by the engine every frame. Before the camera is set: the time of day, written into
// the view for the fog and sky, the light on the blocks, the wind, the tufts laid out around the player, and the
// animals living round them. After it (and after any director shot): the clouds and fireflies around the camera, and
// the walking bob.
import { Color, Group } from 'three'
import { createSkyClock, createSkyState, skyAt } from '@/components/rafeyos/apps/minecraft/logic/life/skyClock'
import { createGround } from '@/components/rafeyos/apps/minecraft/logic/life/ground'
import { driftWater, swayLeaves } from '@/components/rafeyos/apps/minecraft/logic/life/windShaders'
import { createClouds } from '@/components/rafeyos/apps/minecraft/logic/life/clouds'
import { createTufts } from '@/components/rafeyos/apps/minecraft/logic/life/tufts'
import { createFireflies } from '@/components/rafeyos/apps/minecraft/logic/life/fireflies'
import { createHerds } from '@/components/rafeyos/apps/minecraft/logic/life/herds'
import { createCreatureMeshes } from '@/components/rafeyos/apps/minecraft/logic/life/creatureMeshes'
import { zoneAt } from '@/components/rafeyos/apps/minecraft/logic/mainland'

const WHITE = new Color(0xffffff)
// Water keeps a little of its own brightness at night, so the sea still reads under the moon
const WATER_GLOW = 0.15
// The walking bob: how far the eyes rise and sway at walking speed
const BOB = Object.freeze({ RISE: 0.045, SWAY: 0.03, RATE: 2.1, WALK: 4.3 })

/** Relative luminance of a linear colour: how much light there is, for the underwater wash. @param {Color} colour */
const luminance = ({ r, g, b }) => 0.2126 * r + 0.7152 * g + 0.0722 * b

/** Gusting wind: never still, never the same twice in a row. @param {number} t */
const windAt = (t) => 0.8 + 0.45 * Math.sin(t * 0.21) + 0.2 * Math.sin(t * 0.77)

/**
 * @param {{ view: object, world: object, startTime?: number, reducedMotion?: boolean }} options - `view`: the engine's
 *   view (scene, sky, materials, camera and the colours setAtmosphereAt reads); `startTime`: the time of day to start
 *   at, a fraction from midnight; `reducedMotion`: hold the wind, water, clouds and fireflies still, and drop the bob
 */
export const createLife = ({ view, world, startTime, reducedMotion = false }) => {
  const motion = reducedMotion ? 0 : 1
  const clock = createSkyClock(startTime)
  const sky = createSkyState()
  const uniforms = { time: { value: 0 }, wind: { value: 0 }, sun: { value: 1 } }
  const ground = createGround(world)
  const group = new Group()
  group.name = 'life'
  const clouds = createClouds()
  const tufts = createTufts(ground, world, uniforms)
  const flies = createFireflies(ground, uniforms.time)
  const herds = createHerds({ world, ground, zoneAt })
  const creatures = createCreatureMeshes()
  group.add(clouds.mesh, ...tufts.meshes, flies.points, ...creatures.meshes)
  view.scene.add(group)
  swayLeaves(view.materials.solid, uniforms)
  driftWater(view.materials.water, uniforms)
  let elapsed = 0
  let bob = 0
  let populated = false
  const skyUniforms = view.sky.material.uniforms

  const applySky = () => {
    view.horizon.copy(sky.horizon)
    view.zenith.copy(sky.zenith)
    view.underwater.copy(sky.underwater)
    view.glow = sky.glow
    view.daylight = luminance(sky.light)
    skyUniforms.sun.value.copy(sky.sun)
    skyUniforms.moon.value.copy(sky.moon)
    skyUniforms.night.value = sky.night
    skyUniforms.time.value = elapsed
    // The blocks are unlit, so their material's colour is the light falling on them; tufts stand in the same light
    view.materials.solid.color.copy(sky.light)
    view.materials.water.color.copy(sky.light).lerp(WHITE, WATER_GLOW)
    tufts.material.color.copy(sky.light)
    creatures.material.color.copy(sky.light)
    clouds.tint(sky)
  }
  const walkBob = (dt, player) => {
    const speed = Math.hypot(player.vel.x, player.vel.z)
    if (!player.onGround || speed < 0.5) return
    bob += dt * speed * BOB.RATE
    const amount = Math.min(1, speed / BOB.WALK)
    view.camera.position.y += Math.sin(bob * 2) * BOB.RISE * amount
    view.camera.position.x += Math.cos(bob) * BOB.SWAY * amount * Math.cos(player.yaw)
    view.camera.position.z -= Math.cos(bob) * BOB.SWAY * amount * Math.sin(player.yaw)
    view.camera.updateMatrixWorld()
  }
  const stepAnimals = (dt, player) => {
    if (!populated) {
      herds.populate(player.pos)
      populated = true
    }
    herds.update(dt, { x: player.pos.x, z: player.pos.z, speed: Math.hypot(player.vel.x, player.vel.z) })
    creatures.draw(herds.animals, herds.gulls, sky.glow)
  }
  return {
    /** @param {number} dt @param {{ pos: { x: number, z: number }, vel: { x: number, z: number } }} player */
    beforeView: (dt, player) => {
      elapsed += dt
      uniforms.time.value += dt * motion
      uniforms.wind.value = windAt(elapsed) * motion
      skyAt(clock.advance(dt), sky)
      uniforms.sun.value = sky.glow
      applySky()
      tufts.update(player.pos)
      stepAnimals(dt, player)
    },
    /**
     * @param {number} dt
     * @param {{ shot: object | null, player: object, playing: boolean }} frame - `shot`: the director's, if it has the
     *   camera
     */
    afterView: (dt, { shot, player, playing }) => {
      const camera = view.camera.position
      clouds.update(dt * motion, camera)
      flies.update(camera, sky.night, motion)
      if (!shot?.camera && playing && motion) walkBob(dt, player)
    },
    /** @param {number} x @param {number} z */
    blockChanged: (x, z) => {
      ground.forget(x, z)
      tufts.blockChanged(x, z)
    },
    time: () => clock.time(),
    herds: () => herds,
    dispose: () => {
      group.removeFromParent()
      clouds.dispose()
      tufts.dispose()
      flies.dispose()
      creatures.dispose()
    },
  }
}
