// What the Blender pipeline (tools/studio/blender) hands the web scene: camera, lights and
// where each packed layer sits. Checked once at import so a stale export fails loudly.
import rawManifest from './manifest.json'
import { aspectRange, halfTanFor, plateHalfTans } from './camera'

export const STUDIO_ASSETS = '/studio/v1'
export const DRACO_PATH = '/draco/'

export class StudioManifestError extends Error {}

/** tools/studio/build.sh draft|final: a draft is for a quick look and must never ship. */
export const BUILD_QUALITY = Object.freeze({ DRAFT: 'draft', FINAL: 'final' })

const REQUIRED = ['quality', 'camera', 'plate', 'moon', 'uplight', 'candle', 'opening', 'room', 'clock', 'plants', 'background']

const inUnitRange = (rect) => Array.isArray(rect) && rect.length === 4 && rect.every((value) => value >= 0 && value <= 1)

/** Throws StudioManifestError when keys are missing or a packed rect falls outside [0, 1]. */
export const validateManifest = (manifest) => {
  const missing = REQUIRED.filter((key) => !(key in manifest))
  if (missing.length) throw new StudioManifestError(`studio manifest is missing: ${missing.join(', ')}`)
  if (!Object.values(BUILD_QUALITY).includes(manifest.quality)) {
    throw new StudioManifestError(`studio manifest has an unknown quality '${manifest.quality}'`)
  }
  for (const [name, layer] of Object.entries(manifest.deltas ?? {})) {
    if (!inUnitRange(layer.rect) || !inUnitRange(layer.pos?.atlasRect) || !inUnitRange(layer.neg?.atlasRect)) {
      throw new StudioManifestError(`studio manifest delta '${name}' has a rect outside [0, 1]`)
    }
  }
  // The page poses bones in order, each inside its parent, so parents must come first
  if ((manifest.figure?.bones ?? []).some((bone, i) => bone.parent >= i)) {
    throw new StudioManifestError('studio manifest figure bones must list each parent before its children')
  }
  const rests = manifest.figure?.rests
  if (rests && !['L', 'R'].every((side) => Array.isArray(rests[side]) && rests[side].length === 3)) {
    throw new StudioManifestError('studio manifest figure rests need a wrist point for each side')
  }
  const mouse = manifest.figure?.mouse
  if (mouse && !(Array.isArray(mouse) && mouse.length === 3 && mouse.every(Number.isFinite))) {
    throw new StudioManifestError('studio manifest figure mouse needs one point: the top of the mouse')
  }
  const keyPitch = manifest.figure?.keyPitch
  if (keyPitch && !(Array.isArray(keyPitch) && keyPitch.length === 2 && keyPitch.every((m) => Number.isFinite(m) && m > 0))) {
    throw new StudioManifestError('studio manifest figure keyPitch needs two distances: across and between rows')
  }
  const isPoint = (p) => Array.isArray(p) && p.length === 3 && p.every(Number.isFinite)
  const desk = manifest.figure?.desk
  if (desk && !(Array.isArray(desk.edge) && desk.edge.length === 2 && desk.edge.every(isPoint))) {
    throw new StudioManifestError('studio manifest figure desk needs its front edge as two points')
  }
  const synth = manifest.figure?.synth
  if (synth && !(isPoint(synth.seat) && isPoint(synth.upper) && Array.isArray(synth.keys) && synth.keys.length === 2 && synth.keys.every(isPoint))) {
    throw new StudioManifestError('studio manifest figure synth needs a seat, a key line (two points) and an upper reach point')
  }
  const headphones = manifest.figure?.headphones
  if (headphones && !(isPoint(headphones.centre) && isPoint(headphones.radii) && isPoint(headphones.colour))) {
    throw new StudioManifestError('studio manifest figure headphones need his skull centre, its half-sizes and a colour')
  }
  const light = manifest.light
  if (light) {
    const { probes, lut } = light
    const cells = probes?.counts?.reduce((a, b) => a * b, 1)
    if (!(Array.isArray(probes?.counts) && probes.counts.length === 3 && isPoint(probes.origin) && isPoint(probes.step))) {
      throw new StudioManifestError('studio manifest light probes need a grid: origin, step and counts')
    }
    if (probes.valid?.length !== cells || probes.cube?.length !== cells * 18) {
      throw new StudioManifestError('studio manifest light probes need six colours and a valid flag per grid cell')
    }
    if (!(Number.isInteger(lut?.size) && Array.isArray(lut?.stops) && lut.stops.length === 2)) {
      throw new StudioManifestError('studio manifest light lut needs a size and its log2 range')
    }
  }
  for (const [name, layer] of Object.entries(manifest.plantLayers ?? {})) {
    if (!inUnitRange(layer.rect) || !inUnitRange(layer.atlasRect)) {
      throw new StudioManifestError(`studio manifest plant layer '${name}' has a rect outside [0, 1]`)
    }
  }
  return manifest
}

export const manifest = validateManifest(rawManifest)
export const REF_HALF_TAN = halfTanFor(manifest.camera.lens, manifest.camera.sensor)
export const PLATE_HALF_TAN = plateHalfTans(manifest.plate, REF_HALF_TAN)
export const ASPECT_RANGE = aspectRange(PLATE_HALF_TAN, REF_HALF_TAN)
export const REF_ROWS = manifest.plate.crop[3]
