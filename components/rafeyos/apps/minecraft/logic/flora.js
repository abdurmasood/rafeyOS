// @ts-check
// Trees, bushes and boulders. Each plants itself at a position [x, y, z], the first block above the ground.
import { BLOCK } from './blockTypes'

/**
 * @typedef {import('./voxelGrid').Grid} Grid
 * @typedef {import('./voxelGrid').Position} Position
 * @typedef {() => number} Rand
 */

const SIDE_STEPS = [[1, 0], [-1, 0], [0, 1], [0, -1]]

/**
 * A flat, ragged ring of blocks at one height.
 * @param {Grid} grid
 * @param {Position} center
 * @param {Rand} rand
 * @param {{ radius: number, block: number, ragged?: number }} shape - `ragged` is the chance an edge block is skipped
 */
const disc = (grid, [centerX, y, centerZ], rand, { radius, block, ragged = 0.5 }) => {
  const reach = Math.ceil(radius)
  for (let dz = -reach; dz <= reach; dz++) {
    for (let dx = -reach; dx <= reach; dx++) {
      const distanceSquared = dx * dx + dz * dz
      if (distanceSquared > radius * radius + 0.6) continue
      if (distanceSquared > (radius - 0.8) * (radius - 0.8) && rand() < ragged) continue
      grid.setIfAir(centerX + dx, y, centerZ + dz, block)
    }
  }
}

/**
 * A rough ball of blocks, flattened a little so crowns read as tufts rather than spheres.
 * @param {Grid} grid
 * @param {Position} center
 * @param {Rand} rand
 * @param {{ radius: number, block: number }} shape
 */
const blob = (grid, [centerX, centerY, centerZ], rand, { radius, block }) => {
  const reach = Math.ceil(radius)
  for (let dy = -reach; dy <= reach; dy++) {
    for (let dz = -reach; dz <= reach; dz++) {
      for (let dx = -reach; dx <= reach; dx++) {
        const distance = Math.sqrt(dx * dx + dy * dy * 1.4 + dz * dz)
        if (distance <= radius - 0.4 || (distance <= radius + 0.3 && rand() < 0.5)) {
          grid.setIfAir(centerX + dx, centerY + dy, centerZ + dz, block)
        }
      }
    }
  }
}

/**
 * @param {Grid} grid
 * @param {Position} base
 * @param {number} height
 * @param {number} block
 */
const trunk = (grid, [x, y, z], height, block) => {
  for (let i = 0; i < height; i++) grid.set(x, y + i, z, block)
}

/**
 * The app's own tree shape, so lowland woods still read as home.
 * @param {Grid} grid
 * @param {Position} base
 * @param {Rand} rand
 * @param {{ leaves?: number, log?: number }} [blocks]
 */
export const oak = (grid, base, rand, { leaves = BLOCK.LEAVES, log = BLOCK.LOG } = {}) => {
  const [x, y, z] = base
  const height = 4 + Math.floor(rand() * 3), top = y + height
  for (let dy = -2; dy <= 1; dy++) {
    const reach = dy < 0 ? 2 : 1
    for (let dz = -reach; dz <= reach; dz++) {
      for (let dx = -reach; dx <= reach; dx++) {
        if (Math.abs(dx) === reach && Math.abs(dz) === reach && (dy === 1 || rand() < 0.55)) continue
        grid.setIfAir(x + dx, top + dy, z + dz, leaves)
      }
    }
  }
  trunk(grid, base, height, log)
}

/**
 * @param {Grid} grid
 * @param {Position} base
 * @param {Rand} rand
 */
export const bigOak = (grid, base, rand) => {
  const [x, y, z] = base
  const height = 7 + Math.floor(rand() * 3), top = y + height
  blob(grid, [x, top, z], rand, { radius: 3.2, block: BLOCK.LEAVES })
  for (let i = 0; i < 3; i++) {
    const angle = rand() * Math.PI * 2
    const branchX = x + Math.round(Math.cos(angle) * 3), branchZ = z + Math.round(Math.sin(angle) * 3)
    const branchY = top - 2 - Math.floor(rand() * 2)
    blob(grid, [branchX, branchY, branchZ], rand, { radius: 2.2, block: BLOCK.LEAVES })
    grid.set(x + Math.round(Math.cos(angle)), branchY - 1, z + Math.round(Math.sin(angle)), BLOCK.LOG)
    grid.set(x + Math.round(Math.cos(angle) * 2), branchY, z + Math.round(Math.sin(angle) * 2), BLOCK.LOG)
  }
  trunk(grid, base, height, BLOCK.LOG)
}

/**
 * @param {Grid} grid
 * @param {Position} base
 * @param {Rand} rand
 */
export const birch = (grid, base, rand) => {
  const [x, y, z] = base
  const height = 6 + Math.floor(rand() * 3), top = y + height
  for (let dy = -3; dy <= 1; dy++) {
    const reach = dy <= -1 && dy >= -2 ? 2 : 1
    for (let dz = -reach; dz <= reach; dz++) {
      for (let dx = -reach; dx <= reach; dx++) {
        if (Math.abs(dx) === reach && Math.abs(dz) === reach && rand() < 0.7) continue
        grid.setIfAir(x + dx, top + dy, z + dz, BLOCK.BIRCH_LEAVES)
      }
    }
  }
  grid.setIfAir(x, top + 2, z, BLOCK.BIRCH_LEAVES)
  trunk(grid, base, height, BLOCK.BIRCH_LOG)
}

/**
 * @param {Grid} grid
 * @param {Position} base
 * @param {Rand} rand
 * @param {{ scale?: number }} [options] - stretches the trunk, for taller island pines
 */
