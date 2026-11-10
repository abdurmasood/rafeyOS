// Motion clips (Mixamo, fitted to him by tools/studio/blender/studio_motion.py): for every frame and every
// page bone a clip moves, the rigid transform (quaternion + translation, three.js axes) that carries his
// seated rest mesh into the clip's pose, standing at the clip's stage point under his seat, facing the desk.
// The page plays a clip by sampling it in time and moving the whole pose to where he is (a stage transform),
// or puts a clip's upper body on his own hips (createTypingClip: how he types).
import { Euler, Matrix4, Quaternion, Vector3 } from 'three'

const STRIDE_VALUES = 7 // x, y, z, w, tx, ty, tz

/**
 * @param {ArrayBuffer} buffer  motion.bin
 * @param {{ stride: number, translationUnit: number, clips: object, stage: number[] }} motion  the manifest's index
 * @returns {{ stage: number[], clips: Record<string, { tracks: string[], frames: number, duration: number,
 *   loop: boolean, speed: number, values: Float32Array }> }}
 */
export const decodeMotion = (buffer, motion) => {
  const view = new DataView(buffer)
  const clips = {}
  for (const [name, clip] of Object.entries(motion.clips)) {
    const count = clip.frames * clip.tracks.length
    const values = new Float32Array(count * STRIDE_VALUES)
    for (let i = 0; i < count; i++) {
      const at = clip.offset + i * motion.stride
      for (let c = 0; c < 4; c++) values[i * STRIDE_VALUES + c] = view.getInt16(at + c * 2, true) / 32767
      for (let c = 0; c < 3; c++) values[i * STRIDE_VALUES + 4 + c] = view.getInt16(at + 8 + c * 2, true) / motion.translationUnit
    }
    clips[name] = { tracks: clip.tracks, frames: clip.frames, duration: clip.duration, loop: clip.loop, speed: clip.speed, values }
  }
  return { stage: motion.stage, clips }
}

const ONE = new Vector3(1, 1, 1)

/** Where `time` falls in a clip: the frames around it and how far between the middle two. Loops wrap; others hold. */
const framesAt = (clip, time) => {
  const span = clip.frames - 1
  const local = clip.loop ? ((time % clip.duration) + clip.duration) % clip.duration : Math.min(Math.max(time, 0), clip.duration)
  const position = span > 0 ? (local / clip.duration) * span : 0
  const a = Math.min(Math.floor(position), span)
  const at = (f) => (clip.loop ? ((f % span) + span) % span : Math.min(Math.max(f, 0), span)) // a loop's last frame is its first
  return { before: at(a - 1), a, b: at(a + 1), after: at(a + 2), mix: position - a }
}

/** Catmull-Rom between p1 and p2 (p0 and p3 their neighbours): smooth through every frame, no kinks. */
const curve = (p0, p1, p2, p3, t) =>
  0.5 * (2 * p1 + (p2 - p0) * t + (2 * p0 - 5 * p1 + 4 * p2 - p3) * t * t + (3 * p1 - p0 - 3 * p2 + p3) * t * t * t)

const q4 = [new Quaternion(), new Quaternion(), new Quaternion(), new Quaternion()]
const sampled = new Quaternion()
const moved = new Vector3()

/**
 * The clip's pose at `time` (s): one matrix per track (clip.tracks), written into `out` (Matrix4[]). Loops wrap;
 * others hold their first and last frames. Between frames, rotations and translations follow Catmull-Rom curves
 * through the neighbouring frames, so motion stays smooth through every frame.
 */
