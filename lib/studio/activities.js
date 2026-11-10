// How he does each thing his moods send him to, as targets the poser blends toward. Big, clear moves: he's
// about 60 px tall. Everything is a pure function of the block he's in (moods.js) and the room's facts.
//
// Beat: pushes off the desk edge, rolls the chair over to the synths and turns to face them, puts his
// headphones on and plays, nodding along; then the same back. He plays the mocap of a pianist ("keys", its
// upper body on his hips with his hands lifted onto Synth A's keys, played by the scene); without it, coded
// chords left, a riff right and the odd reach up to the top synth. Game: leans in, left hand on W A S D, right hand on the mouse aiming and clicking.
// Break: hands off the keys into his lap (mocap: "Type To Sit"), sitting there breathing while the screen goes
// to sleep, then back onto the keys ("Sit To Type"). The clips are played on his hips by the scene (clips.js).
//
// Three.js world space throughout (y up). `root` moves him and the whole chair: a turn by `yaw` about the
// gas-lift axis, then a slide by `offset`.
import { ACTIVITY } from './moods'
import { fbm, hash } from './wind'

export const SCREEN = Object.freeze({ CODE: 'code', DAW: 'daw', GAME: 'game', SLEEP: 'sleep' })

export const MOVES = Object.freeze({
  [ACTIVITY.BEAT]: Object.freeze({
    reachEdge: 0.8, // s: hands to the desk edge
    push: 1.0, // s: pushing off, the chair rolling back...
    pushBack: 0.25, // ...this far (m)
    roll: 2.8, // s: rolling and turning to the synths
    phones: 2.4, // s: hands up to his neck, headphones on, hands down to the keys
    playIn: 1.1, // s: hands settle onto the keys
    playOut: 1.3, // s: hands leave the keys
    release: 1.3, // s: hands leave the desk edge as the chair gets going
    exitPhones: 2.2, // s: headphones back round his neck
    exitRoll: 2.8, // s: rolling back
    exitKeys: 1.0, // s: hands back onto the keyboard
    tempo: 92, // beats a minute he plays and nods to
    nod: Object.freeze([0.035, 0.08]), // rad of spine and head on each beat
    keySpan: Object.freeze([0.3, 0.62]), // where along the synth's keys each hand plays, low to high
    wander: 0.05, // m each hand drifts along the keys
    upperEvery: 22, // s: about this often his right hand reaches up to the top synth...
    upperFor: 2.4, // ...for this long
    upperLean: -0.08,
    wristAbove: 0.05, // m the wrist sits above the key tops, and...
    wristBack: 0.05, // ...this far in front of their front edge (the fingers reach the rest)
    phonesDone: 0.55, // share of the phones move by which they're on his head
  }),
  [ACTIVITY.GAME]: Object.freeze({
    enter: 1.6,
    exit: 1.4,
    lean: -0.1,
    turn: 0.12, // rad toward the mouse
    look: 0.06,
    wasd: Object.freeze([1, -0.3]), // key widths from home for his left hand: index on D, middle on W/S, ring on A
    aim: Object.freeze([0.012, 0.008]), // m his mouse hand wanders [across, toward him]
    deathEvery: 55, // s: about this often he loses and sits back...
    deathFor: 2.6, // ...for this long
    deathLean: 0.14,
  }),
  [ACTIVITY.BREAK]: Object.freeze({
    settle: 0.5, // s the typing hands over to the break clip, and takes him back at the end
    breath: 0.025, // rad of slow breathing while he sits back...
    breathRate: 0.22, // ...in breaths a second
    screenSleepsAfter: 20, // s into the break the monitor goes to sleep, fading over...
    screenFade: 4,
  }),
})

