// How he moves, read off the typing timeline. Typing: fingers strike, wrists stay on the keys. Short
// pauses: hands hover, fingers drum, he reads. Long pauses: he leans back, rests his forearms on the
// armrests and swivels a little. Always: breathing, the odd glance at the keys or his phone.
//
// Pure. Angles are radians [pitch about x, yaw about y] keyed by bone name (studio_figure.py); positive
// pitch lifts a finger or leans him back. Arms are given as reach goals in three.js world space
// (wrist target, elbow pole, palm [pitch, yaw]); components/studio/figureRig.js solves them.
import { FINGERS, HANDS } from './typing'

export const POSE = Object.freeze({
  fingerLift: Object.freeze([0.3, 0.22]), // knuckle and middle joint at the top of a stroke
  thumbLift: Object.freeze([0.2, 0.14]),
  handLift: 0.04, // the hand rises a little while one of its fingers is up
  hoverLift: 0.012, // m the hands rise off the keys in a short pause
  drum: 0.4, // finger taps while hovering
  drumRate: 6,
  shortPause: 0.7, // s: hover from here...
  longPause: 2.5, // ...and lean back from here
  hoverEase: 0.25, // s to settle into and out of a pause
  leanEase: 1.2, // an unhurried move back onto the armrests
  lean: 0.16, // rad back (about 9 degrees)
  swivel: 0.05, // rad either way (about 3 degrees)
  swivelRate: 0.11, // Hz
  breath: 0.008,
  breathRate: 0.25, // 15 breaths a minute
  headNod: 0.025,
  headTurn: 0.04,
  readUp: 0.05, // the head lifts to read the screen when he stops typing
  glanceDown: 0.14,
  armrestPole: Object.freeze([0.6, -1, 0.5]), // elbows out, down and back when the forearms rest
})

const smooth = (x) => {
  const t = Math.min(1, Math.max(0, x))
  return t * t * (3 - 2 * t)
}
const mix = (a, b, t) => a.map((v, i) => v + (b[i] - v) * t)
const sub = (a, b) => a.map((v, i) => v - b[i])
const rotateAboutY = (point, pivot, angle) => {
  const [x, y, z] = sub(point, pivot)
  const c = Math.cos(angle)
  const s = Math.sin(angle)
  return [pivot[0] + c * x + s * z, pivot[1] + y, pivot[2] - s * x + c * z]
}

/** 0..1: how settled into a pause he is, easing in after it starts and out before the next keystroke. */
export const settle = ({ since, until }, ease) => Math.min(smooth(since / ease), smooth(until / ease))

const fingerAngles = (pose, strokes, hover, since) => {
  HANDS.forEach((hand, h) => {
    let raised = 0
    FINGERS.forEach((finger, f) => {
      const drumming = finger === 'thumb' ? 0 : hover * POSE.drum * Math.max(0, Math.sin(2 * Math.PI * POSE.drumRate * since - f * 1.3 - h * 2))
      const stroke = Math.max(strokes[h * FINGERS.length + f], drumming)
      const [knuckle, middle] = finger === 'thumb' ? POSE.thumbLift : POSE.fingerLift
      pose[`${finger}_${hand}_a`] = [knuckle * stroke, 0]
      pose[`${finger}_${hand}_b`] = [middle * stroke, 0]
      raised = Math.max(raised, strokes[h * FINGERS.length + f])
    })
    pose[`hand_${hand}`] = [POSE.handLift * raised, 0]
  })
}

/**
 * @param {{ bones: Array<{ name: string, pivot: number[] }>, rests?: { L: number[], R: number[] }, phone?: number[] }} figure
 */
export const createFigurePoser = ({ bones, rests, phone }) => {
  const pivot = Object.fromEntries(bones.map((b) => [b.name, b.pivot]))
  const canReach = HANDS.every((s) => pivot[`shoulder_${s}`] && pivot[`elbow_${s}`] && pivot[`hand_${s}`])
  const restPole = Object.fromEntries(
    HANDS.map((s) => [s, canReach ? sub(pivot[`elbow_${s}`], mix(pivot[`shoulder_${s}`], pivot[`hand_${s}`], 0.5)) : [0, -1, 0]]),
  )
  const toPhone = phone && pivot.head ? sub(phone, pivot.head) : null
  const phoneYaw = toPhone ? Math.atan2(-toPhone[0], -toPhone[2]) : 0
  const phonePitch = toPhone ? Math.atan2(toPhone[1], Math.hypot(toPhone[0], toPhone[2])) : 0

  return (state, time) => {
    const { pause, glance } = state
    const think = pause.length >= POSE.longPause ? settle(pause, POSE.leanEase) : 0
    const hover = pause.length >= POSE.shortPause && pause.length < POSE.longPause ? settle(pause, POSE.hoverEase) : 0
    const breath = POSE.breath * Math.sin(2 * Math.PI * POSE.breathRate * time)
    const swivel = POSE.swivel * think * Math.sin(2 * Math.PI * POSE.swivelRate * pause.since)
    const looking = glance ? glance.amount * (1 - think) : 0
    const angles = {
      swivel: [0, swivel],
      spine: [POSE.lean * think + breath, 0],
      head: [
        -POSE.headNod * (0.5 + 0.5 * Math.sin(time * 0.43)) - 0.6 * POSE.lean * think - 0.7 * breath +
          POSE.readUp * Math.max(hover, think) +
          looking * (glance?.kind === 'keys' ? -POSE.glanceDown : phonePitch),
        POSE.headTurn * Math.sin(time * 0.31 + 1.2) - 0.7 * swivel + (glance?.kind === 'phone' ? looking * phoneYaw : 0),
      ],
    }
    fingerAngles(angles, state.strokes, hover, pause.since)
    if (!canReach) return { angles, reach: null }

    const reach = {}
    for (const side of HANDS) {
      const atKeys = mix(pivot[`hand_${side}`], [pivot[`hand_${side}`][0], pivot[`hand_${side}`][1] + POSE.hoverLift, pivot[`hand_${side}`][2]], hover)
      const onArmrest = rests ? rotateAboutY(rests[side], pivot.swivel, swivel) : atKeys
      const outward = side === 'L' ? -1 : 1
      const armrestPole = [POSE.armrestPole[0] * outward, POSE.armrestPole[1], POSE.armrestPole[2]]
      reach[side] = {
        target: mix(atKeys, onArmrest, rests ? think : 0),
        pole: mix(restPole[side], armrestPole, think),
        palm: [angles[`hand_${side}`][0] * (1 - think), swivel * think],
      }
    }
    return { angles, reach }
  }
}
