// Fireflies: soft yellow-green points drifting low over grass around the camera, out only at night. Each keeps a home
// on the ground near the camera and loops around it; one too far away finds a new home.
import { AdditiveBlending, BufferAttribute, BufferGeometry, Points, ShaderMaterial } from 'three'
import { BLOCK } from '@/components/rafeyos/apps/minecraft/logic/blockTypes'

export const FIREFLIES = Object.freeze({ COUNT: 70, SPREAD: 56, ROAM: 34 })
const GRASSY = new Set([BLOCK.GRASS, BLOCK.MARSH_GRASS, BLOCK.DRY_GRASS])

const VERTEX = `attribute float seed; uniform float uTime; varying float vGlow;
  void main() {
    vec4 eyeSpace = modelViewMatrix * vec4(position, 1.0);
    gl_Position = projectionMatrix * eyeSpace;
    vGlow = 0.5 + 0.5 * sin(uTime * (1.5 + seed * 2.0) + seed * 40.0);
    gl_PointSize = 90.0 / max(-eyeSpace.z, 1.0);
  }`
const FRAGMENT = `uniform float uNight; varying float vGlow;
  void main() {
    vec2 p = gl_PointCoord - 0.5;
    float core = step(max(abs(p.x), abs(p.y)), 0.12);
    float halo = smoothstep(0.5, 0.0, length(p)) * 0.35;
    gl_FragColor = vec4(vec3(0.85, 1.0, 0.45) * (core + halo) * vGlow * uNight, 1.0);
  }`

/**
 * @param {(x: number, z: number) => import('./ground').Ground | null} ground
 * @param {{ value: number }} time - the shared clock, in seconds
 * @param {() => number} random - 0..1, injected so tests can pin the homes
 */
export const createFireflies = (ground, time, random = Math.random) => {
  const positions = new Float32Array(FIREFLIES.COUNT * 3)
  const seeds = Float32Array.from({ length: FIREFLIES.COUNT }, () => random())
  const geometry = new BufferGeometry()
  geometry.setAttribute('position', new BufferAttribute(positions, 3))
  geometry.setAttribute('seed', new BufferAttribute(seeds, 1))
  const material = new ShaderMaterial({
    transparent: true, depthWrite: false, blending: AdditiveBlending,
    uniforms: { uTime: time, uNight: { value: 0 } }, vertexShader: VERTEX, fragmentShader: FRAGMENT,
  })
  const points = new Points(geometry, material)
  points.frustumCulled = false
  points.visible = false
  /** @type {Array<{ x: number, y: number, z: number } | null>} */
  const homes = Array.from({ length: FIREFLIES.COUNT }, () => null)
  const findHome = (camera) => {
    for (let tries = 0; tries < 6; tries++) {
      const x = camera.x + (random() - 0.5) * FIREFLIES.SPREAD, z = camera.z + (random() - 0.5) * FIREFLIES.SPREAD
      const found = ground(Math.floor(x), Math.floor(z))
      if (found && !found.wet && GRASSY.has(found.block)) return { x, y: found.y + 1, z }
    }
    return null
  }
  return {
    points,
    /**
     * @param {{ x: number, z: number }} camera
     * @param {number} night - 0 by day to 1 at night
     * @param {number} roam - 1 to drift, 0 to hold still (reduced motion)
     */
    update: (camera, night, roam) => {
      material.uniforms.uNight.value = night
      points.visible = night > 0.02
      if (!points.visible) return
      const t = time.value * roam
      for (let i = 0; i < FIREFLIES.COUNT; i++) {
        const home = homes[i]
        if (!home || Math.hypot(home.x - camera.x, home.z - camera.z) > FIREFLIES.ROAM) homes[i] = findHome(camera)
        const at = homes[i]
        const s = seeds[i] * 50
        positions.set(at ? [
          at.x + Math.sin(t * 0.4 + s) * 1.6, at.y + 0.8 + Math.sin(t * 0.7 + s * 1.3) * 0.6, at.z + Math.cos(t * 0.33 + s * 0.7) * 1.6,
        ] : [0, -100, 0], i * 3)
      }
      geometry.attributes.position.needsUpdate = true
    },
    dispose: () => {
      geometry.dispose()
      material.dispose()
    },
  }
}
