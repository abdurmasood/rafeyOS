// @ts-check
// The animals, as boxes: eight original creatures, each a list of coloured parts around its feet (y 0), facing +z, in
// blocks. Parts named in `swing` turn about their pivot as the animal walks, grazes or flies.
//   part: { size: [w, h, d], at: [x, y, z] (its centre), colour, swing?, pivot?: [x, y, z] }
//   swing: legA / legB (the two leg pairs, in step), head, tail, wingL / wingR
//   gait: how it moves: walk, hop, waddle, scuttle (sideways), swim, fly

/**
 * @typedef {number[]} Triple - [x, y, z]
 * @typedef {{ size: Triple, at: Triple, colour: string, swing?: string, pivot?: Triple }} Part
 * @typedef {{
 *   gait: string, speed: number, flee: number, height: number, sizeVar: number, swims?: boolean,
 *   colours: string[][], parts: (colours: string[]) => Part[],
 * }} Species - speed in blocks a second; flee: how near the player may come, 0 for never; sizeVar: ± share of size
 */

/**
 * A leg hanging from its hip at height h.
 * @param {number} x @param {number} z @param {number} h @param {number} w @param {string} colour @param {string} swing
 * @returns {Part}
 */
const leg = (x, z, h, w, colour, swing) => ({ size: [w, h, w], at: [x, h / 2, z], colour, swing, pivot: [x, h, z] })
/**
 * Two small dark eyes, `gap` either side of x.
 * @param {number} x @param {number} y @param {number} z @param {number} gap @param {string} [colour]
 * @returns {Part[]}
 */
const eyes = (x, y, z, gap, colour = '#141018') => [
  { size: [0.06, 0.06, 0.03], at: [x - gap, y, z], colour },
  { size: [0.06, 0.06, 0.03], at: [x + gap, y, z], colour },
]