export const sampleClip = (clip, time, out) => {
  const trackCount = clip.tracks.length
  const { before, a, b, after, mix } = framesAt(clip, time)
  const frames = [before, a, b, after]
  const v = clip.values
  for (let track = 0; track < trackCount; track++) {
    const at = frames.map((f) => (f * trackCount + track) * STRIDE_VALUES)
    at.forEach((i, k) => {
      q4[k].set(v[i], v[i + 1], v[i + 2], v[i + 3])
      if (k !== 1 && q4[k].dot(q4[1]) < 0) q4[k].set(-q4[k].x, -q4[k].y, -q4[k].z, -q4[k].w) // the short way round
    })
    sampled.set(
      curve(q4[0].x, q4[1].x, q4[2].x, q4[3].x, mix),
      curve(q4[0].y, q4[1].y, q4[2].y, q4[3].y, mix),
      curve(q4[0].z, q4[1].z, q4[2].z, q4[3].z, mix),
      curve(q4[0].w, q4[1].w, q4[2].w, q4[3].w, mix),
    ).normalize()
    moved.set(
      curve(v[at[0] + 4], v[at[1] + 4], v[at[2] + 4], v[at[3] + 4], mix),
      curve(v[at[0] + 5], v[at[1] + 5], v[at[2] + 5], v[at[3] + 5], mix),
      curve(v[at[0] + 6], v[at[1] + 6], v[at[2] + 6], v[at[3] + 6], mix),
    )
    out[track].compose(moved, sampled, ONE)
  }
  return out
}

/** Where the clip's stage point goes, and which way he faces (yaw about +y; 0 = facing the desk, as the clip). */
export const stageMatrix = (stage, { at, yaw }, out = new Matrix4()) => {
  const turn = new Matrix4().makeRotationY(yaw)
  return out
    .makeTranslation(at[0], at[1], at[2])
    .multiply(turn)
    .multiply(new Matrix4().makeTranslation(-stage[0], -stage[1], -stage[2]))
}

const TYPING_SMOOTH = 0.06 // s: the clip is softened over about this long, taking the edge off fast moves

/** A copy of a clip blurred in time (Gaussian, sigma s): each frame a weighted mean of its neighbours. */
export const smoothClip = (clip, sigma) => {
  const step = clip.duration / Math.max(1, clip.frames - 1)
  const radius = Math.max(1, Math.ceil((2 * sigma) / step))
  const weights = Array.from({ length: 2 * radius + 1 }, (_, i) => Math.exp(-0.5 * (((i - radius) * step) / sigma) ** 2))
  const tracks = clip.tracks.length
  const values = new Float32Array(clip.values.length)
  const v = clip.values
  for (let f = 0; f < clip.frames; f++) {
    for (let k = 0; k < tracks; k++) {
      const at = (f * tracks + k) * STRIDE_VALUES
      const sum = [0, 0, 0, 0, 0, 0, 0]
      let total = 0
      weights.forEach((w, i) => {
        let g = f + i - radius
        if (clip.loop) g = ((g % (clip.frames - 1)) + (clip.frames - 1)) % (clip.frames - 1)
        else g = Math.min(Math.max(g, 0), clip.frames - 1)
        const from = (g * tracks + k) * STRIDE_VALUES
        const sign = v[from] * v[at] + v[from + 1] * v[at + 1] + v[from + 2] * v[at + 2] + v[from + 3] * v[at + 3] < 0 ? -1 : 1
        for (let c = 0; c < 4; c++) sum[c] += w * sign * v[from + c]
        for (let c = 4; c < 7; c++) sum[c] += w * v[from + c]
        total += w
      })
      const norm = Math.hypot(sum[0], sum[1], sum[2], sum[3]) || 1
      for (let c = 0; c < 4; c++) values[at + c] = sum[c] / norm
      for (let c = 4; c < 7; c++) values[at + c] = sum[c] / total
    }
  }
  return { ...clip, values }
}

/**
 * A clip's upper body put on his own hips: each joint turned as the clip turns it relative to its parent, so it
 * rides wherever his posing has him. His wrists go where the clip's do, lifted onto the room's keyboard by
 * `lift` (one offset per hand, from his hips), scaled by `liftShare` per pose (a clip that ends in his lap needs
 * none there). `mouse` maps the clip's mouse onto the room's (createTypingClip). `spineTurn` [pitch, yaw, roll]
 * turns his chest a little more (a held pose's breathing, a lean toward the mouse).
 * @returns {{ pose: (time: number, weight: number, headWeight?: number, liftShare?: number, spineTurn?: number[]) => object }}
 */
