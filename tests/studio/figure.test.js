import { describe, expect, it } from 'vitest'
import { Vector3 } from 'three'
import { createFigureRig, elbowFor } from '@/components/studio/figureRig'
import { POSE, createFigurePoser, settle } from '@/lib/studio/figurePose'
import { FINGERS, HANDS, strokeSlot } from '@/lib/studio/typing'

// A small seated rig in three.js space: forward is -z, up is +y, his left is -x
const arm = (side, x) => [
  { name: `shoulder_${side}`, parent: 2, pivot: [0.12 * x, 0.85, -0.09] },
  { name: `elbow_${side}`, parent: null, pivot: [0.2 * x, 0.62, -0.25] },
  { name: `hand_${side}`, parent: null, pivot: [0.1 * x, 0.78, -0.42] },
  { name: `index_${side}_a`, parent: null, pivot: [0.1 * x, 0.78, -0.48] },
]
const BONES = (() => {
  const bones = [
    { name: 'root', parent: -1, pivot: [0, 0.5, 0] },
    { name: 'swivel', parent: 0, pivot: [0, 0.4, 0] },
    { name: 'spine', parent: 1, pivot: [0, 0.6, 0] },
    { name: 'head', parent: 2, pivot: [0, 0.9, -0.1] },
  ]
  for (const [side, x] of [['L', -1], ['R', 1]]) {
    const first = bones.length
    arm(side, x).forEach((bone, k) => bones.push({ ...bone, parent: k === 0 ? 2 : first + k - 1 }))
  }
  return bones
})()
const RESTS = { L: [-0.3, 0.7, -0.05], R: [0.3, 0.7, -0.05] }
const pivotOf = (name) => new Vector3(...BONES.find((b) => b.name === name).pivot)
const posed = (rig, name, point = pivotOf(name)) => point.clone().applyMatrix4(rig.matrices[BONES.findIndex((b) => b.name === name)])

const state = ({ since = 0.05, until = 0.1, strokes = new Float32Array(10), glance = null } = {}) => ({
  typed: 0,
  extra: '',
  strokes,
  pause: { since, until, length: since + until },
  glance,
})

describe('figure pose', () => {
  const poser = createFigurePoser({ bones: BONES, rests: RESTS, phone: [0.5, 0.75, -0.3] })

  it('names an angle for the swivel, spine, head, hands and every finger joint', () => {
    const { angles } = poser(state(), 0)
    const expected = ['swivel', 'spine', 'head', ...HANDS.flatMap((h) => [`hand_${h}`, ...FINGERS.flatMap((f) => [`${f}_${h}_a`, `${f}_${h}_b`])])]
    expect(Object.keys(angles).sort()).toEqual(expected.sort())
  })

  it('keeps his wrists on the keys and the chair still while he types', () => {
    const { angles, reach } = poser(state(), 3)
    expect(reach.L.target).toEqual(BONES.find((b) => b.name === 'hand_L').pivot)
    expect(angles.swivel[1]).toBe(0)
  })

  it('lifts a striking finger at both joints', () => {
    const strokes = new Float32Array(10)
    strokes[strokeSlot('L', 'middle')] = 1
    const { angles } = poser(state({ strokes }), 1)
    expect(angles.middle_L_a[0]).toBeCloseTo(POSE.fingerLift[0])
    expect(angles.middle_L_b[0]).toBeCloseTo(POSE.fingerLift[1])
  })

  it('hovers his hands a little in a short pause', () => {
    const { reach } = poser(state({ since: 0.6, until: 0.6 }), 2)
    expect(reach.R.target[1]).toBeCloseTo(BONES.find((b) => b.name === 'hand_R').pivot[1] + POSE.hoverLift)
  })

  it('in a long pause leans back, rests his forearms on the armrests and swivels a little', () => {
    for (let since = POSE.leanEase; since <= 9 - POSE.leanEase; since += 0.37) {
      const { angles, reach } = poser(state({ since, until: 9 - since }), since)
      expect(Math.abs(angles.spine[0] - POSE.lean)).toBeLessThanOrEqual(POSE.breath + 1e-9)
      expect(Math.abs(angles.swivel[1])).toBeLessThanOrEqual(POSE.swivel)
      const swivelled = new Vector3(...RESTS.L).sub(pivotOf('swivel')).applyAxisAngle(new Vector3(0, 1, 0), angles.swivel[1]).add(pivotOf('swivel'))
      expect(new Vector3(...reach.L.target).distanceTo(swivelled)).toBeLessThan(1e-9)
    }
  })

  it('eases into and out of a pause without jumps', () => {
    expect(settle({ since: 0, until: 5 }, 0.9)).toBe(0)
    expect(settle({ since: 0.9, until: 5 }, 0.9)).toBe(1)
    expect(settle({ since: 5, until: 0 }, 0.9)).toBe(0)
    // 10 ms apart, the wrist moves no faster than an unhurried arm (1 m/s)
    const a = poser(state({ since: 0.5, until: 4 }), 1).reach.L.target
    const b = poser(state({ since: 0.51, until: 3.99 }), 1.01).reach.L.target
    expect(new Vector3(...a).distanceTo(new Vector3(...b))).toBeLessThan(0.01)
  })

  it('turns his head toward the phone when he glances at it', () => {
    const still = poser(state(), 0).angles.head[1]
    const glancing = poser(state({ glance: { kind: 'phone', amount: 1 } }), 0).angles.head[1]
    expect(glancing).toBeLessThan(still) // the phone is to his right (+x), so the yaw goes negative
  })

  it('poses fingers only, with no arm goals, for a rig from before he could lean', () => {
    const old = createFigurePoser({ bones: [{ name: 'root', parent: -1, pivot: [0, 0, 0] }] })
    expect(old(state(), 0).reach).toBeNull()
  })
})

