// Grass tufts, flowers, reeds and dry shrubs: two crossed cut-out quads each, on the ground around the player, their
// tops bending in the wind. Not blocks, so the world and its save stay as they are; laid out from a fixed hash per
// column, so the same tuft is always in the same place, and laid out again as the player walks or the ground changes.
import { DataTexture, DoubleSide, InstancedMesh, MeshBasicMaterial, NearestFilter, Object3D, PlaneGeometry, RGBAFormat, SRGBColorSpace } from 'three'
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js'
import { BLOCK } from '@/components/rafeyos/apps/minecraft/logic/blockTypes'
import { hash01 } from '@/components/rafeyos/apps/minecraft/logic/random'
import { SPRITE_COUNT, SPRITE_SIZE, TUFT, paintTuftSprites } from '@/components/rafeyos/apps/minecraft/logic/life/tuftSprites'
import { extendCompile } from '@/components/rafeyos/apps/minecraft/logic/life/windShaders'

export const TUFTS = Object.freeze({ RADIUS: 46, RELAYOUT_AFTER: 6, PER_SPRITE: 2400 })
const FLOWERS = Object.freeze([TUFT.RED, TUFT.YELLOW, TUFT.BLUE, TUFT.WHITE])
const SEED = 61

const TUFT_SWAY = `#include <begin_vertex>
  {
    vec3 at = vec3(instanceMatrix[3][0], instanceMatrix[3][1], instanceMatrix[3][2]);
    float phase = uTime * 2.1 + at.x * 0.37 + at.z * 0.29;
    transformed.x += uv.y * uWind * (sin(phase) * 0.09 + sin(phase * 2.3) * 0.03);
    transformed.z += uv.y * uWind * cos(phase * 0.9) * 0.06;
  }`

/**
 * Which sprite grows on this column, or -1 for none: grass and flowers on grass, reeds in the marsh, dry shrubs on dry
 * grass and now and then on sand.
 * @param {number} block - the ground block
 * @param {number} x
 * @param {number} z
 */
export const tuftFor = (block, x, z) => {
  const chance = hash01(SEED, x, 0, z), kind = hash01(SEED + 1, x, 1, z)
  if (block === BLOCK.GRASS) {
    if (chance > 0.34) return -1
    if (kind < 0.55) return TUFT.GRASS
    if (kind < 0.75) return TUFT.TALL
    return FLOWERS[Math.floor(hash01(SEED + 2, x, 2, z) * FLOWERS.length)]
  }
  if (block === BLOCK.MARSH_GRASS) return chance < 0.3 ? (kind < 0.6 ? TUFT.REED : TUFT.GRASS) : -1
  if (block === BLOCK.DRY_GRASS) return chance < 0.25 ? TUFT.DRY : -1
  if (block === BLOCK.SAND || block === BLOCK.RED_SAND) return chance < 0.025 ? TUFT.DRY : -1
  return -1
}

/** Two unit quads crossed at right angles, standing on y 0, showing sprite `s` of the sheet. @param {number} s */
const crossedQuads = (s) => {
  const quad = new PlaneGeometry(1, 1).translate(0, 0.5, 0)
  const geometry = mergeGeometries([quad.clone().rotateY(Math.PI / 4), quad.clone().rotateY(-Math.PI / 4)])
  quad.dispose()
  const uv = geometry.attributes.uv
  for (let i = 0; i < uv.count; i++) uv.setX(i, (s + uv.getX(i)) / SPRITE_COUNT)
  return geometry
}

const createSpriteTexture = () => {
  const texture = new DataTexture(paintTuftSprites(), SPRITE_COUNT * SPRITE_SIZE, SPRITE_SIZE, RGBAFormat)
  texture.magFilter = NearestFilter
  texture.minFilter = NearestFilter
  texture.colorSpace = SRGBColorSpace
  texture.needsUpdate = true
  return texture
}

/**
 * @param {(x: number, z: number) => import('./ground').Ground | null} ground
 * @param {{ get: (x: number, y: number, z: number) => number }} world
 * @param {{ time: { value: number }, wind: { value: number } }} uniforms
 */
export const createTufts = (ground, world, { time, wind }) => {
  const texture = createSpriteTexture()
  const material = new MeshBasicMaterial({ map: texture, alphaTest: 0.5, side: DoubleSide })
  extendCompile(material, 'mc-tufts', (shader) => {
    shader.uniforms.uTime = time
    shader.uniforms.uWind = wind
    shader.vertexShader = `uniform float uTime;\nuniform float uWind;\n${shader.vertexShader.replace('#include <begin_vertex>', TUFT_SWAY)}`
  })
  const meshes = Array.from({ length: SPRITE_COUNT }, (_, s) => {
    const mesh = new InstancedMesh(crossedQuads(s), material, TUFTS.PER_SPRITE)
    mesh.frustumCulled = false
    mesh.count = 0
    return mesh
  })
  const holder = new Object3D()
  let laidOutAt = null
  const place = (counts, x, z) => {
    const found = ground(x, z)
    if (!found || found.wet || world.get(x, found.y + 1, z) !== BLOCK.AIR) return
    const s = tuftFor(found.block, x, z)
    if (s < 0 || counts[s] >= TUFTS.PER_SPRITE) return
    const tall = s === TUFT.TALL ? 1.25 : s === TUFT.REED ? 1.35 : 0.85
    const scale = tall * (0.8 + hash01(SEED + 3, x, 3, z) * 0.35)
    holder.position.set(x + 0.2 + hash01(SEED + 4, x, 4, z) * 0.6, found.y + 1, z + 0.2 + hash01(SEED + 5, x, 5, z) * 0.6)
    holder.rotation.set(0, hash01(SEED + 6, x, 6, z) * Math.PI, 0)
    holder.scale.setScalar(scale)
    holder.updateMatrix()
    meshes[s].setMatrixAt(counts[s]++, holder.matrix)
  }
  /** @param {{ x: number, z: number }} centre */
  const layOut = (centre) => {
    laidOutAt = { x: centre.x, z: centre.z }
    const counts = meshes.map(() => 0)
    const cx = Math.floor(centre.x), cz = Math.floor(centre.z), r = TUFTS.RADIUS
    for (let x = cx - r; x <= cx + r; x++) {
      for (let z = cz - r; z <= cz + r; z++) if ((x - cx) ** 2 + (z - cz) ** 2 <= r * r) place(counts, x, z)
    }
    meshes.forEach((mesh, s) => {
      mesh.count = counts[s]
      mesh.instanceMatrix.needsUpdate = true
    })
  }
  return {
    meshes,
    material,
    /** @param {{ x: number, z: number }} player */
    update: (player) => {
      if (laidOutAt && Math.hypot(player.x - laidOutAt.x, player.z - laidOutAt.z) < TUFTS.RELAYOUT_AFTER) return
      layOut(player)
    },
    /** A block changed at (x, z): lay out again next update if that's among the tufts. @param {number} x @param {number} z */
    blockChanged: (x, z) => {
      if (laidOutAt && Math.hypot(x - laidOutAt.x, z - laidOutAt.z) <= TUFTS.RADIUS + 1) laidOutAt = null
    },
    dispose: () => {
      meshes.forEach((mesh) => mesh.geometry.dispose())
      material.dispose()
      texture.dispose()
    },
  }
}
