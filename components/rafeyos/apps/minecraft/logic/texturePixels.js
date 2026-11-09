// @ts-check
// The pixel-art texture atlas, painted in code into an RGBA buffer: 16px tiles in an 8 × 8 grid
import { TILE } from './blockTypes'
import { mulberry32 } from './random'

export const ATLAS = Object.freeze({ TILE: 16, COLS: 8, SIZE: 128 })

const TEXTURE_SEED = 7
const CRACK = '#6d7277'

/** @type {Readonly<Record<number, readonly string[]>>} */
const PALETTES = Object.freeze({
  [TILE.GRASS_TOP]: ['#6f9f46', '#79aa4e', '#65933f', '#84b358', '#6f9f46'],
  [TILE.DIRT]: ['#8b5f3c', '#7d5435', '#976b45', '#6f4b2f', '#8b5f3c'],
  [TILE.STONE]: ['#8f9499', '#83888d', '#9a9fa4', '#8f9499'],
  [TILE.SAND]: ['#e1d2a2', '#d7c692', '#e9dbad', '#e1d2a2'],
  [TILE.LOG_SIDE]: ['#6b4b2d', '#5c3f25', '#785535'],
  [TILE.LOG_TOP]: ['#b48b57', '#a17b49', '#6b4b2d'],
  [TILE.LEAVES]: ['#3e7b36', '#346c2e', '#498a40', '#2d5f28'],
  [TILE.PLANKS]: ['#b98a50', '#ad7f48', '#c4955b', '#7e5b34'],
  [TILE.BRICK]: ['#a6563f', '#b26149', '#984c38', '#d3c7b7'],
  [TILE.SNOW]: ['#f2f5f8', '#e6ecf2', '#fbfcfd', '#dce4ec'],
  [TILE.WATER]: ['#3d80d6', '#4689dd', '#3775ca'],
})

/**
 * The tile's top-left pixel in the atlas.
 * @param {number} tile
 * @returns {[number, number]}
 */
export const tileOrigin = (tile) => [(tile % ATLAS.COLS) * ATLAS.TILE, Math.floor(tile / ATLAS.COLS) * ATLAS.TILE]

/** @param {string} hex */
const toRgb = (hex) => [1, 3, 5].map((at) => parseInt(hex.slice(at, at + 2), 16))

/**
 * Hairline cracks: a few short runs that sometimes step down a row.
 * @param {() => number} rand
 */
const crackPixels = (rand) => {
  const cracks = new Set()
  for (let i = 0; i < 5; i++) {
    const x = Math.floor(rand() * ATLAS.TILE)
    let y = Math.floor(rand() * ATLAS.TILE)
    const length = 2 + Math.floor(rand() * 4)
    for (let k = 0; k < length; k++) {
      cracks.add(`${(x + k) % ATLAS.TILE},${y}`)
      if (rand() < 0.35) y = (y + 1) % ATLAS.TILE
    }
  }
  return cracks
}

/**
 * How to colour one tile: a function of (x, y) that draws its speckle from `rand`.
 * @param {number} tile
 * @param {() => number} rand
 * @returns {(x: number, y: number) => string}
 */
const texel = (tile, rand) => {
  const palette = PALETTES[tile]
  /** @param {readonly string[]} colours */
  const any = (colours) => colours[Math.floor(rand() * colours.length)]
  switch (tile) {
    case TILE.GRASS_SIDE: {
      const edge = Array.from({ length: ATLAS.TILE }, () => 3 + Math.floor(rand() * 3))
      return (x, y) => (y < edge[x] ? any(PALETTES[TILE.GRASS_TOP]) : any(PALETTES[TILE.DIRT]))
    }
    case TILE.STONE: {
      const cracks = crackPixels(rand)
      return (x, y) => (cracks.has(`${x},${y}`) ? CRACK : any(palette))
    }
    case TILE.LOG_SIDE: {
      const stripe = Array.from({ length: ATLAS.TILE }, () => Math.floor(rand() * 3))
      return (x) => palette[(stripe[x] + (rand() < 0.18 ? 1 : 0)) % palette.length]
    }
    case TILE.LOG_TOP:
      return (x, y) => {
        const ring = Math.max(Math.abs(x - 7.5), Math.abs(y - 7.5))
        return ring > 6.5 ? palette[2] : palette[Math.floor(ring) % 2]
      }
    case TILE.PLANKS:
      return (x, y) => (y % 4 === 3 || x === (Math.floor(y / 4) * 7 + 3) % ATLAS.TILE ? palette[3] : palette[Math.floor(rand() * 3)])
    case TILE.BRICK:
      return (x, y) => (y % 4 === 3 || (x + (Math.floor(y / 4) % 2) * 4) % 8 === 7 ? palette[3] : palette[Math.floor(rand() * 3)])
    default:
      return () => any(palette)
  }
}