const clamp01 = (x) => Math.min(1, Math.max(0, x))
const smooth = (x) => {
  const t = clamp01(x)
  return t * t * (3 - 2 * t)
}
const mix = (a, b, t) => a.map((v, i) => v + (b[i] - v) * t)
const add = (...vectors) => vectors.reduce((sum, v) => sum.map((s, i) => s + v[i]))
const sub = (a, b) => a.map((v, i) => v - b[i])
const scale = (v, k) => v.map((x) => x * k)
const flat = ([x, , z]) => {
  const length = Math.hypot(x, z) || 1
  return [x / length, 0, z / length]
}
const rotateAboutY = (point, pivot, angle) => {
  const [x, y, z] = sub(point, pivot)
  const c = Math.cos(angle)
  const s = Math.sin(angle)
  return [pivot[0] + c * x + s * z, pivot[1] + y, pivot[2] - s * x + c * z]
}
const turnVector = (v, angle) => rotateAboutY(v, [0, 0, 0], angle)
/** The turn (about +y, three's sense) taking direction `from` onto direction `to`. */
const yawBetween = (from, to) => Math.atan2(from[2] * to[0] - from[0] * to[2], from[0] * to[0] + from[2] * to[2])
const centred = (t, salt) => 2 * fbm(t, salt) - 1

/** Where a rest-pose point is once the chair has turned by `yaw` about the axis and slid by `offset`. */
export const carry = (point, { axis, root }) => add(rotateAboutY(point, axis, root.yaw), root.offset)

/**
 * The room's facts the activities need, from the manifest's figure and the poser's keyboard axes.
 * @returns {object | null} null when the figure can't reach (no arms)
 */
export const activityFacts = ({ pivot, rests, lateral, toward, mouseWrist, keyPitch, restPole, desk, synth, motion = null }) => {
  if (!lateral) return null
  const axis = pivot.swivel ?? pivot.root
  const homeMid = mix(pivot.hand_L, pivot.hand_R, 0.5)
  const facing = scale(toward, -1) // from him toward the keyboard
  const clips = motion?.clips
  const facts = {
    pivot,
    rests,
    lateral,
    toward,
    facing,
    mouseWrist,
    keyPitch,
    restPole,
    axis,
    homeMid,
    desk,
    synth: null,
    // how long the break's clips take (s), when they're baked
    clips: clips?.typeToSit && clips?.sitToType ? { typeToSit: clips.typeToSit.duration, sitToType: clips.sitToType.duration } : null,
    piano: Boolean(clips?.keys), // the pianist's mocap, for the synths
  }
  if (synth) {
    const along = flat(sub(synth.keys[1], synth.keys[0]))
    let toKeys = [along[2], 0, -along[0]] // across the keys, pointing at them from the seat
    const middle = mix(synth.keys[0], synth.keys[1], 0.5)
    if (toKeys[0] * (middle[0] - synth.seat[0]) + toKeys[2] * (middle[2] - synth.seat[2]) < 0) toKeys = scale(toKeys, -1)
    facts.synth = {
      ...synth,
      along,
      toKeys,
      yaw: yawBetween(facing, toKeys),
      offset: [synth.seat[0] - axis[0], 0, synth.seat[2] - axis[2]],
    }
  }
  return facts
}

const NO_ROOT = Object.freeze({ offset: Object.freeze([0, 0, 0]), yaw: 0 })

/** One move from `a` to `b` over [start, start + length] of `t`, eased; `ease` shapes it. */
const step = (t, start, length, ease = smooth) => ease(clamp01((t - start) / length))

/** Where a wrist plays on Synth A: `span` along its keys (0 low, 1 high), just above and in front of them. */
const onSynth = (synth, span) => {
  const m = MOVES[ACTIVITY.BEAT]
  return add(mix(synth.keys[0], synth.keys[1], span), scale(synth.toKeys, -m.wristBack), [0, m.wristAbove, 0])
}

/**
 * Where each wrist plays on Synth A, in the rest pose's frame (the chair back at the desk): the pianist clip's
 * hands are lifted so their average lands here once the chair has rolled to the synths (clips.handLift).
 */
export const pianoTargets = (facts) => {
  const { synth, axis } = facts
  const m = MOVES[ACTIVITY.BEAT]
  return Object.fromEntries(
    ['L', 'R'].map((side, i) => [side, rotateAboutY(sub(onSynth(synth, m.keySpan[i]), synth.offset), axis, -synth.yaw)]),
  )
}

/** A hand goal. */
const goal = (target, pole, palm = [0, 0]) => ({ target, pole, palm })
const mixGoal = (a, b, t) => goal(mix(a.target, b.target, t), mix(a.pole, b.pole, t), mix(a.palm, b.palm, t))

