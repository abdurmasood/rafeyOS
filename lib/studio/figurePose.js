// How he moves, read off the typing timeline. He's about 60 px tall at a normal window size, so moves are
// fewer, bigger and clearer than life, and nothing runs on a fixed timer.
// Typing: fingers press keys down and reach for them while the hands drift slowly over the keyboard, and he
// leans in when he's typing fast. Short pauses: hands hover and fingers tap now and then. Long pauses: one of
// a few ways of sitting back (picked per pause), one of them with his hand on the mouse for a while. Always:
// uneven breathing with the odd sigh, a drifting head, and glances that his shoulders follow a beat late.
//
// Pure and deterministic for a given (state, time, seed). Angles are radians [pitch about x, yaw about y,
// roll about z] keyed by bone name (studio_figure.py); positive pitch lifts a finger or leans him back. Arms
// are reach goals in three.js world space (wrist target, elbow pole, palm [pitch, yaw]); figureRig.js solves them.
import { activityFacts, activityPose, screenFor } from './activities'
import { FINGERS, HANDS, overshootEase } from './typing'
import { fbm, hash } from './wind'

export const POSE = Object.freeze({
  fingerPress: Object.freeze([0.12, 0.1]), // rad the knuckle and middle joint bend to press a key down
  thumbPress: Object.freeze([0.1, 0.08]),
  fingerRow: Object.freeze([0.25, 0.3]), // rad per row still to reach: straighten for keys further away, curl for nearer
  fingerColumn: 0.45, // rad the knuckle turns per key across still to reach
  fingerReach: 1.2, // key widths a finger covers on its own; the hand's drift does the rest
  tipFollows: 0.7, // share of the middle joint's bend the fingertip joint takes, as real fingers do
  keyPitch: Object.freeze([0.019, 0.019]), // m between key centres [across, rows], unless the manifest has the room's
  hoverLift: 0.012, // m the hands rise off the keys in a short pause
  drum: 0.4, // finger taps while hovering...
  drumSlot: 0.16, // ...each taking this long...
  drumChance: 0.6, // ...in this share of hovers...
  tapChance: 0.5, // ...and this share of slots
  shortPause: 0.7, // s: hover from here...
  longPause: 2.5, // ...and sit back from here
  hoverEase: 0.25, // s to settle into and out of a hover
  leanEase: 1.2, // an unhurried move back onto the armrests
  leanOvershoot: 0.06, // the flop back into the chair: this far past, then settling
  leanIn: 0.07, // rad forward when he's typing fast
  swivelMove: 0.9, // s per turn of the chair...
  swivelHold: Object.freeze([2.5, 4]), // ...and between turns...
  swivelOvershoot: 0.03, // ...each going a little past and settling
  breath: 0.01,
  breathRate: 0.25, // about 15 breaths a minute...
  breathDrift: 2.5, // ...wandering by this much phase, so the rhythm is never exact
  sigh: 2.2, // a deeper breath...
  sighEvery: 42, // ...about this often (s)...
  sighLength: 3.5, // ...taking this long
  headNod: 0.035,
  headTurn: 0.07,
  readUp: 0.05, // the head lifts to read the screen in a short pause
  glanceDown: 0.16,
  glanceBody: 0.3, // share of a glance his shoulders take
  armrestPole: Object.freeze([0.6, -1, 0.5]), // elbows out, down and back when the forearms rest
  scrollMinPause: 3.5, // s: he only takes the mouse when he'll keep it a while (a move each way takes 1.2 s)
  mouseUp: 0.025, // the wrist sits this far above the top of the mouse, so the palm rests on its hump...
  mouseBack: 0.075, // ...and this far toward him from its centre, palm over its back half
  mouseFingers: Object.freeze([0.15, 0.45]), // knuckle and middle joint open up so the fingers drape over its front
  clickSlot: 0.4, // s per chance of a click...
  clickChance: 0.3, // ...and how often it comes
  mouseLean: Object.freeze([-0.12, 0.12, -0.12]), // forward, turned and tipped toward it, so his arm keeps a bend
  mousePole: Object.freeze([0.4, -1, 0.4]),
})

// How he types: a mocap clip of someone typing, its whole upper body on his own hips (clips.createTypingClip),
// moving only as keys are hit (the timeline's active time), faded out for long pauses and activities and, for his
// head, while he glances. In a pause where he takes the mouse, the clip's own trip to its mouse plays instead.
const VISIT_EASE = 0.4 // s a mouse visit takes over from the typing, and hands back

