// The animals around the player, simulated: where herds live (by the ground block, and the continent's zone for grass),
// spawning in a ring out of sight and gone once left far behind, and how each one moves: wandering, grazing and
// bolting when the player comes close, stepping up single blocks and never off a cliff or into water it can't swim.
// Fish keep to schools under the surface; gulls circle overhead by day. No three.js: creatureMeshes draws them.
import { BLOCK } from '@/components/rafeyos/apps/minecraft/logic/blockTypes'
import { ZONE } from '@/components/rafeyos/apps/minecraft/logic/continent'
import { WATER_SURFACE } from '@/components/rafeyos/apps/minecraft/logic/mesher'
import { WORLD } from '@/components/rafeyos/apps/minecraft/logic/terrain'
import { SPECIES } from '@/components/rafeyos/apps/minecraft/logic/life/species'

export const HERDS = Object.freeze({
  NEAR: 30, FAR: 62, GONE: 84, LAND: 34, FISH: 36, SPAWN_EVERY: 0.4, TRIES: 4, FILL_TRIES: 400, FLOCKS: 3, GULLS: 5,
})
// Where a floating duck's feet sit: the drawn water surface, a little sunk
const FLOAT_Y = WORLD.WATER_LEVEL + WATER_SURFACE - 0.12
const ROCK = new Set([BLOCK.STONE, BLOCK.ROCK_RUST, BLOCK.ROCK_CREAM, BLOCK.ROCK_ORANGE, BLOCK.BASALT, BLOCK.DRY_GRASS, BLOCK.MOSSY_STONE])
const SANDY = new Set([BLOCK.SAND, BLOCK.BLACK_SAND, BLOCK.RED_SAND, BLOCK.GRAVEL])
const SHORE_LOOK = Object.freeze([[3, 0], [-3, 0], [0, 3], [0, -3], [2, 2], [-2, -2]])

/**
 * @typedef {{
 *   species: string, x: number, y: number, z: number, yaw: number, turnTo: number, mode: string, timer: number,
 *   phase: number, moving: number, scale: number, grow: number, variant: number, hop: number, headPitch: number,
 *   school?: School, offset?: number[],
 * }} Animal - mode: idle, walk, graze or flee; grow: 0..1 as it appears; hop: a step-up's lift, fading
 * @typedef {{ x: number, y: number, z: number, yaw: number, timer: number, turn: number, steppedAt: number }} School
 * @typedef {{ x: number, y: number, z: number, yaw: number, wing: number }} Gull
 */

/**
 * @param {{
 *   world: { get: (x: number, y: number, z: number) => number },
 *   ground: (x: number, z: number) => import('./ground').Ground | null,
 *   zoneAt: (x: number, z: number) => string, random?: () => number,
 * }} options
 */