/** Each hand's rest-pose elbow direction, turned with the chair. */
const turnedPole = (facts, side, yaw, outward = 0) => {
  const out = scale(facts.lateral, side === 'L' ? -outward : outward)
  return turnVector(add(facts.restPole[side], out), yaw)
}

/** Where his wrist sits on the room keyboard for an offset of [across, toward him] key widths from home. */
const onKeyboard = (facts, side, [across, toward]) =>
  add(facts.pivot[`hand_${side}`], scale(facts.lateral, across * facts.keyPitch[0]), scale(facts.toward, toward * facts.keyPitch[1]))

/** A repeatable number in [0, 1) for the n-th thing of kind k in this block. */
const randomIn = (block, seed) => (n, k) => hash(n * 1.618 + k * 31.7 + (block.index ?? 0) * 7.13 + ((seed >>> 0) % 9973) * 0.11)

/** The beat: where the chair is and how far through each phase he is. */
const beatPhases = (block) => {
  const m = MOVES[ACTIVITY.BEAT]
  const t = block.into
  const out = block.left
  const pushStart = m.reachEdge
  const rollStart = pushStart + m.push
  const phonesStart = rollStart + m.roll
  return {
    edge: Math.min(step(t, 0, m.reachEdge), 1 - step(t, pushStart + m.push * 0.4, m.release)),
    pushed: step(t, pushStart, m.push),
    rolled: Math.min(step(t, rollStart, m.roll), 1 - step(out, m.exitKeys, m.exitRoll, (x) => 1 - smooth(x))),
    phones: Math.min(step(t, phonesStart, m.phones), 1 - step(out, m.exitKeys + m.exitRoll, m.exitPhones, (x) => 1 - smooth(x))),
    play: Math.min(step(t, phonesStart + m.phones * 0.75, m.playIn), smooth((out - m.exitKeys - m.exitRoll - m.exitPhones * 0.5) / m.playOut)),
    home: smooth((m.exitKeys - out) / m.exitKeys), // the last second: hands back onto the keyboard
    unpushed: 1 - step(out, 0, m.exitKeys + 0.3, (x) => 1 - smooth(x)),
  }
}

