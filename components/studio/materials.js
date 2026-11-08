// Uniforms and shader materials for the studio. Every material references the same uniform
// objects, so the frame loop updates time, wind, flicker and shadows in one place.
import {
  AdditiveBlending,
  DoubleSide,
  LinearFilter,
  LinearMipmapLinearFilter,
  NoColorSpace,
  ShaderMaterial,
  Vector2,
  Vector3,
  Vector4,
} from 'three'
import { WIND_DIRECTION } from '@/lib/studio/motion'
import { roomFragment, roomVertex } from './shaders/room.glsl'
import {
  dustFragment,
  dustVertex,
  moonSilhouetteFragment,
  plantFragment,
  plantVertex,
  treeFragment,
  treeVertex,
  upDepthFragment,
  upDepthVertex,
} from './shaders/live.glsl'

export const WALL_X = -2.2
export const UP_FAR = 6
const LEAF_TRANSMIT = 0.12
const DUST_COLOUR = [0.16, 0.19, 0.26]
const LAYERS = Object.freeze({ Moon: 'moon', Haze: 'haze', Candle: 'candle', Up: 'up' })

/** Plates are display-referred bytes: sample them raw, with mipmaps for smaller windows. */
export const preparePlate = (texture, { mipmaps = true } = {}) => {
  texture.colorSpace = NoColorSpace
  texture.generateMipmaps = mipmaps
  texture.minFilter = mipmaps ? LinearMipmapLinearFilter : LinearFilter
  texture.magFilter = LinearFilter
  texture.anisotropy = 4
  texture.needsUpdate = true
  return texture
}

const rect = (values) => new Vector4(...values)

/** Uniforms for each light layer the manifest has, plus which shader defines to switch on. */
const layerUniforms = (deltas) => {
  const uniforms = {}
  const defines = {}
  for (const [name, key] of Object.entries(LAYERS)) {
    const layer = deltas?.[key]
    uniforms[`u${name}Rect`] = { value: rect(layer?.rect ?? [0, 0, 0, 0]) }
    uniforms[`u${name}Plus`] = { value: rect(layer?.pos.atlasRect ?? [0, 0, 0, 0]) }
    uniforms[`u${name}Minus`] = { value: rect(layer?.neg.atlasRect ?? [0, 0, 0, 0]) }
    uniforms[`u${name}Scale`] = { value: new Vector2(layer?.pos.scale ?? 0, layer?.neg.scale ?? 0) }
    if (layer) defines[`HAS_${name === 'Up' ? 'UPLIGHT' : name.toUpperCase()}`] = ''
  }
  return { uniforms, defines }
}

const boxOf = ([a, b]) => ({
  min: new Vector3(Math.min(a[0], b[0]), Math.min(a[1], b[1]), Math.min(a[2], b[2])),
  max: new Vector3(Math.max(a[0], b[0]), Math.max(a[1], b[1]), Math.max(a[2], b[2])),
})

/** The uniforms every studio material shares. Targets and matrices are filled in by the shadow rig. */
export const createSharedUniforms = ({ manifest, plateViewProj, base, deltas }) => {
  const room = boxOf(manifest.room)
  const { opening } = manifest
  const layers = layerUniforms(deltas ? manifest.deltas : null)
  return {
    defines: layers.defines,
    uniforms: {
      ...layers.uniforms,
      uPlateViewProj: { value: plateViewProj },
      uBase: { value: base },
      uDeltas: { value: deltas },
      uTime: { value: 0 },
      uCandleGain: { value: 1 },
      uMoonPos: { value: new Vector3(...manifest.moon.position) },
      uMoonDir: { value: new Vector3(...manifest.moon.direction) },
      uMoonCosCone: { value: Math.cos(((manifest.moon.coneDeg / 2) * Math.PI) / 180) },
      uRoomMin: { value: room.min },
      uRoomMax: { value: room.max },
      uOpeningX: { value: new Vector2(...opening.facesX) },
      uOpening: { value: new Vector4(opening.y[0], opening.y[1], opening.z[0], opening.z[1]) },
      uMoonShadow: { value: null },
      uMoonViewProj: { value: null },
      uWallX: { value: WALL_X },
      uUpLive: { value: null },
      uUpRest: { value: null },
      uUpViewProj: { value: null },
      uUpPos: { value: new Vector3(...manifest.uplight.position) },
      uUpFar: { value: UP_FAR },
      uUpTexel: { value: new Vector2() },
      uWindDir: { value: new Vector3(...WIND_DIRECTION) },
      uCrossDir: { value: new Vector3(0, 0, 1) },
    },
  }
}

