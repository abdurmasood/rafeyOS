// Drawing the shades: a dark four-legged body with a ragged mane, slit amber eyes that glow in the dark, and wisps of
// smoke rising off its back, thicker as it rises from the ground or burns away. Visual only: shades.js decides.
import { AdditiveBlending, BufferAttribute, BufferGeometry, Color, InstancedMesh, Matrix4, MeshBasicMaterial, Points, Quaternion, ShaderMaterial, Vector3 } from 'three'
import { SHADES, STATUS } from '@/components/rafeyos/apps/minecraft/logic/life/shades'
import { shadedBox } from '@/components/rafeyos/apps/minecraft/logic/life/shadedBox'

// Parts as in species.js: { size, at, colour, swing?, pivot? }, facing +z with the feet at y 0
const HEAD = [0, 0.98, 0.62]
const BODY = [
  { size: [0.62, 0.5, 1.15], at: [0, 0.9, -0.12], colour: '#211a2a' },
  { size: [0.74, 0.64, 0.52], at: [0, 1.02, 0.4], colour: '#2a2035' },
  { size: [0.46, 0.4, 0.52], at: [0, 0.88, 0.88], colour: '#2a2035', swing: 'head', pivot: HEAD },
  { size: [0.36, 0.11, 0.34], at: [0, 0.64, 0.94], colour: '#140f19', swing: 'jaw', pivot: [0, 0.7, 0.76] },
  { size: [0.3, 0.2, 0.22], at: [0, 0.8, 1.24], colour: '#221a2b', swing: 'head', pivot: HEAD },
  { size: [0.04, 0.07, 0.04], at: [-0.1, 0.675, 1.3], colour: '#d9d2c4', swing: 'head', pivot: HEAD },
  { size: [0.04, 0.07, 0.04], at: [0.1, 0.675, 1.3], colour: '#d9d2c4', swing: 'head', pivot: HEAD },
  { size: [0.08, 0.17, 0.08], at: [-0.16, 1.15, 0.74], colour: '#140f19', swing: 'head', pivot: HEAD },
  { size: [0.08, 0.17, 0.08], at: [0.16, 1.15, 0.74], colour: '#140f19', swing: 'head', pivot: HEAD },
  { size: [0.16, 0.66, 0.16], at: [-0.23, 0.33, 0.42], colour: '#1a1422', swing: 'legA', pivot: [-0.23, 0.66, 0.42] },
  { size: [0.16, 0.66, 0.16], at: [0.23, 0.33, 0.42], colour: '#1a1422', swing: 'legB', pivot: [0.23, 0.66, 0.42] },
  { size: [0.16, 0.66, 0.16], at: [-0.21, 0.33, -0.5], colour: '#1a1422', swing: 'legB', pivot: [-0.21, 0.66, -0.5] },
  { size: [0.16, 0.66, 0.16], at: [0.21, 0.33, -0.5], colour: '#1a1422', swing: 'legA', pivot: [0.21, 0.66, -0.5] },
  { size: [0.12, 0.12, 0.72], at: [0, 0.98, -0.98], colour: '#2a2035', swing: 'tail', pivot: [0, 1.0, -0.64] },
  { size: [0.8, 0.16, 0.34], at: [0, 1.38, 0.46], colour: '#352944' },
  { size: [0.12, 0.22, 0.12], at: [-0.2, 1.52, 0.5], colour: '#352944' },
  { size: [0.12, 0.26, 0.12], at: [0.16, 1.54, 0.4], colour: '#352944' },
  { size: [0.1, 0.2, 0.1], at: [0, 1.22, 0.02], colour: '#2f2440' },
  { size: [0.1, 0.16, 0.1], at: [0, 1.2, -0.4], colour: '#2f2440' },
]
const EYES = [
  { size: [0.12, 0.07, 0.03], at: [-0.13, 0.95, 1.145], swing: 'head', pivot: HEAD, colour: '#ffb347' },
  { size: [0.12, 0.07, 0.03], at: [0.13, 0.95, 1.145], swing: 'head', pivot: HEAD, colour: '#ffb347' },
  { size: [0.025, 0.07, 0.02], at: [-0.13, 0.95, 1.16], swing: 'head', pivot: HEAD, colour: '#2a1206' },
  { size: [0.025, 0.07, 0.02], at: [0.13, 0.95, 1.16], swing: 'head', pivot: HEAD, colour: '#2a1206' },
]
const AXIS = Object.freeze({ legA: 'x', legB: 'x', head: 'x', jaw: 'x', tail: 'y' })
const AXES = Object.freeze({ x: new Vector3(1, 0, 0), y: new Vector3(0, 1, 0) })
const SMOKE = Object.freeze({ MAX: 220, RATE: 3, RATE_MOVING: 6, BURST: 30 })
const SIZE = 1.1
// Shades are dark but must still read at night: they take only part of the darkening the blocks do
const KEEP_LIGHT = 0.35
const WHITE = new Color(0xffffff)

