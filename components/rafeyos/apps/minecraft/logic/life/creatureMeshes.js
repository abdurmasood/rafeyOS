// Drawing the herds: every body part of every species is one instanced box, posed each frame from the animal's state
// (where it is, which way it faces, how far through its stride, whether it's grazing) and shaded like the blocks, in
// the same light.
import { Color, InstancedMesh, Matrix4, MeshBasicMaterial, Quaternion, Vector3 } from 'three'
import { HERDS } from '@/components/rafeyos/apps/minecraft/logic/life/herds'
import { shadedBox } from '@/components/rafeyos/apps/minecraft/logic/life/shadedBox'
import { SPECIES } from '@/components/rafeyos/apps/minecraft/logic/life/species'

const AXIS = Object.freeze({ legA: 'x', legB: 'x', head: 'x', tail: 'y', wingL: 'z', wingR: 'z' })
const AXES = Object.freeze({ x: new Vector3(1, 0, 0), y: new Vector3(0, 1, 0), z: new Vector3(0, 0, 1) })
const CAPACITY = Object.freeze({ fish: HERDS.FISH, gull: HERDS.FLOCKS * HERDS.GULLS })
// Gulls only show while there's light to see them by
const GULLS_FROM = 0.15

/** How each swinging part turns for this animal right now, in radians. */
const angles = (animal, gait) => {
  const swing = Math.sin(animal.phase) * animal.moving
  return {
    legA: gait === 'hop' ? -Math.abs(swing) * 0.9 : swing * 0.7,
    legB: gait === 'hop' ? -Math.abs(swing) * 0.9 : -swing * 0.7,
    head: animal.headPitch + Math.sin(animal.phase * 0.5) * 0.04,
    tail: animal.species === 'fish' ? Math.sin(animal.phase * 1.6) * 0.6 : Math.sin(animal.phase * 2) * 0.25,
    wingL: 0.15 + Math.abs(swing) * 0.25,
    wingR: -0.15 - Math.abs(swing) * 0.25,
  }
}

/** How far the body rises: hares bound, waddlers bob, anything stepping up a block hops. */
const liftOf = (animal, gait) => {
  if (gait === 'hop') return Math.abs(Math.sin(animal.phase * 0.5)) * 0.32 * animal.moving + animal.hop * 0.3
  if (gait === 'waddle') return Math.abs(Math.sin(animal.phase)) * 0.04 * animal.moving
  return animal.hop * 0.25
}

export const createCreatureMeshes = () => {
  const material = new MeshBasicMaterial({ vertexColors: true })
  const box = shadedBox()
  // The parts of each species in each of its colourings, worked out once
  const partsOf = new Map(Object.entries(SPECIES).map(([name, def]) => [name, def.colours.map((colours) => def.parts(colours))]))
  const meshes = new Map(Object.entries(SPECIES).map(([name]) => [name, partsOf.get(name)[0].map(() => {
    const mesh = new InstancedMesh(box, material, CAPACITY[name] ?? HERDS.LAND)
    // Instances move every frame; a bounding sphere three worked out once would cull them wrongly
    mesh.frustumCulled = false
    mesh.count = 0
    return mesh
  })]))
  const body = new Matrix4(), step = new Matrix4(), turn = new Matrix4()
  const position = new Vector3(), scale = new Vector3(), rotation = new Quaternion(), colour = new Color()

  /** Sets one instance to `part` of a creature at `at`, facing `yaw`, `size` times its usual size. */
  const pose = ({ mesh, index }, { at, yaw, size, lift }, part, turnBy) => {
    body.makeRotationY(yaw).premultiply(step.makeTranslation(at.x, at.y + lift, at.z)).multiply(step.makeScale(size, size, size))
    if (part.swing) {
      const [px, py, pz] = part.pivot
      turn.makeRotationAxis(AXES[AXIS[part.swing]], turnBy[part.swing])
      body.multiply(step.makeTranslation(px, py, pz)).multiply(turn).multiply(step.makeTranslation(-px, -py, -pz))
    }
    body.multiply(step.compose(position.fromArray(part.at), rotation.identity(), scale.fromArray(part.size)))
    mesh.setMatrixAt(index, body)
    mesh.setColorAt(index, colour.set(part.colour))
  }
  const finish = (name, count) => {
    for (const mesh of meshes.get(name)) {
      mesh.count = count
      mesh.instanceMatrix.needsUpdate = true
      if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true
    }
  }
  const drawAnimals = (animals) => {
    const used = new Map()
    for (const animal of animals) {
      const def = SPECIES[animal.species]
      const i = used.get(animal.species) ?? 0
      const parts = meshes.get(animal.species)
      if (i >= parts[0].instanceMatrix.count) continue
      used.set(animal.species, i + 1)
      const where = { at: animal, yaw: animal.yaw, size: animal.scale * animal.grow, lift: liftOf(animal, def.gait) }
      const turnBy = angles(animal, def.gait)
      partsOf.get(animal.species)[animal.variant].forEach((part, k) => pose({ mesh: parts[k], index: i }, where, part, turnBy))
    }
    for (const name of meshes.keys()) if (name !== 'gull') finish(name, used.get(name) ?? 0)
  }
  const drawGulls = (gulls, daylight) => {
    const shown = daylight > GULLS_FROM ? gulls : []
    const parts = meshes.get('gull')
    shown.forEach((gull, i) => {
      const where = { at: gull, yaw: gull.yaw, size: 1.4, lift: 0 }
      const turnBy = { wingL: gull.wing, wingR: -gull.wing }
      partsOf.get('gull')[0].forEach((part, k) => pose({ mesh: parts[k], index: i }, where, part, turnBy))
    })
    finish('gull', shown.length)
  }
  return {
    meshes: [...meshes.values()].flat(),
    material,
    /**
     * @param {import('./herds').Animal[]} animals
     * @param {import('./herds').Gull[]} gulls
     * @param {number} daylight - 0..1, the sun's strength
     */
    draw: (animals, gulls, daylight) => {
      drawAnimals(animals)
      drawGulls(gulls, daylight)
    },
    dispose: () => {
      box.dispose()
      material.dispose()
    },
  }
}