// The ways he sits through a long pause; hands say where each wrist goes
export const LONG_PAUSES = Object.freeze({
  sitBack: Object.freeze({ weight: 0.35, lean: 0.16, head: 0.05, swivel: 0.105, hands: { L: 'armrest', R: 'armrest' } }),
  slump: Object.freeze({ weight: 0.25, lean: 0.24, head: -0.08, swivel: 0.17, hands: { L: 'armrest', R: 'armrest' } }),
  scroll: Object.freeze({ weight: 0.25, lean: 0, head: 0.03, swivel: 0.035, hands: { L: 'keys', R: 'mouse' } }),
  closeRead: Object.freeze({ weight: 0.15, lean: -0.05, head: 0.02, swivel: 0, hands: { L: 'keys', R: 'keys' } }),
})
const MOUSE_HAND = 'R' // the mouse sits right of the keyboard
const HOME = Object.freeze([0, 0])

const clamp01 = (x) => Math.min(1, Math.max(0, x))
const smooth = (x) => {
  const t = clamp01(x)
  return t * t * (3 - 2 * t)
}
const mix = (a, b, t) => a.map((v, i) => v + (b[i] - v) * t)
const add = (...vectors) => vectors.reduce((sum, v) => sum.map((s, i) => s + v[i]))
const scale = (v, k) => v.map((x) => x * k)
const sub = (a, b) => a.map((v, i) => v - b[i])
const between = ([low, high], unit) => low + (high - low) * unit
const centred = (t, salt) => 2 * fbm(t, salt) - 1
const rotateAboutY = (point, pivot, angle) => {
  const [x, y, z] = sub(point, pivot)
  const c = Math.cos(angle)
  const s = Math.sin(angle)
  return [pivot[0] + c * x + s * z, pivot[1] + y, pivot[2] - s * x + c * z]
}

const saltFor = (seed) => ((seed >>> 0) % 100003) * 0.37
/** A repeatable number in [0, 1) for the n-th thing of kind k in this session. */
const randomFor = (seed) => {
  const salt = saltFor(seed)
  return (n, k) => hash(n * 1.618 + k * 31.7 + salt)
}

/** 0..1: how settled into a pause he is, easing in after it starts and out before the next keystroke. */
export const settle = ({ since, until }, ease) => Math.min(smooth(since / ease), smooth(until / ease))

/** Like settle, but he flops into the chair (a little overshoot) and comes forward again a bit quicker. */
const flop = ({ since, until }, ease) => Math.min(overshootEase(since / ease, POSE.leanOvershoot), smooth(until / (0.7 * ease)))

/** How he sits through the long pause with this index: weighted, and the same for a given session. */
export const longPauseFor = (index, seed = 7, canScroll = true) => {
  let u = randomFor(seed)(index, 1)
  for (const [name, way] of Object.entries(LONG_PAUSES)) {
    u -= way.weight
    if (u < 0) return name === 'scroll' && !canScroll ? 'sitBack' : name
  }
  return 'sitBack'
}

/** What kind of pause this is and how far into it he is. */
const envelopes = (pause, seed, hasMouse) => {
  const long = pause.length >= POSE.longPause
  const short = !long && pause.length >= POSE.shortPause
  const name = long ? longPauseFor(pause.index ?? 0, seed, hasMouse && pause.length >= POSE.scrollMinPause) : null
  const way = name ? LONG_PAUSES[name] : null
  const think = long ? settle(pause, POSE.leanEase) : 0
  return {
    name,
    way,
    think,
    lean: long ? flop(pause, POSE.leanEase) : 0,
    hover: short ? settle(pause, POSE.hoverEase) : 0,
    onMouse: way?.hands[MOUSE_HAND] === 'mouse' ? think : 0,
  }
}

/** Breathing: uneven rate and depth, and now and then a sigh. */
const breathAt = (time, random, salt) => {
  const window = Math.floor(time / POSE.sighEvery)
  const sighAt = (window + 0.15 + 0.7 * random(window, 4)) * POSE.sighEvery // well inside its window
  const x = (time - sighAt) / POSE.sighLength + 0.5
  const sigh = x > 0 && x < 1 ? Math.sin(Math.PI * x) ** 2 : 0
  const phase = 2 * Math.PI * POSE.breathRate * time + POSE.breathDrift * centred(time * 0.05, salt)
  const depth = POSE.breath * (0.8 + 0.4 * fbm(time * 0.1, salt + 3)) * (1 + (POSE.sigh - 1) * sigh)
  return { breath: depth * Math.sin(phase), sigh }
}

