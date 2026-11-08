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