const TILE_SIZE = ATLAS.TILE
const FIRST_BIOME_TILE = TILE.PINE_BARK

/** @typedef {[number, number, number]} Rgb */
/** @typedef {(tile: number, x: number, y: number) => Rgb} BasePixel */

/** @type {Readonly<Record<string, readonly string[]>>} */
const BIOME_PALETTES = Object.freeze({
  pineBark: ['#4f3a26', '#5a432c', '#463220'],
  needles: ['#2f5a3c', '#29503a', '#356445', '#22442f'],
  birch: ['#e4e0d4', '#d9d4c6', '#ece9df', '#dcd7ca'],
  birchLeaves: ['#7fa64a', '#88b053', '#739a42', '#93b95e'],
  gravel: ['#8a8580', '#7a7570', '#9b9690', '#6b6560', '#a8a29b'],
  clay: ['#a3abb8', '#9aa2af', '#abb3bf', '#a3abb8'],
  ice: ['#a9cdf0', '#b5d5f3', '#9fc4ea', '#a9cdf0'],
  sandstone: ['#d8c48e', '#cdb882', '#e0cd99'],
  redSand: ['#c4703a', '#b9652f', '#cf7c45', '#c4703a'],
  rust: ['#8e4a2f', '#844429', '#995236'],
  cream: ['#d9bf9a', '#cfb48f', '#e2c9a5'],
  orange: ['#c0703f', '#b56738', '#ca7a48'],
  cactus: ['#4f8a3a', '#57943f', '#478034'],
  mud: ['#4b3f35', '#42372e', '#53463b', '#3a3029'],
  marsh: ['#5f7a3a', '#687f40', '#566f34', '#71884a'],
  basalt: ['#45474c', '#3d3f44', '#4d5055'],
  palmBark: ['#9c7a52', '#8f6f4a', '#a8865d'],
  palmLeaves: ['#4f9a3a', '#58a742', '#468a34', '#63b04c'],
  dry: ['#a9a65a', '#b5b066', '#9c9a50', '#bdb873'],
  magma: ['#3a1a14', '#2c1410', '#451f17'],
  marshLeaves: ['#4b5e2a', '#435426', '#536732', '#3b4a22'],
  blackSand: ['#3c3c40', '#45454a', '#333336', '#55555b'],
})

/**
 * @param {string} hex
 * @returns {Rgb}
 */
const rgb = (hex) => /** @type {Rgb} */ (toRgb(hex))

/**
 * One tile's pixels, row by row (x runs fastest), from a colour per (x, y).
 * @param {(x: number, y: number) => Rgb} colourAt
 * @returns {Rgb[]}
 */
const grid = (colourAt) => Array.from({ length: TILE_SIZE * TILE_SIZE }, (_, i) => colourAt(i % TILE_SIZE, Math.floor(i / TILE_SIZE)))

/**
 * @param {() => number} rand
 * @param {readonly string[]} palette
 */
const pick = (rand, palette) => palette[Math.floor(rand() * palette.length)]

/**
 * @param {() => number} rand
 * @param {readonly string[]} palette
 */
const speckle = (rand, palette) => grid(() => rgb(pick(rand, palette)))

/**
 * A random walk, wrapped around the tile, for cracks and seams.
 * @param {() => number} rand
 * @param {{ length: number, start: [number, number], step: (x: number, y: number, rand: () => number) => [number, number] }} options
 */
const walk = (rand, { length, start, step }) => {
  /** @type {Array<[number, number]>} */
  const points = []
  let [x, y] = start
  for (let i = 0; i < length; i++) {
    points.push([((x % TILE_SIZE) + TILE_SIZE) % TILE_SIZE, ((y % TILE_SIZE) + TILE_SIZE) % TILE_SIZE])
    const next = step(x, y, rand)
    x = next[0]
    y = next[1]
  }
  return points
}

