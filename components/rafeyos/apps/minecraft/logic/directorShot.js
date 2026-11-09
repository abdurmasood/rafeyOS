// What the engine does with the start director (startDirector.js): lays its shot over the player's view each frame, and
// hands it the glide in when Play is pressed. The engine runs without a director too, playing at once.
import { lerp } from './noise'

// The fog starts this close, so the world is hidden until the director lifts it
const FOG_LIFT_FROM = 2

export const IDLE_DIRECTOR = Object.freeze({ frame: () => null, toPlayer: (onArrive) => onArrive(), toOrbit() {} })

/**
 * Lets the director's shot override what updateView just set: a camera pose with the fog where it is, and fog pulled
 * in to `fogLift` (0..1). Runs after updateView, which rewrites the fog and camera every frame.
 * @param {{ clear: { near: number, far: number }, setAt: (eye: { x: number, y: number, z: number }) => void }} fog -
 *   `clear`: the fog out of water, which the lift opens up to; `setAt`: sets the fog for a camera at `eye`
 */
export const applyShot = (view, shot, fog) => {
  const { camera, scene, sky, outline } = view
  if (shot.camera) {
    const { x, y, z, yaw, pitch } = shot.camera
    camera.position.set(x, y, z)
    camera.rotation.set(pitch, yaw, 0)
    camera.updateMatrixWorld()
    sky.position.copy(camera.position)
    // updateView aimed and fogged it from the player's eyes, which can be under water far below the shot
    outline.visible = false
    fog.setAt(camera.position)
  }
  if (shot.fogLift !== undefined) {
    scene.fog.far = lerp(FOG_LIFT_FROM, fog.clear.far, shot.fogLift)
    scene.fog.near = (scene.fog.far * fog.clear.near) / fog.clear.far
  }
}

/** Takes the mouse now, since this runs inside the click, but holds input back until the glide to the player lands. */
export const startPlaying = ({ input, director }, onArrive) => {
  // Muted first: in drag mode capture() engages synchronously
  input.setMuted(true)
  input.capture()
  director.toPlayer(() => {
    input.setMuted(false)
    onArrive()
  })
}
