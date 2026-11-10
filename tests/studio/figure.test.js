import { describe, expect, it } from 'vitest'
import { Vector3 } from 'three'
import { createFigureRig, elbowFor } from '@/components/studio/figureRig'
import { roomFragment } from '@/components/studio/shaders/room.glsl'
import { lineStarts, normaliseSource } from '@/lib/studio/code'
import { LONG_PAUSES, POSE, createFigurePoser, longPauseFor, settle } from '@/lib/studio/figurePose'
import { manifest } from '@/lib/studio/manifest'
import { FINGERS, HANDS, createTypingTimeline, strokeSlot } from '@/lib/studio/typing'

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
const MOUSE = [0.3, 0.75, -0.45]
const PHONE = [0.5, 0.75, -0.3]
const pivotOf = (name) => new Vector3(...BONES.find((b) => b.name === name).pivot)
const posed = (rig, name, point = pivotOf(name)) => point.clone().applyMatrix4(rig.matrices[BONES.findIndex((b) => b.name === name)])

const state = ({ since = 0.05, until = 0.1, index = 0, strokes = new Float32Array(10), glance = null, hands, pace } = {}) => ({
  typed: 0,
  extra: '',
  strokes,
  pause: { since, until, length: since + until, index },
  glance,
  hands,
  pace,
})
/** A pause index (seed 7) whose long pause he sits through the given way. */
const pauseSatThrough = (name) => {
  for (let index = 0; index < 1000; index++) if (longPauseFor(index, 7, true) === name) return index
  throw new Error(`no pause sits ${name}`)
}
const breathRoom = POSE.breath * 1.2 * POSE.sigh + 1e-9 // the most a breath (or a sigh) moves his spine

