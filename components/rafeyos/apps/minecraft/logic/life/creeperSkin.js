// @ts-check
// Original 64×32 creeper skin painted in code on the classic entity UV layout. Not Mojang's asset — same unwrap,
// different pixels. Buffer is bottom-row-first for the GPU (like tuftSprites).

export const SKIN = Object.freeze({ W: 64, H: 32 })

/** Classic creeper texOffs and limb sizes in texels (W×H×D). */
export const CREEPER_UV = Object.freeze({
  HEAD: Object.freeze({ u: 0, v: 0, w: 8, h: 8, d: 8 }),
  BODY: Object.freeze({ u: 16, v: 16, w: 8, h: 12, d: 4 }),
  LEG: Object.freeze({ u: 0, v: 16, w: 4, h: 6, d: 4 }),
})

const GREENS = Object.freeze(['#3e7a36', '#2d5a27', '#4a8f40', '#356b2e', '#45853c'])
const FACE = '#141810'

/** @param {string} hex */
const rgb = (hex) => /** @type {[number, number, number]} */ ([1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16)))

/**
 * Fill a Minecraft-style box UV unwrap (top/bottom strip + side belt) with mottled green.
 * @param {(x: number, y: number, hex: string) => void} put - x,y from the skin's top-left
 * @param {{ u: number, v: number, w: number, h: number, d: number }} part
 */
const fillBoxUv = (put, { u, v, w, h, d }) => {
  const paint = (x0, y0, rw, rh) => {
    for (let y = 0; y < rh; y++) {
      for (let x = 0; x < rw; x++) {
        const hex = GREENS[(x * 3 + y * 5 + u + v) % GREENS.length]
        put(x0 + x, y0 + y, hex)
      }
    }
  }
  // Top, bottom
  paint(u + d, v, w, d)
  paint(u + d + w, v, w, d)
  // Right, front, left, back
  paint(u, v + d, d, h)
  paint(u + d, v + d, w, h)
  paint(u + d + w, v + d, d, h)
  paint(u + d + w + d, v + d, w, h)
}

/**
 * Face on the head's front UV square (8,8)–(16,16): eyes + mouth. Original silhouette, not Mojang pixels.
 * @param {(x: number, y: number, hex: string) => void} put
 */
const paintFace = (put) => {
  // Eyes
  for (const [x, y] of [[9, 10], [10, 10], [13, 10], [14, 10], [9, 11], [10, 11], [13, 11], [14, 11]]) put(x, y, FACE)
  // Mouth bridge
  put(11, 12, FACE)
  put(12, 12, FACE)
  // Mouth corners / frown
  for (const [x, y] of [
    [9, 13], [10, 13], [11, 13], [12, 13], [13, 13], [14, 13],
    [9, 14], [14, 14], [10, 15], [13, 15],
  ]) put(x, y, FACE)
}

/**
 * @returns {Uint8Array} RGBA, 64×32, bottom row first
 */
export const paintCreeperSkin = () => {
  const { W, H } = SKIN
  const pixels = new Uint8Array(W * H * 4)
  /** Skin coords from the top-left (Minecraft); stored flipped for the GPU. */
  const put = (x, y, hex) => {
    if (x < 0 || y < 0 || x >= W || y >= H) return
    const offset = ((H - 1 - y) * W + x) * 4
    const [r, g, b] = rgb(hex)
    pixels[offset] = r
    pixels[offset + 1] = g
    pixels[offset + 2] = b
    pixels[offset + 3] = 255
  }
  fillBoxUv(put, CREEPER_UV.HEAD)
  fillBoxUv(put, CREEPER_UV.BODY)
  fillBoxUv(put, CREEPER_UV.LEG)
  paintFace(put)
  return pixels
}

/**
 * Three.js UVs for one face of a Minecraft entity box (v flipped for bottom-row-first buffer).
 * Returns 4 UV pairs for the face's corners in BoxGeometry order (BL, BR, TR, TL in local face space
 * as Three lays them: for each face, corners are [0,1]=bottom-leftish per Three's convention).
 * @param {number} u @param {number} v @param {number} rw @param {number} rh
 * @returns {number[]} eight numbers: u,v × 4
 */
export const faceUv = (u, v, rw, rh) => {
  const { W, H } = SKIN
  const u0 = u / W, u1 = (u + rw) / W
  // Minecraft v grows down from the top of the image; GPU v grows up from the buffer bottom
  const v1 = 1 - v / H
  const v0 = 1 - (v + rh) / H
  // Three BoxGeometry face UVs: (0,0), (1,0), (1,1), (0,1) → map to (u0,v0), (u1,v0), (u1,v1), (u0,v1)
  return [u0, v0, u1, v0, u1, v1, u0, v1]
}