/**
 * @param {Rgb[]} pixels
 * @param {Array<[number, number]>} points
 * @param {string} colour
 */
const put = (pixels, points, colour) => points.forEach(([x, y]) => { pixels[y * TILE_SIZE + x] = rgb(colour) })

/**
 * Scatters small patches of `palette` over `pixels`, each pixel of a patch kept 80% of the time.
 * @param {() => number} rand
 * @param {Rgb[]} pixels
 * @param {{ count: number, palette: readonly string[], size: number }} patches
 */
const blobs = (rand, pixels, { count, palette, size }) => {
  for (let i = 0; i < count; i++) {
    const bx = Math.floor(rand() * (TILE_SIZE - size))
    const by = Math.floor(rand() * (TILE_SIZE - size))
    for (let dy = 0; dy < size; dy++) {
      for (let dx = 0; dx < size; dx++) {
        if (rand() < 0.8) pixels[(by + dy) * TILE_SIZE + bx + dx] = rgb(pick(rand, palette))
      }
    }
  }
  return pixels
}

/**
 * Recolours the green fringe of the grass-side tile, keeping its exact ragged edge.
 * @param {BasePixel} basePixel
 * @param {readonly string[]} palette
 */
const regrass = (basePixel, palette) => grid((x, y) => {
  const [r, g, b] = basePixel(TILE.GRASS_SIDE, x, y)
  if (!(g > r + 8 && g > b)) return [r, g, b]
  const rank = Math.min(palette.length - 1, Math.max(0, Math.round(((g - 120) / 70) * (palette.length - 1))))
  return rgb(palette[rank])
})

/**
 * @param {BasePixel} basePixel
 * @param {number} tile
 */
const copyOf = (basePixel, tile) => grid((x, y) => basePixel(tile, x, y))

/**
 * A square-ringed tile: a solid edge, a solid centre and speckle between.
 * @param {() => number} rand
 * @param {{ palette: readonly string[], inner: string, edge: string }} colours
 */
const ringTile = (rand, { palette, inner, edge }) => grid((x, y) => {
  const ring = Math.max(Math.abs(x - 7.5), Math.abs(y - 7.5))
  return rgb(ring > 6.5 ? edge : ring < 2 ? inner : pick(rand, palette))
})

/**
 * Each painter draws a whole tile, making its `rand()` calls in the order they were made when the pixels were approved.
 * @type {Readonly<Record<string, (rand: () => number, basePixel: BasePixel) => Rgb[]>>}
 */
