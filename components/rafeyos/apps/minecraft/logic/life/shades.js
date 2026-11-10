// Shades: four-legged shadow animals that rise out of the ground after dark and hunt the player on foot, by the same
// voxel rules the player lives by. A shade steps up one block but never two, falls off ledges, won't wade into water,
// needs room for its shoulders, and follows a wall round to its end, keeping to the side it chose. It prowls from
// afar, stalks from 14 blocks, pounces from 3 on the same level and bites, then backs off and comes again, until dawn
// burns it away or two hits put it down. It only acts while the game is being played. No three.js: shadeMeshes draws.
import { BLOCK } from '@/components/rafeyos/apps/minecraft/logic/blockTypes'
import { WORLD } from '@/components/rafeyos/apps/minecraft/logic/terrain'

export const SHADES = Object.freeze({
  MAX: 4, GRAVITY: 28, HOP: 8, BITE: 3, HITS: 2, HIT_COOLDOWN: 0.3, GRACE: 3, RISE_SECONDS: 1.4,
  SPAWN_NEAR: 16, SPAWN_FAR: 28, NIGHT_FROM: 0.6, DAWN_BELOW: 0.35,
})
const SPEED = Object.freeze({ prowl: 1.5, stalk: 3.6, backOff: 2.2, pace: 1.8, lunge: 6.5 })
const RANGE = Object.freeze({ stalk: 14, pounce: 3.2, bite: 1.5, close: 1.3 })
const SWEEP = Object.freeze([0.45, 0.9, 1.4, 2.0, 2.6])

export const STATUS = Object.freeze({
  RISING: 'rising', PROWL: 'prowl', STALK: 'stalk', POUNCE: 'pounce', BACK_OFF: 'backOff', BELOW: 'below',
  SHORE: 'shore', AROUND: 'around', HIT: 'hit', BURN: 'burn',
})

/**
 * @typedef {{
 *   x: number, y: number, z: number, vy: number, kx: number, kz: number, yaw: number, onGround: boolean, mode: string,
 *   status: string, rise: number, fade: number, phase: number, moving: number, side: number, cooldown: number,
 *   timer: number, hits: number, hitClock: number, flinch: number, seed: number, jaw: number, paceDir: number,
 *   paceTimer: number, lungeYaw: number, head: number,
 * }} Shade - rise: 0..1 out of the ground; fade: 0..1 as it burns away; kx, kz: knockback
 * @typedef {{
 *   player: { pos: { x: number, y: number, z: number }, vel: { x: number, y: number, z: number } },
 *   eye: { x: number, y: number, z: number }, night: number, playing: boolean, swimming: boolean, time: number,
 *   onBite: (shade: Shade) => void,
 * }} ShadeFrame
 */

/**
 * @param {{
 *   world: { get: (x: number, y: number, z: number) => number },
 *   ground: (x: number, z: number) => import('./ground').Ground | null, random?: () => number,
 * }} options
 */
