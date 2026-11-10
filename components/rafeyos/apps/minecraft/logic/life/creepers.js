// Creepers: tall green hostiles that spawn after dark alongside shades, walk up to the player, fuse, and explode.
// They keep going after dawn (no burn). Voxel walk rules match shades. No three.js: creeperMeshes draws.
import { BLOCK } from '@/components/rafeyos/apps/minecraft/logic/blockTypes'
import { WORLD, inBounds } from '@/components/rafeyos/apps/minecraft/logic/terrain'

export const CREEPERS = Object.freeze({
  MAX: 3, GRAVITY: 28, HOP: 8, HITS: 2, HIT_COOLDOWN: 0.3, GRACE: 3,
  SPAWN_NEAR: 16, SPAWN_FAR: 28, NIGHT_FROM: 0.6,
  SPEED: 2.2, FUSE_RANGE: 3, FUSE_CANCEL: 6, FUSE_SECONDS: 1.5,
  BLAST_RADIUS: 3, BLAST_DAMAGE: 10, CLOSE: 1.4,
})

export const STATUS = Object.freeze({ WALK: 'walk', FUSE: 'fuse', HIT: 'hit' })

const SWEEP = Object.freeze([0.45, 0.9, 1.4, 2.0, 2.6])

/**
 * Integer block centres inside a sphere that an explosion should clear: solid, not water, y >= 0, in-world.
 * @param {{ x: number, y: number, z: number }} center
 * @param {number} radius
 * @param {(x: number, y: number, z: number) => number} get
 * @returns {Array<{ x: number, y: number, z: number }>}
 */
export const blastBlocks = (center, radius, get) => {
  const solid = (block) => block !== BLOCK.AIR && block !== BLOCK.WATER
  const out = []
  const r = Math.ceil(radius)
  const cx = Math.floor(center.x), cy = Math.floor(center.y), cz = Math.floor(center.z)
  for (let x = cx - r; x <= cx + r; x++) {
    for (let y = Math.max(0, cy - r); y <= cy + r; y++) {
      for (let z = cz - r; z <= cz + r; z++) {
        if (!inBounds(x, y, z)) continue
        const dx = (x + 0.5) - center.x, dy = (y + 0.5) - center.y, dz = (z + 0.5) - center.z
        if (dx * dx + dy * dy + dz * dz > radius * radius) continue
        const block = get(x, y, z)
        if (!solid(block)) continue
        out.push({ x, y, z })
      }
    }
  }
  return out
}

/**
 * @typedef {{
 *   x: number, y: number, z: number, vy: number, kx: number, kz: number, yaw: number, onGround: boolean,
 *   status: string, fuse: number, phase: number, moving: number, side: number, hits: number, hitClock: number,
 *   flinch: number, seed: number, dead: boolean,
 * }} Creeper - fuse: 0..1 while arming; dead: marked for removal after boom or fatal hits
 * @typedef {{
 *   player: { pos: { x: number, y: number, z: number }, vel: { x: number, y: number, z: number } },
 *   eye: { x: number, y: number, z: number }, night: number, playing: boolean, swimming: boolean, time: number,
 *   onBoom: (creeper: Creeper) => void,
 * }} CreeperFrame
 */

/**
 * @param {{
 *   world: { get: (x: number, y: number, z: number) => number },
 *   ground: (x: number, z: number) => import('./ground').Ground | null, random?: () => number,
 * }} options
 */
