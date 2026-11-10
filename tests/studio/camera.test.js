import { describe, expect, it } from 'vitest'
import { Matrix4, Vector3, Vector4 } from 'three'
import {
  aspectRange,
  cameraPose,
  canvasBox,
  containFovDeg,
  dprFor,
  halfTanFor,
  plateHalfTans,
  plateViewProjection,
  ROOM_VIEW,
  roomViewOffset,
} from '@/lib/studio/camera'

const PLATE = { width: 4800, height: 2400, crop: [1400, 200, 2000, 2000] }
const REF = 0.18
// A camera at (0, 0, 10) looking down -Z, column-major like the manifest
const MATRIX = new Matrix4().makeTranslation(0, 0, 10).toArray()

const plateUvOf = (viewProj, world) => {
  const clip = new Vector4(...world, 1).applyMatrix4(viewProj)
  return [clip.x / clip.w / 2 + 0.5, clip.y / clip.w / 2 + 0.5]
}

describe('camera reconstruction', () => {
  it('reads the 100 mm lens on a 36 mm sensor as a 0.18 half-tangent (20.4°)', () => {
    expect(halfTanFor(100, 36)).toBeCloseTo(0.18, 10)
    expect(containFovDeg(16 / 9, REF)).toBeCloseTo(20.408, 3)
    expect(containFovDeg(1, REF)).toBeCloseTo(20.408, 3)
  })

  it('widens the vertical field on portrait windows so the whole room still fits', () => {
    expect(containFovDeg(0.9, REF)).toBeCloseTo(22.62, 2)
  })

  it('knows the plate covers windows from 0.833 to 2.4 wide', () => {
    const half = plateHalfTans(PLATE, REF)
    expect(half.x).toBeCloseTo(0.432, 10)
    expect(half.y).toBeCloseTo(0.216, 10)
    const range = aspectRange(half, REF)
    expect(range.min).toBeCloseTo(0.8333, 4)
    expect(range.max).toBeCloseTo(2.4, 10)
  })

  it('letterboxes windows wider or taller than the plate', () => {
    const range = { min: 0.8333333, max: 2.4 }
    expect(canvasBox({ width: 3000, height: 1000 }, range)).toEqual({ width: 2400, height: 1000 })
    expect(canvasBox({ width: 600, height: 1000 }, range)).toEqual({ width: 600, height: 720 })
    expect(canvasBox({ width: 1600, height: 900 }, range)).toEqual({ width: 1600, height: 900 })
  })

  it('renders no sharper than one device pixel per plate pixel, and scales down on slow GPUs', () => {
    expect(dprFor({ box: { width: 1000, height: 1000 }, deviceDpr: 2, refRows: 2000 })).toBe(2)
    expect(dprFor({ box: { width: 1440, height: 1440 }, deviceDpr: 1, refRows: 2000 })).toBe(1)
    expect(dprFor({ box: { width: 1600, height: 1600 }, deviceDpr: 2, refRows: 2000 })).toBeCloseTo(1.25, 10)
    expect(dprFor({ box: { width: 1000, height: 1000 }, deviceDpr: 2, refRows: 2000, perf: 0.7 })).toBeCloseTo(1.4, 10)
  })

  it('takes the render camera position from its world matrix', () => {
    expect(cameraPose(MATRIX).position.equals(new Vector3(0, 0, 10))).toBe(true)
  })

  it('projects the view centre to the plate centre and the reference corner to its crop corner', () => {
    const viewProj = plateViewProjection(MATRIX, plateHalfTans(PLATE, REF))
    const [u0, v0] = plateUvOf(viewProj, [0, 0, 0])
    expect(u0).toBeCloseTo(0.5, 10)
    expect(v0).toBeCloseTo(0.5, 10)
    // 10 m ahead, the reference frame's top-right corner is 1.8 m right and up
    const [u, v] = plateUvOf(viewProj, [1.8, 1.8, 0])
    expect(u).toBeCloseTo((1400 + 2000) / 4800, 6)
    expect(v).toBeCloseTo(1 - 200 / 2400, 6)
  })
})

describe('framing the room', () => {
  it('zooms in by 1 / halfSize, keeping the canvas aspect', () => {
    const view = roomViewOffset({ width: 1600, height: 900 }, { centre: [0, 0], halfSize: 0.8 })
    expect(view).toMatchObject({ fullWidth: 1600, fullHeight: 900, width: 1280, height: 720 })
    expect(view.width / view.height).toBeCloseTo(1600 / 900)
    expect(view.x).toBeCloseTo(160) // centred: the same margin either side
    expect(view.y).toBeCloseTo(90)
  })

  it('shifts to the centre it is given, in reference-frame units (y up)', () => {
    // A wide canvas contains the frame by its height: one unit is half the height
    const view = roomViewOffset({ width: 1600, height: 900 }, { centre: [0.1, -0.1], halfSize: 1 })
    expect(view.x).toBeCloseTo(0.1 * 450)
    expect(view.y).toBeCloseTo(0.1 * 450) // a lower centre moves the window down the frame
    // A tall one contains it by its width
    expect(roomViewOffset({ width: 600, height: 1000 }, { centre: [0.2, 0], halfSize: 1 }).x).toBeCloseTo(0.2 * 300)
  })

  it('shows the whole room with a margin, and only a little closer than the full render', () => {
    expect(ROOM_VIEW.halfSize).toBeGreaterThan(0.78) // the room reaches 0.78 below the frame's centre...
    expect(ROOM_VIEW.halfSize - Math.abs(ROOM_VIEW.centre[1])).toBeGreaterThan(0.73) // ...and 0.69 above
    expect(1 / ROOM_VIEW.halfSize).toBeLessThan(1.5)
  })

  it('renders fewer device pixels once zoomed: there are fewer plate pixels across the view', () => {
    const box = { width: 1000, height: 700 }
    const full = dprFor({ box, deviceDpr: 2, refRows: 1500 })
    const zoomed = dprFor({ box, deviceDpr: 2, refRows: 1500 * ROOM_VIEW.halfSize })
    expect(zoomed).toBeLessThan(full)
  })
})