export const createSeatedClip = (clip, bones, lift, mouse = null) => {
  const boneIndex = new Map(bones.map((b, i) => [b.name, i]))
  const trackOf = new Map(clip.tracks.map((t, k) => [t, k]))
  const pairs = clip.tracks
    .map((track, k) => {
      const bone = boneIndex.get(track)
      const parentName = bone === undefined ? undefined : bones[bones[bone].parent]?.name
      return { k, bone, parent: trackOf.get(parentName) }
    })
    .filter(({ bone, parent }) => bone !== undefined && parent !== undefined) // the hips stay his own
  const absolute = clip.tracks.map(() => new Matrix4())
  const inverse = new Matrix4()
  const relative = new Map(pairs.map(({ bone }) => [bone, new Matrix4()]))
  const head = boneIndex.get('head')
  const spine = boneIndex.get('spine')
  const spinePivot = spine === undefined ? null : new Vector3(...bones[spine].pivot)
  const liftBone = boneIndex.get('swivel')
  const lifted = { L: new Vector3(), R: new Vector3() }
  const turn = new Matrix4()
  const scratch = new Matrix4()
  const euler = new Euler(0, 0, 0, 'YXZ')
  return {
    pose(time, weight, headWeight = weight, liftShare = 1, spineTurn = null) {
      sampleClip(clip, time, absolute)
      for (const { k, bone, parent } of pairs) relative.get(bone).copy(inverse.copy(absolute[parent]).invert()).multiply(absolute[k])
      if (spineTurn && spinePivot && relative.has(spine)) {
        turn
          .makeTranslation(spinePivot.x, spinePivot.y, spinePivot.z)
          .multiply(scratch.makeRotationFromEuler(euler.set(spineTurn[0], spineTurn[1], spineTurn[2])))
          .multiply(scratch.makeTranslation(-spinePivot.x, -spinePivot.y, -spinePivot.z))
        relative.get(spine).multiply(turn)
      }
      for (const side of ['L', 'R']) lifted[side].copy(lift[side]).multiplyScalar(liftShare)
      return { relative, lift: lifted, liftBone, mouse, weight, weights: new Map([[head, headWeight]]) }
    },
  }
}

/** Splits values into two groups around two centres (two-means): returns the centres, low then high. */
const twoMeans = (values) => {
  let low = Math.min(...values)
  let high = Math.max(...values)
  for (let pass = 0; pass < 12; pass++) {
    const mid = (low + high) / 2
    const lows = values.filter((v) => v <= mid)
    const highs = values.filter((v) => v > mid)
    if (!lows.length || !highs.length) break
    low = lows.reduce((a, b) => a + b) / lows.length
    high = highs.reduce((a, b) => a + b) / highs.length
  }
  return [low, high]
}

const MOUSE_APART = 0.12 // m: a right hand that spends time this far right of where it types is on a mouse

/**
 * Where the clip's wrists are on its keyboard, and where its typist's mouse is: per hand, the gap between his
 * home keys and the clip's wrist while it types (measured from his hips), so his hands land on the room's keys;
 * and, if the clip's right hand also visits a mouse, that mouse's offset from its typing spot.
 * @returns {{ lift: { L: Vector3, R: Vector3 }, mouse: Vector3 | null }}
 */
export const keyboardLift = (clip, bones) => {
  const boneIndex = new Map(bones.map((b, i) => [b.name, i]))
  const trackOf = new Map(clip.tracks.map((t, k) => [t, k]))
  const absolute = clip.tracks.map(() => new Matrix4())
  const inverse = new Matrix4()
  const hips = trackOf.get('swivel')
  const wrists = { L: [], R: [] }
  const pivots = { L: new Vector3(...bones[boneIndex.get('hand_L')].pivot), R: new Vector3(...bones[boneIndex.get('hand_R')].pivot) }
  for (let f = 0; f < clip.frames; f++) {
    sampleClip(clip, (f / Math.max(1, clip.frames - 1)) * clip.duration, absolute)
    inverse.copy(absolute[hips]).invert()
    for (const side of ['L', 'R']) wrists[side].push(pivots[side].clone().applyMatrix4(inverse.clone().multiply(absolute[trackOf.get(`hand_${side}`)])))
  }
  const mean = (points) => points.reduce((sum, p) => sum.add(p), new Vector3()).divideScalar(points.length)
  const [typing, mousing] = twoMeans(wrists.R.map((p) => p.x)) // across the keyboard: three's +x is his right
  const onMouse = mousing - typing > MOUSE_APART
  const typed = onMouse ? wrists.R.filter((p) => p.x <= (typing + mousing) / 2) : wrists.R
  const rightHome = mean(typed)
  return {
    lift: { L: pivots.L.clone().sub(mean(wrists.L)), R: pivots.R.clone().sub(rightHome) },
    mouse: onMouse ? mean(wrists.R.filter((p) => p.x > (typing + mousing) / 2)).sub(rightHome) : null,
  }
}