describe('figure pose', () => {
  const poser = createFigurePoser({ bones: BONES, rests: RESTS, phone: PHONE })
  const withMouse = createFigurePoser({ bones: BONES, rests: RESTS, phone: PHONE, mouse: MOUSE })
  const mouseWrist = [MOUSE[0], MOUSE[1] + POSE.mouseUp, MOUSE[2] + POSE.mouseBack] // the test keyboard runs along x

  it('names an angle for the swivel, spine, head, hands and every finger joint', () => {
    const { angles } = poser(state(), 0)
    const joints = (f, h) => ['a', 'b', 'c'].map((j) => `${f}_${h}_${j}`)
    const expected = ['swivel', 'spine', 'head', ...HANDS.flatMap((h) => [`hand_${h}`, ...FINGERS.flatMap((f) => joints(f, h))])]
    expect(Object.keys(angles).sort()).toEqual(expected.sort())
  })

  it('keeps his wrists on the keys and the chair still while he types', () => {
    const { angles, reach } = poser(state(), 3)
    expect(reach.L.target).toEqual(BONES.find((b) => b.name === 'hand_L').pivot)
    expect(angles.swivel[1]).toBe(0)
  })

  it('presses a striking finger down at both joints, and keeps the hand level', () => {
    const strokes = new Float32Array(10)
    strokes[strokeSlot('L', 'middle')] = 1
    const { angles, reach } = poser(state({ strokes }), 1)
    expect(angles.middle_L_a[0]).toBeCloseTo(-POSE.fingerPress[0])
    expect(angles.middle_L_b[0]).toBeCloseTo(-POSE.fingerPress[1])
    expect(reach.L.palm).toEqual([0, 0])
  })

  it('bends each fingertip joint with its middle joint, as real fingers do', () => {
    const strokes = new Float32Array(10)
    strokes[strokeSlot('R', 'ring')] = 1
    const { angles } = poser(state({ strokes }), 1)
    expect(angles.ring_R_c[0]).toBeCloseTo(angles.ring_R_b[0] * POSE.tipFollows)
    expect(angles.ring_R_c[0]).toBeLessThan(0)
  })

  it('stretches a finger toward a key further away and turns it toward one across', () => {
    const aims = new Float32Array(20)
    const slot = strokeSlot('R', 'index')
    aims[2 * slot] = 1 // one key to his right
    aims[2 * slot + 1] = -1 // one row away from him
    const { angles } = poser({ ...state(), aims }, 1)
    expect(angles.index_R_a[0]).toBeCloseTo(POSE.fingerRow[0])
    expect(angles.index_R_b[0]).toBeCloseTo(POSE.fingerRow[1])
    expect(angles.index_R_a[1]).toBeCloseTo(-POSE.fingerColumn)
  })

  it('hovers his hands a little in a short pause', () => {
    const { reach } = poser(state({ since: 0.6, until: 0.6 }), 2)
    expect(reach.R.target[1]).toBeCloseTo(BONES.find((b) => b.name === 'hand_R').pivot[1] + POSE.hoverLift)
  })

  it('sits through each long pause one of a few ways, each with its own lean, hands and chair', () => {
    for (const [name, way] of Object.entries(LONG_PAUSES)) {
      const index = pauseSatThrough(name)
      for (let since = POSE.leanEase; since <= 9 - POSE.leanEase; since += 0.37) {
        const { angles, reach, longPause } = withMouse(state({ since, until: 9 - since, index }), since)
        expect(longPause).toBe(name)
        const reachingLean = way.hands.R === 'mouse' ? POSE.mouseLean[0] : 0
        expect(Math.abs(angles.spine[0] - way.lean - reachingLean)).toBeLessThanOrEqual(breathRoom)
        expect(Math.abs(angles.swivel[1])).toBeLessThanOrEqual(way.swivel * (1 + 2 * POSE.swivelOvershoot) + 1e-9)
        for (const side of HANDS) {
          const target = new Vector3(...reach[side].target)
          const swivelled = new Vector3(...RESTS[side]).sub(pivotOf('swivel')).applyAxisAngle(new Vector3(0, 1, 0), angles.swivel[1]).add(pivotOf('swivel'))
          if (way.hands[side] === 'armrest') expect(target.distanceTo(swivelled)).toBeLessThan(1e-9)
          if (way.hands[side] === 'mouse') expect(target.distanceTo(new Vector3(...mouseWrist))).toBeLessThan(1e-9)
          if (way.hands[side] === 'keys') expect(target.distanceTo(pivotOf(`hand_${side}`))).toBeLessThan(0.02)
        }
      }
    }
  })

  it('leans well back in some pauses and toward the screen in others', () => {
    const leans = Object.values(LONG_PAUSES).map((way) => way.lean)
    expect(Math.max(...leans)).toBeGreaterThan(0.2) // about 14 degrees: reads at room size
    expect(Math.min(...leans)).toBeLessThan(0)
  })

  it('sits back instead of scrolling when there is no mouse', () => {
    const { longPause } = poser(state({ since: 3, until: 3, index: pauseSatThrough('scroll') }), 3)
    expect(longPause).toBe('sitBack')
  })

  it('never darts to the mouse: he only takes it in a pause long enough to keep it', () => {
    for (let index = 0; index < 40; index++) {
      const { reach } = withMouse(state({ since: 1, until: 1, index }), 1)
      expect(new Vector3(...reach.R.target).distanceTo(new Vector3(...mouseWrist))).toBeGreaterThan(0.05)
    }
    const scroll = pauseSatThrough('scroll')
    const brief = POSE.scrollMinPause - 0.5
    expect(withMouse(state({ since: brief / 2, until: brief / 2, index: scroll }), 1).longPause).toBe('sitBack')
    expect(withMouse(state({ since: 2, until: 2, index: scroll }), 1).longPause).toBe('scroll')
  })

  it('lays his fingers flat along the mouse and leans toward it', () => {
    const { angles } = withMouse(state({ since: 3, until: 3, index: pauseSatThrough('scroll') }), 3)
    for (const finger of ['middle', 'ring', 'little']) expect(angles[`${finger}_R_a`][0]).toBeCloseTo(POSE.mouseFingers[0])
    expect(angles.index_R_a[0]).toBeLessThanOrEqual(POSE.mouseFingers[0] + 1e-9) // it clicks now and then
    expect(angles.spine[2]).toBeCloseTo(POSE.mouseLean[2])
  })

  it('moves his wrists across the keys with his hands', () => {
    const { reach } = poser(state({ hands: { L: [1, -1], R: [0, 0] } }), 3)
    const expected = pivotOf('hand_L').add(new Vector3(POSE.keyPitch[0], 0, -POSE.keyPitch[1]))
    expect(new Vector3(...reach.L.target).distanceTo(expected)).toBeLessThan(1e-9)
    expect(reach.R.target).toEqual(BONES.find((b) => b.name === 'hand_R').pivot)
  })

  it('leans in when he is typing fast', () => {
    const fast = poser(state({ pace: 1 }), 2).angles.spine[0]
    const slow = poser(state({ pace: 0 }), 2).angles.spine[0]
    expect(fast - slow).toBeCloseTo(-POSE.leanIn)
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

  it('tips a bone sideways about its pivot when given a roll', () => {
    const rig = createFigureRig(BONES)
    rig.pose({ spine: [0, 0, 0.3] })
    expect(posed(rig, 'spine').distanceTo(pivotOf('spine'))).toBeLessThan(1e-12)
    expect(posed(rig, 'head').x).toBeLessThan(pivotOf('head').x - 0.05)
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

describe('his whole session, posed', () => {
  const code = normaliseSource(roomFragment)
  const timeline = createTypingTimeline(code, { startAt: lineStarts(code)[12] })
  const clock = manifest.clock.matrix
  const poser = createFigurePoser({ ...manifest.figure, phone: [clock[12], clock[13], clock[14]] })

  it('never moves a wrist faster than an unhurried arm, through three minutes of typing and pauses', () => {
    let previous = poser(timeline.at(0), 0).reach
    for (let t = 0.01; t < 180; t += 0.01) {
      const { reach } = poser(timeline.at(t), t)
      for (const side of HANDS) expect(Math.hypot(...reach[side].target.map((v, i) => v - previous[side].target[i]))).toBeLessThan(0.01)
      previous = reach
    }
  })

  it('glides his hands over the keys instead of twitching from key to key', () => {
    for (const side of HANDS) {
      let anchor = null
      let heading = null
      let turns = 0
      let typing = 0
      for (let t = 2; t < 62; t += 0.01) {
        const moment = timeline.at(t)
        if (moment.pause.length >= POSE.shortPause) continue
        typing += 0.01
        const p = poser(moment, t).reach[side].target
        anchor ??= p
        const step = [p[0] - anchor[0], p[2] - anchor[2]]
        if (Math.hypot(...step) < 0.004) continue
        if (heading && step[0] * heading[0] + step[1] * heading[1] < 0) turns++
        heading = step
        anchor = p
      }
      expect(turns / typing).toBeLessThan(0.5) // back-and-forth moves of 4 mm or more, per second of typing
    }
  })

  it('has no rhythm you can lock onto: his head never repeats itself over two minutes', () => {
    const yaw = []
    for (let t = 0; t < 120; t += 0.05) yaw.push(poser(timeline.at(t), t).angles.head[1])
    const mean = yaw.reduce((a, b) => a + b) / yaw.length
    const centred = yaw.map((v) => v - mean)
    const power = centred.reduce((sum, v) => sum + v * v, 0)
    for (let lag = 60; lag <= 1200; lag += 5) {
      let sum = 0
      for (let i = 0; i + lag < centred.length; i++) sum += centred[i] * centred[i + lag]
      expect((sum / power) * (centred.length / (centred.length - lag))).toBeLessThan(0.6)
    }
  })

  it('reaches the mouse with a bend left in his arm', () => {
    const scroll = pauseSatThrough('scroll')
    const rig = createFigureRig(manifest.figure.bones)
    const { angles, reach } = poser(state({ since: 3, until: 3, index: scroll }), 3)
    rig.pose(angles, reach)
    const bones = manifest.figure.bones
    const at = (name) => new Vector3(...bones.find((b) => b.name === name).pivot).applyMatrix4(rig.matrices[bones.findIndex((b) => b.name === name)])
    const [shoulder, elbow, wrist] = ['shoulder_R', 'elbow_R', 'hand_R'].map(at)
    expect(wrist.distanceTo(new Vector3(...reach.R.target))).toBeLessThan(3e-3) // soft IK: a hair short at full stretch
    const bend = elbow.clone().sub(shoulder).angleTo(wrist.clone().sub(elbow))
    expect(bend).toBeGreaterThan(0.15) // not locked straight
  })
})

describe('the chair rolling', () => {
  it('carries everything from the root: turned about the gas lift, then slid across the floor', () => {
    const rig = createFigureRig(BONES)
    rig.pose({}, null, { offset: [1, 0, 0], yaw: Math.PI / 2 })
    // the swivel axis (0, 0.4, 0) only slides; the head, ahead of it, swings round a quarter turn first
    expect(posed(rig, 'swivel').toArray().map((v) => +v.toFixed(6))).toEqual([1, 0.4, 0])
    const head = posed(rig, 'head')
    expect(head.x).toBeCloseTo(1 - 0.1, 6)
    expect(head.z).toBeCloseTo(0, 6)
  })

  it('can shrink a bone away about its pivot (headphones off his neck)', () => {
    const rig = createFigureRig(BONES)
    rig.pose({ head: [0, 0, 0, 0] })
    const index = BONES.findIndex((b) => b.name === 'head')
    expect(new Vector3(0.05, 1.1, -0.1).applyMatrix4(rig.matrices[index]).distanceTo(pivotOf('head'))).toBeLessThan(1e-9)
  })
})