describe('figure rig', () => {
  it('starts in the rest pose the render was made in', () => {
    const rig = createFigureRig(BONES)
    expect(posed(rig, 'hand_L').distanceTo(pivotOf('hand_L'))).toBeLessThan(1e-12)
  })

  it('turns a bone about its own pivot and carries its children along', () => {
    const rig = createFigureRig(BONES)
    rig.pose({ spine: [0.3, 0] })
    expect(posed(rig, 'spine').distanceTo(pivotOf('spine'))).toBeLessThan(1e-12)
    expect(posed(rig, 'head').distanceTo(pivotOf('head'))).toBeGreaterThan(0.05)
  })

  it('reaches a wrist to its target, keeping both arm lengths, elbow bent toward the pole', () => {
    const rig = createFigureRig(BONES)
    const goal = { target: RESTS.L, pole: [-0.6, -1, 0.5], palm: [0, 0] }
    rig.pose({}, { L: goal })
    const [s, e, w] = ['shoulder_L', 'elbow_L', 'hand_L'].map((name) => posed(rig, name))
    expect(w.distanceTo(new Vector3(...RESTS.L))).toBeLessThan(1e-6)
    expect(s.distanceTo(e)).toBeCloseTo(pivotOf('shoulder_L').distanceTo(pivotOf('elbow_L')), 9)
    expect(e.distanceTo(w)).toBeCloseTo(pivotOf('elbow_L').distanceTo(pivotOf('hand_L')), 9)
    const middle = s.clone().add(w).multiplyScalar(0.5)
    expect(e.clone().sub(middle).dot(new Vector3(...goal.pole))).toBeGreaterThan(0)
  })

  it('keeps the palm at its rest orientation, so fingers sit where the hand puts them', () => {
    const rig = createFigureRig(BONES)
    rig.pose({}, { L: { target: RESTS.L, pole: [-0.6, -1, 0.5], palm: [0, 0] } })
    const offset = posed(rig, 'index_L_a').sub(posed(rig, 'hand_L'))
    expect(offset.distanceTo(pivotOf('index_L_a').sub(pivotOf('hand_L')))).toBeLessThan(1e-9)
  })

  it('puts the elbow so the two bones span the reach', () => {
    const e = elbowFor(new Vector3(0, 0, 0), new Vector3(1, 0, 0), 1, 1, new Vector3(0, 1, 0))
    expect(e.x).toBeCloseTo(0.5)
    expect(e.y).toBeCloseTo(Math.sqrt(0.75))
  })
})
