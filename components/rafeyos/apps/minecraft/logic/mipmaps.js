// @ts-check
// Mip levels for the pixel-art textures, averaged here rather than by the GPU. The GPU would halve all the way to
// 1 × 1, and below one pixel per tile the atlas's tiles bleed into each other; stopping at `minSize` keeps every
// level tile-safe. No three.js here, so it runs in tests.

/** @typedef {{ data: Uint8Array, width: number, height: number }} MipLevel */

/**
 * Half the size: each pixel is the rounded average of the 2 × 2 block it covers.
 * @param {Uint8Array} pixels - square RGBA
 * @param {number} size - its width and height, even
 * @returns {Uint8Array} RGBA, (size / 2) × (size / 2)
 */
const halve = (pixels, size) => {
  const half = size / 2
  const halved = new Uint8Array(half * half * 4)
  for (let y = 0; y < half; y++) {
    for (let x = 0; x < half; x++) {
      const above = (2 * y * size + 2 * x) * 4, below = above + size * 4
      for (let channel = 0; channel < 4; channel++) {
        const sum = pixels[above + channel] + pixels[above + 4 + channel] + pixels[below + channel] + pixels[below + 4 + channel]
        halved[(y * half + x) * 4 + channel] = (sum + 2) >> 2
      }
    }
  }
  return halved
}

/**
 * Every level from `size` down to `minSize`, each a 2 × 2 box average of the one before. In a power-of-two image
 * of power-of-two tiles, a pixel only ever averages its own tile's pixels while each tile is at least one pixel.
 * @param {Uint8Array} pixels - square RGBA: level 0, kept as given (not copied)
 * @param {number} size - a power of two
 * @param {number} minSize - the smallest level, a power of two from 1 to `size`
 * @returns {MipLevel[]} largest first
 * @throws {RangeError} when `minSize` is outside 1 to `size`
 */
export const mipChain = (pixels, size, minSize) => {
  if (!(minSize >= 1 && minSize <= size)) throw new RangeError(`mipChain: minSize ${minSize} is outside 1 to ${size}`)
  const levels = [{ data: pixels, width: size, height: size }]
  for (let next = size / 2; next >= minSize; next /= 2) {
    const previous = levels[levels.length - 1]
    levels.push({ data: halve(previous.data, previous.width), width: next, height: next })
  }
  return levels
}
