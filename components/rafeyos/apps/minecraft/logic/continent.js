// @ts-check
// The continent: one landmass split into six climate zones, each with its own ground, relief and trees.
// It samples in its own 256² local coordinates and can be written anywhere.
import { BLOCK } from './blockTypes'
import { fbm2, lerp, perlin2, ridged2, smoothstep } from './noise'
import { hash01 } from './random'
import { fillColumn } from './voxelGrid'
import { bigOak, birch, boulder, bush, cactus, flatTop, oak, pine, swampTree } from './flora'

/**
 * @typedef {import('./voxelGrid').Grid} Grid
 * @typedef {import('./voxelGrid').Column} Column
 * @typedef {import('./voxelGrid').Layers} Layers
 * @typedef {{ height: number, land: number, biome: string }} ContinentColumn - height, land share (0 sea to 1 inland) and zone
 * @typedef {[number, Layers]} Surface - the surface block and the layers under it
 */

const SIZE = 256, SEA = 28, SEED = 5203

export const ZONE = Object.freeze({
  FROST: 'frost',
  FOREST: 'forest',
  MEADOW: 'meadow',
  SWAMP: 'swamp',
  DESERT: 'desert',
  CANYON: 'canyon',
})

// Each zone grows from a seed point inside the landmass; warped distance makes the borders wander.
// Seeding by position (not by temperature/rainfall extremes) guarantees all six fit on the land.
const ZONE_SEEDS = [
  { id: ZONE.FROST, x: 122, z: 40 },
  { id: ZONE.FOREST, x: 192, z: 98 },
  { id: ZONE.MEADOW, x: 96, z: 112 },
  { id: ZONE.SWAMP, x: 194, z: 188 },
  { id: ZONE.DESERT, x: 112, z: 206 },
  { id: ZONE.CANYON, x: 40, z: 150 },
]
const BANDS = [
  BLOCK.ROCK_ORANGE, BLOCK.ROCK_ORANGE, BLOCK.ROCK_CREAM, BLOCK.ROCK_RUST, BLOCK.ROCK_ORANGE, BLOCK.ROCK_RUST,
  BLOCK.ROCK_RUST, BLOCK.ROCK_CREAM, BLOCK.ROCK_ORANGE, BLOCK.RED_SAND, BLOCK.ROCK_RUST, BLOCK.ROCK_CREAM,
]
const ZONE_SPREAD = 34

/**
 * How strongly each zone claims (x, z), summing to 1.
 * @param {number} x
 * @param {number} z
 * @param {number} [jitter]
 */
const zoneClaims = (x, z, jitter = 0) => {
  const warpedX = x + 34 * fbm2(SEED + 1, x / 70, z / 70, 3) + jitter
  const warpedZ = z + 34 * fbm2(SEED + 2, x / 70 + 3, z / 70, 3) + jitter
  const claims = ZONE_SEEDS.map((zone) => Math.exp(-((warpedX - zone.x) ** 2 + (warpedZ - zone.z) ** 2) / (ZONE_SPREAD * ZONE_SPREAD)))
  const total = claims.reduce((sum, claim) => sum + claim, 0) || 1
  return claims.map((claim) => claim / total)
}

/**
 * @param {number} value
 * @param {number} step
 */
const terrace = (value, step) => Math.floor(value / step) * step + smoothstep(0.8, 1, (value / step) % 1) * step

/**
 * The height each zone would give (x, z).
 * @param {number} x
 * @param {number} z
 * @returns {Record<string, number>}
 */
const reliefByZone = (x, z) => {
  const rolling = fbm2(SEED + 4, x / 40, z / 40, 4)
  const dune = Math.pow(1 - Math.abs(perlin2(SEED + 6, (x + 30 * rolling) / 30, z / 13)), 3)
  const mesa = smoothstep(-0.02, 0.14, fbm2(SEED + 7, x / 46, z / 46, 3))
  return {
    [ZONE.FROST]: 7 + 9 * rolling + 40 * Math.pow(ridged2(SEED + 3, x / 52, z / 52, 5), 2.2),
    [ZONE.FOREST]: 6 + 10 * rolling,
    [ZONE.MEADOW]: 4 + 5 * rolling,
    [ZONE.SWAMP]: 0.7 + 2.4 * fbm2(SEED + 5, x / 16, z / 16, 3),
    [ZONE.DESERT]: 4 + 8 * dune + 3 * rolling,
    [ZONE.CANYON]: 4 + terrace(mesa * 32 + 6 * fbm2(SEED + 8, x / 18, z / 18, 2), 5),
  }
}