/** The chair turns a few times through a long pause, each turn settling, then comes back square. */
const swivelAt = (pause, amplitude, random) => {
  if (!amplitude) return 0
  const index = pause.index ?? 0
  const hold = between(POSE.swivelHold, random(index, 3))
  const step = Math.floor(pause.since / hold)
  const target = (j) => (j === 0 ? 0 : amplitude * (2 * random(index * 13 + j, 5) - 1))
  const turn = overshootEase((pause.since - step * hold) / POSE.swivelMove, POSE.swivelOvershoot)
  return target(step) + (target(step + 1) - target(step)) * turn
}

/** While hovering he taps a finger now and then: which one, and how far up, or null. */
const tapAt = (pause, random) => {
  const index = pause.index ?? 0
  if (random(index, 20) > POSE.drumChance) return null
  const slot = Math.floor(pause.since / POSE.drumSlot)
  const n = index * 977 + slot
  if (random(n, 21) > POSE.tapChance) return null
  return { finger: Math.floor(random(n, 22) * 8), amount: Math.sin(Math.PI * (pause.since / POSE.drumSlot - slot)) }
}

/** On the mouse his index finger clicks now and then: how far down it is, 0..1. */
const clickAt = (pause, random) => {
  const slot = Math.floor(pause.since / POSE.clickSlot)
  if (random((pause.index ?? 0) * 613 + slot, 30) > POSE.clickChance) return 0
  return Math.sin(Math.PI * (pause.since / POSE.clickSlot - slot)) ** 2
}

const clampReach = (keys) => Math.min(POSE.fingerReach, Math.max(-POSE.fingerReach, keys))

/** Fingers: pressed down by keystrokes (or taps, or clicks), turned and stretched toward their keys, flat on the mouse. */
const fingerAngles = (pose, state, env, { tap, click }) => {
  const { strokes, aims } = state
  HANDS.forEach((hand, h) => {
    const onMouse = hand === MOUSE_HAND ? env.onMouse : 0
    FINGERS.forEach((finger, f) => {
      const slot = h * FINGERS.length + f
      const thumb = finger === 'thumb'
      const tapping = tap && !thumb && tap.finger === h * 4 + f ? env.hover * POSE.drum * tap.amount : 0
      const press = tapping > strokes[slot] ? tapping : strokes[slot] // keeps the small lift after a keystroke
      const across = aims ? clampReach(aims[2 * slot]) : 0
      const toward = aims ? clampReach(aims[2 * slot + 1]) : 0
      const [pressKnuckle, pressMiddle] = thumb ? POSE.thumbPress : POSE.fingerPress
      const [rowKnuckle, rowMiddle] = POSE.fingerRow
      const flat = thumb ? 0 : onMouse
      const clicking = finger === 'index' ? onMouse * click : 0
      pose[`${finger}_${hand}_a`] = [
        (-pressKnuckle * press - rowKnuckle * toward) * (1 - flat) + POSE.mouseFingers[0] * flat - pressKnuckle * clicking,
        thumb ? 0 : -POSE.fingerColumn * across * (1 - flat),
      ]
      const middle = (-pressMiddle * press - rowMiddle * toward) * (1 - flat) + POSE.mouseFingers[1] * flat
      pose[`${finger}_${hand}_b`] = [middle, 0]
      pose[`${finger}_${hand}_c`] = [middle * POSE.tipFollows, 0] // the last joint bends with the middle one
    })
    pose[`hand_${hand}`] = [0, 0] // the hand stays level: keystrokes are the fingers' work
  })
}

/** An activity's own finger presses (playing keys, holding W), on top of what the typing left. */
const pressFingers = (pose, presses) => {
  for (const [key, press] of Object.entries(presses)) {
    const [finger, hand] = key.split('_')
    const [knuckle, middle] = finger === 'thumb' ? POSE.thumbPress : POSE.fingerPress
    const a = pose[`${finger}_${hand}_a`]
    const b = pose[`${finger}_${hand}_b`]
    pose[`${finger}_${hand}_a`] = [a[0] - knuckle * press, a[1]]
    pose[`${finger}_${hand}_b`] = [b[0] - middle * press, b[1]]
    pose[`${finger}_${hand}_c`] = [(b[0] - middle * press) * POSE.tipFollows, 0]
  }
}