/**
 * How he types: the typing clip's whole upper body on his hips (its typist had a lower desk, so his hands are
 * lifted onto the room's keyboard), and when its typist goes for the mouse, his right hand goes to the room's
 * mouse (mouseReach: figurePose.mouseReachOf), which is further away.
 */
export const createTypingClip = (raw, bones, mouseReach = null) => {
  const clip = smoothClip(raw, TYPING_SMOOTH)
  const { lift, mouse } = keyboardLift(clip, bones)
  const onMouse = mouse ? mouseShares(clip, bones, lift.R, mouse) : null
  const { keys, visits } = stretchesOf(clip, onMouse)
  const keysLength = keys.reduce((sum, [from, to]) => sum + to - from - KEYS_JOIN, 0)
  /** A sampler with its own buffers: the clip at a time and, withMouse, his hand on the room's mouse as far as the clip's is on its. */
  const sampler = (withMouse) => {
    const toMouse = withMouse && mouse && mouseReach ? { offset: mouse, wrist: new Vector3(...mouseReach.wrist), pole: mouseReach.pole, share: 0, play: new Vector3() } : null
    const seated = createSeatedClip(clip, bones, lift, toMouse)
    const lean = [0, 0, 0]
    return (time, weight, headWeight = weight) => {
      if (!toMouse) return seated.pose(time, weight, headWeight)
      const now = onMouse(time)
      toMouse.share = now.share
      toMouse.play.copy(now.play)
      // he turns toward the room's mouse as he takes it, so his arm keeps a bend (it's further than the clip's)
      mouseReach.lean.forEach((a, i) => (lean[i] = a * toMouse.share))
      return seated.pose(time, weight, headWeight, 1, lean)
    }
  }
  // on the keys the clip's hand never heads for its mouse, so those samplers leave the mouse out
  const keysA = sampler(false)
  const keysB = sampler(false)
  const onVisit = sampler(true)
  const mix = createClipMixer()

  /**
   * Where in the clip `active` seconds of typing fall: through its keyboard stretches only. Each stretch fades into
   * the next over its last KEYS_JOIN s while the next plays its first KEYS_JOIN s, so the next one carries on from
   * KEYS_JOIN in (each counts KEYS_JOIN s short). A clip that never leaves the keys just loops.
   */
  const keyboardAt = (active) => {
    if (keys.length === 1 && keys[0][1] - keys[0][0] >= clip.duration - 0.01) return [{ time: keys[0][0] + wrap(active, clip.duration), share: 1 }]
    let offset = wrap(active, keysLength)
    for (let k = 0; k < keys.length; k++) {
      const [from, to] = keys[k]
      const length = to - from - KEYS_JOIN
      if (offset >= length) {
        offset -= length
        continue
      }
      const time = from + KEYS_JOIN + offset
      const into = offset - (length - KEYS_JOIN)
      if (into <= 0) return [{ time, share: 1 }]
      const w = smoothstep01(into / KEYS_JOIN)
      return [
        { time, share: 1 - w },
        { time: keys[(k + 1) % keys.length][0] + into, share: w },
      ]
    }
    return [{ time: keys[0][0] + KEYS_JOIN, share: 1 }]
  }

  /** Typing: his upper body as the clip types, moving only with `active` seconds of real keystrokes. */
  const typing = (active, weight, headWeight) => {
    const [a, b] = keyboardAt(active)
    const first = keysA(a.time, weight * a.share, headWeight * a.share)
    return b ? mix(first, keysB(b.time, weight * b.share, headWeight * b.share)) : first
  }
  /**
   * A mouse visit fitted to a pause: out to the mouse at the clip's pace, on it for as long as the pause allows,
   * back to the keys just before typing starts again. `index` picks which of the clip's visits.
   */
  const visitAt = (since, length, index, weight) => {
    const v = visits[((index % visits.length) + visits.length) % visits.length]
    const out = v.on - v.from
    const back = v.to - v.off
    const budget = length - VISIT_MARGIN - out - back
    let time
    if (budget > 0) {
      if (since <= out) time = v.from + since
      else if (since <= out + budget) time = v.on + ((since - out) / budget) * (v.off - v.on)
      else time = Math.min(v.to, v.off + since - out - budget)
    } else {
      time = v.from + Math.min(1, since / Math.max(0.1, length - VISIT_MARGIN)) * (v.to - v.from)
    }
    return onVisit(time, weight)
  }
  const hasVisits = visits.length > 0 && Boolean(mouseReach)
  const mixVisit = createClipMixer()

  return {
    lift,
    /** Whether a mouse pause is the clip's own trip to its mouse (else his coded scroll holds it). */
    hasVisits,
    /**
     * Its say over him for the poser's typing extras: the keyboard stretches as keys are hit (`active`), and in a
     * mouse pause (`visit`: { since, length, index, weight }) the clip's trip to its mouse.
     */
    pose({ active, weight, head = weight, visit = null }) {
      const keys = weight > 0 ? typing(active, weight, head) : null
      const mousing = hasVisits && visit?.weight > 0 ? visitAt(visit.since, visit.length, visit.index, visit.weight) : null
      return mixVisit(keys, mousing)
    },
  }
}

