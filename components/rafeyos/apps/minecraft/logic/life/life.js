// The world's own life, stepped by the engine every frame. Before the camera is set: the time of day, written into
// the view for the fog and sky, the light on the blocks, the wind, the tufts laid out around the player, the animals
// living round them, and after dark the shades hunting them. After it (and after any director shot): the clouds and
// fireflies around the camera, and the walking bob.
import { Color, Group } from 'three'
import { createSkyClock, createSkyState, skyAt } from '@/components/rafeyos/apps/minecraft/logic/life/skyClock'
import { createGround } from '@/components/rafeyos/apps/minecraft/logic/life/ground'
import { driftWater, swayLeaves } from '@/components/rafeyos/apps/minecraft/logic/life/windShaders'
import { createClouds } from '@/components/rafeyos/apps/minecraft/logic/life/clouds'
import { createTufts } from '@/components/rafeyos/apps/minecraft/logic/life/tufts'
import { createFireflies } from '@/components/rafeyos/apps/minecraft/logic/life/fireflies'
import { createHerds } from '@/components/rafeyos/apps/minecraft/logic/life/herds'
import { createCreatureMeshes } from '@/components/rafeyos/apps/minecraft/logic/life/creatureMeshes'
import { createShades } from '@/components/rafeyos/apps/minecraft/logic/life/shades'
import { createShadeMeshes } from '@/components/rafeyos/apps/minecraft/logic/life/shadeMeshes'
import { zoneAt } from '@/components/rafeyos/apps/minecraft/logic/mainland'

const WHITE = new Color(0xffffff)
// Water keeps a little of its own brightness at night, so the sea still reads under the moon
const WATER_GLOW = 0.15
// The walking bob: how far the eyes rise and sway at walking speed
const BOB = Object.freeze({ RISE: 0.045, SWAY: 0.03, RATE: 2.1, WALK: 4.3 })

/** Relative luminance of a linear colour: how much light there is, for the underwater wash. @param {Color} colour */
const luminance = ({ r, g, b }) => 0.2126 * r + 0.7152 * g + 0.0722 * b

// How far a click can reach a shade when it isn't aimed at a block; a block in the way stops it there
const HIT_REACH = 4.5

/**
 * How far along `look` from `eye` the ray first enters block `target` (the slab test on its unit box).
 * @param {{ x: number, y: number, z: number }} eye
 * @param {{ x: number, y: number, z: number }} look
 * @param {{ x: number, y: number, z: number }} target
 */
const entryDistance = (eye, look, target) => {
  let entry = 0
  for (const axis of ['x', 'y', 'z']) {
    if (look[axis] === 0) continue
    const near = (look[axis] > 0 ? target[axis] : target[axis] + 1) - eye[axis]
    entry = Math.max(entry, near / look[axis])
  }
  return entry
}

/** Gusting wind: never still, never the same twice in a row. @param {number} t */
const windAt = (t) => 0.8 + 0.45 * Math.sin(t * 0.21) + 0.2 * Math.sin(t * 0.77)

/**
 * @param {{
 *   view: object, world: object, startTime?: number, reducedMotion?: boolean,
 *   onBite?: (shade: import('./shades').Shade) => void,
 * }} options - `view`: the engine's view (scene, sky, materials, camera and the colours setAtmosphereAt reads);
 *   `startTime`: the time of day to start at, a fraction from midnight; `reducedMotion`: hold the wind, water, clouds
 *   and fireflies still, and drop the bob; `onBite`: a shade has bitten the player
 */
export const createLife = ({ view, world, startTime, reducedMotion = false, onBite = () => {} }) => {
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
  const shades = createShades({ world, ground })
  const shadeMeshes = createShadeMeshes()
  group.add(clouds.mesh, ...tufts.meshes, flies.points, ...creatures.meshes, ...shadeMeshes.meshes, shadeMeshes.glow)
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
    /**
     * @param {number} dt
     * @param {{ player: object, playing: boolean, eye: { x: number, y: number, z: number }, swimming: boolean }} frame
     */
    beforeView: (dt, { player, playing, eye, swimming }) => {
      elapsed += dt
      uniforms.time.value += dt * motion
      uniforms.wind.value = windAt(elapsed) * motion
      skyAt(clock.advance(dt), sky)
      uniforms.sun.value = sky.glow
      applySky()
      tufts.update(player.pos)
      stepAnimals(dt, player)
      shades.update(dt, { player, eye, night: sky.night, playing, swimming, time: elapsed, onBite })
      shadeMeshes.draw(shades.shades, dt, sky.light)
    },
    /**
     * A left click: hits the shade it points at, if one is nearer than the block it's aimed at. True if it did, so the
     * block behind is left alone.
     * @param {{ eye: object, look: object, target: { x: number, y: number, z: number } | null }} aim
     */
    hitShade: ({ eye, look, target }) => shades.hit(eye, look, target ? Math.min(HIT_REACH, entryDistance(eye, look, target)) : HIT_REACH),
    respawned: () => shades.respawned(),
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
    shades: () => shades,
    dispose: () => {
      group.removeFromParent()
      clouds.dispose()
      tufts.dispose()
      flies.dispose()
      creatures.dispose()
      shadeMeshes.dispose()
    },
  }
}