/** While an activity holds his body (`hold` 0..1), the typing's own posture, glances and strokes fade out. */
const quieted = (state, env, hold) => {
  if (!hold) return { state, env }
  const keep = 1 - hold
  const glance = state.glance && { ...state.glance, amount: state.glance.amount * keep, trail: (state.glance.trail ?? state.glance.amount) * keep }
  return {
    state: { ...state, glance, pace: (state.pace ?? 0) * keep, strokes: state.strokes.map((v) => v * keep) },
    env: { ...env, think: env.think * keep, lean: env.lean * keep, hover: env.hover * keep, onMouse: env.onMouse * keep },
  }
}

/** Blends each wrist goal toward the activity's, by that hand's weight. */
const blendReach = (reach, hands) => {
  if (!reach || !hands) return reach
  for (const side of HANDS) {
    const theirs = hands[side]
    if (!theirs?.weight) continue
    const ours = reach[side]
    reach[side] = {
      target: mix(ours.target, theirs.target, theirs.weight),
      pole: mix(ours.pole, theirs.pole, theirs.weight),
      palm: mix(ours.palm, theirs.palm, theirs.weight),
    }
  }
  return reach
}

/** Swivel, spine and head: the pause's posture, the mouse reach, leaning in, glances, breath and drift. */
const bodyAngles = (state, time, env, look) => {
  const { glance, pause } = state
  const { breath, sigh } = breathAt(time, look.random, look.salt)
  const way = env.way
  const swivel = way ? swivelAt(pause, way.swivel, look.random) * env.think : 0
  const [mousePitch, mouseYaw, mouseRoll] = POSE.mouseLean.map((a) => a * env.onMouse)
  const fast = smooth(((state.pace ?? 0) - 0.55) / 0.45) * (1 - env.think)
  const lean = (way ? way.lean * env.lean : 0) - POSE.leanIn * fast + mousePitch
  const looking = glance ? glance.amount * (1 - env.think) : 0
  const trailing = glance ? (glance.trail ?? glance.amount) * (1 - env.think) * POSE.glanceBody : 0
  const onPhone = glance?.kind === 'phone'
  const bodyYaw = onPhone ? trailing * look.phoneYaw : 0
  const bodyPitch = glance && !onPhone ? -trailing * POSE.glanceDown : 0
  const headAim = glance ? (onPhone ? looking * look.phonePitch : -looking * POSE.glanceDown) - bodyPitch : 0
  return {
    swivel: [0, swivel],
    spine: [lean + breath + bodyPitch, bodyYaw + mouseYaw, mouseRoll],
    head: [
      POSE.headNod * centred(time * 0.13, look.salt + 7) + 0.04 * sigh - 0.6 * lean - 0.7 * breath +
        POSE.readUp * env.hover + (way ? way.head * env.think : 0) + headAim,
      POSE.headTurn * centred(time * 0.09, look.salt + 5) - 0.7 * swivel - mouseYaw + (onPhone ? looking * look.phoneYaw - bodyYaw : 0),
      -0.8 * mouseRoll, // keep his head upright as he tips toward the mouse
    ],
  }
}

/** Wrist goals: on the keys (following them), on the armrests, or on the mouse. */
const reachGoals = (state, env, angles, ctx) => {
  const reach = {}
  const swivel = angles.swivel[1]
  for (const side of HANDS) {
    const [across, toward] = state.hands?.[side] ?? HOME
    const keys = add(
      ctx.pivot[`hand_${side}`],
      scale(ctx.lateral, across * ctx.keyPitch[0]),
      scale(ctx.toward, toward * ctx.keyPitch[1]),
      [0, POSE.hoverLift * env.hover, 0],
    )
    const role = env.way?.hands[side] ?? 'keys'
    const onArmrest = role === 'armrest' && ctx.rests ? env.think : 0
    const onMouse = ctx.mouseWrist && role === 'mouse' ? env.think : 0
    const armrest = ctx.rests ? rotateAboutY(ctx.rests[side], ctx.pivot.swivel, swivel) : keys
    const outward = side === 'L' ? -1 : 1
    const out = ([x, y, z]) => [x * outward, y, z]
    reach[side] = {
      target: mix(mix(keys, armrest, onArmrest), ctx.mouseWrist ?? keys, onMouse),
      pole: mix(mix(ctx.restPole[side], out(POSE.armrestPole), onArmrest), out(POSE.mousePole), onMouse),
      palm: [0, swivel * onArmrest],
    }
  }
  return reach
}