export const createRoomMaterial = (shared, hazeSteps) =>
  new ShaderMaterial({
    uniforms: shared.uniforms,
    defines: { ...shared.defines, HAZE_STEPS: hazeSteps },
    vertexShader: roomVertex,
    fragmentShader: roomFragment,
  })

/** Per-object sway uniforms; time and directions stay shared. */
export const swayUniforms = (shared, { amp, freq, height, phaseBase = 0, phaseSpread = 1 }) => ({
  uTime: shared.uniforms.uTime,
  uWindDir: shared.uniforms.uWindDir,
  uCrossDir: shared.uniforms.uCrossDir,
  uWind: { value: 0.25 },
  uAmp: { value: amp },
  uFreq: { value: freq },
  uHeight: { value: height },
  uSwayScale: { value: 1 },
  uPhaseBase: { value: phaseBase },
  uPhaseSpread: { value: phaseSpread },
})

export const createPlantMaterial = (shared, sway, { plants, layerRect, atlasRect }) =>
  new ShaderMaterial({
    uniforms: {
      ...sway,
      uPlateViewProj: shared.uniforms.uPlateViewProj,
      uPlants: { value: plants },
      uLayerRect: { value: rect(layerRect) },
      uLayerAtlas: { value: rect(atlasRect) },
    },
    vertexShader: plantVertex,
    fragmentShader: plantFragment,
  })

/** Shared by the tree's own material and its moon-silhouette twin. Colour comes from its Cycles layer. */
export const treeUniforms = (shared, sway, { flutterAmp, flutterFreq }, { plants, layerRect, atlasRect }) => ({
  ...sway,
  uPlateViewProj: shared.uniforms.uPlateViewProj,
  uOpeningX: shared.uniforms.uOpeningX,
  uOpening: shared.uniforms.uOpening,
  uFlutterAmp: { value: flutterAmp },
  uFlutterFreq: { value: flutterFreq },
  uPlants: { value: plants },
  uLayerRect: { value: rect(layerRect) },
  uLayerAtlas: { value: rect(atlasRect) },
  uLeafTransmit: { value: LEAF_TRANSMIT },
})

// Leaves are single polygons seen from both sides (from the room and from the moon)
export const createTreeMaterial = (uniforms) =>
  new ShaderMaterial({ uniforms, vertexShader: treeVertex, fragmentShader: treeFragment, side: DoubleSide })

/** The same swaying tree, drawn from the moon as a dark silhouette on white. */
export const createMoonSilhouetteMaterial = (uniforms) =>
  new ShaderMaterial({ uniforms, vertexShader: treeVertex, fragmentShader: moonSilhouetteFragment, side: DoubleSide })

export const createUpDepthMaterial = (shared, sway) =>
  new ShaderMaterial({
    uniforms: { ...sway, uUpPos: shared.uniforms.uUpPos, uUpFar: shared.uniforms.uUpFar },
    vertexShader: upDepthVertex,
    fragmentShader: upDepthFragment,
  })

export const createDustMaterial = (shared, { boxMin, boxSize, pointSize }) =>
  new ShaderMaterial({
    uniforms: {
      uTime: shared.uniforms.uTime,
      uWindDir: shared.uniforms.uWindDir,
      uTravel: { value: 0 },
      uBoxMin: { value: new Vector3(...boxMin) },
      uBoxSize: { value: new Vector3(...boxSize) },
      uPointSize: { value: pointSize },
      uDustColour: { value: new Vector3(...DUST_COLOUR) },
      ...Object.fromEntries(
        ['uMoonPos', 'uMoonDir', 'uMoonCosCone', 'uRoomMin', 'uRoomMax', 'uOpeningX', 'uOpening', 'uMoonShadow', 'uMoonViewProj', 'uWallX'].map(
          (key) => [key, shared.uniforms[key]],
        ),
      ),
    },
    vertexShader: dustVertex,
    fragmentShader: dustFragment,
    transparent: true,
    depthWrite: false,
    blending: AdditiveBlending,
  })
