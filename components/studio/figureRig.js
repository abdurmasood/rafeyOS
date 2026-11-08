// The figure's bones as matrices the shader reads. Each matrix carries a vertex from the render's rest
// pose to this frame's pose. Bones arrive parent-first (checked by lib/studio/manifest.js); each turns
// about its pivot inside its parent, except the arms, which reach for a wrist target (two-bone IK).
import { Euler, Matrix4, Quaternion, Vector3 } from 'three'

const SIDES = ['L', 'R']

/** Where the elbow goes so an upper arm of length a and forearm of length b reach from s toward t. */
export const elbowFor = (s, t, a, b, pole) => {
  const span = t.clone().sub(s)
  const reach = Math.min(span.length(), a + b - 1e-6)
  const along = span.normalize()
  const bend = pole.clone().addScaledVector(along, -pole.dot(along))
  if (bend.lengthSq() < 1e-12) bend.set(0, -1, 0)
  bend.normalize()
  const cos = Math.min(1, Math.max(-1, (a * a + reach * reach - b * b) / (2 * a * reach)))
  const angle = Math.acos(cos)
  return s.clone().addScaledVector(along, a * Math.cos(angle)).addScaledVector(bend, a * Math.sin(angle))
}

/** M = T(p) · R · T(-p) · parent: turn by `rotation` about the already-posed point `p`, after `parent`. */
const turnAbout = (out, p, rotation, parent, scratch) =>
  out
    .makeTranslation(p.x, p.y, p.z)
    .multiply(scratch.makeRotationFromQuaternion(rotation))
    .multiply(scratch.makeTranslation(-p.x, -p.y, -p.z))
    .multiply(parent)

/**
 * @param {Array<{ name: string, parent: number, pivot: number[] }>} bones
 * @returns {{ matrices: Matrix4[], pose: (angles?: object, reach?: object | null) => void }}
 */
export const createFigureRig = (bones) => {
  const matrices = bones.map(() => new Matrix4())
  const pivots = bones.map(({ pivot }) => new Vector3(...pivot))
  const index = new Map(bones.map((bone, i) => [bone.name, i]))
  const arms = Object.fromEntries(
    SIDES.filter((s) => index.has(`shoulder_${s}`)).map((s) => {
      const [shoulder, elbow, hand] = ['shoulder', 'elbow', 'hand'].map((joint) => index.get(`${joint}_${s}`))
      return [s, { shoulder, elbow, hand, upper: pivots[elbow].distanceTo(pivots[shoulder]), fore: pivots[hand].distanceTo(pivots[elbow]) }]
    }),
  )
  const local = new Matrix4()
  const scratch = new Matrix4()
  const euler = new Euler(0, 0, 0, 'YXZ')
  const q = new Quaternion()
  const qHand = new Quaternion()

  const turn = (i, [pitch = 0, yaw = 0] = []) => {
    const { x, y, z } = pivots[i]
    local.makeTranslation(x, y, z).multiply(scratch.makeRotationFromEuler(euler.set(pitch, yaw, 0)))
    local.multiply(scratch.makeTranslation(-x, -y, -z))
    const parent = bones[i].parent
    if (parent < 0) matrices[i].copy(local)
    else matrices[i].multiplyMatrices(matrices[parent], local)
  }

  const reachArm = ({ shoulder, elbow, hand, upper, fore }, goal) => {
    const parent = matrices[bones[shoulder].parent]
    const s1 = pivots[shoulder].clone().applyMatrix4(parent)
    const e0 = pivots[elbow].clone().applyMatrix4(parent)
    const w0 = pivots[hand].clone().applyMatrix4(parent)
    const target = new Vector3(...goal.target)
    const e1 = elbowFor(s1, target, upper, fore, new Vector3(...goal.pole))
    q.setFromUnitVectors(e0.clone().sub(s1).normalize(), e1.clone().sub(s1).normalize())
    turnAbout(matrices[shoulder], s1, q, parent, scratch)
    const forearm = w0.sub(e0).applyQuaternion(q).normalize()
    q.setFromUnitVectors(forearm, target.clone().sub(e1).normalize())
    turnAbout(matrices[elbow], e1, q, matrices[shoulder], scratch)
    // The hand takes the palm's world rotation outright, so twist never builds up along the arm
    const w1 = pivots[hand].clone().applyMatrix4(matrices[elbow])
    qHand.setFromEuler(euler.set(goal.palm[0], goal.palm[1], 0))
    q.setFromRotationMatrix(matrices[elbow]).invert().premultiply(qHand)
    turnAbout(matrices[hand], w1, q, matrices[elbow], scratch)
  }

  /** No arguments: the rest pose the render was made in. Bones missing from `angles` stay at rest. */
  const pose = (angles = {}, reach = null) => {
    const solved = new Set()
    bones.forEach(({ name }, i) => {
      if (solved.has(i)) return
      const side = reach ? SIDES.find((s) => arms[s]?.shoulder === i && reach[s]) : undefined
      if (!side) return turn(i, angles[name])
      reachArm(arms[side], reach[side])
      solved.add(arms[side].elbow).add(arms[side].hand)
    })
  }
  pose()
  return { matrices, pose }
}
