// @ts-check
// The blocks a Blocks world is made of: their ids, the texture tile on each face, and the hotbar

export const BLOCK = Object.freeze({
  AIR: 0, GRASS: 1, DIRT: 2, STONE: 3, SAND: 4, LOG: 5, LEAVES: 6, PLANKS: 7, BRICK: 8, SNOW: 9, WATER: 10,
})

/** Tiles in the texture atlas, numbered left to right, top to bottom in a 4 × 4 grid. */
export const TILE = Object.freeze({
  GRASS_TOP: 0, GRASS_SIDE: 1, DIRT: 2, STONE: 3, SAND: 4, LOG_SIDE: 5, LOG_TOP: 6, LEAVES: 7, PLANKS: 8, BRICK: 9, SNOW: 10, WATER: 11,
})

/**
 * The tile on each block's top, sides and bottom.
 * @type {Readonly<Record<number, readonly number[]>>}
 */
export const FACE_TILES = Object.freeze({
  [BLOCK.GRASS]: Object.freeze([TILE.GRASS_TOP, TILE.GRASS_SIDE, TILE.DIRT]),
  [BLOCK.DIRT]: Object.freeze([TILE.DIRT, TILE.DIRT, TILE.DIRT]),
  [BLOCK.STONE]: Object.freeze([TILE.STONE, TILE.STONE, TILE.STONE]),
  [BLOCK.SAND]: Object.freeze([TILE.SAND, TILE.SAND, TILE.SAND]),
  [BLOCK.LOG]: Object.freeze([TILE.LOG_TOP, TILE.LOG_SIDE, TILE.LOG_TOP]),
  [BLOCK.LEAVES]: Object.freeze([TILE.LEAVES, TILE.LEAVES, TILE.LEAVES]),
  [BLOCK.PLANKS]: Object.freeze([TILE.PLANKS, TILE.PLANKS, TILE.PLANKS]),
  [BLOCK.BRICK]: Object.freeze([TILE.BRICK, TILE.BRICK, TILE.BRICK]),
  [BLOCK.SNOW]: Object.freeze([TILE.SNOW, TILE.SNOW, TILE.SNOW]),
  [BLOCK.WATER]: Object.freeze([TILE.WATER, TILE.WATER, TILE.WATER]),
})

/** The nine blocks the player can place, in hotbar order (keys 1–9). */
export const HOTBAR = Object.freeze(
  /** @type {Array<[number, string]>} */ ([
    [BLOCK.GRASS, 'Grass'], [BLOCK.DIRT, 'Dirt'], [BLOCK.STONE, 'Stone'], [BLOCK.SAND, 'Sand'], [BLOCK.LOG, 'Log'],
    [BLOCK.PLANKS, 'Planks'], [BLOCK.LEAVES, 'Leaves'], [BLOCK.BRICK, 'Brick'], [BLOCK.SNOW, 'Snow'],
  ]).map(([block, label]) => Object.freeze({ block, label })),
)

/**
 * Whether a block stops the player and hides the faces behind it; air and water do neither.
 * @param {number} block
 */
export const isSolid = (block) => block !== BLOCK.AIR && block !== BLOCK.WATER

/** @type {ReadonlySet<number>} */
const KNOWN_BLOCKS = new Set(Object.values(BLOCK))

/**
 * Whether `block` is a real block id, so a hand-edited save can't put garbage into the world.
 * @param {unknown} block
 */
export const isKnownBlock = (block) => typeof block === 'number' && KNOWN_BLOCKS.has(block)
