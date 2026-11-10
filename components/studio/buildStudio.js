// Turns the loaded glb and plates into the live studio: materials on every mesh, the things the
// wind moves, the shadow passes and the dust. Plain three.js, so StudioScene stays small.
import {
  BufferAttribute,
  BufferGeometry,
  CanvasTexture,
  CircleGeometry,
  Color,
  Group,
  LinearSRGBColorSpace,
  Mesh,
  MeshBasicMaterial,
  Points,
  SphereGeometry,
  TorusGeometry,
} from 'three'
import { createFigurePoser, createMouseProp, mouseReachOf } from '@/lib/studio/figurePose'
import { PLANT_MOTION, TREE_MOTION } from '@/lib/studio/motion'
import { createFigureRig } from './figureRig'
import {
  createDustMaterial,
  createFigureMaterial,
  createLiveLight,
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

// A pair of headphones on his head, in place of the pair round his neck while he makes a beat. Flat dark
// navy: they're a few pixels at page size. Sizes are from his skull (manifest figure.headphones).
const HEADBAND = Object.freeze({ drop: 0.03, outside: 0.03, tube: 0.012, tall: 1.3, cup: 0.035, cupFlat: 0.5 })
const HEADPHONES_DISPLAY = Object.freeze([0.07, 0.08, 0.13]) // display-space, near the render's neck pair

const headphonesOn = ({ centre, radii }) => {
  const material = new MeshBasicMaterial({ color: new Color().setRGB(...HEADPHONES_DISPLAY, LinearSRGBColorSpace) })
  const across = radii[0] + HEADBAND.outside
  const band = new Mesh(new TorusGeometry(across, HEADBAND.tube, 8, 32, Math.PI), material)
  band.scale.set(1, HEADBAND.tall, 1)
  const group = new Group()
  group.add(band)
  for (const side of [-1, 1]) {
    const cup = new Mesh(new SphereGeometry(HEADBAND.cup, 16, 12), material)
    cup.scale.set(HEADBAND.cupFlat, 1, 1)
    cup.position.set(side * across, 0, 0)
    group.add(cup)
  }
  group.position.set(centre[0], centre[1] - HEADBAND.drop, centre[2])
  const holder = new Group() // carries the rest-pose pair to where his head is (the head bone's matrix)
  holder.add(group)
  holder.matrixAutoUpdate = false
  holder.visible = false
  holder.frustumCulled = false
  return { object: holder, dispose: () => [band.geometry, material, ...group.children.map((c) => c.geometry)].forEach((d) => d.dispose()) }
}

// A soft dark patch under the chair where it stands at the synths: the plates only have his shadow at the desk
const CONTACT = Object.freeze({ radius: 0.42, darkness: 0.45, lift: 0.006, rugTop: 0.04 })

const contactShadow = () => {
  const canvas = document.createElement('canvas')
  canvas.width = canvas.height = 64
  const context = canvas.getContext('2d')
  const gradient = context.createRadialGradient(32, 32, 0, 32, 32, 32)
  gradient.addColorStop(0, 'rgba(0,0,0,1)')
  gradient.addColorStop(0.55, 'rgba(0,0,0,0.6)')
  gradient.addColorStop(1, 'rgba(0,0,0,0)')
  context.fillStyle = gradient
  context.fillRect(0, 0, 64, 64)
  const map = new CanvasTexture(canvas)
  const material = new MeshBasicMaterial({ map, color: 0x000000, transparent: true, opacity: 0, depthWrite: false })
  const disc = new Mesh(new CircleGeometry(CONTACT.radius, 32), material)
  disc.rotation.x = -Math.PI / 2
  disc.position.y = CONTACT.rugTop + CONTACT.lift
  disc.renderOrder = 2
  disc.frustumCulled = false
  return {
    object: disc,
    /** Under the chair's axis, dark as far as he's rolled away from the desk. */
    place: ([x, , z], away) => {
      disc.position.x = x
      disc.position.z = z
      material.opacity = CONTACT.darkness * away
      disc.visible = away > 0.001
    },
    dispose: () => [disc.geometry, material, map].forEach((d) => d.dispose()),
  }
}

/** He and the chair top: one rig and poser; each mesh is coloured from the layer holding its parts. */
const setupFigure = ({ manifest, shared, plants, meshes, fallback, seed, light }) => {
  if (!meshes.length) return null
  if (!manifest.figure || !plants) {
    for (const mesh of meshes) mesh.material = fallback // a manifest from before he moved: show the plate
    return null
  }
  const { bones, rests, mouse, keyPitch, desk, synth, headphones } = manifest.figure
  const rig = createFigureRig(bones)
  const chairBone = bones.findIndex((b) => b.name === 'chair')
  const guitarBone = bones.findIndex((b) => b.name === 'guitar')
  for (const mesh of meshes) {
    const layer = layerFor(manifest, mesh.userData.studio_name)
    // the same mesh's layer with him out of the chair: f for the chair, g for its see-through backrest
    const emptyKey = layer === manifest.plantLayers?.e ? 'g' : 'f'
    const empty = chairBone >= 0 ? (manifest.plantLayers?.[emptyKey] ?? null) : null
    mesh.material = layer
      ? createFigureMaterial(shared, { plants, layerRect: layer.rect, atlasRect: layer.atlasRect, bones: rig.matrices, empty, light, chairBone, guitarBone })
      : fallback
  }
  const head = bones.findIndex((b) => b.name === 'head')
  const axis = bones.find((b) => b.name === 'swivel')?.pivot ?? bones[0].pivot
  const mouseProp = createMouseProp()
  return {
    meshes,
    rig,
    typing: null, // how he types (clips.createTypingClip), once the motion clips load (StudioScene)
    seated: null, // the break's clips on his hips (clips.createSeatedClip), likewise
    poser: createFigurePoser({ bones, rests, mouse, keyPitch, seed, desk, synth, motion: manifest.motion, mouseAt: mouseProp, phone: phoneAt(manifest.clock) }),
    headphones: headphones && head >= 0 ? { ...headphonesOn(headphones), bone: head } : null,
    contact: synth ? contactShadow() : null,
    axis,
    // the mouse: where it is (the prop), its bone, and his wrist's spot on it where it sits in the render
    mouseRig: bones.some((b) => b.name === 'mouse') && mouseReachOf(manifest.figure)
      ? { prop: mouseProp, bone: bones.findIndex((b) => b.name === 'mouse'), spot: mouseReachOf(manifest.figure).wrist }
      : null,
    // his right fingers, which drape over the mouse as he holds it (the clip's were shaped to its own mouse)
    mouseFingers: ['index', 'middle', 'ring', 'little'].map((f) => ['a', 'b', 'c'].map((j) => bones.findIndex((b) => b.name === `${f}_R_${j}`))),
  }
}

/**
 * @returns {{ shared, room, swaying: Array<{ sway, place }>, figure, shadows, dust, dispose }}
 */
export const buildStudio = ({ manifest, plateViewProj, scene, base, deltas, plants, lutImage = null, hazeSteps, pixelRatio, seed }) => {
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
  const light = manifest.light && lutImage ? createLiveLight(manifest.light, lutImage) : null
  const figure = setupFigure({ manifest, shared, plants, meshes: byRole.figure, fallback: room, seed, light })
  const monstera = manifest.deltas?.up ? plantParts.find((part) => part.name === FLOOR_MONSTERA) : null
  const shadows = createShadowRig({ manifest, shared, tree, monstera, figure })

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
      figure?.headphones?.dispose()
      figure?.contact?.dispose()
      light?.dispose()
    },
  }
}