const GLOW_VERTEX = 'void main() { vec4 eyeSpace = modelViewMatrix * vec4(position, 1.0); gl_Position = projectionMatrix * eyeSpace; gl_PointSize = clamp(150.0 / max(-eyeSpace.z, 1.0), 3.0, 60.0); }'
const GLOW_FRAGMENT = 'void main() { float d = length(gl_PointCoord - 0.5); gl_FragColor = vec4(vec3(1.0, 0.62, 0.2) * smoothstep(0.5, 0.0, d) * 0.55, 1.0); }'

/** How each swinging part turns for this shade right now, in radians. */
const anglesOf = (shade) => {
  const swing = Math.sin(shade.phase) * shade.moving
  return {
    legA: shade.onGround ? swing * 0.75 : -0.6,
    legB: shade.onGround ? -swing * 0.75 : 0.6,
    head: shade.head,
    jaw: shade.jaw * 0.6 + (shade.mode === 'stalk' ? 0.12 + Math.sin(shade.phase * 0.7) * 0.05 : 0),
    tail: Math.sin(shade.phase * 0.5 + shade.seed) * 0.35,
  }
}
/** Nose down while prowling, up at a player out of reach, level otherwise. */
const headFor = (shade) => {
  if (shade.status === STATUS.PROWL) return 0.35 + Math.sin(shade.phase * 0.5) * 0.12
  return shade.status === STATUS.BELOW || shade.status === STATUS.SHORE ? -0.35 : 0.08
}

