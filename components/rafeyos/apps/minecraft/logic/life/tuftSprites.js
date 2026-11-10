// @ts-check
// The sprites tufts and flowers are drawn from: eight 16 × 16 cut-outs side by side, painted pixel by pixel in the
// blocks' palette. Plain RGBA rows, bottom row first as the GPU reads them, so no canvas is needed.

export const TUFT = Object.freeze({ GRASS: 0, TALL: 1, RED: 2, YELLOW: 3, BLUE: 4, DRY: 5, REED: 6, WHITE: 7 })
export const SPRITE_COUNT = 8
export const SPRITE_SIZE = 16

const GREENS = Object.freeze(['#5f9a3e', '#6fab49', '#4f8834', '#7cb855'])
const STEMS = Object.freeze(['#4f8834', '#5f9a3e'])
const DRY = Object.freeze(['#9a7a4a', '#866a3e', '#a8895a'])
const REEDS = Object.freeze(['#6a8a3e', '#5a7a34'])
const PETALS = Object.freeze({
  [TUFT.RED]: ['#d8402f', '#b52d22'], [TUFT.YELLOW]: ['#f2c43a', '#d9a520'],
  [TUFT.BLUE]: ['#5f7fe0', '#4560c0'], [TUFT.WHITE]: ['#f2f0ea', '#d6d2c8'],
})
// Blades as [x, top row, lean]: each runs from the bottom row up to `top`, leaning `lean` pixels by its tip
const BLADES = Object.freeze({
  [TUFT.GRASS]: [[3, 9, -1], [6, 7, 0], [8, 10, 1], [11, 8, 2], [5, 11, -2], [13, 11, 1]],
  [TUFT.TALL]: [[4, 3, -1], [7, 1, 0], [9, 4, 1], [11, 2, 2], [6, 6, -2]],
  [TUFT.DRY]: [[4, 8, -2], [7, 6, -1], [8, 7, 1], [11, 9, 2], [6, 10, 2]],
  [TUFT.REED]: [[5, 2, 0], [8, 1, 0], [11, 3, 1]],
})

/** @param {string} hex */
const rgb = (hex) => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16))

/** @returns {Uint8Array} RGBA, SPRITE_COUNT * SPRITE_SIZE wide and SPRITE_SIZE tall */
export const paintTuftSprites = () => {
  const width = SPRITE_COUNT * SPRITE_SIZE
  const pixels = new Uint8Array(width * SPRITE_SIZE * 4)
  /** In sprite `s`, x across and y down from its top row. @param {number} s @param {number} x @param {number} y @param {string} hex */
  const put = (s, x, y, hex) => {
    const offset = ((SPRITE_SIZE - 1 - y) * width + s * SPRITE_SIZE + x) * 4
    pixels.set([...rgb(hex), 255], offset)
  }
  /** @param {number} s @param {number[]} blade @param {readonly string[]} colours */
  const blade = (s, [x, top, lean], colours) => {
    for (let y = SPRITE_SIZE - 1; y >= top; y--) {
      const dx = Math.round(((SPRITE_SIZE - 1 - y) / (SPRITE_SIZE - 1 - top)) * lean)
      put(s, x + dx, y, colours[(y + x) % colours.length])
    }
  }
  for (const s of [TUFT.GRASS, TUFT.TALL]) BLADES[s].forEach((b) => blade(s, b, GREENS))
  BLADES[TUFT.DRY].forEach((b) => blade(TUFT.DRY, b, DRY))
  BLADES[TUFT.REED].forEach((b) => blade(TUFT.REED, b, REEDS))
  for (const [x, y] of [[5, 2], [5, 3], [5, 4], [8, 1], [8, 2], [8, 3]]) put(TUFT.REED, x, y, '#6a4a2e')
  for (const s of [TUFT.RED, TUFT.YELLOW, TUFT.BLUE, TUFT.WHITE]) {
    const [petal, petalShade] = PETALS[s]
    blade(s, [8, 6, 0], STEMS)
    blade(s, [5, 11, -1], GREENS)
    blade(s, [10, 12, 1], GREENS)
    for (const [x, y] of [[7, 4], [9, 4], [8, 3], [8, 5]]) put(s, x, y, petal)
    for (const [x, y] of [[7, 3], [9, 5]]) put(s, x, y, petalShade)
    put(s, 8, 4, s === TUFT.YELLOW ? '#8a5a20' : '#f2d04a')
  }
  return pixels
}
