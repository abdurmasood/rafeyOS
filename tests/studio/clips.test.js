import { describe, expect, it } from 'vitest'
import { Matrix4, Quaternion, Vector3 } from 'three'
import { decodeMotion, sampleClip, stageMatrix } from '@/lib/studio/clips'
import { manifest } from '@/lib/studio/manifest'

// A tiny motion.bin: one track, three frames (turning about y by 0, 90 and 180 degrees, moving along x)
const motionOf = (frames, { loop = false } = {}) => {
  const buffer = new ArrayBuffer(frames.length * 14)
  const view = new DataView(buffer)
  frames.forEach(({ q, t }, i) => {
    q.forEach((c, k) => view.setInt16(i * 14 + k * 2, Math.round(c * 32767), true))
    t.forEach((c, k) => view.setInt16(i * 14 + 8 + k * 2, Math.round(c * 4000), true))
  })
  const index = { stride: 14, translationUnit: 4000, stage: [0, 0, 0], clips: { turn: { offset: 0, frames: frames.length, duration: 2, loop, speed: 0, tracks: ['spine'] } } }
  return decodeMotion(buffer, index)
}
const yaw = (deg) => new Quaternion().setFromAxisAngle(new Vector3(0, 1, 0), (deg * Math.PI) / 180).toArray()
const FRAMES = [
  { q: yaw(0), t: [0, 0, 0] },
  { q: yaw(90), t: [1, 0, 0] },
  { q: yaw(180), t: [2, 0, 0] },
]
const sampled = (motion, time) => sampleClip(motion.clips.turn, time, [new Matrix4()])[0]
const parts = (m) => {
  const p = new Vector3()
  const q = new Quaternion()
  m.decompose(p, q, new Vector3())
  return { p, q }
}

describe('motion clips', () => {
  it('decodes each frame back to its rotation and translation', () => {
    const { p, q } = parts(sampled(motionOf(FRAMES), 1))
    expect(p.x).toBeCloseTo(1, 5)
    expect(q.angleTo(new Quaternion(...yaw(90)))).toBeLessThan(1e-3)
  })

  it('curves smoothly between frames, through every frame', () => {
    // four evenly spaced frames (0, 30, 60, 90 degrees; 0..3 m): halfway through the middle pair is exactly halfway
    const even = motionOf([0, 1, 2, 3].map((k) => ({ q: yaw(30 * k), t: [k, 0, 0] })))
    even.clips.turn.duration = 3
    const { p, q } = parts(sampleClip(even.clips.turn, 1.5, [new Matrix4()])[0])
    expect(p.x).toBeCloseTo(1.5, 3)
    expect(q.angleTo(new Quaternion(...yaw(45)))).toBeLessThan(0.01)
  })

  it('holds the last frame of a one-off clip, and wraps a looping one', () => {
    expect(parts(sampled(motionOf(FRAMES), 5)).p.x).toBeCloseTo(2, 5)
    expect(parts(sampled(motionOf(FRAMES, { loop: true }), 2.5)).p.x).toBeCloseTo(0.5, 5)
  })

  it('moves the whole pose to where he is and turns it there', () => {
    const stage = stageMatrix([1, 0, 1], { at: [3, 0, 0], yaw: Math.PI / 2 })
    expect(new Vector3(1, 0, 1).applyMatrix4(stage).toArray().map((v) => +v.toFixed(6) + 0)).toEqual([3, 0, 0])
    expect(new Vector3(1, 0, 0).applyMatrix4(stage).toArray().map((v) => +v.toFixed(6) + 0)).toEqual([2, 0, 0]) // (0, 0, -1) from the stage, a quarter turn on
  })

  it('ships the walk, on the spot with its own speed, standing under his seat', () => {
    expect(manifest.motion.clips.walk).toMatchObject({ loop: true })
    expect(manifest.motion.clips.walk.speed).toBeGreaterThan(0.8)
    expect(manifest.motion.clips.walk.speed).toBeLessThan(1.8)
    expect(manifest.motion.clips.walk.tracks).toContain('thigh_L')
    expect(manifest.motion.clips.walk.tracks).not.toContain('chair')
    expect(manifest.motion.clips.walk.tracks).not.toContain('index_L_a') // his own fingers, except where he plays
    expect(manifest.motion.clips.guitar.tracks).toContain('index_L_a')
  })
})