/** Across the keyboard (his left to right) and toward him, flat, from where his wrists rest. */
const keyboardAxes = (left, right) => {
  const dx = right[0] - left[0]
  const dz = right[2] - left[2]
  const length = Math.hypot(dx, dz) || 1
  const lateral = [dx / length, 0, dz / length]
  return { lateral, toward: [-lateral[2], 0, lateral[0]] }
}

/**
 * @param {{ bones: Array<{ name: string, pivot: number[] }>, rests?: { L: number[], R: number[] },
 *   phone?: number[], mouse?: number[], keyPitch?: number[], seed?: number, desk?: object, synth?: object }} figure
 *   mouse: the top of the mouse (three.js); keyPitch: m between key centres on the room's keyboard [across, rows];
 *   desk / synth: where the desk edge and the synths are (activities.js); motion: the manifest's clip index;
 *   mouseAt: the mouse prop (createMouseProp), whose resting place his scrolling and gaming hand reaches for
 * @returns {(state: object, time: number, block?: object | null) => { angles: object, reach: object | null,
 *   root: { offset: number[], yaw: number } | null, longPause: string | null, extras: object }}
 *   block: what his night has him doing (moods.activityAt), or nothing for plain typing
 */
/**
 * Where his right wrist goes on the mouse (palm on its hump), which way his elbow points there and how he leans
 * toward it (so the arm keeps a bend): the same as his scrolling pauses, for the typing clip's reaches to its own
 * mouse (clips.createTypingClip).
 * @returns {{ wrist: number[], pole: number[], lean: number[] } | null}
 */
export const mouseReachOf = ({ bones, mouse }) => {
  const pivot = Object.fromEntries(bones.map((b) => [b.name, b.pivot]))
  if (!mouse || !pivot.hand_L || !pivot.hand_R) return null
  const { toward } = keyboardAxes(pivot.hand_L, pivot.hand_R)
  return { wrist: add(mouse, [0, POSE.mouseUp, 0], scale(toward, POSE.mouseBack)), pole: [...POSE.mousePole], lean: [...POSE.mouseLean] }
}

const MOUSE_GRAB = 0.7 // hold past this: his hand has the mouse...
const MOUSE_LET_GO = 0.3 // ...and below this it's let go, staying where he left it
const MOUSE_ROAM = 0.06 // m: the furthest the mouse wanders from where it sits in the render

/**
 * The mouse as a thing on the desk: it stays where he leaves it, he picks it up from there, and while he holds
 * it, it moves exactly as his hand moves it (the typing clip's own mouse moves, or his aim in a game). Positions
 * are offsets from where it sits in the render, flat on the desk.
 * update(hold, move, fromGrab): hold 0..1; move [x, 0, z] the hand's own movement on the mouse (or null);
 * fromGrab: count `move` from where it was when he took hold (a clip's moves), rather than from zero (an aim).
 */
export const createMouseProp = () => {
  const base = [0, 0, 0] // where it rests: hands reach here for it
  const at = [0, 0, 0] // where it is now
  let held = false
  let from = [0, 0, 0]
  return {
    base,
    at,
    update(hold, move = null, fromGrab = false) {
      const m = move ?? [0, 0, 0]
      if (!held && hold > MOUSE_GRAB) {
        held = true
        from = fromGrab ? [m[0], 0, m[2]] : [0, 0, 0]
      }
      const share = Math.min(1, Math.max(0, hold))
      let x = base[0] + share * (m[0] - from[0])
      let z = base[2] + share * (m[2] - from[2])
      const far = Math.hypot(x, z)
      if (far > MOUSE_ROAM) {
        x *= MOUSE_ROAM / far
        z *= MOUSE_ROAM / far
      }
      at[0] = x
      at[2] = z
      if (held && hold < MOUSE_LET_GO) {
        held = false
        base[0] = x
        base[2] = z
      }
      return at
    },
  }
}

