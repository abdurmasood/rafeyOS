// A tiny world for Minecraft logic tests: listed cells are blocks, everything else air, with stone below y = 0
import { BLOCK } from '@/components/rafeyos/apps/minecraft/logic/blockTypes'

/** @param {Array<[number, number, number, number]>} cells - [x, y, z, block] */
export const worldOf = (cells = [], fill = () => BLOCK.AIR) => {
  const blocks = new Map(cells.map(([x, y, z, block]) => [`${x},${y},${z}`, block]))
  return {
    get: (x, y, z) => blocks.get(`${x},${y},${z}`) ?? (y < 0 ? BLOCK.STONE : fill(x, y, z)),
  }
}

/** Solid stone up to and including `top`, air above: a flat floor to stand on at y = top + 1. */
export const floorAt = (top, extra = []) => worldOf(extra, (x, y) => (y <= top ? BLOCK.STONE : BLOCK.AIR))