describe('how he types: the typing clip on his own hips', async () => {
  const { readFileSync } = await import('node:fs')
  const { createClipMixer, createSeatedClip, createTypingClip } = await import('@/lib/studio/clips')
  const { createFigurePoser, createMouseProp, mouseReachOf } = await import('@/lib/studio/figurePose')
  const { createFigureRig } = await import('@/components/studio/figureRig')
  const { createTypingTimeline } = await import('@/lib/studio/typing')
  const { roomFragment } = await import('@/components/studio/shaders/room.glsl')
  const { lineStarts, normaliseSource } = await import('@/lib/studio/code')
  const file = readFileSync('public/studio/v1/motion.bin')
  const motion = decodeMotion(file.buffer.slice(file.byteOffset, file.byteOffset + file.byteLength), manifest.motion)
  const code = normaliseSource(roomFragment)
  const timeline = createTypingTimeline(code, { startAt: lineStarts(code)[12] })
  const bones = manifest.figure.bones
  const indexOf = (name) => bones.findIndex((b) => b.name === name)
  const poser = createFigurePoser({ ...manifest.figure, motion: manifest.motion })
  const mouseReach = mouseReachOf(manifest.figure)
  const mouseWrist = new Vector3(...mouseReach.wrist)
  const typing = createTypingClip(motion.clips.typing, bones, mouseReach)
  const seatedClips = { typeToSit: createSeatedClip(motion.clips.typeToSit, bones, typing.lift), sitToType: createSeatedClip(motion.clips.sitToType, bones, typing.lift) }
  const mix = createClipMixer()
  const pointOf = (rig, name, offset = [0, 0, 0]) => new Vector3(...bones[indexOf(name)].pivot).add(new Vector3(...offset)).applyMatrix4(rig.matrices[indexOf(name)])
  /** His pose at t, as the scene builds it (clip off: the coded typing alone); `block` puts him in an activity. */
  const posedAt = (rig, t, withClip = true, block = null) => {
    const { angles, reach, root, extras } = poser(timeline.at(t), t, block)
    const clip = withClip ? typing.pose(extras.typing) : null
    const s = extras.seated
    const seated = withClip && s ? seatedClips[s.name].pose(s.time, s.weight, s.weight, s.lift, [s.breath, 0, 0]) : null
    rig.pose(angles, reach, root, mix(clip, seated))
    return extras
  }
  const autocorrelation = (series, lag) => {
    const mean = series.reduce((a, b) => a + b) / series.length
    const c = series.map((v) => v - mean)
    const power = c.reduce((sum, v) => sum + v * v, 0)
    let sum = 0
    for (let i = 0; i + lag < c.length; i++) sum += c[i] * c[i + lag]
    return (sum / power) * (c.length / (c.length - lag))
  }

  it('moves his whole upper body like the clip: his head travels much more than the coded typing did', () => {
    const spread = (withClip) => {
      const rig = createFigureRig(bones)
      const tops = []
      for (let t = 0; t < 60; t += 0.1) {
        posedAt(rig, t, withClip)
        tops.push(pointOf(rig, 'head', [0, 0.2, 0]))
      }
      const mean = tops.reduce((a, b) => a.add(b.clone()), new Vector3()).divideScalar(tops.length)
      return Math.sqrt(tops.reduce((sum, p) => sum + p.distanceToSquared(mean), 0) / tops.length)
    }
    expect(spread(true)).toBeGreaterThan(spread(false) * 1.5)
  })

  it("keeps his hands on the room's keyboard: lifted onto it, roaming the keys like the clip's", () => {
    const rig = createFigureRig(bones)
    for (const side of ['L', 'R']) {
      const home = new Vector3(...bones[indexOf(`hand_${side}`)].pivot)
      let sum = new Vector3()
      let far = 0
      let n = 0
      for (let t = 0; t < 60; t += 0.25) {
        const { typing: share } = posedAt(rig, t)
        if (share.weight < 0.999) continue // typing, not sitting back
        const wrist = pointOf(rig, `hand_${side}`)
        if (wrist.distanceTo(mouseWrist) < 0.25) continue // on, or on the way to, the mouse
        sum = sum.add(wrist)
        far = Math.max(far, wrist.distanceTo(home))
        n++
      }
      expect(sum.divideScalar(n).distanceTo(home)).toBeLessThan(0.04)
      expect(far).toBeLessThan(0.12)
    }
  })

  it('never moves a wrist faster than a natural arm, typing and pausing, for three minutes', () => {
    const rig = createFigureRig(bones)
    posedAt(rig, 0)
    let previous = ['L', 'R'].map((s) => pointOf(rig, `hand_${s}`))
    const limit = [0.01, 0.016] // m per 10 ms: unhurried, and a quick reach to the mouse (right hand)
    for (let t = 0.01; t < 180; t += 0.01) {
      posedAt(rig, t)
      const now = ['L', 'R'].map((s) => pointOf(rig, `hand_${s}`))
      now.forEach((p, i) => expect(p.distanceTo(previous[i])).toBeLessThan(limit[i]))
      previous = now
    }
  })

  it('puts a character on screen only while his hand is on the keys: the clip types as the keys are hit', () => {
    const rig = createFigureRig(bones)
    const home = new Vector3(...bones[indexOf('hand_R')].pivot)
    let typed = timeline.at(0).typed
    let strokes = 0
    for (let t = 0; t < 200; t += 0.02) {
      const state = timeline.at(t)
      posedAt(rig, t)
      if (state.typed === typed) continue
      typed = state.typed
      strokes++
      const clip = typing.pose(poser(state, t).extras.typing)
      expect(clip?.mouse?.share ?? 0).toBeLessThan(0.01) // the clip's hand isn't heading for its mouse
      expect(pointOf(rig, 'hand_R').distanceTo(home)).toBeLessThan(0.08) // his is at the keys
    }
    expect(strokes).toBeGreaterThan(500)
  })

  it('holds the clip still while no keys are hit, and takes the mouse only in a pause where he scrolls', () => {
    const rig = createFigureRig(bones)
    let previous = null
    let still = 0
    let closest = Infinity
    let onMouse = 0
    for (let t = 0; t < 200; t += 0.05) {
      const state = timeline.at(t)
      const extras = posedAt(rig, t)
      const clip = typing.pose(extras.typing)
      const wrist = pointOf(rig, 'hand_R')
      if (extras.typing.visit) {
        closest = Math.min(closest, wrist.distanceTo(mouseWrist))
        if (wrist.distanceTo(mouseWrist) < 0.04) onMouse++
      } else {
        expect(wrist.distanceTo(mouseWrist)).toBeGreaterThan(0.1) // no trip to the mouse while he types
      }
      const stopped = state.pause.since > 0.25 && state.pause.until > 0.05 && state.pause.length >= 0.7
      if (previous && stopped && !extras.typing.visit && clip && previous.active === state.active) {
        for (const [bone, m] of clip.relative) expect(m.equals(previous.relative.get(bone))).toBe(true)
        still++
      }
      previous = clip && { active: state.active, relative: new Map([...clip.relative].map(([b, m]) => [b, m.clone()])) }
    }
    expect(still).toBeGreaterThan(100)
    expect(closest).toBeLessThan(0.03)
    expect(onMouse).toBeGreaterThan(80) // about 6 s on the mouse in two scroll pauses, at 20 a second
  })

  it('keeps every joint on its parent, at every blend: fingers, head and spine never come off', () => {
    const rig = createFigureRig(bones)
    const gapOf = (i) => {
      const pivot = new Vector3(...bones[i].pivot)
      return pivot.clone().applyMatrix4(rig.matrices[i]).distanceTo(pivot.clone().applyMatrix4(rig.matrices[bones[i].parent]))
    }
    const him = bones.map((b, i) => i).filter((i) => bones[i].parent >= 0 && !['chair', 'swivel'].includes(bones[i].name))
    for (let t = 0; t < 120; t += 0.05) {
      posedAt(rig, t)
      for (const i of him) expect(gapOf(i)).toBeLessThan(0.0005)
    }
  })

  it('moves his fingertips and elbows smoothly: no kinks between frames, no flicks', () => {
    const rig = createFigureRig(bones)
    const track = (name) => {
      const i = indexOf(name)
      return { i, pivot: new Vector3(...bones[i].pivot), last: null, speed: null, worst: 0, all: [] }
    }
    const watched = [track('index_R_c'), track('elbow_R'), track('elbow_L')]
    for (let t = 0; t < 120; t += 1 / 60) {
      posedAt(rig, t)
      for (const w of watched) {
        const at = w.pivot.clone().applyMatrix4(rig.matrices[w.i])
        if (w.last) {
          const speed = at.clone().sub(w.last).multiplyScalar(60)
          if (w.speed) w.all.push(speed.clone().sub(w.speed).length() * 60)
          w.speed = speed
        }
        w.last = at
      }
    }
    const [tip, ...elbows] = watched.map((w) => w.all.sort((a, b) => b - a))
    expect(tip[Math.floor(tip.length * 0.01)]).toBeLessThan(20) // m/s2, the 99th percentile of a fingertip
    for (const elbow of elbows) expect(elbow[0]).toBeLessThan(25) // real mouse handling peaks near 20; a snapping elbow is 60+
  })

  it('treats the mouse as a thing: it moves with his hand while held, stays where he leaves it', () => {
    const prop = createMouseProp()
    prop.update(1, [0.01, 0, 0.005], true) // takes hold: it doesn't jump to the clip's own mouse spot
    expect(Math.hypot(...prop.at)).toBe(0)
    prop.update(1, [0.03, 0, 0.005], true) // moves it 2 cm right
    expect(prop.at[0]).toBeCloseTo(0.02, 6)
    prop.update(0.1, [0.05, 0, 0.02], true) // lets go
    const left = [...prop.at]
    prop.update(0, null)
    expect(prop.at).toEqual(left) // it stays where he left it
    expect(prop.base[0]).toBeCloseTo(left[0], 6) // and that's where his hand comes back for it
    for (let i = 0; i < 20; i++) prop.update(1, [0.5, 0, 0.5], false)
    expect(Math.hypot(prop.at[0], prop.at[2])).toBeLessThan(0.0601) // it never wanders off the mat
  })

  it('keeps his hand on the mouse while he moves it: hand and mouse together, never sliding over it', () => {
    const rig = createFigureRig(bones)
    const prop = createMouseProp()
    let gripped = 0
    for (let t = 0; t < 200; t += 0.05) { // two pauses where he scrolls
      const { angles, reach, root, extras } = poser(timeline.at(t), t)
      const clip = typing.pose(extras.typing)
      const share = clip?.mouse ? clip.mouse.share * clip.weight : 0
      const hold = extras.typing.visit ? 0 : extras.mouseHold // as the scene: the clip's visit holds the mouse
      const at = prop.update(Math.max(hold, share), share > hold ? [clip.mouse.play.x, 0, clip.mouse.play.z] : null, share > hold)
      const spot = new Vector3(mouseReach.wrist[0] + at[0], mouseReach.wrist[1], mouseReach.wrist[2] + at[2])
      rig.pose(angles, reach, root, clip ? { ...clip, mouse: clip.mouse && { ...clip.mouse, wrist: spot } } : null)
      if (share > 0.95) {
        expect(pointOf(rig, 'hand_R').distanceTo(spot)).toBeLessThan(0.02) // his hand is on the mouse where it is
        gripped++
      }
    }
    expect(gripped).toBeGreaterThan(100)
  })

  it('takes a break smoothly: into his lap and back, joints on, wrists unhurried, back on the keys after', () => {
    const rig = createFigureRig(bones)
    const length = 40
    let previous = null
    for (let into = 0; into <= length + 2; into += 0.01) {
      const block = into <= length ? { activity: 'break', into, left: length - into, index: 0 } : null
      posedAt(rig, 100 + into, true, block)
      const wrists = ['L', 'R'].map((side) => pointOf(rig, `hand_${side}`))
      if (previous) wrists.forEach((p, i) => expect(p.distanceTo(previous[i])).toBeLessThan(i ? 0.016 : 0.012)) // the mocap's own pace
      previous = wrists
      for (const name of ['index_L_a', 'head', 'spine']) {
        const i = indexOf(name)
        const pivot = new Vector3(...bones[i].pivot)
        expect(pivot.clone().applyMatrix4(rig.matrices[i]).distanceTo(pivot.clone().applyMatrix4(rig.matrices[bones[i].parent]))).toBeLessThan(0.0005)
      }
    }
    posedAt(rig, 100 + length + 3)
    for (const side of ['L', 'R']) expect(pointOf(rig, `hand_${side}`).distanceTo(new Vector3(...bones[indexOf(`hand_${side}`)].pivot))).toBeLessThan(0.1)
  })

  it('never falls into the clip’s own 16 s loop: no rhythm in his head over two minutes', () => {
    const rig = createFigureRig(bones)
    const yaw = []
    for (let t = 0; t < 120; t += 0.05) {
      posedAt(rig, t)
      const forward = new Vector3(0, 0, -1).applyQuaternion(new Quaternion().setFromRotationMatrix(rig.matrices[indexOf('head')]))
      yaw.push(Math.atan2(forward.x, -forward.z))
    }
    for (let lag = 60; lag <= 1200; lag += 5) expect(autocorrelation(yaw, lag)).toBeLessThan(0.6)
  })
})
