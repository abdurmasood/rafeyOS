// @ts-check
// Mainland & Isles: the continent in the middle of a 512² sea, ringed by islands that match the coast
// they face. One generator, no seams: each column takes the highest of continent, island and sea floor,
// then gets the surface of whichever won.
import { BLOCK } from './blockTypes'
import { carveWorms, sprinkleOre } from './caves'
import { CONTINENT, ZONE, continentAt, fillCanyon, fillContinentColumn, plantContinent } from './continent'
import { ISLE, OPEN_SEA, isCrater, isleSurface, islandField, plantIsle, seaFloor } from './islands'
import { clamp, fbm2, perlin2, smoothstep } from './noise'
import { hash01, mulberry32 } from './random'
import { pickSpawn } from './spawn'
import { WORLD } from './terrain'
import { createGrid, fillColumn, measureHeights, scatter, slopeAt } from './voxelGrid'

/**
 * @typedef {import('./voxelGrid').Grid} Grid
 * @typedef {import('./voxelGrid').Column} Column
 * @typedef {import('./continent').ContinentColumn} ContinentColumn
 * @typedef {object} Shape - what the first pass decides about every column, indexed by z * SIZE + x
 * @property {Int16Array} heights - ground height
 * @property {Uint8Array} craters - 1 inside a volcano crater
 * @property {string[]} owners - OWNER or an ISLE kind: whichever landform won the column
 * @property {Array<ContinentColumn | null>} continent - the continent's reading, where it won
 */

const { SIZE, HEIGHT, WATER_LEVEL: SEA } = WORLD
const SEED = 8521
const OFFSET = (SIZE - CONTINENT.SIZE) / 2
// The continent is only sampled this far past its own edge; its warped coastline never reaches further.
const CONTINENT_MARGIN = 24
const OWNER = Object.freeze({ SEA: OPEN_SEA, CONTINENT: 'continent' })
const ISLES = [
  { kind: ISLE.PINES, x: 250, z: 50, r: 36, peak: 20 }, // off the frost coast
  { kind: ISLE.PINES, x: 394, z: 80, r: 22, peak: 14 },
  { kind: ISLE.PINES, x: 104, z: 98, r: 16, peak: 10 },
  { kind: ISLE.WOODS, x: 466, z: 226, r: 30, peak: 16 }, // off the forest
  { kind: ISLE.ATOLL, x: 470, z: 334, r: 24 },
  { kind: ISLE.JUNGLE, x: 418, z: 432, r: 44, peak: 15 }, // off the swamp
  { kind: ISLE.VOLCANO, x: 254, z: 454, r: 46, peak: 34 }, // off the desert
  { kind: ISLE.ATOLL, x: 96, z: 432, r: 24 },
  { kind: ISLE.BAR, x: 150, z: 474, r: 16 },
  { kind: ISLE.REDSTACKS, x: 54, z: 272, r: 26 }, // off the canyon
  { kind: ISLE.PLAIN, x: 46, z: 170, r: 10, peak: 5 },
  { kind: ISLE.PLAIN, x: 350, z: 488, r: 9, peak: 4 },
]
// The player stands near here on the desert's south shore, looking across the strait at the volcano
const SPAWN_AREA = { x: 252, z: 360 }

/**
 * Drifting ice on the cold northern sea, thinning out toward the middle of the map.
 * @param {Column} column
 */
const isFloe = ([x, z]) => {
  const cold = 1 - smoothstep(40, 160, z)
  return cold > 0 && fbm2(SEED + 1, x / 16, z / 16, 3) + cold * 0.45 > 0.5
}

/**
 * Decides one column: the highest of sea floor, continent and island wins.
 * @param {Shape} shape
 * @param {ReturnType<typeof islandField>} isleField
 * @param {Column} column
 */
const shapeColumn = ({ heights, craters, owners, continent }, isleField, [x, z]) => {
  const i = z * SIZE + x, localX = x - OFFSET, localZ = z - OFFSET, floor = seaFloor(x, z)
  let height = floor
  /** @type {string} */
  let owner = OWNER.SEA
  const nearContinent = [localX, localZ].every((local) => local > -CONTINENT_MARGIN && local < CONTINENT.SIZE + CONTINENT_MARGIN)
  if (nearContinent) {
    const reading = continentAt(localX, localZ)
    if (reading.land > 0.02) { height = Math.max(floor, reading.height); owner = OWNER.CONTINENT; continent[i] = reading }
  }
  const isleHit = isleField.at([x, z], floor)
  if (isleHit.height > height) {
    height = isleHit.height
    owner = isleHit.kind
    continent[i] = null
    craters[i] = isCrater(isleHit.isle, [x, z]) ? 1 : 0
  }
  heights[i] = clamp(Math.round(height), 3, HEIGHT - 8)
  owners[i] = owner
}

