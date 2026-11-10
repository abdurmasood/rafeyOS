// A box whose faces are shaded like the blocks' (mesher.js): full on top, darker down the sides, darkest underneath.
// For the unlit things drawn among the blocks, so they sit in the same light.
import { BoxGeometry, Float32BufferAttribute } from 'three'

// BoxGeometry's face order: +x, -x, +y, -y, +z, -z; the shades are mesher.js's FACES
const FACE_SHADES = Object.freeze([0.8, 0.8, 1, 0.52, 0.67, 0.67])

/** @param {number} width @param {number} height @param {number} depth */
export const shadedBox = (width = 1, height = 1, depth = 1) => {
  const box = new BoxGeometry(width, height, depth)
  const colours = []
  for (const shade of FACE_SHADES) {
    // Linear, raised to 2.2 as the mesher's are, so the darkening seen on screen matches
    const light = Math.pow(shade, 2.2)
    for (let corner = 0; corner < 4; corner++) colours.push(light, light, light)
  }
  box.setAttribute('color', new Float32BufferAttribute(colours, 3))
  return box
}
