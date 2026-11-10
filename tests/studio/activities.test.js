import { describe, expect, it } from 'vitest'
import { Vector3 } from 'three'
import { createFigureRig } from '@/components/studio/figureRig'
import { roomFragment } from '@/components/studio/shaders/room.glsl'
import { MOVES, SCREEN, activityPose } from '@/lib/studio/activities'
import { lineStarts, normaliseSource } from '@/lib/studio/code'
import { createFigurePoser } from '@/lib/studio/figurePose'
import { manifest } from '@/lib/studio/manifest'
import { ACTIVITY } from '@/lib/studio/moods'
import { HANDS, createTypingTimeline } from '@/lib/studio/typing'

// The real room: his skeleton, desk, synths and mouse from the manifest, his typing from the reference session
const code = normaliseSource(roomFragment)
const timeline = createTypingTimeline(code, { startAt: lineStarts(code)[12] })
const poser = createFigurePoser({ ...manifest.figure, motion: manifest.motion })
const bones = manifest.figure.bones
const LENGTH = 120
const block = (activity, into) => ({ activity, into, left: LENGTH - into, index: 0 })
const posedAt = (activity, into) => poser(timeline.at(5), 5 + into, block(activity, into))
const pointOf = (rig, name, offset = [0, 0, 0]) =>
  new Vector3(...bones.find((b) => b.name === name).pivot).add(new Vector3(...offset)).applyMatrix4(rig.matrices[bones.findIndex((b) => b.name === name)])
const distance = (a, b) => Math.hypot(...a.map((v, i) => v - b[i]))

describe('what he does away from the code', () => {
  it('leaves typing alone: no block, no change', () => {
    const plain = poser(timeline.at(5), 5)
    expect(poser(timeline.at(5), 5, block(ACTIVITY.CODE, 3))).toEqual(plain)
    expect(plain.root).toBeNull()
  })

  for (const activity of [ACTIVITY.BEAT, ACTIVITY.GAME, ACTIVITY.BREAK]) {
    it(`never moves a wrist faster than an unhurried arm, in and out of ${activity}`, () => {
      for (const window of [[0, 12], [LENGTH - 10, LENGTH]]) {
        let previous = posedAt(activity, window[0]).reach
        for (let into = window[0] + 0.01; into <= window[1]; into += 0.01) {
          const { reach } = posedAt(activity, into)
          for (const side of HANDS) expect(distance(reach[side].target, previous[side].target)).toBeLessThan(0.01)
          previous = reach
        }
      }
    })

    it(`starts and ends ${activity} exactly where typing has him`, () => {
      for (const into of [0, LENGTH]) {
        const { reach, root } = posedAt(activity, into)
        const plain = poser(timeline.at(5), 5 + into).reach
        for (const side of HANDS) expect(distance(reach[side].target, plain[side].target)).toBeLessThan(1e-3)
        if (root) expect(Math.hypot(...root.offset) + Math.abs(root.yaw)).toBeLessThan(1e-3)
      }
    })
  }

  it('rolls the chair over to the synths, turned to face them, and plays Synth A', () => {
    const rig = createFigureRig(bones)
    const { angles, reach, root, extras } = posedAt(ACTIVITY.BEAT, 30)
    rig.pose(angles, reach, root)
    const { seat, keys } = manifest.figure.synth
    const axis = pointOf(rig, 'swivel')
    expect(Math.hypot(axis.x - seat[0], axis.z - seat[2])).toBeLessThan(0.01)
    expect(extras.away).toBeCloseTo(1, 6)
    for (const side of HANDS) {
      const wrist = pointOf(rig, `hand_${side}`)
      expect(wrist.distanceTo(new Vector3(...reach[side].target))).toBeLessThan(0.015)
      expect(Math.abs(wrist.x - (keys[0][0] + MOVES[ACTIVITY.BEAT].wristBack))).toBeLessThan(0.015) // just in front of the keys
    }
    expect(extras.phones).toBe(1)
    expect(extras.screen.mode).toBe(SCREEN.DAW)
  })

  it('takes a break with the mocap: hands off the keys into his lap, sitting back, then back to typing', () => {
    const { typeToSit, sitToType } = manifest.motion.clips
    const leaving = posedAt(ACTIVITY.BREAK, 0.3).extras
    expect(leaving.seated).toMatchObject({ name: 'typeToSit' })
    expect(leaving.seated.time).toBeCloseTo(0.3, 6)
    const resting = posedAt(ACTIVITY.BREAK, 40).extras
    expect(resting.seated).toMatchObject({ name: 'typeToSit', lift: 0, weight: 1 })
    expect(resting.seated.time).toBeCloseTo(typeToSit.duration, 6) // its last frame, held
    expect(resting.typing.weight).toBe(0) // the typing clip is off while he sits back
    expect(resting.screen).toEqual({ mode: SCREEN.SLEEP, level: 0 })
    const returning = posedAt(ACTIVITY.BREAK, LENGTH - 0.5).extras
    expect(returning.seated.name).toBe('sitToType')
    expect(returning.seated.time).toBeCloseTo(sitToType.duration - 0.5, 6)
  })

  it('plays the game with his left hand on W A S D and his right on the mouse', () => {
    const { reach, extras } = posedAt(ACTIVITY.GAME, 20)
    const home = bones.find((b) => b.name === 'hand_L').pivot
    expect(reach.L.target[0] - home[0]).toBeCloseTo(MOVES[ACTIVITY.GAME].wasd[0] * manifest.figure.keyPitch[0], 3)
    const [mx, , mz] = manifest.figure.mouse
    expect(Math.hypot(reach.R.target[0] - mx, reach.R.target[2] - mz)).toBeLessThan(0.1)
    expect(extras.screen.mode).toBe(SCREEN.GAME)
  })

  it('has nothing to do without the room (no arms, or no synths for a beat)', () => {
    expect(activityPose(block(ACTIVITY.BREAK, 3), null, 0)).toBeNull()
    const noClips = createFigurePoser({ ...manifest.figure })
    expect(noClips(timeline.at(5), 5, block(ACTIVITY.BREAK, 30)).extras.seated).toBeNull() // without the clips he types on
    const noSynth = createFigurePoser({ ...manifest.figure, synth: null })
    expect(noSynth(timeline.at(5), 5, block(ACTIVITY.BEAT, 30)).root).toBeNull()
  })
})