/**
 * First pass: height and owner of every column. Done for the whole map before any filling, so the fill
 * pass can read neighbours' heights for slope.
 * @returns {Shape}
 */
const shapeColumns = () => {
  const isleField = islandField(ISLES)
  const cellCount = SIZE * SIZE
  /** @type {Shape} */
  const shape = {
    heights: new Int16Array(cellCount),
    craters: new Uint8Array(cellCount),
    owners: new Array(cellCount),
    continent: new Array(cellCount),
  }
  for (let z = 0; z < SIZE; z++) for (let x = 0; x < SIZE; x++) shapeColumn(shape, isleField, [x, z])
  return shape
}

/**
 * Writes the blocks of one column according to whoever owns it.
 * @param {Grid} grid
 * @param {Shape} shape
 * @param {Column} column
 */
const fillShapedColumn = (grid, { heights, craters, owners, continent }, [x, z]) => {
  const i = z * SIZE + x, top = heights[i], owner = owners[i], slope = slopeAt(heights, SIZE, [x, z])
  if (owner === OWNER.CONTINENT) {
    const reading = /** @type {ContinentColumn} */ (continent[i])
    fillContinentColumn(grid, { x, z, localX: x - OFFSET, localZ: z - OFFSET, top, column: reading, slope })
  } else if (owner === ISLE.REDSTACKS && top > SEA + 6) {
    fillCanyon(grid, { x, z, top, slope })
  } else {
    const noise = perlin2(SEED + 9, x / 8, z / 8)
    const [surface, layers] = isleSurface(owner, top, { slope, noise, inCrater: craters[i] === 1 })
    fillColumn(grid, { x, z, top, surface, layers, sea: SEA })
    if (top < SEA && isFloe([x, z])) grid.set(x, SEA, z, BLOCK.ICE)
  }
}

/**
 * Second pass: the surface, layers and water of every column.
 * @param {Grid} grid
 * @param {Shape} shape
 */
const fillColumns = (grid, shape) => {
  for (let z = 0; z < SIZE; z++) for (let x = 0; x < SIZE; x++) fillShapedColumn(grid, shape, [x, z])
}

/**
 * Caves, then ores. Heights are re-measured in between because the caves change them.
 * @param {Grid} grid
 */
const digUnderground = (grid) => {
  carveWorms(grid, mulberry32(SEED + 30), { count: 40, keepDryBelow: SEA + 2 })
  measureHeights(grid)
  const oreRand = mulberry32(SEED + 31)
  sprinkleOre(grid, oreRand, { ore: BLOCK.COAL_ORE, count: 380, maxY: SEA + 30 })
  sprinkleOre(grid, oreRand, { ore: BLOCK.IRON_ORE, count: 200, maxY: SEA + 8, clusterSize: 4 })
}

/**
 * Trees and plants on every jittered candidate, then a re-measure so heights include the plants.
 * @param {Grid} grid
 * @param {Shape} shape
 */
const plantWorld = (grid, { owners, continent }) => {
  scatter(grid, SEED + 20, 4, ([x, z], rand, roll) => {
    const i = z * SIZE + x
    const reading = continent[i]
    if (owners[i] === OWNER.CONTINENT && reading) plantContinent(grid, [x, z], reading.biome, { rand, roll })
    else plantIsle(grid, [x, z], owners[i], { rand, roll })
  })
  measureHeights(grid)
}

/**
 * @param {Grid} grid
 * @param {Shape} shape
 */
const pickPlayerSpawn = (grid, { owners, continent }) => {
  const volcano = /** @type {NonNullable<typeof ISLES[number]>} */ (ISLES.find((isle) => isle.kind === ISLE.VOLCANO))
  return pickSpawn(grid, {
    score: ([x, z], ground) => {
      const i = z * SIZE + x
      if (owners[i] !== OWNER.CONTINENT || continent[i]?.biome !== ZONE.DESERT || ground - SEA < 4 || ground - SEA > 11) return -Infinity
      return -Math.hypot(x - SPAWN_AREA.x, z - SPAWN_AREA.z) + (ground - SEA) * 1.5 + hash01(SEED, x, 5, z) * 2
    },
    lookAt: () => [volcano.x, volcano.z],
    pitch: -0.2,
  })
}

/**
 * The whole world: what stands in every cell, the ground height of every column, and where the player starts.
 * @returns {Readonly<{ blocks: Uint8Array, heights: Int16Array, spawn: { x: number, y: number, z: number, yaw: number, pitch: number } }>}
 */
export const generateMainland = () => {
  const grid = createGrid(SIZE, HEIGHT)
  const shape = shapeColumns()
  fillColumns(grid, shape)
  digUnderground(grid)
  plantWorld(grid, shape)
  const spawn = pickPlayerSpawn(grid, shape)
  return Object.freeze({ blocks: grid.blocks, heights: grid.heights, spawn })
}