const KEYS_JOIN = 0.3 // s: one keyboard stretch of the clip fades into the next over this
const wrap = (x, length) => ((x % length) + length) % length
const VISIT_MARGIN = 0.25 // s: a mouse visit is back on the keys this long before typing starts again
const smoothstep01 = (x) => {
  const t = Math.min(1, Math.max(0, x))
  return t * t * (3 - 2 * t)
}

/**
 * The clip's keyboard stretches ([from, to], s) and mouse visits ({ from, on, off, to }: leaving the keys, on the
 * mouse, leaving it, back on the keys), from how far over to its mouse its hand is through the loop.
 */
const stretchesOf = (clip, onMouse) => {
  if (!onMouse) return { keys: [[0, clip.duration]], visits: [] }
  const step = 1 / 30
  const count = Math.round(clip.duration / step)
  const shares = Array.from({ length: count }, (_, i) => onMouse(i * step).share)
  const start = shares.findIndex((v) => v < 0.03) // begin on the keys, so no stretch is split by the loop
  const keys = []
  const visits = []
  let i = 0
  while (i < count) {
    const at = (k) => shares[(start + k) % count]
    const timeOf = (k) => (start + k) * step
    if (at(i) < 0.03) {
      let j = i
      while (j < count && at(j) < 0.03) j++
      if ((j - i) * step >= 1) keys.push([timeOf(i), timeOf(j)])
      i = j
    } else {
      let j = i
      let on = -1
      let off = -1
      while (j < count && at(j) >= 0.03) {
        if (at(j) > 0.97) {
          if (on < 0) on = j
          off = j
        }
        j++
      }
      if (on >= 0) visits.push({ from: timeOf(i), on: timeOf(on), off: timeOf(off), to: timeOf(j) })
      i = j
    }
  }
  return { keys: keys.length ? keys : [[0, clip.duration]], visits }
}

const MOUSE_ALONG = [0.25, 0.75] // share of the way to its own mouse over which the clip's hand counts as going there
const MOUSE_EASE = 0.15 // s: the room's mouse is twice as far, so his hand goes over (and back) eased over about this
const MOUSE_PLAY = 0.035 // m: the most the clip's hand moves its mouse about, kept for his hand on the room's

/**
 * How far over to the mouse his right hand is at each moment of the clip, 0 typing .. 1 on the mouse: from how
 * far along toward its own mouse the clip's hand is, then eased in time so the longer trip here isn't a dart.
 * Also how the clip's hand moves its mouse about while it's on it (from his hips), to move the room's mouse.
 */