const PAINTERS = Object.freeze({
  PINE_BARK: (rand) => grid((x) => rgb(x % 4 === 0 ? '#36271a' : pick(rand, BIOME_PALETTES.pineBark))),
  PINE_NEEDLES: (rand) => speckle(rand, BIOME_PALETTES.needles),
  BIRCH_BARK: (rand) => {
    const pixels = speckle(rand, BIOME_PALETTES.birch)
    for (let y = 0; y < TILE_SIZE; y++) {
      if (rand() >= 0.3) continue
      const start = Math.floor(rand() * TILE_SIZE)
      const length = 2 + Math.floor(rand() * 3)
      for (let i = 0; i < length; i++) pixels[y * TILE_SIZE + ((start + i) % TILE_SIZE)] = rgb(rand() < 0.7 ? '#3a3530' : '#5a534a')
    }
    return pixels
  },
  BIRCH_LEAVES: (rand) => speckle(rand, BIOME_PALETTES.birchLeaves),
  GRAVEL: (rand) => blobs(rand, speckle(rand, ['#7f7a75', '#86817c']), { count: 26, palette: BIOME_PALETTES.gravel, size: 2 }),
  CLAY: (rand) => speckle(rand, BIOME_PALETTES.clay),
  ICE: (rand) => {
    const pixels = speckle(rand, BIOME_PALETTES.ice)
    put(pixels, walk(rand, { length: 14, start: [1, 2], step: (x, y, r) => [x + 1, y + (r() < 0.5 ? 1 : 0)] }), '#e2eefa')
    put(pixels, walk(rand, { length: 10, start: [9, 8], step: (x, y, r) => [x + (r() < 0.5 ? 1 : 0), y + 1] }), '#e2eefa')
    return pixels
  },
  SANDSTONE_SIDE: (rand) => grid((x, y) => {
    if (y === 3 || y === 12) return rgb('#bfa972')
    if (y < 3) return rgb(pick(rand, ['#e3d19e', '#ddca96']))
    return rgb(pick(rand, BIOME_PALETTES.sandstone))
  }),
  SANDSTONE_TOP: (rand) => grid((x, y) => rgb(x === 0 || y === 0 ? '#c9b47e' : pick(rand, BIOME_PALETTES.sandstone))),
  RED_SAND: (rand) => speckle(rand, BIOME_PALETTES.redSand),
  ROCK_RUST: (rand) => grid((x, y) => rgb(y % 5 === 4 ? '#7a3d25' : pick(rand, BIOME_PALETTES.rust))),
  ROCK_CREAM: (rand) => grid((x, y) => rgb(y % 5 === 4 ? '#c4a983' : pick(rand, BIOME_PALETTES.cream))),
  ROCK_ORANGE: (rand) => grid((x, y) => rgb(y % 5 === 4 ? '#a65f33' : pick(rand, BIOME_PALETTES.orange))),
  CACTUS_SIDE: (rand) => grid((x) => {
    if (x % 5 === 2) return rgb(rand() < 0.15 ? '#d8e3a4' : '#3b6e2c')
    return rgb(x === 0 || x === 15 ? '#3f7330' : pick(rand, BIOME_PALETTES.cactus))
  }),
  CACTUS_TOP: (rand) => ringTile(rand, { palette: BIOME_PALETTES.cactus, inner: '#7aa95a', edge: '#3b6e2c' }),
  MUD: (rand) => blobs(rand, speckle(rand, BIOME_PALETTES.mud), { count: 6, palette: ['#2f2721', '#352c25'], size: 3 }),
  MARSH_TOP: (rand) => speckle(rand, BIOME_PALETTES.marsh),
  MARSH_SIDE: (rand, basePixel) => regrass(basePixel, ['#4f6a2e', '#566f34', '#5f7a3a', '#687f40', '#71884a']),
  BASALT_SIDE: (rand) => grid((x, y) => rgb(x % 5 === 0 || (y + x * 7) % 11 === 0 ? '#2e3034' : pick(rand, BIOME_PALETTES.basalt))),
  BASALT_TOP: (rand) => grid((x, y) => rgb((x + (Math.floor(y / 5) % 2) * 3) % 6 === 0 || y % 5 === 0 ? '#2e3034' : pick(rand, BIOME_PALETTES.basalt))),
  PALM_BARK: (rand) => grid((x, y) => rgb((y + (x > 7 ? 1 : 0)) % 3 === 0 ? '#7a5c3a' : pick(rand, BIOME_PALETTES.palmBark))),
  PALM_LEAVES: (rand) => grid((x, y) => rgb((x + y) % 7 === 0 && rand() < 0.7 ? '#7cc463' : pick(rand, BIOME_PALETTES.palmLeaves))),
  COAL_ORE: (rand, basePixel) => blobs(rand, copyOf(basePixel, TILE.STONE), { count: 6, palette: ['#2b2b2f', '#36363b', '#232326'], size: 2 }),
  IRON_ORE: (rand, basePixel) => blobs(rand, copyOf(basePixel, TILE.STONE), { count: 5, palette: ['#c9a27e', '#b88b66', '#dcbc9a'], size: 2 }),
  MOSSY_STONE: (rand, basePixel) => {
    const moss = Array.from({ length: 25 }, () => rand())
    /** @type {(x: number, y: number) => number} */
    const mossAt = (x, y) => moss[Math.min(4, Math.floor(y / 4)) * 5 + Math.min(4, Math.floor(x / 4))]
    return grid((x, y) => (mossAt(x, y) + rand() * 0.35 > 0.75 ? rgb(pick(rand, ['#5c7a3e', '#4f6d35', '#6a8746'])) : basePixel(TILE.STONE, x, y)))
  },
  DRY_TOP: (rand) => speckle(rand, BIOME_PALETTES.dry),
  DRY_SIDE: (rand, basePixel) => regrass(basePixel, ['#8f8c48', '#9c9a50', '#a9a65a', '#b5b066', '#bdb873']),
  MAGMA: (rand) => {
    const pixels = speckle(rand, BIOME_PALETTES.magma)
    for (let i = 0; i < 4; i++) {
      const start = /** @type {[number, number]} */ ([Math.floor(rand() * TILE_SIZE), Math.floor(rand() * TILE_SIZE)])
      /** @type {(x: number, y: number, r: () => number) => [number, number]} */
      const step = (x, y, r) => [x + (r() < 0.5 ? 1 : -1), y + (r() < 0.6 ? 1 : 0)]
      put(pixels, walk(rand, { length: 9, start, step }), pick(rand, ['#ff7a1a', '#ffae3d', '#e85a12']))
    }
    return pixels
  },
  MARSH_LEAVES: (rand) => speckle(rand, BIOME_PALETTES.marshLeaves),
  BLACK_SAND: (rand) => speckle(rand, BIOME_PALETTES.blackSand),
})

