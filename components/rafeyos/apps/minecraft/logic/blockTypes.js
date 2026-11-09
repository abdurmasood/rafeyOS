// @ts-check
// The blocks a Minecraft world is made of: their ids, the texture tile on each face, and the hotbar

export const BLOCK = Object.freeze({
  AIR: 0, GRASS: 1, DIRT: 2, STONE: 3, SAND: 4, LOG: 5, LEAVES: 6, PLANKS: 7, BRICK: 8, SNOW: 9, WATER: 10,
  PINE_LOG: 11, PINE_LEAVES: 12, BIRCH_LOG: 13, BIRCH_LEAVES: 14, GRAVEL: 15, CLAY: 16, ICE: 17, SANDSTONE: 18,
  RED_SAND: 19, ROCK_RUST: 20, ROCK_CREAM: 21, ROCK_ORANGE: 22, CACTUS: 23, MUD: 24, MARSH_GRASS: 25, BASALT: 26,
  PALM_LOG: 27, PALM_LEAVES: 28, COAL_ORE: 29, IRON_ORE: 30, MOSSY_STONE: 31, DRY_GRASS: 32, MAGMA: 33,
  MARSH_LEAVES: 34, BLACK_SAND: 35,
})

/** Tiles in the texture atlas, numbered left to right, top to bottom in an 8 × 8 grid. */
export const TILE = Object.freeze({
  GRASS_TOP: 0, GRASS_SIDE: 1, DIRT: 2, STONE: 3, SAND: 4, LOG_SIDE: 5, LOG_TOP: 6, LEAVES: 7, PLANKS: 8, BRICK: 9, SNOW: 10, WATER: 11,
  PINE_BARK: 12, PINE_NEEDLES: 13, BIRCH_BARK: 14, BIRCH_LEAVES: 15, GRAVEL: 16, CLAY: 17, ICE: 18,
  SANDSTONE_SIDE: 19, SANDSTONE_TOP: 20, RED_SAND: 21, ROCK_RUST: 22, ROCK_CREAM: 23, ROCK_ORANGE: 24,
  CACTUS_SIDE: 25, CACTUS_TOP: 26, MUD: 27, MARSH_TOP: 28, MARSH_SIDE: 29, BASALT_SIDE: 30, BASALT_TOP: 31,
  PALM_BARK: 32, PALM_LEAVES: 33, COAL_ORE: 34, IRON_ORE: 35, MOSSY_STONE: 36, DRY_TOP: 37, DRY_SIDE: 38,
  MAGMA: 39, MARSH_LEAVES: 40, BLACK_SAND: 41,
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
  [BLOCK.PINE_LOG]: Object.freeze([TILE.LOG_TOP, TILE.PINE_BARK, TILE.LOG_TOP]),
  [BLOCK.PINE_LEAVES]: Object.freeze([TILE.PINE_NEEDLES, TILE.PINE_NEEDLES, TILE.PINE_NEEDLES]),
  [BLOCK.BIRCH_LOG]: Object.freeze([TILE.LOG_TOP, TILE.BIRCH_BARK, TILE.LOG_TOP]),
  [BLOCK.BIRCH_LEAVES]: Object.freeze([TILE.BIRCH_LEAVES, TILE.BIRCH_LEAVES, TILE.BIRCH_LEAVES]),
  [BLOCK.GRAVEL]: Object.freeze([TILE.GRAVEL, TILE.GRAVEL, TILE.GRAVEL]),
  [BLOCK.CLAY]: Object.freeze([TILE.CLAY, TILE.CLAY, TILE.CLAY]),
  [BLOCK.ICE]: Object.freeze([TILE.ICE, TILE.ICE, TILE.ICE]),
  [BLOCK.SANDSTONE]: Object.freeze([TILE.SANDSTONE_TOP, TILE.SANDSTONE_SIDE, TILE.SANDSTONE_TOP]),
  [BLOCK.RED_SAND]: Object.freeze([TILE.RED_SAND, TILE.RED_SAND, TILE.RED_SAND]),
  [BLOCK.ROCK_RUST]: Object.freeze([TILE.ROCK_RUST, TILE.ROCK_RUST, TILE.ROCK_RUST]),
  [BLOCK.ROCK_CREAM]: Object.freeze([TILE.ROCK_CREAM, TILE.ROCK_CREAM, TILE.ROCK_CREAM]),
  [BLOCK.ROCK_ORANGE]: Object.freeze([TILE.ROCK_ORANGE, TILE.ROCK_ORANGE, TILE.ROCK_ORANGE]),
  [BLOCK.CACTUS]: Object.freeze([TILE.CACTUS_TOP, TILE.CACTUS_SIDE, TILE.CACTUS_TOP]),
  [BLOCK.MUD]: Object.freeze([TILE.MUD, TILE.MUD, TILE.MUD]),
  [BLOCK.MARSH_GRASS]: Object.freeze([TILE.MARSH_TOP, TILE.MARSH_SIDE, TILE.DIRT]),
  [BLOCK.BASALT]: Object.freeze([TILE.BASALT_TOP, TILE.BASALT_SIDE, TILE.BASALT_TOP]),
  [BLOCK.PALM_LOG]: Object.freeze([TILE.LOG_TOP, TILE.PALM_BARK, TILE.LOG_TOP]),
  [BLOCK.PALM_LEAVES]: Object.freeze([TILE.PALM_LEAVES, TILE.PALM_LEAVES, TILE.PALM_LEAVES]),
  [BLOCK.COAL_ORE]: Object.freeze([TILE.COAL_ORE, TILE.COAL_ORE, TILE.COAL_ORE]),
  [BLOCK.IRON_ORE]: Object.freeze([TILE.IRON_ORE, TILE.IRON_ORE, TILE.IRON_ORE]),
  [BLOCK.MOSSY_STONE]: Object.freeze([TILE.MOSSY_STONE, TILE.MOSSY_STONE, TILE.MOSSY_STONE]),
  [BLOCK.DRY_GRASS]: Object.freeze([TILE.DRY_TOP, TILE.DRY_SIDE, TILE.DIRT]),
  [BLOCK.MAGMA]: Object.freeze([TILE.MAGMA, TILE.MAGMA, TILE.MAGMA]),
  [BLOCK.MARSH_LEAVES]: Object.freeze([TILE.MARSH_LEAVES, TILE.MARSH_LEAVES, TILE.MARSH_LEAVES]),
  [BLOCK.BLACK_SAND]: Object.freeze([TILE.BLACK_SAND, TILE.BLACK_SAND, TILE.BLACK_SAND]),
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
