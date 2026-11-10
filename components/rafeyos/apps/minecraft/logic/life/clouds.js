// A layer of blocky clouds drifting east with the wind, high above the title orbit so the opening shot looks under
// them. Laid out on a grid of cells around the camera from a fixed hash, so the same sky comes back as it drifts by.
import { Color, InstancedMesh, Matrix4, MeshBasicMaterial } from 'three'
import { hash01 } from '@/components/rafeyos/apps/minecraft/logic/random'
import { shadedBox } from '@/components/rafeyos/apps/minecraft/logic/life/shadedBox'

export const CLOUDS = Object.freeze({ CELL: 6, BASE: 108, THICK: 2, RADIUS: 176, MAX: 1800, SPEED: 1.4 })
const SEED = 51
const NIGHT = new Color('#2c3352')
const DUSK = new Color('#f1b7a0')
const DAY = new Color('#ffffff')

/** Whether a cell has cloud: big patches broken up at the edges. @param {number} i @param {number} j */
export const isCloud = (i, j) => {
  const patch = hash01(SEED, Math.floor(i / 5), 0, Math.floor(j / 4))
  const fleck = hash01(SEED + 1, i, 0, j)
  return (patch > 0.7 && fleck > 0.2) || (patch > 0.6 && fleck > 0.82)
}

export const createClouds = () => {
  const material = new MeshBasicMaterial({ vertexColors: true, transparent: true, opacity: 0.86, depthWrite: false })
  const mesh = new InstancedMesh(shadedBox(CLOUDS.CELL, CLOUDS.THICK, CLOUDS.CELL), material, CLOUDS.MAX)
  // Instances move every rebuild; a bounding sphere three worked out once would cull them wrongly
  mesh.frustumCulled = false
  mesh.renderOrder = 2
  mesh.count = 0
  const matrix = new Matrix4()
  let drift = 0
  let laidOut = ''
  const layOut = (i0, i1, j0, j1) => {
    let count = 0
    for (let i = i0; i <= i1 && count < CLOUDS.MAX; i++) {
      for (let j = j0; j <= j1 && count < CLOUDS.MAX; j++) {
        if (!isCloud(i, j)) continue
        matrix.makeTranslation((i + 0.5) * CLOUDS.CELL, CLOUDS.BASE + CLOUDS.THICK / 2, (j + 0.5) * CLOUDS.CELL)
        mesh.setMatrixAt(count++, matrix)
      }
    }
    mesh.count = count
    mesh.instanceMatrix.needsUpdate = true
  }
  return {
    mesh,
    /**
     * @param {number} dt
     * @param {{ x: number, z: number }} camera
     */
    update: (dt, camera) => {
      drift += dt * CLOUDS.SPEED
      mesh.position.x = drift
      const i0 = Math.floor((camera.x - drift - CLOUDS.RADIUS) / CLOUDS.CELL), i1 = i0 + Math.ceil((2 * CLOUDS.RADIUS) / CLOUDS.CELL)
      const j0 = Math.floor((camera.z - CLOUDS.RADIUS) / CLOUDS.CELL), j1 = j0 + Math.ceil((2 * CLOUDS.RADIUS) / CLOUDS.CELL)
      const key = `${i0},${j0}`
      if (key !== laidOut) {
        laidOut = key
        layOut(i0, i1, j0, j1)
      }
    },
    /** Grey at night, rosy at the ends of the day, white by day. @param {{ glow: number, sun: { y: number } }} sky */
    tint: (sky) => {
      const lowSun = 1 - Math.min(1, Math.abs(sky.sun.y) * 6)
      material.color.copy(NIGHT).lerp(DUSK, Math.min(1, sky.glow * 2)).lerp(DAY, Math.max(0, sky.glow * 2 - 1) * (1 - lowSun * 0.6))
    },
    dispose: () => {
      mesh.geometry.dispose()
      material.dispose()
    },
  }
}