/**
 * Paints one of the newer tiles whole, since its passes share one random stream.
 * @param {string} name the tile's key in TILE
 * @param {() => number} rand
 * @param {BasePixel} basePixel a pixel of a tile already painted, for tiles built from another
 */
const paintTile = (name, rand, basePixel) => PAINTERS[name](rand, basePixel)

/**
 * Paints every tile, top row first; the same pixels on every call.
 * @returns {Uint8ClampedArray} RGBA, ATLAS.SIZE × ATLAS.SIZE
 */
export const paintAtlas = () => {
  const pixels = new Uint8ClampedArray(ATLAS.SIZE * ATLAS.SIZE * 4)
  /** @type {BasePixel} */
  const basePixel = (tile, x, y) => {
    const [ox, oy] = tileOrigin(tile)
    const at = ((oy + y) * ATLAS.SIZE + ox + x) * 4
    return [pixels[at], pixels[at + 1], pixels[at + 2]]
  }
  /**
   * @param {number} tile
   * @param {(x: number, y: number) => readonly number[]} colourAt
   */
  const writeTile = (tile, colourAt) => {
    const [ox, oy] = tileOrigin(tile)
    for (let y = 0; y < ATLAS.TILE; y++) {
      for (let x = 0; x < ATLAS.TILE; x++) pixels.set([...colourAt(x, y), 255], ((oy + y) * ATLAS.SIZE + ox + x) * 4)
    }
  }
  for (const [name, tile] of Object.entries(TILE)) {
    if (tile < FIRST_BIOME_TILE) {
      const draw = texel(tile, mulberry32(TEXTURE_SEED * 131 + tile * 977))
      writeTile(tile, (x, y) => toRgb(draw(x, y)))
    } else {
      // Same seed the prototype used, so the new pixels are the ones Rafey approved
      const painted = paintTile(name, mulberry32(9001 + tile * 977), basePixel)
      writeTile(tile, (x, y) => painted[y * ATLAS.TILE + x])
    }
  }
  return pixels
}

/**
 * The same image upside down. A GPU texture's first row is its bottom, so the atlas is flipped before upload and
 * a tile's v coordinate still counts up from the bottom of the picture.
 * @param {Uint8ClampedArray} pixels
 * @param {number} size
 */
export const flipRows = (pixels, size) => {
  const row = size * 4
  const flipped = new Uint8ClampedArray(pixels.length)
  for (let y = 0; y < size; y++) flipped.set(pixels.subarray(y * row, (y + 1) * row), (size - 1 - y) * row)
  return flipped
}

/**
 * One tile on its own, cut from the painted atlas, for a texture that repeats it.
 * @param {Uint8ClampedArray} atlas - from paintAtlas()
 * @param {number} tile
 * @returns {Uint8ClampedArray} RGBA, ATLAS.TILE × ATLAS.TILE
 */
export const tilePixels = (atlas, tile) => {
  const [ox, oy] = tileOrigin(tile)
  const row = ATLAS.TILE * 4
  const cut = new Uint8ClampedArray(ATLAS.TILE * row)
  for (let y = 0; y < ATLAS.TILE; y++) {
    const start = ((oy + y) * ATLAS.SIZE + ox) * 4
    cut.set(atlas.subarray(start, start + row), y * row)
  }
  return cut
}
