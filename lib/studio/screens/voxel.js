// The monitor while he plays: a blocky first-person view over an island of stacked blocks, drawn small
// and scaled up with hard pixels. A heightmap raycast (one ray per screen column), terraced into whole
// blocks. Bright daylight colours, so from across the room it reads as a game, not code.
import { fbm } from '../wind'

export const VOXEL_W = 160
export const VOXEL_H = 88
const SIZE = 128 // island cells across
const FAR = 90 // cells the view reaches
const HORIZON = 0.42 // share of the height above the horizon
const WATER = 3 // block height of the sea
const SKY = Object.freeze(['#7fb7f0', '#cfe6fb'])

const islandHeights = () => {
  const heights = new Uint8Array(SIZE * SIZE)
  for (let y = 0; y < SIZE; y++) {
    for (let x = 0; x < SIZE; x++) {
      const dx = x / SIZE - 0.5
      const dy = y / SIZE - 0.5
      const falloff = 1 - Math.min(1, Math.hypot(dx, dy) * 2.1)
      const land = fbm(x * 0.045, 3.1) * 0.55 + fbm(y * 0.045 + 40, 5.7) * 0.45
      heights[y * SIZE + x] = Math.max(0, Math.round((land * 0.7 + falloff * 0.9 - 0.25) * 14))
    }
  }
  return heights
}
let island = null

const colourOf = (height, shade) => {
  const [r, g, b] = height <= WATER ? [52, 112, 200] : height <= WATER + 1 ? [218, 205, 150] : height < 11 ? [94, 168, 74] : [138, 138, 132]
  return `rgb(${Math.round(r * shade)},${Math.round(g * shade)},${Math.round(b * shade)})`
}

/**
 * @param {CanvasRenderingContext2D} context  a VOXEL_W x VOXEL_H canvas
 * @param {{ yaw: number, walked: number }} view  yaw: radians; walked: cells moved forward
 */
export const drawVoxel = (context, { yaw, walked }) => {
  island ??= islandHeights()
  const sky = context.createLinearGradient(0, 0, 0, VOXEL_H * HORIZON)
  sky.addColorStop(0, SKY[0])
  sky.addColorStop(1, SKY[1])
  context.fillStyle = sky
  context.fillRect(0, 0, VOXEL_W, VOXEL_H)
  const eyeX = SIZE / 2 + Math.sin(walked * 0.01) * 20
  const eyeY = SIZE / 2 + Math.cos(walked * 0.013) * 20
  const eyeZ = Math.max(island[(Math.floor(eyeY) & (SIZE - 1)) * SIZE + (Math.floor(eyeX) & (SIZE - 1))], WATER) + 2.2
  const horizon = VOXEL_H * HORIZON
  for (let column = 0; column < VOXEL_W; column++) {
    const angle = yaw + ((column / VOXEL_W) - 0.5) * 1.1
    const dx = Math.sin(angle)
    const dy = -Math.cos(angle)
    let lowest = VOXEL_H
    for (let distance = 1; distance < FAR && lowest > 0; distance += distance < 20 ? 0.5 : 1) {
      const cx = Math.floor(eyeX + dx * distance) & (SIZE - 1)
      const cy = Math.floor(eyeY + dy * distance) & (SIZE - 1)
      const height = Math.max(island[cy * SIZE + cx], WATER)
      const top = Math.floor(horizon + ((eyeZ - height) / distance) * 60)
      if (top < lowest) {
        context.fillStyle = colourOf(height, 1 - (distance / FAR) * 0.45)
        context.fillRect(column, top, 1, lowest - top)
        lowest = top
      }
    }
  }
  // crosshair and hotbar
  context.fillStyle = '#ffffff'
  context.fillRect(VOXEL_W / 2 - 3, VOXEL_H / 2, 7, 1)
  context.fillRect(VOXEL_W / 2, VOXEL_H / 2 - 3, 1, 7)
  context.fillStyle = 'rgba(20,20,24,0.75)'
  context.fillRect(VOXEL_W / 2 - 45, VOXEL_H - 11, 90, 9)
  for (let slot = 0; slot < 9; slot++) {
    context.fillStyle = slot === 2 ? '#f0f0f0' : '#6a6a70'
    context.fillRect(VOXEL_W / 2 - 44 + slot * 10, VOXEL_H - 10, 8, 7)
  }
}