/**
 * Height, land share and zone of one continent column, in the continent's local coordinates.
 * @param {number} x
 * @param {number} z
 * @returns {ContinentColumn}
 */
export const continentAt = (x, z) => {
  const warpedX = x + 22 * fbm2(SEED + 9, x / 70, z / 70, 3), warpedZ = z + 22 * fbm2(SEED + 10, x / 70 + 5, z / 70, 3)
  const land = 1 - smoothstep(0.68, 1.02, Math.hypot(warpedX - SIZE / 2, warpedZ - SIZE / 2) / 120)
  const claims = zoneClaims(x, z), relief = reliefByZone(x, z)
  let altitude = 0
  ZONE_SEEDS.forEach((zone, i) => (altitude += claims[i] * relief[zone.id]))
  let height = SEA - 14 + land * (14 + altitude)
  const bend = Math.abs(fbm2(SEED + 11, warpedX / 140, warpedZ / 140, 3))
  const river = (1 - smoothstep(0.012, 0.04, bend)) * smoothstep(0.4, 0.7, land)
  height = lerp(height, Math.min(height, SEA - 2), river)
  // Jitter only the zone pick, so borders are ragged but heights stay smooth
  const jitteredClaims = zoneClaims(x, z, (hash01(SEED, x, 7, z) - 0.5) * 3)
  const biome = ZONE_SEEDS[jitteredClaims.indexOf(Math.max(...jitteredClaims))].id
  return { height, land, biome }
}

/**
 * The surface block and layers under it, or null for canyon country, which fills its own columns.
 * @param {Column} localColumn - the column in the continent's own coordinates
 * @param {number} height
 * @param {{ land: number, biome: string }} column
 * @param {number} slope
 * @returns {Surface | null}
 */
export const surfaceFor = ([localX, localZ], height, { land, biome }, slope) => {
  const noise = perlin2(SEED + 12, localX / 9, localZ / 9), altitude = height - SEA
  if (height < SEA) {
    if (biome === ZONE.SWAMP) return [noise > 0 ? BLOCK.MUD : BLOCK.CLAY, [[BLOCK.MUD, 2]]]
    if (biome === ZONE.FROST) return [BLOCK.GRAVEL, [[BLOCK.GRAVEL, 2]]]
    if (SEA - height <= 3) return [biome === ZONE.CANYON ? BLOCK.RED_SAND : BLOCK.SAND, [[BLOCK.SAND, 2]]]
    return [noise > 0.25 ? BLOCK.GRAVEL : noise < -0.3 ? BLOCK.CLAY : BLOCK.SAND, [[BLOCK.SAND, 2]]]
  }
  if (height <= SEA + 1 && land < 0.97) {
    if (biome === ZONE.FROST) return [BLOCK.GRAVEL, [[BLOCK.GRAVEL, 2]]]
    if (biome === ZONE.SWAMP) return [BLOCK.MUD, [[BLOCK.MUD, 2]]]
    return [biome === ZONE.CANYON ? BLOCK.RED_SAND : BLOCK.SAND, [[BLOCK.SAND, 3]]]
  }
  switch (biome) {
    case ZONE.FROST: return [altitude > 30 && slope >= 3 ? BLOCK.STONE : BLOCK.SNOW, [[BLOCK.DIRT, 2]]]
    case ZONE.SWAMP: return [BLOCK.MARSH_GRASS, [[BLOCK.MUD, 3]]]
    case ZONE.DESERT: return [BLOCK.SAND, [[BLOCK.SAND, 3], [BLOCK.SANDSTONE, 5]]]
    case ZONE.CANYON: return null
    default: return [slope >= 5 ? BLOCK.STONE : BLOCK.GRASS, [[BLOCK.DIRT, 3]]]
  }
}