export const createFigurePoser = ({ bones, rests, phone, mouse, keyPitch = POSE.keyPitch, seed = 7, desk = null, synth = null, motion = null, mouseAt = null }) => {
  const pivot = Object.fromEntries(bones.map((b) => [b.name, b.pivot]))
  const canReach = HANDS.every((s) => pivot[`shoulder_${s}`] && pivot[`elbow_${s}`] && pivot[`hand_${s}`])
  const restPole = Object.fromEntries(
    HANDS.map((s) => [s, canReach ? sub(pivot[`elbow_${s}`], mix(pivot[`shoulder_${s}`], pivot[`hand_${s}`], 0.5)) : [0, -1, 0]]),
  )
  const toPhone = phone && pivot.head ? sub(phone, pivot.head) : null
  const axes = canReach ? keyboardAxes(pivot.hand_L, pivot.hand_R) : null
  const hasMouse = Boolean(mouse && canReach)
  const look = {
    random: randomFor(seed),
    salt: saltFor(seed),
    hasMouse,
    phoneYaw: toPhone ? Math.atan2(-toPhone[0], -toPhone[2]) : 0,
    phonePitch: toPhone ? Math.atan2(toPhone[1], Math.hypot(toPhone[0], toPhone[2])) : 0,
  }
  const ctx = canReach && {
    pivot,
    rests,
    restPole,
    keyPitch,
    ...axes,
    mouseRest: hasMouse ? add(mouse, [0, POSE.mouseUp, 0], scale(axes.toward, POSE.mouseBack)) : null,
    mouseWrist: null, // where the mouse is now (set each pose from mouseAt)
  }
  const facts = ctx && rests ? activityFacts({ ...ctx, desk, synth, motion }) : null
  const hasPhones = Boolean(pivot.phones)
  const hasChair = Boolean(pivot.chair) // the chair as its own bone: it turns with him while he sits

  return (state, time, block = null) => {
    if (ctx?.mouseRest) ctx.mouseWrist = mouseAt ? add(ctx.mouseRest, mouseAt.base) : ctx.mouseRest
    if (facts) facts.mouseWrist = ctx.mouseWrist
    const doing = block ? activityPose(block, facts, time, seed) : null
    const hold = doing?.hold ?? 0
    const quiet = quieted(state, envelopes(state.pause, seed, hasMouse), hold)
    const env = quiet.env
    const angles = bodyAngles(quiet.state, time, env, look)
    if (doing) {
      angles.spine = add(angles.spine, doing.body.spine)
      angles.head = add(angles.head, doing.body.head)
    }
    // the typing clip's share of him: all of it while he types, none in a long pause or an activity
    const typingWeight = (1 - env.think) * (1 - hold)
    const { pause } = state
    const visit =
      env.name === 'scroll'
        ? { since: pause.since, length: pause.length, index: pause.index ?? 0, weight: (1 - hold) * settle(pause, VISIT_EASE) }
        : null
    const typing = {
      active: state.active ?? 0, // the clip moves only as keys are hit
      weight: typingWeight,
      head: typingWeight * (1 - (quiet.state.glance?.amount ?? 0)), // his own head looks at the keys or his phone
      visit, // a pause where he takes the mouse: the clip's own trip to its mouse plays
    }
    const fingerEnv = doing?.mouse ? { ...env, onMouse: Math.max(env.onMouse, doing.mouse) } : env
    fingerAngles(angles, quiet.state, fingerEnv, {
      tap: env.hover ? tapAt(state.pause, look.random) : null,
      click: env.onMouse ? clickAt(state.pause, look.random) : 0,
    })
    if (doing) pressFingers(angles, doing.fingers)
    if (hasPhones) angles.phones = [0, 0, 0, doing?.phones ? 0 : 1] // on his head instead (a separate mesh)
    if (hasChair) angles.chair = [0, angles.swivel[1]]
    return {
      angles,
      reach: ctx ? blendReach(reachGoals(quiet.state, env, angles, ctx), doing?.hands) : null,
      root: doing?.root ?? null,
      longPause: env.name,
      // live: how much he's lit live instead of by the seated render (off the chair, or rolled away from it)
      extras: { away: doing?.away ?? 0, screen: screenFor(doing), phones: doing?.phones ?? 0, live: doing?.live ?? doing?.away ?? 0, typing, seated: doing?.seated ?? null, piano: doing?.piano ?? null, mouseHold: Math.max(env.onMouse, doing?.mouse ?? 0), mouseAim: doing?.mouseAim ?? null },
    }
  }
}
