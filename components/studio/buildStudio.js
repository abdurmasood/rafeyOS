// Turns the loaded glb and plates into the live studio: materials on every mesh, the things the
// wind moves, the shadow passes and the dust. Plain three.js, so StudioScene stays small.
import { BufferAttribute, BufferGeometry, Points } from 'three'
import { createFigurePoser } from '@/lib/studio/figurePose'
import { PLANT_MOTION, TREE_MOTION } from '@/lib/studio/motion'
import { createFigureRig } from './figureRig'
import {
  createDustMaterial,
  createFigureMaterial,
  createPlantMaterial,
  createRoomMaterial,
  createSharedUniforms,
  createTreeMaterial,
  swayUniforms,
  treeUniforms,
} from './materials'
import { createShadowRig } from './shadowRig'

export const ROLES = Object.freeze({ ROOM: 'room', GROUND: 'ground', PLANT: 'plant', TREE: 'tree', FIGURE: 'figure' })
const FLOOR_MONSTERA = 'Monstera (floor)'
const TREE_HEIGHT = 1.5
// Where the beam crosses the room (three.js coords): from the window down to the rug
const DUST_BOX = Object.freeze({ boxMin: [-2.0, 0.02, -0.8], boxSize: [3.2, 2.4, 1.9] })
const MAX_DUST = 300
const DUST_POINT_PX = 1.6

const meshesByRole = (scene) => {
  const byRole = Object.fromEntries(Object.values(ROLES).map((role) => [role, []]))
  scene.updateMatrixWorld(true)
  scene.traverse((object) => {
    const role = object.userData.studio_role
    if (object.isMesh && byRole[role]) byRole[role].push(object)
  })
  return byRole
}

const layerFor = (manifest, name) => Object.values(manifest.plantLayers ?? {}).find((layer) => layer.plants.includes(name))

/** Deterministic pseudo-random seeds, so the dust looks the same on every visit. */
const dustGeometry = (count) => {
  const seeds = new Float32Array(count * 3)
  let state = 1234567
  for (let i = 0; i < seeds.length; i++) {
    state = (state * 1103515245 + 12345) % 2147483648
    seeds[i] = state / 2147483648
  }
  const geometry = new BufferGeometry()
  geometry.setAttribute('position', new BufferAttribute(new Float32Array(count * 3), 3))
  geometry.setAttribute('aSeed', new BufferAttribute(seeds, 3))
  return geometry
}

const setupPlants = ({ manifest, shared, plants, meshes, fallback }) =>
  meshes.map((mesh) => {
    const name = mesh.userData.studio_name
    const motion = PLANT_MOTION[name]
    const sway = swayUniforms(shared, { ...motion, height: mesh.userData.studio_height, phaseSpread: 0.35 })
    const layer = layerFor(manifest, name)
    mesh.material = layer && plants ? createPlantMaterial(shared, sway, { plants, layerRect: layer.rect, atlasRect: layer.atlasRect }) : fallback
    return { name, mesh, sway, place: motion.place }
  })

/** The phone's position (three.js), from the clock facts: where he glances to check the time. */
const phoneAt = (clock) => (clock?.matrix ? [clock.matrix[12], clock.matrix[13], clock.matrix[14]] : undefined)

/** He and the chair top: one rig and poser; each mesh is coloured from the layer holding its parts. */
const setupFigure = ({ manifest, shared, plants, meshes, fallback, seed }) => {
  if (!meshes.length) return null
  if (!manifest.figure || !plants) {
    for (const mesh of meshes) mesh.material = fallback // a manifest from before he moved: show the plate
    return null
  }
  const { bones, rests, mouse, keyPitch } = manifest.figure
  const rig = createFigureRig(bones)
  for (const mesh of meshes) {
    const layer = layerFor(manifest, mesh.userData.studio_name)
    mesh.material = layer
      ? createFigureMaterial(shared, { plants, layerRect: layer.rect, atlasRect: layer.atlasRect, bones: rig.matrices })
      : fallback
  }
  return { meshes, rig, poser: createFigurePoser({ bones, rests, mouse, keyPitch, seed, phone: phoneAt(manifest.clock) }) }
}

/**
 * @returns {{ shared, room, swaying: Array<{ sway, place }>, figure, shadows, dust, dispose }}
 */
export const buildStudio = ({ manifest, plateViewProj, scene, base, deltas, plants, hazeSteps, pixelRatio, seed }) => {
  const byRole = meshesByRole(scene)
  const shared = createSharedUniforms({ manifest, plateViewProj, base, deltas })
  const room = createRoomMaterial(shared, hazeSteps)
  for (const mesh of [...byRole.room, ...byRole.ground]) mesh.material = room
  for (const mesh of scene.children) mesh.frustumCulled = false
  const plantParts = setupPlants({ manifest, shared, plants, meshes: byRole.plant, fallback: room })
  const swaying = plantParts.map(({ sway, place }) => ({ sway, place }))

  const treeMesh = byRole.tree[0]
  const treeLayer = treeMesh ? layerFor(manifest, treeMesh.userData.studio_name) : undefined
  let tree = null
  if (treeLayer && plants) {
    const sway = swayUniforms(shared, { ...TREE_MOTION, height: TREE_HEIGHT })
    const layer = { plants, layerRect: treeLayer.rect, atlasRect: treeLayer.atlasRect }
    const uniforms = treeUniforms(shared, sway, TREE_MOTION, layer)
    treeMesh.material = createTreeMaterial(uniforms)
    tree = { mesh: treeMesh, uniforms }
    swaying.push({ sway: uniforms, place: 'tree' })
  } else if (treeMesh) {
    treeMesh.material = room // a manifest without the tree's layer: show the plate, as the plants do
  }
  const figure = setupFigure({ manifest, shared, plants, meshes: byRole.figure, fallback: room, seed })
  const monstera = manifest.deltas?.up ? plantParts.find((part) => part.name === FLOOR_MONSTERA) : null
  const shadows = createShadowRig({ manifest, shared, tree, monstera })

  const dustMaterial = createDustMaterial(shared, { ...DUST_BOX, pointSize: DUST_POINT_PX * pixelRatio })
  const dust = new Points(dustGeometry(MAX_DUST), dustMaterial)
  dust.frustumCulled = false
  dust.renderOrder = 1

  return {
    shared,
    room,
    swaying,
    figure,
    shadows,
    dust,
    dispose() {
      shadows.dispose()
      dust.geometry.dispose()
      dustMaterial.dispose()
      room.dispose()
      for (const { mesh } of plantParts) if (mesh.material !== room) mesh.material.dispose()
      if (treeMesh && treeMesh.material !== room) treeMesh.material.dispose()
      for (const mesh of figure?.meshes ?? []) if (mesh.material !== room) mesh.material.dispose()
    },
  }
}