/**
 * @typedef {object} CanyonSpec
 * @property {number} x
 * @property {number} z
 * @property {number} top
 * @property {number} slope
 * @property {number} [localX] - where the band shift is sampled; defaults to x
 * @property {number} [localZ] - defaults to z
 */

/**
 * Red-rock country: sand floors, banded cliff walls, dry grass on the mesa tops.
 * @param {Grid} grid
 * @param {CanyonSpec} column
 */
export const fillCanyon = (grid, { x, z, top, slope, localX = x, localZ = z }) => {
  const shift = Math.floor(3 * perlin2(SEED + 13, localX / 50, localZ / 50))
  const band = (/** @type {number} */ y) => BANDS[(((y + shift) % BANDS.length) + BANDS.length) % BANDS.length]
  const altitude = top - SEA
  /** @type {Layers} */
  const layers = []
  for (let y = top - 1; y > SEA + 1; y--) layers.push([band(y), 1])
  const surface = altitude <= 6 ? BLOCK.RED_SAND : slope <= 1 ? BLOCK.DRY_GRASS : band(top)
  fillColumn(grid, { x, z, top, surface, layers: altitude <= 6 ? [[BLOCK.RED_SAND, 2], ...layers] : layers, sea: SEA })
}

/** The continent as a reusable layer: sample it in its own 256² local coordinates, write anywhere. */
export const CONTINENT = Object.freeze({ SIZE, SEA })

/**
 * @typedef {object} ContinentFill
 * @property {number} x - where to write
 * @property {number} z
 * @property {number} localX - where the continent is sampled
 * @property {number} localZ
 * @property {number} top
 * @property {{ land: number, biome: string }} column
 * @property {number} slope
 */

/**
 * Writes one continent column at (x, z), sampled from local (localX, localZ).
 * @param {Grid} grid
 * @param {ContinentFill} fill
 */
export const fillContinentColumn = (grid, { x, z, localX, localZ, top, column, slope }) => {
  const surface = surfaceFor([localX, localZ], top, column, slope)
  if (surface) fillColumn(grid, { x, z, top, surface: surface[0], layers: surface[1], sea: SEA })
  else fillCanyon(grid, { x, z, top, slope, localX, localZ })
  if (column.biome === ZONE.FROST && top < SEA) grid.set(x, SEA, z, BLOCK.ICE)
}

/**
 * Grows whatever the zone grows at a column, if the ground suits it.
 * @param {Grid} grid
 * @param {Column} column
 * @param {string} zone
 * @param {{ rand: () => number, roll: number }} dice - `roll` decides whether to plant, `rand` shapes the plant
 */
export const plantContinent = (grid, [x, z], zone, { rand, roll }) => {
  const top = grid.top(x, z), ground = grid.get(x, top, z)
  /** @type {import('./voxelGrid').Position} */
  const above = [x, top + 1, z]
  if (zone === ZONE.FROST && ground === BLOCK.SNOW && top - SEA < 30) {
    if (roll < 0.45) pine(grid, above, rand)
    return
  }
  if (zone === ZONE.FOREST && ground === BLOCK.GRASS) {
    if (roll < 0.8) {
      const pick = rand()
      const grow = pick < 0.4 ? oak : pick < 0.6 ? bigOak : birch
      grow(grid, above, rand)
    }
    return
  }
  if (zone === ZONE.MEADOW && ground === BLOCK.GRASS) {
    if (roll < 0.04) oak(grid, above, rand)
    else if (roll < 0.09) bush(grid, above, rand)
    else if (roll < 0.12) boulder(grid, [x, top, z], rand)
    return
  }
  if (zone === ZONE.SWAMP && ground === BLOCK.MARSH_GRASS) {
    if (roll < 0.22) swampTree(grid, above, rand)
    else if (roll < 0.3) bush(grid, above, rand, { leaves: BLOCK.MARSH_LEAVES })
    return
  }
  if (zone === ZONE.DESERT && ground === BLOCK.SAND && top > SEA + 2) {
    if (roll < 0.09) cactus(grid, above, rand)
    return
  }
  if (zone === ZONE.CANYON && ground === BLOCK.DRY_GRASS) {
    if (roll < 0.12) flatTop(grid, above, rand)
    else if (roll < 0.18) bush(grid, above, rand)
  }
}