const mouseShares = (clip, bones, lift, mouse) => {
  const trackOf = new Map(clip.tracks.map((t, k) => [t, k]))
  const pivot = new Vector3(...bones.find((b) => b.name === 'hand_R').pivot)
  const absolute = clip.tracks.map(() => new Matrix4())
  const inverse = new Matrix4()
  const raw = []
  const play = []
  for (let f = 0; f < clip.frames; f++) {
    sampleClip(clip, (f / Math.max(1, clip.frames - 1)) * clip.duration, absolute)
    inverse.copy(absolute[trackOf.get('swivel')]).invert().multiply(absolute[trackOf.get('hand_R')])
    const offset = pivot.clone().applyMatrix4(inverse).add(lift).sub(pivot)
    const along = offset.dot(mouse) / mouse.lengthSq()
    const t = Math.min(1, Math.max(0, (along - MOUSE_ALONG[0]) / (MOUSE_ALONG[1] - MOUSE_ALONG[0])))
    raw.push(t * t * (3 - 2 * t))
    const moved = offset.sub(mouse)
    moved.y = 0 // a mouse slides on the desk
    play.push(moved.clampLength(0, MOUSE_PLAY))
  }
  const step = clip.duration / Math.max(1, clip.frames - 1)
  const radius = Math.ceil((2.5 * MOUSE_EASE) / step)
  const span = clip.frames - 1
  const ease = (values, add, zero) =>
    values.map((_, f) => {
      let sum = zero()
      let total = 0
      for (let i = -radius; i <= radius; i++) {
        const w = Math.exp(-0.5 * ((i * step) / MOUSE_EASE) ** 2)
        const g = clip.loop ? (((f + i) % span) + span) % span : Math.min(Math.max(f + i, 0), span)
        sum = add(sum, values[g], w)
        total += w
      }
      return typeof sum === 'number' ? sum / total : sum.divideScalar(total)
    })
  const eased = ease(raw, (sum, v, w) => sum + w * v, () => 0)
  const playing = ease(play, (sum, v, w) => sum.addScaledVector(v, w), () => new Vector3())
  const out = new Vector3()
  return (time) => {
    const local = clip.loop ? ((time % clip.duration) + clip.duration) % clip.duration : Math.min(Math.max(time, 0), clip.duration)
    const position = (local / clip.duration) * span
    const a = Math.min(Math.floor(position), span)
    const b = Math.min(a + 1, span)
    const mix = position - a
    return { share: eased[a] + (eased[b] - eased[a]) * mix, play: out.copy(playing[a]).lerp(playing[b], mix) }
  }
}

/**
 * Two seated clip poses (pose() results) as one, for the moments one hands over to the other: their relative
 * joints and lifts blended by their weights. Either may be null.
 */
export const createClipMixer = () => {
  const relative = new Map()
  const lift = { L: new Vector3(), R: new Vector3() }
  const pa = new Vector3()
  const qa = new Quaternion()
  const sa = new Vector3()
  const pb = new Vector3()
  const qb = new Quaternion()
  const sb = new Vector3()
  return (a, b) => {
    if (!a || a.weight <= 0) return b && b.weight > 0 ? b : null
    if (!b || b.weight <= 0) return a
    const total = a.weight + b.weight
    const share = b.weight / total
    for (const [bone, ra] of a.relative) {
      const rb = b.relative.get(bone)
      if (!relative.has(bone)) relative.set(bone, new Matrix4())
      if (!rb) {
        relative.get(bone).copy(ra)
        continue
      }
      ra.decompose(pa, qa, sa)
      rb.decompose(pb, qb, sb)
      relative.get(bone).compose(pa.lerp(pb, share), qa.slerp(qb, share), sa)
    }
    for (const side of ['L', 'R']) lift[side].copy(a.lift[side]).lerp(b.lift[side], share)
    // a mouse reach belongs to the clip that has it, and fades with that clip's share
    const fade = (spec, keep) => (spec.mouse ? { ...spec.mouse, share: (spec.mouse.share ?? 0) * keep } : null)
    const mouse = fade(a, 1 - share) ?? fade(b, share)
    const head = [...a.weights.keys()][0]
    const headWeight = (a.weights.get(head) ?? a.weight) + (b.weights.get(head) ?? b.weight)
    return { ...a, relative, lift, mouse, weight: Math.min(1, total), weights: new Map([[head, Math.min(1, headWeight)]]) }
  }
}