export const createShades = ({ world, ground, random = Math.random }) => {
  /** @type {Shade[]} */
  const shades = []
  let grace = 0

  const blockAt = (x, y, z) => world.get(Math.floor(x), Math.floor(y), Math.floor(z))
  const solid = (block) => block !== BLOCK.AIR && block !== BLOCK.WATER
  const outside = (x, z) => x < 0 || z < 0 || x >= WORLD.SIZE || z >= WORLD.SIZE
  /** Can feet at `shade` step to (x, z)? 'walk', 'hop' for a one-block step, or null: a wall, water, a cliff, an overhang. */
  const probe = (shade, x, z) => {
    const feetY = Math.floor(shade.y + 0.01)
    if (outside(x, z)) return null
    const feet = blockAt(x, feetY, z)
    if (feet === BLOCK.WATER || blockAt(x, feetY - 1, z) === BLOCK.WATER) return null
    if (solid(feet)) return solid(blockAt(x, feetY + 1, z)) || solid(blockAt(x, feetY + 2, z)) ? null : 'hop'
    if (solid(blockAt(x, feetY + 1, z))) return null
    for (let drop = 1; drop <= 4; drop++) {
      const below = blockAt(x, feetY - drop, z)
      if (below === BLOCK.WATER) return null
      if (solid(below)) return 'walk'
    }
    return null
  }
  /** Room for the whole body: its middle and both shoulders, so two blocks touching at a corner stop it. */
  const probeBody = (shade, yaw) => {
    const ax = Math.sin(yaw), az = Math.cos(yaw)
    const centre = probe(shade, shade.x + ax * 0.75, shade.z + az * 0.75)
    if (!centre) return null
    for (const side of [0.32, -0.32]) if (!probe(shade, shade.x + ax * 0.6 + az * side, shade.z + az * 0.6 - ax * side)) return null
    return centre
  }
  /** The way toward `want` it can take, keeping to the side it last turned so it follows a wall instead of dithering. */
  const steer = (shade, want) => {
    const order = [0, ...SWEEP.map((o) => o * shade.side), ...SWEEP.map((o) => -o * shade.side)]
    for (const offset of order) {
      const yaw = want + offset
      const result = probeBody(shade, yaw)
      if (!result) continue
      if (offset !== 0) shade.side = Math.sign(offset)
      return { yaw, hop: result === 'hop', detour: offset !== 0 }
    }
    return null
  }
  const moveFlat = (shade, yaw, speed, dt) => {
    const nx = shade.x + Math.sin(yaw) * speed * dt + shade.kx * dt, nz = shade.z + Math.cos(yaw) * speed * dt + shade.kz * dt
    const feetY = Math.floor(shade.y + 0.01)
    if (outside(nx, nz) || solid(blockAt(nx, feetY, nz)) || solid(blockAt(nx, feetY + 1, nz)) || blockAt(nx, feetY, nz) === BLOCK.WATER) return false
    shade.x = nx
    shade.z = nz
    return true
  }
  const fall = (shade, dt) => {
    shade.vy -= SHADES.GRAVITY * dt
    shade.y += shade.vy * dt
    const below = Math.floor(shade.y - 0.001)
    shade.onGround = shade.vy <= 0 && solid(blockAt(shade.x, below, shade.z))
    if (shade.onGround) {
      shade.y = below + 1
      shade.vy = 0
    }
    while (solid(blockAt(shade.x, shade.y + 0.01, shade.z))) shade.y = Math.floor(shade.y + 0.01) + 1
  }

  /** What it means to do this frame: { yaw, speed, face?, step?, lunge? }. */
  const think = (shade, dt, frame) => {
    const { player } = frame
    const dx = player.pos.x - shade.x, dz = player.pos.z - shade.z
    const flat = Math.hypot(dx, dz), toPlayer = Math.atan2(dx, dz), above = player.pos.y - shade.y
    shade.cooldown -= dt
    shade.kx *= Math.max(0, 1 - dt * 4)
    shade.kz *= Math.max(0, 1 - dt * 4)
    if (shade.flinch > 0) {
      shade.flinch -= dt
      shade.status = STATUS.HIT
      return { yaw: shade.yaw, speed: 0 }
    }
    if (shade.mode === 'backOff') return backingOff(shade, dt, toPlayer)
    if (shade.mode === 'pounce') return pouncing(shade, dt)
    if (above > 1.5 && flat < 4) return circling(shade, flat, toPlayer)
    if (flat > RANGE.stalk) {
      Object.assign(shade, { mode: 'prowl', status: STATUS.PROWL })
      const want = toPlayer + Math.sin(frame.time * 0.5 + shade.seed) * 0.7
      return { yaw: want, speed: SPEED.prowl, step: steer(shade, want) }
    }
    shade.mode = 'stalk'
    if (flat < RANGE.pounce && Math.abs(above) < 0.6 && shade.onGround && shade.cooldown <= 0 && !frame.swimming) {
      Object.assign(shade, { mode: 'pounce', timer: 0.45, lungeYaw: toPlayer, vy: 6, jaw: 0.7 })
      return { yaw: toPlayer, speed: SPEED.lunge, face: toPlayer, lunge: true }
    }
    const step = steer(shade, toPlayer)
    if (!step) return pacing(shade, dt, toPlayer, frame.swimming)
    shade.status = frame.swimming ? STATUS.SHORE : step.detour && flat > 3 ? STATUS.AROUND : STATUS.STALK
    return { yaw: toPlayer, speed: SPEED.stalk * (flat < 5 ? 0.7 : 1), step }
  }
  const backingOff = (shade, dt, toPlayer) => {
    shade.timer -= dt
    if (shade.timer <= 0) shade.mode = 'stalk'
    shade.status = STATUS.BACK_OFF
    const away = toPlayer + Math.PI
    return { yaw: away, speed: SPEED.backOff, face: toPlayer, step: steer(shade, away) }
  }
  const pouncing = (shade, dt) => {
    shade.timer -= dt
    shade.status = STATUS.POUNCE
    if (shade.timer <= 0 && shade.onGround) Object.assign(shade, { mode: 'stalk', cooldown: 1.2 })
    return { yaw: shade.lungeYaw, speed: SPEED.lunge, face: shade.lungeYaw, lunge: true }
  }
  // Up out of reach: it circles below, nose up, and now and then leaps, and falls short
  const circling = (shade, flat, toPlayer) => {
    shade.status = STATUS.BELOW
    shade.jaw = 0.3
    if (shade.onGround && shade.cooldown <= 0 && flat < 2.4) {
      Object.assign(shade, { vy: SHADES.HOP, cooldown: 1.6 + random() })
      return { yaw: toPlayer, speed: 2, face: toPlayer }
    }
    const around = toPlayer + (Math.PI / 2) * shade.side
    return { yaw: around, speed: SPEED.pace, face: toPlayer, step: steer(shade, around + (flat > 2.2 ? -0.5 : 0.3) * shade.side) }
  }
  // No way forward (the player is in the water, or walled in): it paces back and forth, watching
  const pacing = (shade, dt, toPlayer, swimming) => {
    shade.status = swimming ? STATUS.SHORE : STATUS.BELOW
    shade.paceTimer -= dt
    if (shade.paceTimer <= 0) Object.assign(shade, { paceTimer: 1.4 + random(), paceDir: -shade.paceDir })
    const along = toPlayer + (Math.PI / 2) * shade.paceDir
    return { yaw: along, speed: SPEED.pace * 0.7, face: toPlayer, step: steer(shade, along) }
  }

  const bite = (shade, frame) => {
    const { player } = frame
    const flat = Math.hypot(player.pos.x - shade.x, player.pos.z - shade.z), dy = player.pos.y - shade.y
    if (flat >= RANGE.bite || dy <= -0.8 || dy >= 1.1 || shade.cooldown > 0) return
    if (shade.mode !== 'pounce' && shade.mode !== 'stalk') return
    frame.onBite(shade)
    Object.assign(shade, { mode: 'backOff', timer: 1.8, cooldown: 3, jaw: 1 })
  }
  const act = (shade, dt, frame) => {
    const plan = think(shade, dt, frame)
    const yaw = plan.lunge ? plan.yaw : (plan.step?.yaw ?? plan.yaw)
    if (plan.step?.hop && shade.onGround) shade.vy = SHADES.HOP
    const { player } = frame
    const gap = Math.hypot(player.pos.x - shade.x, player.pos.z - shade.z)
    const closing = Math.cos(yaw - Math.atan2(player.pos.x - shade.x, player.pos.z - shade.z)) > 0
    // Its head reaches well ahead of its middle: it stops short rather than walk its face through the player's
    const willMove = plan.speed > 0 && !(gap < RANGE.close && closing) && (plan.lunge || plan.step || shade.mode === 'backOff')
    const moved = willMove && moveFlat(shade, yaw, plan.speed, dt)
    fall(shade, dt)
    const face = plan.face ?? yaw
    shade.yaw += Math.atan2(Math.sin(face - shade.yaw), Math.cos(face - shade.yaw)) * Math.min(1, dt * (plan.lunge ? 14 : 6))
    shade.moving += ((moved ? Math.min(1, plan.speed / 3) : 0) - shade.moving) * Math.min(1, dt * 8)
    shade.phase += dt * (6 + plan.speed * 2.6) * (0.3 + shade.moving)
    bite(shade, frame)
  }
  /** @param {Shade} shade @param {number} dt @param {ShadeFrame} frame */
  const step = (shade, dt, frame) => {
    shade.jaw *= Math.max(0, 1 - dt * 3)
    shade.hitClock -= dt
    if (shade.rise < 1) {
      shade.rise = Math.min(1, shade.rise + dt / SHADES.RISE_SECONDS)
      shade.status = STATUS.RISING
      return
    }
    if (frame.night < SHADES.DAWN_BELOW || shade.hits >= SHADES.HITS) {
      shade.fade = Math.min(1, shade.fade + dt * (shade.hits >= SHADES.HITS ? 2.2 : 0.7))
      shade.status = STATUS.BURN
      return
    }
    act(shade, dt, frame)
  }

  const add = (x, y, z) => {
    /** @type {Shade} */
    const shade = {
      x, y, z, vy: 0, kx: 0, kz: 0, yaw: random() * Math.PI * 2, onGround: true, mode: 'rise', status: STATUS.RISING,
      rise: 0, fade: 0, phase: random() * 6, moving: 0, side: random() < 0.5 ? 1 : -1, cooldown: 0, timer: 0, hits: 0,
      hitClock: 0, flinch: 0, seed: random() * 50, jaw: 0, paceDir: 1, paceTimer: 0, lungeYaw: 0, head: 0,
    }
    shades.push(shade)
    return shade
  }
  /** Rises from dry, open ground in a ring out of easy reach. */
  const spawnNear = (eye) => {
    for (let tries = 0; tries < 8; tries++) {
      const angle = random() * Math.PI * 2, r = SHADES.SPAWN_NEAR + random() * (SHADES.SPAWN_FAR - SHADES.SPAWN_NEAR)
      const x = Math.floor(eye.x + Math.cos(angle) * r), z = Math.floor(eye.z + Math.sin(angle) * r)
      const found = ground(x, z)
      if (!found || found.wet || solid(world.get(x, found.y + 1, z)) || solid(world.get(x, found.y + 2, z))) continue
      return add(x + 0.5, found.y + 1, z + 0.5)
    }
    return null
  }

  return {
    shades,
    add,
    /** @param {number} dt @param {ShadeFrame} frame */
    update: (dt, frame) => {
      // Held still while the game isn't being played: a pause is a pause, not a way out
      if (!frame.playing) return
      grace = Math.max(0, grace - dt)
      if (grace === 0 && frame.night > SHADES.NIGHT_FROM && shades.length < SHADES.MAX && random() < dt * 0.5) spawnNear(frame.eye)
      for (let i = shades.length - 1; i >= 0; i--) {
        step(shades[i], dt, frame)
        if (shades[i].fade >= 1) shades.splice(i, 1)
      }
    },
    /**
     * The nearest shade along the look, within `reach`, takes a hit: knocked back, and put down by the second.
     * @param {{ x: number, y: number, z: number }} origin
     * @param {{ x: number, y: number, z: number }} dir - unit
     * @param {number} reach
     * @returns {boolean} whether one was hit
     */
    /**
     * Distance along `dir` to the nearest risen shade within `reach`, or null.
     * @param {{ x: number, y: number, z: number }} origin
     * @param {{ x: number, y: number, z: number }} dir
     * @param {number} reach
     * @returns {number | null}
     */
    aimDistance: (origin, dir, reach) => {
      let bestAlong = null
      for (const shade of shades) {
        if (shade.rise < 1) continue
        const tx = shade.x - origin.x, ty = shade.y + 0.9 - origin.y, tz = shade.z - origin.z
        const along = tx * dir.x + ty * dir.y + tz * dir.z
        if (along < 0 || along > reach) continue
        const off = Math.hypot(tx - dir.x * along, ty - dir.y * along, tz - dir.z * along)
        if (off < 0.75 && (bestAlong === null || along < bestAlong)) bestAlong = along
      }
      return bestAlong
    },
    hit: (origin, dir, reach) => {
      let best = null, bestAlong = reach
      for (const shade of shades) {
        const tx = shade.x - origin.x, ty = shade.y + 0.9 - origin.y, tz = shade.z - origin.z
        const along = tx * dir.x + ty * dir.y + tz * dir.z
        if (along < 0 || along > bestAlong) continue
        const off = Math.hypot(tx - dir.x * along, ty - dir.y * along, tz - dir.z * along)
        if (off < 0.75 && shade.rise >= 1) {
          best = shade
          bestAlong = along
        }
      }
      if (!best) return false
      if (best.hitClock > 0) return true
      Object.assign(best, {
        hits: best.hits + 1, hitClock: SHADES.HIT_COOLDOWN, flinch: 0.35, kx: dir.x * 9, kz: dir.z * 9, vy: 4,
        mode: 'backOff', timer: 1.4, cooldown: 2,
      })
      return true
    },
    /** A fresh start after a respawn: none about, and a moment before any rise. */
    respawned: () => {
      shades.length = 0
      grace = SHADES.GRACE
    },
  }
}