export const pine = (grid, base, rand, { scale = 1 } = {}) => {
  const [x, y, z] = base
  const height = Math.round((8 + Math.floor(rand() * 5)) * scale), top = y + height
  grid.setIfAir(x, top + 1, z, BLOCK.PINE_LEAVES)
  grid.setIfAir(x, top, z, BLOCK.PINE_LEAVES)
  let layer = 0
  for (let layerY = top - 1; layerY >= y + 3; layerY--, layer++) {
    const radius = Math.min(3, 1 + Math.floor(layer / 3)) - (layer % 2 === 1 ? 1 : 0)
    if (radius > 0) disc(grid, [x, layerY, z], rand, { radius: radius + 0.3, block: BLOCK.PINE_LEAVES, ragged: 0.25 })
  }
  trunk(grid, base, height, BLOCK.PINE_LOG)
}

/**
 * @param {Grid} grid
 * @param {Position} base
 * @param {Rand} rand
 */
export const palm = (grid, base, rand) => {
  const [x, y, z] = base
  const height = 5 + Math.floor(rand() * 4)
  const lean = SIDE_STEPS[Math.floor(rand() * 4)]
  let trunkX = x, trunkZ = z
  for (let i = 0; i < height; i++) {
    if (i === Math.floor(height / 2) || i === height - 1) { trunkX += lean[0]; trunkZ += lean[1] }
    grid.set(trunkX, y + i, trunkZ, BLOCK.PALM_LOG)
  }
  const top = y + height
  grid.setIfAir(trunkX, top, trunkZ, BLOCK.PALM_LEAVES)
  for (const [dx, dz] of [...SIDE_STEPS, [1, 1], [-1, 1], [1, -1], [-1, -1]]) {
    const reach = dx && dz ? 2 : 3 + Math.floor(rand() * 2)
    for (let k = 1; k <= reach; k++) grid.setIfAir(trunkX + dx * k, top - (k >= reach - 1 ? 1 : 0), trunkZ + dz * k, BLOCK.PALM_LEAVES)
  }
}

/**
 * @param {Grid} grid
 * @param {Position} base
 * @param {Rand} rand
 */
export const cactus = (grid, base, rand) => {
  trunk(grid, base, 2 + Math.floor(rand() * 3), BLOCK.CACTUS)
}

/**
 * @param {Grid} grid
 * @param {Position} base
 * @param {Rand} rand
 */
export const swampTree = (grid, base, rand) => {
  const [x, y, z] = base
  const height = 4 + Math.floor(rand() * 2), top = y + height
  disc(grid, [x, top, z], rand, { radius: 3.4, block: BLOCK.MARSH_LEAVES, ragged: 0.4 })
  disc(grid, [x, top + 1, z], rand, { radius: 2.2, block: BLOCK.MARSH_LEAVES, ragged: 0.4 })
  for (let i = 0; i < 9; i++) {
    const angle = rand() * Math.PI * 2
    const hangX = x + Math.round(Math.cos(angle) * 3), hangZ = z + Math.round(Math.sin(angle) * 3)
    const drop = 1 + Math.floor(rand() * 3)
    for (let d = 1; d <= drop; d++) grid.setIfAir(hangX, top - d, hangZ, BLOCK.MARSH_LEAVES)
  }
  trunk(grid, base, height, BLOCK.LOG)
}

/**
 * Flat-topped dry-country tree: trunk bends once, wide thin canopy.
 * @param {Grid} grid
 * @param {Position} base
 * @param {Rand} rand
 */
export const flatTop = (grid, base, rand) => {
  const [x, y, z] = base
  const [bendX, bendZ] = SIDE_STEPS[Math.floor(rand() * 4)]
  trunk(grid, base, 3, BLOCK.LOG)
  let topX = x, topZ = z, topY = y + 3
  for (let i = 0; i < 2; i++) {
    topX += bendX
    topZ += bendZ
    grid.set(topX, topY, topZ, BLOCK.LOG)
    topY++
  }
  grid.set(topX, topY, topZ, BLOCK.LOG)
  disc(grid, [topX, topY + 1, topZ], rand, { radius: 3.3, block: BLOCK.LEAVES, ragged: 0.35 })
  disc(grid, [topX, topY + 2, topZ], rand, { radius: 1.8, block: BLOCK.LEAVES, ragged: 0.3 })
}

/**
 * @param {Grid} grid
 * @param {Position} base
 * @param {Rand} rand
 * @param {{ leaves?: number }} [options]
 */
export const bush = (grid, base, rand, { leaves = BLOCK.LEAVES } = {}) => {
  blob(grid, base, rand, { radius: 1.3 + rand() * 0.6, block: leaves })
}

/**
 * A rock half sunk into the ground, sometimes mossy on top.
 * @param {Grid} grid
 * @param {Position} base
 * @param {Rand} rand
 * @param {{ mossy?: boolean }} [options]
 */
export const boulder = (grid, [x, y, z], rand, { mossy = true } = {}) => {
  const radius = 1.4 + rand() * 1.2, reach = Math.ceil(radius)
  for (let dy = -1; dy <= reach; dy++) {
    for (let dz = -reach; dz <= reach; dz++) {
      for (let dx = -reach; dx <= reach; dx++) {
        if (dx * dx + dy * dy * 1.6 + dz * dz > radius * radius) continue
        const block = mossy && dy >= 0 && rand() < 0.35 ? BLOCK.MOSSY_STONE : BLOCK.STONE
        const existing = grid.get(x + dx, y + dy, z + dz)
        if (existing === BLOCK.AIR || dy <= 0) grid.set(x + dx, y + dy, z + dz, block)
      }
    }
  }
}
