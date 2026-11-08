// @ts-check
// Hotbar icons: a small isometric cube per block, cut from the same texture atlas the world uses
import { ATLAS, tileOrigin } from './texturePixels'
import { FACE_TILES } from './blockTypes'

export const ICON_SIZE = Object.freeze({ width: 34, height: 35 })

/**
 * The atlas as a canvas to draw from, or null where the browser gives no 2D context.
 * @param {Document} doc
 * @param {Uint8ClampedArray} pixels
 */
export const atlasCanvas = (doc, pixels) => {
  const canvas = doc.createElement('canvas')
  canvas.width = canvas.height = ATLAS.SIZE
  const ctx = canvas.getContext('2d')
  if (!ctx) return null
  const image = ctx.createImageData(ATLAS.SIZE, ATLAS.SIZE)
  image.data.set(pixels)
  ctx.putImageData(image, 0, 0)
  return canvas
}

// Where each face of the cube lands: the top as a diamond, the left and right sides sheared down from it, the
// sides darkened like the world's shading
const ICON_FACES = Object.freeze([
  { kind: 0, matrix: [1, 0.5, -1, 0.5, 17, 1], shadow: 0 },
  { kind: 1, matrix: [1, 0.5, 0, 1.0625, 1, 9], shadow: 0.2 },
  { kind: 1, matrix: [1, -0.5, 0, 1.0625, 17, 17], shadow: 0.36 },
])

/**
 * Draws `block` as an isometric cube filling an ICON_SIZE canvas.
 * @param {CanvasRenderingContext2D} ctx
 * @param {CanvasImageSource} atlas
 * @param {number} block
 */
export const drawBlockIcon = (ctx, atlas, block) => {
  ctx.imageSmoothingEnabled = false
  ctx.setTransform(1, 0, 0, 1, 0, 0)
  ctx.clearRect(0, 0, ICON_SIZE.width, ICON_SIZE.height)
  for (const { kind, matrix, shadow } of ICON_FACES) {
    const [sx, sy] = tileOrigin(FACE_TILES[block][kind])
    const [a, b, c, d, e, f] = matrix
    ctx.setTransform(a, b, c, d, e, f)
    ctx.drawImage(atlas, sx, sy, ATLAS.TILE, ATLAS.TILE, 0, 0, ATLAS.TILE, ATLAS.TILE)
    if (shadow) {
      ctx.fillStyle = `rgba(0, 0, 0, ${shadow})`
      ctx.fillRect(0, 0, ATLAS.TILE, ATLAS.TILE)
    }
  }
  ctx.setTransform(1, 0, 0, 1, 0, 0)
}