const beatPose = (block, facts, time, random) => {
  const m = MOVES[ACTIVITY.BEAT]
  const synth = facts.synth
  const ph = beatPhases(block)
  // The chair: back from the desk, then over to the synths and turned to face them
  const back = scale(facts.toward, m.pushBack * Math.max(ph.pushed * (1 - ph.rolled), 0) * ph.unpushed)
  const root = {
    offset: add(scale(synth.offset, ph.rolled), back),
    yaw: synth.yaw * smooth(ph.rolled * 1.15 - 0.1),
  }
  const place = { axis: facts.axis, root }
  const yaw = root.yaw
  // The beat he's playing and nodding to
  const beatTime = (time * m.tempo) / 60
  const beat = beatTime - Math.floor(beatTime)
  const bar = Math.floor(beatTime / 4)
  const upperSlot = Math.floor(block.into / m.upperEvery)
  const upperInto = block.into - upperSlot * m.upperEvery - m.upperEvery * 0.5 * random(upperSlot, 41)
  // the coded reach up to the top synth is only for when there's no pianist clip: the mocap plays instead
  const reachesUp = !facts.piano && upperSlot > 0 && random(upperSlot, 42) < 0.7
  const upper = ph.play * (reachesUp ? Math.min(smooth(upperInto / 0.6), smooth((m.upperFor - upperInto) / 0.6)) : 0)
  const hands = {}
  for (const side of ['L', 'R']) {
    const rest = goal(carry(facts.rests[side], place), turnedPole(facts, side, yaw, 0.5), [0, yaw])
    const edgeAt = facts.desk ? mix(facts.desk.edge[0], facts.desk.edge[1], side === 'L' ? 0.42 : 0.58) : onKeyboard(facts, side, [0, 3])
    const edge = goal(add(edgeAt, [0, 0.02, 0]), turnedPole(facts, side, 0, 0.6), [0, 0])
    const neck = goal(
      carry(add(facts.pivot.head, scale(facts.lateral, side === 'L' ? -0.09 : 0.09), [0, 0.02 + 0.09 * smooth(ph.phones * 2 - 0.4), 0]), place),
      turnedPole(facts, side, yaw, 1),
      [0, yaw],
    )
    const span = m.keySpan[side === 'L' ? 0 : 1] + (m.wander / Math.hypot(...sub(synth.keys[1], synth.keys[0]))) * centred(time * 0.11, side === 'L' ? 51 : 52)
    const keysAt = onSynth(synth, span)
    let keys = goal(keysAt, turnedPole(facts, side, synth.yaw, 0.3), [0, synth.yaw])
    if (side === 'R' && synth.upper) {
      keys = mixGoal(keys, goal(add(synth.upper, scale(synth.toKeys, -0.06), [0, 0.03, 0]), turnedPole(facts, side, synth.yaw, 0.2), [0.3, synth.yaw]), upper)
    }
    // Phase order: edge → rest (rolling) → neck (phones) → keys (playing) → neck → rest → home
    let g = mixGoal(rest, edge, ph.edge)
    const atNeck = Math.sin(Math.PI * clamp01(ph.phones)) // up to his neck through the middle of the phones move
    g = mixGoal(g, neck, atNeck)
    g = mixGoal(g, keys, ph.play)
    // in at the start, and handed back to the typing over the last second (the chair pulling in under him)
    hands[side] = { ...g, weight: Math.min(step(block.into, 0, m.reachEdge), smooth(block.left / m.exitKeys)) }
  }
  const presence = Math.max(ph.edge, ph.pushed * ph.unpushed, ph.rolled, ph.play)
  const nodShape = Math.sin(Math.PI * beat) ** 2
  const nod = ph.play * nodShape
  return {
    weight: Math.min(1, presence) * (1 - ph.home * 0.999),
    root,
    away: ph.rolled,
    body: {
      spine: [-m.nod[0] * nod + m.upperLean * upper + 0.05 * ph.edge * (1 - ph.pushed), 0, 0.02 * ph.play * Math.sin(Math.PI * beatTime / 2)],
      head: [-m.nod[1] * nod, 0, 0],
    },
    hold: smooth(presence * 1.5),
    hands,
    fingers: synthFingers(beatTime, bar, random, ph.play * (1 - upper * 0.8)),
    mouse: 0,
    phones: ph.phones >= m.phonesDone ? 1 : 0,
    screen: { mode: SCREEN.DAW, level: 1 },
    nod,
    // the pianist clip while he plays: its loop's time, its share of him, his nod kept on its spine
    piano: facts.piano ? { time: block.into, weight: ph.play, nod: -m.nod[0] * nod, targets: pianoTargets(facts) } : null,
  }
}

/** Chords in his left hand (changing every two beats), a riff of eighth notes in his right. */
const synthFingers = (beatTime, bar, random, amount) => {
  const fingers = {}
  if (amount <= 0) return fingers
  const half = Math.floor(beatTime / 2)
  const chordInto = beatTime / 2 - half
  const chordPress = amount * (chordInto < 0.08 ? chordInto / 0.08 : 1) * 0.8
  const chord = random(half, 43) < 0.5 ? ['thumb', 'middle', 'little'] : ['thumb', 'index', 'ring']
  for (const finger of chord) fingers[`${finger}_L`] = chordPress
  const eighth = Math.floor(beatTime * 2)
  const into = beatTime * 2 - eighth
  if (random(eighth, 44) < 0.75) {
    const finger = ['index', 'middle', 'ring', 'thumb'][Math.floor(random(eighth + bar * 31, 45) * 4)]
    fingers[`${finger}_R`] = amount * Math.sin(Math.PI * Math.min(1, into / 0.6))
  }
  return fingers
}