export const createShadeMeshes = (random = Math.random) => {
  const box = shadedBox()
  const material = new MeshBasicMaterial({ vertexColors: true })
  const eyeMaterial = new MeshBasicMaterial({ color: 0xffffff })
  const smokeMaterial = new MeshBasicMaterial({ color: new Color('#3b2f4c'), transparent: true, opacity: 0.55, depthWrite: false })
  const instanced = (mat, count) => {
    const mesh = new InstancedMesh(box, mat, count)
    // Instances move every frame; a bounding sphere three worked out once would cull them wrongly
    mesh.frustumCulled = false
    mesh.count = 0
    return mesh
  }
  const bodies = BODY.map(() => instanced(material, SHADES.MAX))
  const eyes = EYES.map(() => instanced(eyeMaterial, SHADES.MAX))
  const smokeMesh = instanced(smokeMaterial, SMOKE.MAX)
  const tint = new Color()
  BODY.forEach((part, k) => { for (let i = 0; i < SHADES.MAX; i++) bodies[k].setColorAt(i, tint.set(part.colour)) })
  EYES.forEach((part, k) => { for (let i = 0; i < SHADES.MAX; i++) eyes[k].setColorAt(i, tint.set(part.colour)) })
  const glowPositions = new Float32Array(SHADES.MAX * 2 * 3)
  const glowGeometry = new BufferGeometry()
  glowGeometry.setAttribute('position', new BufferAttribute(glowPositions, 3))
  const glow = new Points(glowGeometry, new ShaderMaterial({
    transparent: true, depthWrite: false, blending: AdditiveBlending, vertexShader: GLOW_VERTEX, fragmentShader: GLOW_FRAGMENT,
  }))
  glow.frustumCulled = false
  const smoke = []
  const body = new Matrix4(), step = new Matrix4(), turn = new Matrix4()
  const position = new Vector3(), scale = new Vector3(), rotation = new Quaternion()

  const pose = ({ mesh, index }, shade, part, turnBy) => {
    const size = SIZE * (1 - shade.fade) * (shade.flinch > 0 ? 0.94 : 1)
    body.makeRotationY(shade.yaw).premultiply(step.makeTranslation(shade.x, shade.y + (shade.rise - 1) * 1.4, shade.z))
    body.multiply(step.makeScale(size, size, size))
    if (part.swing) {
      const [px, py, pz] = part.pivot
      turn.makeRotationAxis(AXES[AXIS[part.swing]], turnBy[part.swing])
      body.multiply(step.makeTranslation(px, py, pz)).multiply(turn).multiply(step.makeTranslation(-px, -py, -pz))
    }
    body.multiply(step.compose(position.fromArray(part.at), rotation.identity(), scale.fromArray(part.size)))
    mesh.setMatrixAt(index, body)
  }
  const puff = (shade, burst) => {
    if (smoke.length >= SMOKE.MAX) smoke.shift()
    smoke.push({
      x: shade.x + (random() - 0.5) * 0.6, y: shade.y + (burst ? random() * 0.4 : 1.05 + random() * 0.25), z: shade.z + (random() - 0.5) * 0.9,
      vx: (random() - 0.5) * 0.3, vy: 0.45 + random() * 0.4, vz: (random() - 0.5) * 0.3, life: 0, last: 0.9 + random() * 0.6, size: 0.1 + random() * 0.1,
    })
  }
  const drawSmoke = (dt) => {
    for (let i = smoke.length - 1; i >= 0; i--) {
      const wisp = smoke[i]
      wisp.life += dt
      if (wisp.life >= wisp.last) smoke.splice(i, 1)
      else Object.assign(wisp, { x: wisp.x + wisp.vx * dt, y: wisp.y + wisp.vy * dt, z: wisp.z + wisp.vz * dt })
    }
    smoke.forEach((wisp, i) => {
      const k = wisp.size * (1 - wisp.life / wisp.last)
      smokeMesh.setMatrixAt(i, body.compose(position.set(wisp.x, wisp.y, wisp.z), rotation.identity(), scale.set(k, k, k)))
    })
    smokeMesh.count = smoke.length
    smokeMesh.instanceMatrix.needsUpdate = true
  }
  const drawShade = (shade, i, dt) => {
    shade.head += (headFor(shade) - shade.head) * Math.min(1, dt * 5)
    const turnBy = anglesOf(shade)
    BODY.forEach((part, k) => pose({ mesh: bodies[k], index: i }, shade, part, turnBy))
    EYES.forEach((part, k) => {
      pose({ mesh: eyes[k], index: i }, shade, part, turnBy)
      if (k < 2) glowPositions.set(position.setFromMatrixPosition(body).toArray(), (i * 2 + k) * 3)
    })
    const rising = shade.rise < 1 || shade.fade > 0
    const rate = rising ? SMOKE.BURST : SMOKE.RATE + shade.moving * SMOKE.RATE_MOVING
    if (random() < dt * rate) puff(shade, rising)
  }
  return {
    meshes: [...bodies, ...eyes, smokeMesh],
    glow,
    /**
     * @param {import('./shades').Shade[]} shades
     * @param {number} dt
     * @param {Color} light - on the blocks; the body takes some of it, the eyes none
     */
    draw: (shades, dt, light) => {
      material.color.copy(light).lerp(WHITE, KEEP_LIGHT)
      shades.forEach((shade, i) => drawShade(shade, i, dt))
      for (const mesh of [...bodies, ...eyes]) {
        mesh.count = shades.length
        mesh.instanceMatrix.needsUpdate = true
      }
      glowGeometry.setDrawRange(0, shades.length * 2)
      glowGeometry.attributes.position.needsUpdate = true
      drawSmoke(dt)
    },
    dispose: () => {
      box.dispose()
      for (const mat of [material, eyeMaterial, smokeMaterial, glow.material]) mat.dispose()
      glowGeometry.dispose()
    },
  }
}