/** @type {Readonly<Record<string, Species>>} */
export const SPECIES = Object.freeze({
  // Meadow hare: tall ears, hops instead of walking
  hare: {
    gait: 'hop', speed: 2.6, flee: 7, height: 0.55, sizeVar: 0.12,
    colours: [['#a98a69', '#e8dccb'], ['#8c7b6a', '#ddd2c4'], ['#c2a27a', '#f1e7d6']],
    parts: (c) => [
      { size: [0.32, 0.26, 0.46], at: [0, 0.27, 0], colour: c[0] },
      { size: [0.24, 0.22, 0.24], at: [0, 0.42, 0.28], colour: c[0], swing: 'head', pivot: [0, 0.35, 0.18] },
      { size: [0.06, 0.24, 0.05], at: [-0.06, 0.62, 0.24], colour: c[0], swing: 'head', pivot: [0, 0.35, 0.18] },
      { size: [0.06, 0.24, 0.05], at: [0.06, 0.62, 0.24], colour: c[0], swing: 'head', pivot: [0, 0.35, 0.18] },
      { size: [0.12, 0.12, 0.1], at: [0, 0.32, -0.27], colour: c[1] },
      ...eyes(0, 0.46, 0.405, 0.075),
      leg(-0.1, 0.14, 0.14, 0.08, c[0], 'legA'), leg(0.1, 0.14, 0.14, 0.08, c[0], 'legB'),
      leg(-0.1, -0.14, 0.14, 0.1, c[0], 'legB'), leg(0.1, -0.14, 0.14, 0.1, c[0], 'legA'),
    ],
  },
  // Forest deer: long neck, short antlers on the stags
  deer: {
    gait: 'walk', speed: 2.4, flee: 10, height: 1.5, sizeVar: 0.1,
    colours: [['#8a5a34', '#e9dcc6', '#5b4532'], ['#7a4e2e', '#e3d4bb', '#4d3a2a']],
    parts: (c) => [
      { size: [0.5, 0.48, 1.0], at: [0, 0.98, 0], colour: c[0] },
      { size: [0.26, 0.5, 0.26], at: [0, 1.32, 0.48], colour: c[0], swing: 'head', pivot: [0, 1.1, 0.42] },
      { size: [0.3, 0.3, 0.42], at: [0, 1.62, 0.62], colour: c[0], swing: 'head', pivot: [0, 1.1, 0.42] },
      { size: [0.16, 0.14, 0.12], at: [0, 1.55, 0.86], colour: c[2], swing: 'head', pivot: [0, 1.1, 0.42] },
      { size: [0.05, 0.3, 0.05], at: [-0.12, 1.9, 0.56], colour: '#d9c9a8', swing: 'head', pivot: [0, 1.1, 0.42] },
      { size: [0.05, 0.3, 0.05], at: [0.12, 1.9, 0.56], colour: '#d9c9a8', swing: 'head', pivot: [0, 1.1, 0.42] },
      { size: [0.2, 0.06, 0.05], at: [-0.18, 2.0, 0.56], colour: '#d9c9a8', swing: 'head', pivot: [0, 1.1, 0.42] },
      { size: [0.2, 0.06, 0.05], at: [0.18, 2.0, 0.56], colour: '#d9c9a8', swing: 'head', pivot: [0, 1.1, 0.42] },
      ...eyes(0, 1.68, 0.835, 0.11).map((p) => ({ ...p, swing: 'head', pivot: [0, 1.1, 0.42] })),
      { size: [0.18, 0.2, 0.1], at: [0, 1.1, -0.52], colour: c[1], swing: 'tail', pivot: [0, 1.2, -0.5] },
      leg(-0.16, 0.36, 0.76, 0.12, c[0], 'legA'), leg(0.16, 0.36, 0.76, 0.12, c[0], 'legB'),
      leg(-0.16, -0.36, 0.76, 0.12, c[0], 'legB'), leg(0.16, -0.36, 0.76, 0.12, c[0], 'legA'),
    ],
  },
  // Highland goat: shaggy, curled horns, happy on ledges
  goat: {
    gait: 'walk', speed: 2.0, flee: 5, height: 1.1, sizeVar: 0.1,
    colours: [['#e9e4da', '#b8b0a2', '#6e675d'], ['#cfc6b6', '#9d9384', '#5a544c'], ['#4a423b', '#8a7f72', '#2a2622']],
    parts: (c) => [
      { size: [0.5, 0.46, 0.82], at: [0, 0.78, 0], colour: c[0] },
      { size: [0.52, 0.12, 0.84], at: [0, 0.52, 0], colour: c[1] },
      { size: [0.3, 0.34, 0.36], at: [0, 1.12, 0.48], colour: c[0], swing: 'head', pivot: [0, 0.95, 0.32] },
      { size: [0.1, 0.18, 0.08], at: [0, 0.9, 0.6], colour: c[1], swing: 'head', pivot: [0, 0.95, 0.32] },
      { size: [0.07, 0.22, 0.07], at: [-0.1, 1.36, 0.4], colour: c[2], swing: 'head', pivot: [0, 0.95, 0.32] },
      { size: [0.07, 0.22, 0.07], at: [0.1, 1.36, 0.4], colour: c[2], swing: 'head', pivot: [0, 0.95, 0.32] },
      { size: [0.07, 0.07, 0.16], at: [-0.1, 1.46, 0.3], colour: c[2], swing: 'head', pivot: [0, 0.95, 0.32] },
      { size: [0.07, 0.07, 0.16], at: [0.1, 1.46, 0.3], colour: c[2], swing: 'head', pivot: [0, 0.95, 0.32] },
      ...eyes(0, 1.16, 0.665, 0.1).map((p) => ({ ...p, swing: 'head', pivot: [0, 0.95, 0.32] })),
      leg(-0.15, 0.28, 0.55, 0.12, c[1], 'legA'), leg(0.15, 0.28, 0.55, 0.12, c[1], 'legB'),
      leg(-0.15, -0.28, 0.55, 0.12, c[1], 'legB'), leg(0.15, -0.28, 0.55, 0.12, c[1], 'legA'),
    ],
  },
  // Shore crab: low and wide, scuttles sideways
  crab: {
    gait: 'scuttle', speed: 1.6, flee: 4, height: 0.25, sizeVar: 0.2,
    colours: [['#d9572f', '#f08a5d'], ['#c44a2c', '#e57a52']],
    parts: (c) => [
      { size: [0.46, 0.14, 0.34], at: [0, 0.16, 0], colour: c[0] },
      { size: [0.12, 0.08, 0.12], at: [-0.3, 0.16, 0.18], colour: c[1], swing: 'legA', pivot: [-0.22, 0.16, 0.1] },
      { size: [0.12, 0.08, 0.12], at: [0.3, 0.16, 0.18], colour: c[1], swing: 'legB', pivot: [0.22, 0.16, 0.1] },
      { size: [0.04, 0.1, 0.04], at: [-0.08, 0.28, 0.12], colour: '#2a1612' },
      { size: [0.04, 0.1, 0.04], at: [0.08, 0.28, 0.12], colour: '#2a1612' },
      leg(-0.2, -0.05, 0.1, 0.05, c[1], 'legA'), leg(0.2, -0.05, 0.1, 0.05, c[1], 'legB'),
      leg(-0.2, -0.13, 0.1, 0.05, c[1], 'legB'), leg(0.2, -0.13, 0.1, 0.05, c[1], 'legA'),
    ],
  },
  // Ice-floe penguin: waddles
  penguin: {
    gait: 'waddle', speed: 1.1, flee: 4, height: 0.8, sizeVar: 0.1,
    colours: [['#20232b', '#f2f0ea', '#f2a43a']],
    parts: (c) => [
      { size: [0.4, 0.56, 0.34], at: [0, 0.4, 0], colour: c[0] },
      { size: [0.3, 0.44, 0.06], at: [0, 0.38, 0.17], colour: c[1] },
      { size: [0.3, 0.24, 0.28], at: [0, 0.8, 0.02], colour: c[0], swing: 'head', pivot: [0, 0.68, 0] },
      { size: [0.08, 0.06, 0.12], at: [0, 0.78, 0.2], colour: c[2], swing: 'head', pivot: [0, 0.68, 0] },
      ...eyes(0, 0.85, 0.165, 0.08, '#ffffff').map((p) => ({ ...p, swing: 'head', pivot: [0, 0.68, 0] })),
      { size: [0.06, 0.36, 0.2], at: [-0.23, 0.44, 0], colour: c[0], swing: 'wingL', pivot: [-0.2, 0.62, 0] },
      { size: [0.06, 0.36, 0.2], at: [0.23, 0.44, 0], colour: c[0], swing: 'wingR', pivot: [0.2, 0.62, 0] },
      { size: [0.12, 0.05, 0.16], at: [-0.09, 0.025, 0.05], colour: c[2], swing: 'legA', pivot: [-0.09, 0.12, 0] },
      { size: [0.12, 0.05, 0.16], at: [0.09, 0.025, 0.05], colour: c[2], swing: 'legB', pivot: [0.09, 0.12, 0] },
    ],
  },
  // Pond duck: walks on land, floats on water
  duck: {
    gait: 'waddle', speed: 1.3, flee: 5, height: 0.5, sizeVar: 0.1, swims: true,
    colours: [['#7b6a52', '#2f6d4a', '#f2b23a', '#e9e2d2'], ['#efece4', '#efece4', '#f2a43a', '#d9d3c4']],
    parts: (c) => [
      { size: [0.32, 0.24, 0.48], at: [0, 0.26, 0], colour: c[0] },
      { size: [0.2, 0.2, 0.2], at: [0, 0.48, 0.22], colour: c[1], swing: 'head', pivot: [0, 0.38, 0.18] },
      { size: [0.1, 0.05, 0.12], at: [0, 0.45, 0.37], colour: c[2], swing: 'head', pivot: [0, 0.38, 0.18] },
      ...eyes(0, 0.52, 0.325, 0.07).map((p) => ({ ...p, swing: 'head', pivot: [0, 0.38, 0.18] })),
      { size: [0.14, 0.08, 0.1], at: [0, 0.32, -0.28], colour: c[3], swing: 'tail', pivot: [0, 0.3, -0.24] },
      leg(-0.08, 0, 0.14, 0.05, c[2], 'legA'), leg(0.08, 0, 0.14, 0.05, c[2], 'legB'),
    ],
  },
  // Sea fish: small schools under the surface
  fish: {
    gait: 'swim', speed: 2.2, flee: 4, height: 0.2, sizeVar: 0.25,
    colours: [['#6fb3c9', '#e9f3f6'], ['#e2a04a', '#f7e3c3'], ['#9fb8c6', '#dce7ee']],
    parts: (c) => [
      { size: [0.12, 0.2, 0.36], at: [0, 0, 0], colour: c[0] },
      { size: [0.13, 0.08, 0.2], at: [0, -0.05, 0.04], colour: c[1] },
      { size: [0.04, 0.18, 0.12], at: [0, 0, -0.24], colour: c[0], swing: 'tail', pivot: [0, 0, -0.18] },
    ],
  },
  // Gull: glides in loose flocks, flaps now and then
  gull: {
    gait: 'fly', speed: 6, flee: 0, height: 0.3, sizeVar: 0.1,
    colours: [['#f4f4f2', '#9aa3ad', '#f2b23a']],
    parts: (c) => [
      { size: [0.2, 0.18, 0.5], at: [0, 0, 0], colour: c[0] },
      { size: [0.14, 0.14, 0.14], at: [0, 0.05, 0.3], colour: c[0] },
      { size: [0.05, 0.04, 0.1], at: [0, 0.03, 0.41], colour: c[2] },
      { size: [0.5, 0.04, 0.24], at: [-0.34, 0.04, 0.02], colour: c[1], swing: 'wingL', pivot: [-0.1, 0.04, 0] },
      { size: [0.5, 0.04, 0.24], at: [0.34, 0.04, 0.02], colour: c[1], swing: 'wingR', pivot: [0.1, 0.04, 0] },
      { size: [0.14, 0.03, 0.14], at: [0, 0.02, -0.3], colour: c[0] },
    ],
  },
})
