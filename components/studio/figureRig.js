// The figure's bones as matrices the shader reads. Each matrix carries a vertex from the render's rest
// pose to this frame's pose. Bones arrive parent-first (checked by lib/studio/manifest.js); each turns
// about its pivot inside its parent, except the arms, which reach for a wrist target (two-bone IK).
import { Euler, Matrix4, Quaternion, Vector3 } from 'three'

const SIDES = ['L', 'R']
const MOUSE_SIDE = 'R' // the mouse sits right of the keyboard

// An arm nearly straight has its elbow swing wildly for tiny target moves, so the last few percent of its reach
// is eased into (soft IK): the wrist falls a hair short of a target at full stretch, the elbow stays calm.
const SOFT_REACH = 0.95

/** Where the elbow goes so an upper arm of length a and forearm of length b reach from s toward t. */
export const elbowFor = (s, t, a, b, pole) => {
  const span = t.clone().sub(s)
  const full = a + b
  const knee = SOFT_REACH * full
  const distance = span.length()
  const reach = distance <= knee ? distance : knee + (full - knee) * (1 - Math.exp(-(distance - knee) / (full - knee))) - 1e-6
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
  const blend = { p: new Vector3(), q: new Quaternion(), s: new Vector3(), cp: new Vector3(), cq: new Quaternion(), cs: new Vector3() }

  const pivotOurs = new Vector3()
  const pivotTheirs = new Vector3()
  const scaled = new Matrix4()
  /**
   * Moves bone i's matrix toward `theirs` by `weight`, turning it about its own joint so it never comes off its
   * parent: the rotations are slerped, and the joint goes where its (already posed) parent puts it, or for a
   * bone with no parent, between where each pose puts it. Keeps its own scale (e.g. headphones put away).
   * (Averaging the matrices' translations instead throws a turned bone far off its joint mid-blend.)
   */
  const blendToward = (i, theirs, weight) => {
    const pivot = pivots[i]
    matrices[i].decompose(blend.p, blend.q, blend.s)
    theirs.decompose(blend.cp, blend.cq, blend.cs)
    const parent = bones[i].parent
    if (parent >= 0) pivotOurs.copy(pivot).applyMatrix4(matrices[parent])
    else pivotOurs.copy(pivot).applyMatrix4(matrices[i]).lerp(pivotTheirs.copy(pivot).applyMatrix4(theirs), weight)
    blend.q.slerp(blend.cq, Math.min(1, weight))
    // M = T(joint) . R . S . T(-pivot)
    matrices[i].makeRotationFromQuaternion(blend.q).multiply(scaled.makeScale(blend.s.x, blend.s.y, blend.s.z))
    matrices[i].multiply(scaled.makeTranslation(-pivot.x, -pivot.y, -pivot.z))
    matrices[i].premultiply(scaled.makeTranslation(pivotOurs.x, pivotOurs.y, pivotOurs.z))
    return matrices[i]
  }
  const weightOf = (i, clip) => clip.weights?.get(i) ?? clip.weight
  const relTarget = new Matrix4()

  /**
   * A motion clip's say over bone i: its absolute pose (clip.bones, a clip played whole), or how the clip turns it
   * relative to its parent (clip.relative), put on wherever the parent is now.
   */
  const towardClip = (i, clip) => {
    if (!clip) return
    const weight = weightOf(i, clip)
    if (weight <= 0) return
    const absolute = clip.bones?.get(i)
    if (absolute) return blendToward(i, absolute, weight)
    const relative = clip.relative?.get(i)
    const parent = bones[i].parent
    if (!relative || parent < 0) return
    blendToward(i, relTarget.multiplyMatrices(matrices[parent], relative), weight)
  }

  const armScratch = { s: new Matrix4(), e: new Matrix4(), h: new Matrix4(), q: new Quaternion(), palm: new Quaternion(), lift: new Vector3() }
  /**
   * Where a relative clip would put an arm (shoulder, elbow, hand turned as the clip turns them), as a reach goal:
   * the clip's wrist, moved by clip.lift[side] (in the frame of bone clip.liftBone, his hips) onto the room's
   * keyboard, and its hand's rotation. Blended with `ours` by the clip's weight for the shoulder. The elbow keeps
   * our own steady pole: the clip's elbow swings out when its typist goes for a mouse, which flicks it here.
   */
  const clipArmGoal = (arm, side, ours, clip) => {
    const [relS, relE, relH] = [arm.shoulder, arm.elbow, arm.hand].map((b) => clip.relative?.get(b))
    const weight = weightOf(arm.shoulder, clip)
    if (!relS || !relE || !relH || weight <= 0) return ours
    const parent = matrices[bones[arm.shoulder].parent]
    const { s, e, h, q: hand, palm, lift } = armScratch
    s.multiplyMatrices(parent, relS)
    e.multiplyMatrices(s, relE)
    h.multiplyMatrices(e, relH)
    const frame = matrices[clip.liftBone ?? bones[arm.shoulder].parent]
    frame.decompose(blend.p, blend.q, blend.s)
    lift.copy(clip.lift?.[side] ?? lift.set(0, 0, 0)).applyQuaternion(blend.q)
    let target = pivots[arm.hand].clone().applyMatrix4(h).add(lift)
    let pole = ours.pole
    if (clip.mouse && side === MOUSE_SIDE) {
      // how far over to its mouse the clip's hand is (clip.mouse.share, eased in time): that far to the room's
      const onMouse = clip.mouse.share ?? 0
      if (onMouse > 0) {
        target = target.lerp(clip.mouse.wrist, onMouse) // where the mouse is now (it moves with this hand)
        // the elbow turns out for the mouse only as far as the clip has a say over the arm at all
        pole = new Vector3(...ours.pole).lerp(new Vector3(...clip.mouse.pole), onMouse * weight).toArray()
      }
    }
    h.decompose(blend.cp, hand, blend.cs)
    palm.setFromEuler(euler.set(ours.palm[0], ours.palm[1], 0))
    // on the mouse his palm lies flat on it, as when he scrolls (the clip's hand was shaped to its own mouse)
    if (clip.mouse && side === MOUSE_SIDE && clip.mouse.share > 0) hand.slerp(palm, clip.mouse.share)
    return {
      target: new Vector3(...ours.target).lerp(target, weight).toArray(),
      pole,
      rotation: palm.clone().slerp(hand, weight),
    }
  }

  // The chair (and him on it) turns about the gas lift and rolls across the floor from the root
  const axis = pivots[index.get('swivel') ?? 0]
  const rootIndex = index.get('root') ?? 0
  const carried = new Matrix4()

  /** angles [pitch, yaw, roll, size]: size shrinks a bone to nothing about its pivot (e.g. headphones put away). */
  const turn = (i, [pitch = 0, yaw = 0, roll = 0, size = 1] = [], root = null) => {
    const { x, y, z } = pivots[i]
    local.makeTranslation(x, y, z).multiply(scratch.makeRotationFromEuler(euler.set(pitch, yaw, roll)))
    if (size !== 1) local.multiply(scratch.makeScale(size, size, size))
    local.multiply(scratch.makeTranslation(-x, -y, -z))
    const parent = bones[i].parent
    if (parent >= 0) return matrices[i].multiplyMatrices(matrices[parent], local)
    if (!root || i !== rootIndex) return matrices[i].copy(local) // other free bones (the guitar) don't roll with the chair
    carried
      .makeTranslation(axis.x + root.offset[0], axis.y + root.offset[1], axis.z + root.offset[2])
      .multiply(scratch.makeRotationY(root.yaw))
      .multiply(scratch.makeTranslation(-axis.x, -axis.y, -axis.z))
    return matrices[i].multiplyMatrices(carried, local)
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
    if (goal.rotation) qHand.copy(goal.rotation)
    else qHand.setFromEuler(euler.set(goal.palm[0], goal.palm[1], 0))
    q.setFromRotationMatrix(matrices[elbow]).invert().premultiply(qHand)
    turnAbout(matrices[hand], w1, q, matrices[elbow], scratch)
  }

  /**
   * No arguments: the rest pose the render was made in. Bones missing from `angles` stay at rest.
   * root: { offset: [x, y, z], yaw }, the chair rolled and turned (activities.js), or null where it was.
   * clip: a motion clip's pose blended over the rest (clips.js): { bones: Map(bone index -> Matrix4) } for a clip
   *   played whole, or { relative: Map(bone index -> Matrix4 relative to its parent), lift: { L, R } } for one put on
   *   his own hips (arms reaching for the clip's wrists, lifted onto the keyboard; its mouse mapped to the room's);
   *   weight, and per-bone weights (Map) over it.
   */
  const pose = (angles = {}, reach = null, root = null, clip = null) => {
    const solved = new Set()
    bones.forEach(({ name }, i) => {
      if (solved.has(i)) return
      const side = reach ? SIDES.find((s) => arms[s]?.shoulder === i && reach[s]) : undefined
      if (!side) {
        turn(i, angles[name], root)
        return towardClip(i, clip)
      }
      const arm = arms[side]
      reachArm(arm, clip?.relative ? clipArmGoal(arm, side, reach[side], clip) : reach[side])
      solved.add(arm.elbow).add(arm.hand)
    })
  }
  pose()
  return { matrices, pose }
}
