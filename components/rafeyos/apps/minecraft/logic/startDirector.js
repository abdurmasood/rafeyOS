import { clamp, lerp } from './noise'
import { WORLD } from './terrain'

const CENTRE = WORLD.SIZE / 2
const ORBIT_RADIUS = 105
const ORBIT_HEIGHT = 90
const LOOK_AT_Y = 34
const ORBIT_PERIOD_SECONDS = 150
const FOG_LIFT_SECONDS = 1.8
const FOG_LIFT_REDUCED_SECONDS = 0.6
const REDUCED_ARRIVAL_SECONDS = 0.25

const easeOut = (t) => 1 - (1 - t) ** 3
const easeInOut = (t) => (t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2)
const angleDelta = (from, to) => Math.atan2(Math.sin(to - from), Math.cos(to - from))
const angleAround = (x, z) => Math.atan2(z - CENTRE, x - CENTRE)

/**
 * @typedef {{ x: number, y: number, z: number, yaw: number, pitch: number }} CameraPose
 * @typedef {{ camera?: CameraPose, fogLift?: number }} StartShot
 *   camera omitted means the engine renders the player's own eye view; fogLift is the
 *   eased 0..1 progress and is omitted once the lift has finished.
 */

const orbitPose = (angle) => {
  const x = CENTRE + ORBIT_RADIUS * Math.cos(angle)
  const z = CENTRE + ORBIT_RADIUS * Math.sin(angle)
  return {
    x,
    y: ORBIT_HEIGHT,
    z,
    yaw: Math.atan2(x - CENTRE, z - CENTRE),
    pitch: Math.atan2(LOOK_AT_Y - ORBIT_HEIGHT, ORBIT_RADIUS),
  }
}

const polarOf = (pose) => ({
  angle: angleAround(pose.x, pose.z),
  radius: Math.hypot(pose.x - CENTRE, pose.z - CENTRE),
  height: pose.y,
  yaw: pose.yaw,
  pitch: pose.pitch,
})

const glideDuration = (from, to) =>
  1.3 + (Math.abs(angleDelta(from.angle, to.angle)) / Math.PI) * 1.3 + (Math.abs(angleDelta(from.yaw, to.yaw)) / Math.PI) * 0.7

// The signed arcs are frozen at the start: re-deriving the shortest arc against a
// moving target would flip direction near a half turn and jump the pose by 2π·t.
const makeGlide = (fromPose, target) => {
  const from = polarOf(fromPose)
  return {
    from,
    target,
    arc: angleDelta(from.angle, target.angle),
    yawArc: angleDelta(from.yaw, target.yaw),
    duration: glideDuration(from, target),
    elapsed: 0,
  }
}

const blendGlide = (glide, liveTarget, t) => {
  const angle = glide.from.angle + (glide.arc + angleDelta(glide.target.angle, liveTarget.angle)) * t
  const radius = lerp(glide.from.radius, liveTarget.radius, t)
  return {
    x: CENTRE + radius * Math.cos(angle),
    y: lerp(glide.from.height, liveTarget.height, t),
    z: CENTRE + radius * Math.sin(angle),
    yaw: glide.from.yaw + (glide.yawArc + angleDelta(glide.target.yaw, liveTarget.yaw)) * t,
    pitch: lerp(glide.from.pitch, liveTarget.pitch, t),
  }
}

const orbitAngleOf = ({ reducedMotion, startAngle, clock }) =>
  reducedMotion ? startAngle : startAngle + (clock / ORBIT_PERIOD_SECONDS) * Math.PI * 2
const eyePose = (eye, yaw, pitch) => ({ x: eye.x, y: eye.y, z: eye.z, yaw, pitch })

const arrive = (director) => {
  director.state = 'player'
  director.glide = null
  const callback = director.onArrive
  director.onArrive = null
  callback?.()
}

// Always returns a pose, including on the landing frame, so the engine never shows the
// player's eye for a frame at the end of a glide to the orbit.
const stepGlide = (director, dt, eyePolar) => {
  director.glide.elapsed += dt
  const t = clamp(director.glide.elapsed / director.glide.duration, 0, 1)
  const toPlayer = director.state === 'toPlayer'
  const target = toPlayer ? eyePolar : polarOf(orbitPose(orbitAngleOf(director)))
  const pose = blendGlide(director.glide, target, easeInOut(t))
  if (t >= 1) {
    if (toPlayer) arrive(director)
    else {
      director.state = 'orbit'
      director.glide = null
    }
  }
  return pose
}

const cameraFor = (director, dt, eyePolar) => {
  if (director.state === 'orbit') return orbitPose(orbitAngleOf(director))
  if (director.state === 'player') return null
  if (director.reducedMotion) {
    director.arrivalWait += dt
    if (director.arrivalWait >= REDUCED_ARRIVAL_SECONDS) arrive(director)
    return null
  }
  return stepGlide(director, dt, eyePolar)
}

const shotFor = (camera, clock, fogSeconds) => {
  const shot = {}
  if (camera) shot.camera = camera
  if (clock < fogSeconds) shot.fogLift = easeOut(clock / fogSeconds)
  return camera || shot.fogLift !== undefined ? shot : null
}

/**
 * Drives the title-screen camera: a slow orbit over the continent, glides down to the
 * player's eye and back, and the fog lift that reveals the world. Pure: the engine feeds
 * it dt and the live eye each frame and applies the returned shot.
 * @param {{ reducedMotion?: boolean }} [options]
 */
export const createStartDirector = ({ reducedMotion = false } = {}) => {
  const fogSeconds = reducedMotion ? FOG_LIFT_REDUCED_SECONDS : FOG_LIFT_SECONDS
  const director = {
    reducedMotion,
    state: 'orbit',
    started: false,
    startAngle: 0,
    clock: 0,
    lastPose: null,
    lastEye: null,
    glide: null,
    arrivalWait: 0,
    onArrive: null,
  }

  const frame = ({ dt, eye, yaw, pitch }) => {
    if (!director.started) {
      director.started = true
      director.startAngle = angleAround(eye.x, eye.z)
    }
    director.clock += dt
    director.lastEye = eyePose(eye, yaw, pitch)
    const camera = cameraFor(director, dt, polarOf(director.lastEye))
    director.lastPose = camera ?? director.lastEye
    return shotFor(camera, director.clock, fogSeconds)
  }

  const toPlayer = (callback) => {
    if (director.state === 'toPlayer' || director.state === 'player') return
    director.onArrive = callback
    if (!director.started) return arrive(director)
    director.state = 'toPlayer'
    director.arrivalWait = 0
    if (!reducedMotion) director.glide = makeGlide(director.lastPose, polarOf(director.lastEye))
  }

  const toOrbit = () => {
    if (!director.started) return
    director.onArrive = null
    director.state = reducedMotion ? 'orbit' : 'toOrbit'
    if (!reducedMotion) director.glide = makeGlide(director.lastPose, polarOf(orbitPose(orbitAngleOf(director))))
  }

  return { frame, toPlayer, toOrbit, mode: () => director.state }
}
