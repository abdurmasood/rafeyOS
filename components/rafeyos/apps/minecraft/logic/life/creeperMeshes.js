// Drawing creepers: classic UV’d limbs on an original 64×32 skin (creeperSkin.js). Visual only — creepers.js decides.
// Fuse pulses scale and flashes instance colour toward white; smoke marks the boom.
import {
  BoxGeometry, Color, DataTexture, Float32BufferAttribute, InstancedMesh, Matrix4, MeshBasicMaterial,
  NearestFilter, Quaternion, RGBAFormat, SRGBColorSpace, Vector3,
} from 'three'
import { CREEPERS } from '@/components/rafeyos/apps/minecraft/logic/life/creepers'
import { CREEPER_UV, faceUv, paintCreeperSkin, SKIN } from '@/components/rafeyos/apps/minecraft/logic/life/creeperSkin'

const PX = 1 / 16
const AXIS = Object.freeze({ legA: 'x', legB: 'x' })
const AXES = Object.freeze({ x: new Vector3(1, 0, 0) })
const KEEP_LIGHT = 0.25
const WHITE = new Color(0xffffff)
const FLASH = new Color(1.35, 1.35, 1.35)
const SMOKE = Object.freeze({ MAX: 80, RATE: 2 })

/**
 * BoxGeometry with Minecraft entity UVs. Face order in Three: +x, -x, +y, -y, +z, -z.
 * @param {number} w @param {number} h @param {number} d - texel sizes
 * @param {number} u @param {number} v - texOffs
 */
export const skinnedBox = (w, h, d, u, v) => {
  const geo = new BoxGeometry(w * PX, h * PX, d * PX)
  // Minecraft unwrap → Three faces: left(+x), right(−x), top(+y), bottom(−y), front(+z), back(−z)
  const faces = [
    faceUv(u + d + w, v + d, d, h), // +x left
    faceUv(u, v + d, d, h), // −x right
    faceUv(u + d, v, w, d), // +y top
    faceUv(u + d + w, v, w, d), // −y bottom
    faceUv(u + d, v + d, w, h), // +z front
    faceUv(u + d + w + d, v + d, w, h), // −z back
  ]
  geo.setAttribute('uv', new Float32BufferAttribute(faces.flat(), 2))
  return geo
}

/** Limb defs: size baked into geo; at/pivot in blocks. Facing +z, feet at y 0. */
const LIMBS = Object.freeze([
  {
    name: 'head',
    at: [0, (6 + 12 + 4) * PX, 0],
    geo: () => skinnedBox(CREEPER_UV.HEAD.w, CREEPER_UV.HEAD.h, CREEPER_UV.HEAD.d, CREEPER_UV.HEAD.u, CREEPER_UV.HEAD.v),
  },
  {
    name: 'body',
    at: [0, (6 + 6) * PX, 0],
    geo: () => skinnedBox(CREEPER_UV.BODY.w, CREEPER_UV.BODY.h, CREEPER_UV.BODY.d, CREEPER_UV.BODY.u, CREEPER_UV.BODY.v),
  },
  {
    name: 'legFL', swing: 'legA', pivot: [-2 * PX, 6 * PX, 2 * PX],
    at: [-2 * PX, 3 * PX, 2 * PX],
    geo: () => skinnedBox(CREEPER_UV.LEG.w, CREEPER_UV.LEG.h, CREEPER_UV.LEG.d, CREEPER_UV.LEG.u, CREEPER_UV.LEG.v),
  },
  {
    name: 'legFR', swing: 'legB', pivot: [2 * PX, 6 * PX, 2 * PX],
    at: [2 * PX, 3 * PX, 2 * PX],
    geo: () => skinnedBox(CREEPER_UV.LEG.w, CREEPER_UV.LEG.h, CREEPER_UV.LEG.d, CREEPER_UV.LEG.u, CREEPER_UV.LEG.v),
  },
  {
    name: 'legBL', swing: 'legB', pivot: [-2 * PX, 6 * PX, -2 * PX],
    at: [-2 * PX, 3 * PX, -2 * PX],
    geo: () => skinnedBox(CREEPER_UV.LEG.w, CREEPER_UV.LEG.h, CREEPER_UV.LEG.d, CREEPER_UV.LEG.u, CREEPER_UV.LEG.v),
  },
  {
    name: 'legBR', swing: 'legA', pivot: [2 * PX, 6 * PX, -2 * PX],
    at: [2 * PX, 3 * PX, -2 * PX],
    geo: () => skinnedBox(CREEPER_UV.LEG.w, CREEPER_UV.LEG.h, CREEPER_UV.LEG.d, CREEPER_UV.LEG.u, CREEPER_UV.LEG.v),
  },
])

