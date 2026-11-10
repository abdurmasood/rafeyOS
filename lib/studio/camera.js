// Rebuilding Blender's locked render camera in three.js. The live camera shares the
// render camera's pose; only its field of view adapts to the window, so the projected
// plates line up pixel for pixel.
import { Matrix4, Quaternion, Vector3 } from 'three'

const PLATE_NEAR = 1
const PLATE_FAR = 1000

/** tan(half the field of view) of a camera with this lens on this sensor, both in mm. */
export const halfTanFor = (lensMm, sensorMm) => sensorMm / (2 * lensMm)

/** Half-tangents of the overscan plate, from where the reference frame sits inside it. */
export const plateHalfTans = ({ width, height, crop }, refHalfTan) => {
  const [, , cropWidth, cropHeight] = crop
  return { x: (refHalfTan * width) / cropWidth, y: (refHalfTan * height) / cropHeight }
}

/** The window aspects the plate can fill while the whole reference frame stays in view. */
export const aspectRange = (plateHalfTan, refHalfTan) => ({
  min: refHalfTan / plateHalfTan.y,
  max: plateHalfTan.x / refHalfTan,
})

/** Vertical field of view (degrees) that keeps the reference frame fully visible ("contain"). */
export const containFovDeg = (aspect, refHalfTan) =>
  (2 * Math.atan(aspect >= 1 ? refHalfTan : refHalfTan / aspect) * 180) / Math.PI

/**
 * The part of the reference frame the view shows, in reference-frame units (-1..1, y up): the room
 * itself, closer than the full render. The room spans about ±0.77 across and -0.78..0.69 up the frame
 * (measured on the base plate), so this frames it with a small margin.
 */
export const ROOM_VIEW = Object.freeze({ centre: Object.freeze([0, -0.05]), halfSize: 0.8 })

/**
 * The camera's view offset (three.js setViewOffset) that shows `view` of the contain-fitted frame:
 * the same aspect, zoomed by 1 / halfSize and shifted to the view's centre. Sizes in CSS px.
 */
export const roomViewOffset = ({ width, height }, { centre: [u, v], halfSize }) => {
  const unit = Math.min(width, height) / 2 // px per reference-frame unit when the whole frame is contained
  const viewWidth = width * halfSize
  const viewHeight = height * halfSize
  return {
    fullWidth: width,
    fullHeight: height,
    x: width / 2 + u * unit - viewWidth / 2,
    y: height / 2 - v * unit - viewHeight / 2,
    width: viewWidth,
    height: viewHeight,
  }
}

/** The canvas box (CSS px) inside the viewport: the full viewport unless its aspect is outside range. */
export const canvasBox = ({ width, height }, { min, max }) => {
  const aspect = width / height
  if (aspect > max) return { width: Math.round(height * max), height }
  if (aspect < min) return { width, height: Math.round(width / min) }
  return { width, height }
}

/**
 * Device-pixel ratio worth rendering at: past one device pixel per plate pixel nothing gets sharper.
 * `refRows` is the plate rows across the view (fewer when zoomed in). `perf` scales it down on slow GPUs.
 */
export const dprFor = ({ box, deviceDpr, refRows, perf = 1 }) => {
  const aspect = box.width / box.height
  const plateRowsInView = aspect >= 1 ? refRows : refRows / aspect
  const useful = Math.min(deviceDpr, plateRowsInView / box.height)
  return Math.min(2, Math.max(1, useful * perf))
}

/** Position and orientation of the render camera, from its column-major world matrix. */
export const cameraPose = (matrixArray) => {
  const position = new Vector3()
  const quaternion = new Quaternion()
  new Matrix4().fromArray(matrixArray).decompose(position, quaternion, new Vector3())
  return { position, quaternion }
}

/** World -> overscan-plate clip space; uv = clip.xy / clip.w * 0.5 + 0.5. */
export const plateViewProjection = (matrixArray, plateHalfTan) => {
  const n = PLATE_NEAR
  const projection = new Matrix4().makePerspective(
    -plateHalfTan.x * n,
    plateHalfTan.x * n,
    plateHalfTan.y * n,
    -plateHalfTan.y * n,
    n,
    PLATE_FAR,
  )
  const view = new Matrix4().fromArray(matrixArray).invert()
  return projection.multiply(view)
}
