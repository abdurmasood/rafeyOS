// How each moving thing in the room answers the wind. Amplitudes are in metres and capped so
// nothing moves more than a few pixels at the render's scale (about 2.5 px per cm).

/** Delay (s) and shelter (0..1) per place in the room: the window first, the far corner last. */
export const WIND_RESPONSE = Object.freeze({
  tree: Object.freeze({ lag: 0, atten: 1 }),
  dust: Object.freeze({ lag: 0.2, atten: 1 }),
  windowShelf: Object.freeze({ lag: 0.3, atten: 0.6 }),
  upperShelf: Object.freeze({ lag: 1.0, atten: 0.4 }),
  candle: Object.freeze({ lag: 1.1, atten: 0.5 }),
  farCorner: Object.freeze({ lag: 2.0, atten: 0.35 }),
})

const KIND = Object.freeze({
  pothos: Object.freeze({ amp: 0.025, freq: 0.45 }),
  monstera: Object.freeze({ amp: 0.012, freq: 0.8 }),
  monsteraMini: Object.freeze({ amp: 0.008, freq: 1.1 }),
  snake: Object.freeze({ amp: 0.003, freq: 1.4 }),
})

/** Keyed by the Blender object name the glb carries as `studio_name`. */
export const PLANT_MOTION = Object.freeze({
  'Monstera (floor)': { ...KIND.monstera, place: 'farCorner' },
  'Monstera mini (lower shelf)': { ...KIND.monsteraMini, place: 'farCorner' },
  'Pothos (upper shelf)': { ...KIND.pothos, place: 'upperShelf' },
  'Snake Plant (upper shelf)': { ...KIND.snake, place: 'upperShelf' },
  'Monstera (window shelf)': { ...KIND.monstera, place: 'windowShelf' },
  'Pothos (window shelf)': { ...KIND.pothos, place: 'windowShelf' },
  'Snake Plant (window shelf)': { ...KIND.snake, place: 'windowShelf' },
})

export const TREE_MOTION = Object.freeze({ amp: 0.1, freq: 0.6, flutterAmp: 0.018, flutterFreq: 4 })

/** The wind blows in through the window on the -x wall, toward +x. */
export const WIND_DIRECTION = Object.freeze([1, 0, 0])
