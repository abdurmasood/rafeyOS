// Synth A's keys going down as he plays them (studio_keys.py renders how pressed keys look). Each frame: which
// key each fingertip is over, how hard the pianist clip has that finger down (clips.createFingerStrikes), and
// each key eased toward that, snapping down and springing back up like a real key.
//
// Keys come from the manifest (figure.synthKeys), low to high, in three.js axes: the middle of each key top's
// back and front edges, its half width, black or white.

export const KEY_COUNT = 64 // the room shader's uKeyPress array
export const KEY_EASE = Object.freeze({ down: 0.025, up: 0.07 }) // s a key takes to go down, and to come back up
export const KEY_REACH = Object.freeze({
  above: 0.05, // m: a fingertip up to this far above a key's top can be pressing it (his hands hover a little)
  below: 0.08, // m: or this far below it (the clip's hands are lifted onto the synth as a whole, not finger by finger)
  side: 0.002, // m past a key's side still counts as on it
})

/** Each key's frame on the synth, for testing fingertips against it quickly. */
const keyFrames = (keys) =>
  keys.map(({ back, front, half, black }) => {
    const along = [front[0] - back[0], 0, front[2] - back[2]]
    const length = Math.hypot(along[0], along[2])
    const dir = [along[0] / length, 0, along[2] / length]
    return { back, length, dir, side: [-dir[2], 0, dir[0]], half, black, top: back[1] }
  })

/** How far off-centre (across) a fingertip is if it's over `key`, or null when it isn't. */
const across = (key, [x, y, z]) => {
  const dx = x - key.back[0]
  const dz = z - key.back[2]
  const along = dx * key.dir[0] + dz * key.dir[2]
  if (along < 0 || along > key.length) return null
  const off = Math.abs(dx * key.side[0] + dz * key.side[2])
  if (off > key.half + KEY_REACH.side) return null
  const height = y - key.top
  return height > KEY_REACH.above || height < -KEY_REACH.below ? null : off
}

/** The key a fingertip [x, y, z] is over: a black key if it's on one (they stand above the white keys), else the
 * white key it's most centred on; -1 for none. */
export const keyUnder = (frames, tip) => {
  let best = -1
  let bestOff = Infinity
  let bestBlack = false
  frames.forEach((key, k) => {
    const off = across(key, tip)
    if (off === null) return
    if ((key.black && !bestBlack) || (key.black === bestBlack && off < bestOff)) {
      best = k
      bestOff = off
      bestBlack = key.black
    }
  })
  return best
}

/**
 * @param {Array<{ back: number[], front: number[], half: number, black: boolean }>} keys  manifest.figure.synthKeys
 * @returns {{ press: Float32Array, frames: object[], update: (tips: number[][], amounts: ArrayLike<number>, dt: number) => Float32Array }}
 *   press: how far down each key is, 0..1 of the rendered press
 */
export const createKeyPresser = (keys) => {
  const frames = keyFrames(keys)
  const press = new Float32Array(KEY_COUNT)
  const target = new Float32Array(KEY_COUNT)
  return {
    press,
    frames,
    /** tips[i]: a fingertip's world position; amounts[i]: how hard that finger is down (0 none). */
    update(tips, amounts, dt) {
      target.fill(0)
      tips.forEach((tip, i) => {
        if (amounts[i] <= 0) return
        const k = keyUnder(frames, tip)
        if (k >= 0) target[k] = Math.max(target[k], amounts[i])
      })
      for (let k = 0; k < frames.length; k++) {
        const ease = target[k] > press[k] ? KEY_EASE.down : KEY_EASE.up
        press[k] += (target[k] - press[k]) * Math.min(1, dt / ease)
      }
      return press
    },
  }
}