export const createCreepers = ({ world, ground, random = Math.random }) => {
  /** @type {Creeper[]} */
  const creepers = []
  let grace = 0

  const blockAt = (x, y, z) => world.get(Math.floor(x), Math.floor(y), Math.floor(z))
  const solid = (block) => block !== BLOCK.AIR && block !== BLOCK.WATER
  const outside = (x, z) => x < 0 || z < 0 || x >= WORLD.SIZE || z >= WORLD.SIZE
  const probe = (creeper, x, z) => {
    const feetY = Math.floor(creeper.y + 0.01)
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
  const probeBody = (creeper, yaw) => {
    const ax = Math.sin(yaw), az = Math.cos(yaw)
    const centre = probe(creeper, creeper.x + ax * 0.75, creeper.z + az * 0.75)
    if (!centre) return null
    for (const side of [0.32, -0.32]) {
      if (!probe(creeper, creeper.x + ax * 0.6 + az * side, creeper.z + az * 0.6 - ax * side)) return null
    }
    return centre
  }
  const steer = (creeper, want) => {
    const order = [0, ...SWEEP.map((o) => o * creeper.side), ...SWEEP.map((o) => -o * creeper.side)]
    for (const offset of order) {
      const yaw = want + offset
      const result = probeBody(creeper, yaw)
      if (!result) continue
      if (offset !== 0) creeper.side = Math.sign(offset)
      return { yaw, hop: result === 'hop' }
    }
    return null
  }
  const moveFlat = (creeper, yaw, speed, dt) => {
    const nx = creeper.x + Math.sin(yaw) * speed * dt + creeper.kx * dt
    const nz = creeper.z + Math.cos(yaw) * speed * dt + creeper.kz * dt
    const feetY = Math.floor(creeper.y + 0.01)
    if (outside(nx, nz) || solid(blockAt(nx, feetY, nz)) || solid(blockAt(nx, feetY + 1, nz)) || blockAt(nx, feetY, nz) === BLOCK.WATER) {
      return false
    }
    creeper.x = nx
    creeper.z = nz
    return true
  }
  const fall = (creeper, dt) => {
    creeper.vy -= CREEPERS.GRAVITY * dt
    creeper.y += creeper.vy * dt
    const below = Math.floor(creeper.y - 0.001)
    creeper.onGround = creeper.vy <= 0 && solid(blockAt(creeper.x, below, creeper.z))
    if (creeper.onGround) {
      creeper.y = below + 1
      creeper.vy = 0
    }
    while (solid(blockAt(creeper.x, creeper.y + 0.01, creeper.z))) creeper.y = Math.floor(creeper.y + 0.01) + 1
  }

  /** @param {Creeper} creeper @param {number} dt @param {CreeperFrame} frame */
  const step = (creeper, dt, frame) => {
    creeper.hitClock -= dt
    creeper.kx *= Math.max(0, 1 - dt * 4)
    creeper.kz *= Math.max(0, 1 - dt * 4)
    if (creeper.hits >= CREEPERS.HITS) {
      creeper.dead = true
      return
    }
    if (creeper.flinch > 0) {
      creeper.flinch -= dt
      creeper.status = STATUS.HIT
      creeper.fuse = 0
      fall(creeper, dt)
      return
    }

    const { player } = frame
    const dx = player.pos.x - creeper.x, dz = player.pos.z - creeper.z
    const flat = Math.hypot(dx, dz), toPlayer = Math.atan2(dx, dz), above = player.pos.y - creeper.y

    if (creeper.status === STATUS.FUSE || (flat <= CREEPERS.FUSE_RANGE && Math.abs(above) < 1.2 && !frame.swimming)) {
      if (flat > CREEPERS.FUSE_CANCEL) {
        creeper.status = STATUS.WALK
        creeper.fuse = 0
      } else {
        creeper.status = STATUS.FUSE
        creeper.fuse = Math.min(1, creeper.fuse + dt / CREEPERS.FUSE_SECONDS)
        creeper.yaw += Math.atan2(Math.sin(toPlayer - creeper.yaw), Math.cos(toPlayer - creeper.yaw)) * Math.min(1, dt * 6)
        creeper.moving *= Math.max(0, 1 - dt * 8)
        creeper.phase += dt * 4
        fall(creeper, dt)
        if (creeper.fuse >= 1) {
          frame.onBoom(creeper)
          creeper.dead = true
        }
        return
      }
    }

    creeper.status = STATUS.WALK
    const stepPlan = steer(creeper, toPlayer)
    const yaw = stepPlan?.yaw ?? toPlayer
    if (stepPlan?.hop && creeper.onGround) creeper.vy = CREEPERS.HOP
    const closing = Math.cos(yaw - toPlayer) > 0
    const willMove = flat > CREEPERS.CLOSE || !closing
    const moved = willMove && stepPlan && moveFlat(creeper, yaw, CREEPERS.SPEED, dt)
    fall(creeper, dt)
    creeper.yaw += Math.atan2(Math.sin(yaw - creeper.yaw), Math.cos(yaw - creeper.yaw)) * Math.min(1, dt * 6)
    creeper.moving += ((moved ? 1 : 0) - creeper.moving) * Math.min(1, dt * 8)
    creeper.phase += dt * (5 + CREEPERS.SPEED * 2) * (0.3 + creeper.moving)
  }

  const add = (x, y, z) => {
    /** @type {Creeper} */
    const creeper = {
      x, y, z, vy: 0, kx: 0, kz: 0, yaw: random() * Math.PI * 2, onGround: true,
      status: STATUS.WALK, fuse: 0, phase: random() * 6, moving: 0, side: random() < 0.5 ? 1 : -1,
      hits: 0, hitClock: 0, flinch: 0, seed: random() * 50, dead: false,
    }
    creepers.push(creeper)
    return creeper
  }

  const spawnNear = (eye) => {
    for (let tries = 0; tries < 8; tries++) {
      const angle = random() * Math.PI * 2
      const r = CREEPERS.SPAWN_NEAR + random() * (CREEPERS.SPAWN_FAR - CREEPERS.SPAWN_NEAR)
      const x = Math.floor(eye.x + Math.cos(angle) * r), z = Math.floor(eye.z + Math.sin(angle) * r)
      const found = ground(x, z)
      if (!found || found.wet || solid(world.get(x, found.y + 1, z)) || solid(world.get(x, found.y + 2, z))) continue
      // Head room for a tall creeper (body ~1.7)
      if (solid(world.get(x, found.y + 3, z))) continue
      return add(x + 0.5, found.y + 1, z + 0.5)
    }
    return null
  }

  return {
    creepers,
    add,
    /** @param {number} dt @param {CreeperFrame} frame */
    update: (dt, frame) => {
      if (!frame.playing) return
      grace = Math.max(0, grace - dt)
      if (grace === 0 && frame.night >= CREEPERS.NIGHT_FROM && creepers.length < CREEPERS.MAX && random() < dt * 0.45) {
        spawnNear(frame.eye)
      }
      for (let i = creepers.length - 1; i >= 0; i--) {
        step(creepers[i], dt, frame)
        if (creepers[i].dead) creepers.splice(i, 1)
      }
    },
    /**
     * @param {{ x: number, y: number, z: number }} origin
     * @param {{ x: number, y: number, z: number }} dir
     * @param {number} reach
     * @returns {boolean}
     */
    hit: (origin, dir, reach) => {
      let best = null, bestAlong = reach
      for (const creeper of creepers) {
        const tx = creeper.x - origin.x, ty = creeper.y + 1.0 - origin.y, tz = creeper.z - origin.z
        const along = tx * dir.x + ty * dir.y + tz * dir.z
        if (along < 0 || along > bestAlong) continue
        const off = Math.hypot(tx - dir.x * along, ty - dir.y * along, tz - dir.z * along)
        if (off < 0.85) {
          best = creeper
          bestAlong = along
        }
      }
      if (!best) return false
      if (best.hitClock > 0) return true
      Object.assign(best, {
        hits: best.hits + 1, hitClock: CREEPERS.HIT_COOLDOWN, flinch: 0.35,
        kx: dir.x * 9, kz: dir.z * 9, vy: 4, fuse: 0, status: STATUS.HIT,
      })
      return true
    },
    /**
     * Distance along `dir` to the nearest creeper within `reach`, or null.
     * @param {{ x: number, y: number, z: number }} origin
     * @param {{ x: number, y: number, z: number }} dir
     * @param {number} reach
     * @returns {number | null}
     */
    aimDistance: (origin, dir, reach) => {
      let bestAlong = null
      for (const creeper of creepers) {
        const tx = creeper.x - origin.x, ty = creeper.y + 1.0 - origin.y, tz = creeper.z - origin.z
        const along = tx * dir.x + ty * dir.y + tz * dir.z
        if (along < 0 || along > reach) continue
        const off = Math.hypot(tx - dir.x * along, ty - dir.y * along, tz - dir.z * along)
        if (off < 0.85 && (bestAlong === null || along < bestAlong)) bestAlong = along
      }
      return bestAlong
    },
    respawned: () => {
      creepers.length = 0
      grace = CREEPERS.GRACE
    },
  }
}