export const createHerds = ({ world, ground, zoneAt, random = Math.random }) => {
  /** @type {Animal[]} */
  const animals = []
  /** @type {Gull[]} */
  const gulls = []
  const flocks = []
  const zones = new Map()
  let spawnClock = 0
  let frame = 0
  let flyTime = 0

  const zoneOf = (x, z) => {
    const key = (z >> 2) * (WORLD.SIZE >> 2) + (x >> 2)
    if (!zones.has(key)) zones.set(key, zoneAt(x, z))
    return zones.get(key)
  }
  const nearWater = (x, z) => SHORE_LOOK.some(([dx, dz]) => ground(x + dx, z + dz)?.wet)
  const nearDry = (x, z) => SHORE_LOOK.some(([dx, dz]) => ground(x + dx, z + dz)?.wet === false)
  /** Which herd lives on this column, if any: { species, size: [least, most] }. */
  const herdFor = (x, z) => {
    const found = ground(x, z)
    if (!found) return null
    if (found.wet) {
      if (found.depth >= 3 && zoneOf(x, z) !== ZONE.SWAMP) return { species: 'fish', size: [5, 9] }
      // Ducks float on swamp water, and on shallows by the shore
      if (zoneOf(x, z) === ZONE.SWAMP || (found.depth <= 2 && nearDry(x, z))) return { species: 'duck', size: [2, 4] }
      return null
    }
    const { block, y } = found
    if (block === BLOCK.ICE) return { species: 'penguin', size: [3, 6] }
    if (block === BLOCK.SNOW) return y < 36 ? { species: 'penguin', size: [2, 4] } : { species: 'goat', size: [2, 3] }
    if (block === BLOCK.MARSH_GRASS || block === BLOCK.MUD) return { species: 'duck', size: [2, 4] }
    if (SANDY.has(block)) return nearWater(x, z) ? { species: 'crab', size: [2, 4] } : null
    if (ROCK.has(block)) return y > 40 || zoneOf(x, z) === ZONE.CANYON ? { species: 'goat', size: [2, 3] } : null
    if (block !== BLOCK.GRASS) return null
    const zone = zoneOf(x, z), roll = random()
    if (zone === ZONE.FOREST) return roll < 0.75 ? { species: 'deer', size: [2, 4] } : { species: 'hare', size: [1, 3] }
    if (zone === ZONE.MEADOW) return roll < 0.65 ? { species: 'hare', size: [2, 4] } : { species: 'deer', size: [2, 3] }
    return roll < 0.6 ? { species: 'hare', size: [1, 3] } : { species: 'deer', size: [1, 2] }
  }
  /** Feet height at (x, z) for this species, or null: no wading unless it swims, one block up, two down at most. */
  const standAt = (species, x, z, fromY) => {
    const found = ground(Math.floor(x), Math.floor(z))
    if (!found) return null
    if (found.wet) return SPECIES[species].swims ? FLOAT_Y : null
    const y = found.y + 1
    if (y - fromY > 1.1 || fromY - y > 2.1) return null
    if (world.get(Math.floor(x), found.y + 1, Math.floor(z)) !== BLOCK.AIR) return null
    return y
  }
  const counts = () => {
    let fish = 0
    for (const animal of animals) if (animal.species === 'fish') fish++
    return { land: animals.length - fish, fish }
  }
  const add = (species, at, variant) => {
    const def = SPECIES[species]
    animals.push({
      species, ...at, yaw: random() * Math.PI * 2, turnTo: 0, mode: 'idle', timer: random() * 2, phase: random() * 6,
      moving: 0, scale: 1 + (random() - 0.5) * 2 * def.sizeVar, grow: 0, variant, hop: 0, headPitch: 0,
    })
    return animals.at(-1)
  }
  const addSchool = (x, z, count, found) => {
    const def = SPECIES.fish
    const school = { x: x + 0.5, y: Math.min(FLOAT_Y - 1, found.y + 1 + Math.max(1, found.depth * 0.45)), z: z + 0.5, yaw: random() * 6.28, timer: 0, turn: 0, steppedAt: -1 }
    for (let i = 0; i < count; i++) {
      const fish = add('fish', { x: school.x + (random() - 0.5) * 5, y: school.y + (random() - 0.5), z: school.z + (random() - 0.5) * 5 }, Math.floor(random() * def.colours.length))
      fish.school = school
      fish.offset = [(random() - 0.5) * 3, (random() - 0.5) * 1.2, (random() - 0.5) * 3]
    }
  }
  /** One try at a herd somewhere in the ring round `centre`; `only` keeps it to one species. */
  const trySpawn = (centre, near, far, only = null) => {
    const angle = random() * Math.PI * 2, r = near + random() * (far - near)
    const x = Math.floor(centre.x + Math.cos(angle) * r), z = Math.floor(centre.z + Math.sin(angle) * r)
    const herd = herdFor(x, z)
    if (!herd || (only && herd.species !== only)) return
    const { land, fish } = counts()
    const room = herd.species === 'fish' ? HERDS.FISH - fish : HERDS.LAND - land
    const wanted = herd.size[0] + Math.floor(random() * (herd.size[1] - herd.size[0] + 1))
    const count = Math.min(room, wanted)
    if (count <= 0) return
    const leader = ground(x, z)
    if (herd.species === 'fish') {
      addSchool(x, z, count, leader)
      return
    }
    const variant = Math.floor(random() * SPECIES[herd.species].colours.length)
    for (let i = 0; i < count; i++) {
      const px = x + 0.5 + (random() - 0.5) * 5, pz = z + 0.5 + (random() - 0.5) * 5
      const found = ground(Math.floor(px), Math.floor(pz))
      if (!found || (!found.wet && found.block !== leader.block) || Math.abs(found.y - leader.y) > 2) continue
      const y = found.wet ? (SPECIES[herd.species].swims ? FLOAT_Y : null) : found.y + 1
      if (y !== null) add(herd.species, { x: px, y, z: pz }, variant)
    }
  }

  /** @param {Animal} animal @param {{ x: number, z: number, speed: number }} player @param {number} dt */
  const stepLand = (animal, player, dt) => {
    const def = SPECIES[animal.species]
    const dx = animal.x - player.x, dz = animal.z - player.z
    const distance = Math.hypot(dx, dz)
    if (def.flee && distance < def.flee && (player.speed > 1.5 || distance < def.flee * 0.5)) {
      animal.mode = 'flee'
      animal.timer = 1.6 + random()
      animal.turnTo = Math.atan2(dx, dz)
    }
    animal.timer -= dt
    if (animal.timer <= 0) {
      const roll = random()
      if (roll < 0.5) Object.assign(animal, { mode: 'walk', timer: 1.5 + random() * 3, turnTo: animal.yaw + (random() - 0.5) * 2.6 })
      else if (roll < 0.8) Object.assign(animal, { mode: 'graze', timer: 2 + random() * 3 })
      else Object.assign(animal, { mode: 'idle', timer: 1 + random() * 2 })
    }
    const turn = Math.atan2(Math.sin(animal.turnTo - animal.yaw), Math.cos(animal.turnTo - animal.yaw))
    animal.yaw += turn * Math.min(1, dt * (animal.mode === 'flee' ? 10 : 4))
    const going = animal.mode === 'walk' || animal.mode === 'flee'
    animal.moving += ((going ? 1 : 0) - animal.moving) * Math.min(1, dt * 8)
    if (going) moveLand(animal, def, dt)
    const stride = { hop: 9, scuttle: 16, waddle: 10 }[def.gait] ?? 8
    animal.phase += dt * stride * (0.4 + animal.moving)
    animal.hop = Math.max(0, animal.hop - dt * 3)
    animal.headPitch += ((animal.mode === 'graze' ? 0.75 : 0) - animal.headPitch) * Math.min(1, dt * 6)
  }
  const moveLand = (animal, def, dt) => {
    const speed = def.speed * (animal.mode === 'flee' ? 1.9 : 0.55)
    // Crabs face one way and scuttle across it
    const heading = def.gait === 'scuttle' ? animal.yaw + (Math.PI / 2) * (Math.sin(animal.phase * 0.2) >= 0 ? 1 : -1) : animal.yaw
    const nx = animal.x + Math.sin(heading) * speed * dt, nz = animal.z + Math.cos(heading) * speed * dt
    const y = standAt(animal.species, nx, nz, animal.y)
    if (y === null) {
      animal.turnTo = animal.yaw + Math.PI * (0.6 + random() * 0.8)
      if (animal.mode !== 'flee') animal.mode = 'idle'
      return
    }
    animal.x = nx
    animal.z = nz
    if (y > animal.y + 0.2) animal.hop = Math.max(animal.hop, 0.6)
    animal.y += (y - animal.y) * Math.min(1, dt * 12)
  }
  /** @param {Animal} fish @param {{ x: number, z: number }} player @param {number} dt */
  const stepFish = (fish, player, dt) => {
    const school = fish.school
    if (school.steppedAt !== frame) {
      school.steppedAt = frame
      school.timer -= dt
      if (school.timer <= 0) Object.assign(school, { timer: 2 + random() * 3, turn: (random() - 0.5) * 1.6 })
      const scared = Math.hypot(school.x - player.x, school.z - player.z) < 5
      school.yaw += school.turn * dt + (scared ? dt * 3 : 0)
      const speed = SPECIES.fish.speed * (scared ? 2.2 : 0.6)
      const nx = school.x + Math.sin(school.yaw) * speed * dt, nz = school.z + Math.cos(school.yaw) * speed * dt
      const found = ground(Math.floor(nx), Math.floor(nz))
      if (!found || !found.wet || found.depth < 2) school.yaw += Math.PI * 0.7
      else Object.assign(school, { x: nx, z: nz, y: school.y + (Math.min(FLOAT_Y - 1, found.y + 1.2 + found.depth * 0.4) - school.y) * dt })
    }
    const tx = school.x + fish.offset[0], tz = school.z + fish.offset[2]
    const dx = tx - fish.x, dz = tz - fish.z
    fish.x += dx * Math.min(1, dt * 2.2)
    fish.y += (school.y + fish.offset[1] - fish.y) * Math.min(1, dt * 2)
    fish.z += dz * Math.min(1, dt * 2.2)
    if (Math.hypot(dx, dz) > 0.05) fish.yaw = Math.atan2(dx, dz) * 0.3 + school.yaw * 0.7
    fish.phase += dt * 10
    fish.moving = 1
  }
  /** Gulls wheel round loose centres that follow the player, flapping now and then between glides. */
  const stepGulls = (dt, player) => {
    flyTime += dt
    if (!flocks.length) {
      for (let f = 0; f < HERDS.FLOCKS; f++) {
        flocks.push({
          x: player.x, z: player.z, y: 46 + f * 5, r: 14 + f * 8, angle: random() * 6, spin: (0.18 + f * 0.04) * (f % 2 ? 1 : -1),
          birds: Array.from({ length: HERDS.GULLS }, (_, i) => ({ lag: i * 0.35 + random() * 0.2, dy: (random() - 0.5) * 3, dr: (random() - 0.5) * 4, flap: random() * 10 })),
        })
      }
    }
    gulls.length = 0
    for (const flock of flocks) {
      flock.x += (player.x + Math.sin(flock.y) * 20 - flock.x) * Math.min(1, dt * 0.08)
      flock.z += (player.z + Math.cos(flock.y) * 20 - flock.z) * Math.min(1, dt * 0.08)
      flock.angle += flock.spin * dt
      const way = Math.sign(flock.spin)
      for (const bird of flock.birds) {
        const a = flock.angle + bird.lag * way
        const flapping = Math.sin((flyTime + bird.flap) * 2.1) > 0.3
        gulls.push({
          x: flock.x + Math.cos(a) * (flock.r + bird.dr), y: flock.y + bird.dy + Math.sin((flyTime + bird.flap) * 0.9) * 0.6,
          z: flock.z + Math.sin(a) * (flock.r + bird.dr), yaw: Math.atan2(-Math.sin(a) * way, Math.cos(a) * way),
          wing: flapping ? Math.sin((flyTime + bird.flap) * 9) * 0.7 : 0.08,
        })
      }
    }
  }

  return {
    animals,
    gulls,
    /** A fresh neighbourhood round `centre`, with every animal already there. @param {{ x: number, z: number }} centre */
    populate: (centre) => {
      animals.length = 0
      flocks.length = 0
      for (let i = 0; i < HERDS.FILL_TRIES; i++) trySpawn(centre, 6, HERDS.FAR)
      animals.forEach((animal) => { animal.grow = 1 })
    },
    /**
     * @param {number} dt
     * @param {{ x: number, z: number, speed: number }} player - speed: across the ground, for whether animals bolt
     */
    update: (dt, player) => {
      frame++
      spawnClock += dt
      if (spawnClock >= HERDS.SPAWN_EVERY) {
        spawnClock = 0
        for (let i = 0; i < HERDS.TRIES; i++) trySpawn(player, HERDS.NEAR, HERDS.FAR)
      }
      for (let i = animals.length - 1; i >= 0; i--) {
        const animal = animals[i]
        if (Math.hypot(animal.x - player.x, animal.z - player.z) > HERDS.GONE) {
          animals.splice(i, 1)
          continue
        }
        if (animal.species === 'fish') stepFish(animal, player, dt)
        else stepLand(animal, player, dt)
        animal.grow = Math.min(1, animal.grow + dt * 2)
      }
      stepGulls(dt, player)
    },
    herdFor,
    standAt,
  }
}