const gamePose = (block, facts, time, random) => {
  const m = MOVES[ACTIVITY.GAME]
  const presence = Math.min(smooth(block.into / m.enter), smooth(block.left / m.exit))
  const deathSlot = Math.floor(block.into / m.deathEvery)
  const deathInto = block.into - deathSlot * m.deathEvery - m.deathEvery * 0.6 * random(deathSlot, 46)
  const death = deathSlot > 0 || deathInto > 0 ? Math.min(smooth(deathInto / 0.5), smooth((m.deathFor - deathInto) / 0.8)) : 0
  const aim = [centred(time * 0.7, 61), centred(time * 0.9, 62)]
  const aimMove = add(scale(facts.lateral, aim[0] * m.aim[0]), scale(facts.toward, aim[1] * m.aim[1]))
  const mouseAt = add(facts.mouseWrist ?? onKeyboard(facts, 'R', [3, 0]), aimMove)
  const hands = {
    L: { ...goal(onKeyboard(facts, 'L', m.wasd), facts.restPole.L), weight: presence },
    R: { ...goal(mouseAt, turnedPole(facts, 'R', 0, 0.4)), weight: presence },
  }
  // W held for stretches, A and D tapped, quick clicks
  const slot = Math.floor(time / 0.45)
  const fingers = {
    middle_L: presence * (random(Math.floor(time / 1.8), 47) < 0.6 ? 0.8 : 0),
    ring_L: presence * (random(slot, 48) < 0.25 ? 0.7 : 0),
    index_L: presence * (random(slot, 49) < 0.25 ? 0.7 : 0),
    index_R: presence * (random(Math.floor(time / 0.3), 50) < 0.35 ? Math.sin(Math.PI * ((time / 0.3) % 1)) ** 2 : 0),
  }
  return {
    weight: presence,
    root: NO_ROOT,
    away: 0,
    // turned and tipped toward the mouse, as he is when he scrolls, so his mouse arm keeps a bend
    body: {
      spine: [(m.lean + m.deathLean * death) * presence, m.turn * presence, -m.turn * presence],
      head: [m.look * presence - 0.06 * death, -0.8 * m.turn * presence, 0.8 * m.turn * presence],
    },
    hold: presence,
    hands,
    fingers,
    mouse: presence,
    mouseAim: [aimMove[0], 0, aimMove[2]], // the mouse moves with his aim
    phones: 0,
    screen: { mode: SCREEN.GAME, level: 1 },
    nod: 0,
  }
}

const breakPose = (block, facts, time) => {
  const m = MOVES[ACTIVITY.BREAK]
  const leave = facts.clips?.typeToSit
  const back = facts.clips?.sitToType
  if (!leave || !back) return null // no clips: he carries on typing
  const presence = Math.min(smooth(block.into / m.settle), smooth(block.left / m.settle))
  const leaving = block.into < leave
  const returning = block.left < back
  const seated = leaving
    ? { name: 'typeToSit', time: block.into, lift: 1 - smooth(block.into / leave) }
    : returning
      ? { name: 'sitToType', time: back - block.left, lift: smooth(1 - block.left / back) }
      : { name: 'typeToSit', time: leave, lift: 0 } // its last frame: sitting back, hands in his lap
  const asleep = Math.min(step(block.into, m.screenSleepsAfter, m.screenFade), 1 - step(back - block.left, 0, 0.6))
  return {
    weight: presence,
    root: NO_ROOT,
    away: 0,
    body: { spine: [0, 0, 0], head: [0, 0, 0] },
    hold: presence,
    hands: {},
    fingers: {},
    mouse: 0,
    phones: 0,
    screen: { mode: SCREEN.SLEEP, level: 1 - asleep },
    nod: 0,
    seated: { ...seated, weight: presence, breath: m.breath * Math.sin(2 * Math.PI * m.breathRate * time) },
  }
}

/**
 * What he's doing with his body this frame, for the block he's in.
 * @param {{ activity: string, into: number, left: number, index?: number }} block  from moods.activityAt
 * @param {object | null} facts  from activityFacts
 * @returns {object | null} null while he codes (the poser's own behaviour)
 */
export const activityPose = (block, facts, time, seed = 7) => {
  if (!block || !facts || block.activity === ACTIVITY.CODE) return null
  const random = randomIn(block, seed)
  if (block.activity === ACTIVITY.BEAT) return facts.synth ? beatPose(block, facts, time, random) : null
  if (block.activity === ACTIVITY.GAME) return gamePose(block, facts, time, random)
  if (block.activity === ACTIVITY.BREAK) return breakPose(block, facts, time)
  return null
}

/** What the monitor shows: its mode, and how bright (0 asleep). Code unless an activity says otherwise. */
export const screenFor = (pose) => pose?.screen ?? { mode: SCREEN.CODE, level: 1 }

export { NO_ROOT }