const anglesOf = (creeper) => {
  const swing = Math.sin(creeper.phase) * creeper.moving
  return { legA: creeper.onGround ? swing * 0.55 : -0.35, legB: creeper.onGround ? -swing * 0.55 : 0.35 }
}

export const createCreeperMeshes = (random = Math.random) => {
  const texture = new DataTexture(paintCreeperSkin(), SKIN.W, SKIN.H, RGBAFormat)
  texture.magFilter = NearestFilter
  texture.minFilter = NearestFilter
  texture.colorSpace = SRGBColorSpace
  texture.needsUpdate = true
  const material = new MeshBasicMaterial({ map: texture })
  const smokeMaterial = new MeshBasicMaterial({ color: new Color('#6a8f5a'), transparent: true, opacity: 0.5, depthWrite: false })
  const geometries = LIMBS.map((limb) => limb.geo())
  const bodies = geometries.map((geo) => {
    const mesh = new InstancedMesh(geo, material, CREEPERS.MAX)
    mesh.frustumCulled = false
    mesh.count = 0
    return mesh
  })
  const smokeGeo = new BoxGeometry(1, 1, 1)
  const smokeMesh = new InstancedMesh(smokeGeo, smokeMaterial, SMOKE.MAX)
  smokeMesh.frustumCulled = false
  smokeMesh.count = 0
  const tint = new Color()
  const smoke = []
  const body = new Matrix4(), step = new Matrix4(), turn = new Matrix4()
  const position = new Vector3(), scale = new Vector3(), rotation = new Quaternion()

  const flashColor = (fuse) => (fuse > 0 ? tint.copy(WHITE).lerp(FLASH, fuse * 0.85) : tint.setRGB(1, 1, 1))

  const puff = (creeper, burst) => {
    if (smoke.length >= SMOKE.MAX) smoke.shift()
    smoke.push({
      x: creeper.x + (random() - 0.5) * 0.5,
      y: creeper.y + (burst ? 0.4 + random() * 0.8 : 0.9 + random() * 0.4),
      z: creeper.z + (random() - 0.5) * 0.5,
      vx: (random() - 0.5) * (burst ? 2 : 0.2),
      vy: 0.5 + random() * (burst ? 2 : 0.4),
      vz: (random() - 0.5) * (burst ? 2 : 0.2),
      life: 0, last: burst ? 0.5 + random() * 0.3 : 0.7 + random() * 0.4, size: burst ? 0.2 + random() * 0.15 : 0.08 + random() * 0.06,
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

  return {
    meshes: [...bodies, smokeMesh],
    material,
    /**
     * @param {import('./creepers').Creeper[]} list
     * @param {number} dt
     * @param {Color} light
     */
    draw: (list, dt, light) => {
      material.color.copy(light).lerp(WHITE, KEEP_LIGHT)
      const turnByCache = list.map((c) => anglesOf(c))
      list.forEach((creeper, i) => {
        const flash = flashColor(creeper.fuse)
        const pulse = creeper.fuse > 0 ? 1 + Math.sin(creeper.fuse * Math.PI * 8) * 0.06 * creeper.fuse : 1
        const flinch = creeper.flinch > 0 ? 0.94 : 1
        const size = pulse * flinch
        LIMBS.forEach((limb, k) => {
          body.makeRotationY(creeper.yaw).premultiply(step.makeTranslation(creeper.x, creeper.y, creeper.z))
          body.multiply(step.makeScale(size, size, size))
          if (limb.swing) {
            const [px, py, pz] = limb.pivot
            turn.makeRotationAxis(AXES[AXIS[limb.swing]], turnByCache[i][limb.swing])
            body.multiply(step.makeTranslation(px, py, pz)).multiply(turn).multiply(step.makeTranslation(-px, -py, -pz))
          }
          body.multiply(step.compose(position.fromArray(limb.at), rotation.identity(), scale.set(1, 1, 1)))
          bodies[k].setMatrixAt(i, body)
          bodies[k].setColorAt(i, flash)
        })
        if (creeper.fuse > 0.15 && random() < dt * (SMOKE.RATE + creeper.fuse * 8)) puff(creeper, false)
        if (creeper.fuse >= 0.98) for (let n = 0; n < 8; n++) puff(creeper, true)
      })
      for (const mesh of bodies) {
        mesh.count = list.length
        mesh.instanceMatrix.needsUpdate = true
        if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true
      }
      drawSmoke(dt)
    },
    dispose: () => {
      for (const geo of geometries) geo.dispose()
      smokeGeo.dispose()
      texture.dispose()
      material.dispose()
      smokeMaterial.dispose()
    },
  }
}
