// @ts-check
// The pixel-art texture atlas, painted in code into an RGBA buffer: 16px tiles in a 4 × 4 grid
import { TILE } from './blockTypes'
import { mulberry32 } from './random'

export const ATLAS = Object.freeze({ TILE: 16, COLS: 4, SIZE: 64 })

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

/**
 * Paints every tile, top row first; the same pixels on every call.
 * @returns {Uint8ClampedArray} RGBA, ATLAS.SIZE × ATLAS.SIZE
 */
export const paintAtlas = () => {
  const pixels = new Uint8ClampedArray(ATLAS.SIZE * ATLAS.SIZE * 4)
  for (const tile of Object.values(TILE)) {
    const draw = texel(tile, mulberry32(TEXTURE_SEED * 131 + tile * 977))
    const [ox, oy] = tileOrigin(tile)
    for (let y = 0; y < ATLAS.TILE; y++) {
      for (let x = 0; x < ATLAS.TILE; x++) {
        const at = ((oy + y) * ATLAS.SIZE + ox + x) * 4
        pixels.set([...toRgb(draw(x, y)), 255], at)
      }
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
