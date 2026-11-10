// @ts-check
// The HUD's hearts and air bubbles as pixel art: each is a few one-colour layers, every layer an SVG path of 1 × 1
// squares, so they stay crisp at any size. Drawn here rather than in the block atlas: they are HUD, not world.

const HEART = Object.freeze(['.##.##.', '#######', '#######', '.#####.', '..###..', '...#...'])
const BUBBLE = Object.freeze(['.###.', '#####', '#####', '#####', '.###.'])

const COLOURS = Object.freeze({
  heartOutline: { fill: '#0a060a', opacity: 0.85 },
  heartEmpty: { fill: '#120e14', opacity: 0.62 },
  heartLight: { fill: '#ff9a8a', opacity: 1 },
  heartShade: { fill: '#b9262e', opacity: 1 },
  heart: { fill: '#e8423f', opacity: 1 },
  bubbleOutline: { fill: '#081428', opacity: 0.8 },
  bubbleLight: { fill: '#ffffff', opacity: 1 },
  bubbleShade: { fill: '#3f8fd6', opacity: 1 },
  bubble: { fill: '#79c3f2', opacity: 1 },
})

/**
 * @typedef {{ fill: string, opacity: number, d: string }} PixelLayer
 * @typedef {{ width: number, height: number }} PixelSize
 * @typedef {keyof typeof COLOURS} ColourName
 */

/**
 * A mask (rows of '#' and '.') with a one-pixel outline round it, as layers; `paint(x, y)` names each inside pixel's
 * colour, in mask coordinates.
 * @param {readonly string[]} mask
 * @param {(x: number, y: number) => ColourName} paint
 * @param {ColourName} outline
 * @returns {PixelLayer[]}
 */
const layersOf = (mask, paint, outline) => {
  /** @param {number} x @param {number} y */
  const inside = (x, y) => mask[y - 1]?.[x - 1] === '#'
  /** @type {Map<ColourName, string[]>} */
  const paths = new Map()
  /** @param {ColourName} name @param {number} x @param {number} y */
  const add = (name, x, y) => paths.set(name, [...(paths.get(name) ?? []), `M${x} ${y}h1v1h-1z`])
  for (let y = 0; y < mask.length + 2; y++) {
    for (let x = 0; x < mask[0].length + 2; x++) {
      if (inside(x, y)) add(paint(x - 1, y - 1), x, y)
      else if (inside(x + 1, y) || inside(x - 1, y) || inside(x, y + 1) || inside(x, y - 1)) add(outline, x, y)
    }
  }
  return [...paths].map(([name, squares]) => ({ ...COLOURS[name], d: squares.join('') }))
}

/** @param {number} filledColumns - the heart's columns still red, from the left: 7 full, 4 half, 0 empty */
const heartLayers = (filledColumns) => layersOf(HEART, (x, y) => {
  if (x >= filledColumns) return 'heartEmpty'
  if ((x === 1 && y <= 2 && y >= 1) || (x === 2 && y === 1)) return 'heartLight'
  if (y >= 3 && x >= 4) return 'heartShade'
  return 'heart'
}, 'heartOutline')

/** @type {PixelSize & { full: PixelLayer[], half: PixelLayer[], empty: PixelLayer[] }} */
export const HEART_ICON = Object.freeze({
  width: HEART[0].length + 2, height: HEART.length + 2, full: heartLayers(7), half: heartLayers(4), empty: heartLayers(0),
})

/** @type {PixelSize & { layers: PixelLayer[] }} */
export const BUBBLE_ICON = Object.freeze({
  width: BUBBLE[0].length + 2,
  height: BUBBLE.length + 2,
  layers: layersOf(BUBBLE, (x, y) => {
    if (x === 1 && y === 1) return 'bubbleLight'
    return x >= 3 && y >= 3 ? 'bubbleShade' : 'bubble'
  }, 'bubbleOutline'),
})

/**
 * Which heart each of the ten shows for `health` halves.
 * @param {number} health
 * @param {number} hearts
 * @returns {Array<'full' | 'half' | 'empty'>}
 */
export const heartStates = (health, hearts) => Array.from({ length: hearts }, (_, i) => {
  if (health >= (i + 1) * 2) return 'full'
  return health === i * 2 + 1 ? 'half' : 'empty'
})
