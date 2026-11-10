// Uniforms and shader materials for the studio. Every material references the same uniform
// objects, so the frame loop updates time, wind, flicker and shadows in one place.
import {
  AdditiveBlending,
  Data3DTexture,
  DataTexture,
  DoubleSide,
  FloatType,
  LinearFilter,
  LinearMipmapLinearFilter,
  NearestFilter,
  NoColorSpace,
  RGBAFormat,
  ShaderMaterial,
  UnsignedByteType,
  Vector2,
  Vector3,
  Vector4,
} from 'three'
import { WIND_DIRECTION } from '@/lib/studio/motion'
import { KEY_COUNT } from '@/lib/studio/synthKeys'
import { roomFragment, roomVertex } from './shaders/room.glsl'
import {
  dustFragment,
  dustVertex,
  figureFragment,
  figureSilhouetteFragment,
  figureSilhouetteVertex,
  figureVertex,
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
const LAYERS = Object.freeze({
  Moon: 'moon',
  Haze: 'haze',
  Candle: 'candle',
  Up: 'up',
  Figure: 'figure',
  Body: 'body',
  Guitar: 'guitar',
  Screen: 'screen',
  KeysA: 'keysA',
  KeysB: 'keysB',
  KeysBlack: 'keysBlack',
})

/** The key map holds exact key numbers: never filtered, never mipmapped, never colour-converted. */
export const prepareKeyMap = (texture) => {
  texture.colorSpace = NoColorSpace
  texture.generateMipmaps = false
  texture.minFilter = NearestFilter
  texture.magFilter = NearestFilter
  texture.needsUpdate = true
  return texture
}

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
export const createSharedUniforms = ({ manifest, plateViewProj, base, deltas, keyMap = null }) => {
  const room = boxOf(manifest.room)
  const { opening } = manifest
  const layers = layerUniforms(deltas ? manifest.deltas : null)
  const hasKeys = Boolean(keyMap && manifest.keys && ['HAS_KEYSA', 'HAS_KEYSB', 'HAS_KEYSBLACK'].every((d) => d in layers.defines))
  return {
    defines: { ...layers.defines, ...(hasKeys ? { HAS_KEYS: '' } : {}) },
    uniforms: {
      ...layers.uniforms,
      uPlateViewProj: { value: plateViewProj },
      uBase: { value: base },
      uDeltas: { value: deltas },
      uTime: { value: 0 },
      uCandleGain: { value: 1 },
      uFigureGone: { value: 0 }, // 0 at the desk .. 1 rolled over to the synths
      uBodyGone: { value: 0 }, // 0 seated .. 1 up out of the chair (the chair stays)
      uGuitarGone: { value: 0 }, // 0 on its hook .. 1 taken down
      uEmptyChair: { value: 0 }, // the chair's colour: 0 with him in it .. 1 empty
      uLiveLight: { value: 0 }, // his colour: 0 from the seated render .. 1 lit live
      uGuitarLive: { value: 0 }, // the guitar's colour: 0 from the render (on its hook) .. 1 lit live (in his hands)
      uScreenOff: { value: 0 }, // 0 awake .. 1 the monitor asleep
      uKeyMap: { value: keyMap }, // which of Synth A's keys each plate pixel shows (studio_keys.py)
      uKeyRect: { value: rect(manifest.keys?.rect ?? [0, 0, 0, 0]) },
      uKeyPress: { value: new Float32Array(KEY_COUNT) }, // how far down each key is, 0..1 (synthKeys.js)
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

/**
 * Him, his chair and the guitar: coloured like the plants, posed by `bones` (the rig's matrices, updated in place).
 * empty: the empty chair's layer { rect, atlasRect } for chair vertices (bone `chairBone`); light: the live
 * lighting textures and grid (createLiveLight), used as `uLiveLight` rises (off the chair).
 */
export const createFigureMaterial = (shared, { plants, layerRect, atlasRect, bones, empty = null, light = null, chairBone = -1, guitarBone = -1 }) => {
  const defines = { BONE_COUNT: bones.length }
  if (empty) defines.HAS_EMPTY_CHAIR = ''
  if (light) defines.HAS_LIVE_LIGHT = ''
  return new ShaderMaterial({
    uniforms: {
      uPlateViewProj: shared.uniforms.uPlateViewProj,
      uPlants: { value: plants },
      uLayerRect: { value: rect(layerRect) },
      uLayerAtlas: { value: rect(atlasRect) },
      uBones: { value: bones },
      uChairBone: { value: chairBone },
      uGuitarBone: { value: guitarBone },
      uGuitarLive: shared.uniforms.uGuitarLive,
      uEmptyRect: { value: rect(empty?.rect ?? [0, 0, 1, 1]) },
      uEmptyAtlas: { value: rect(empty?.atlasRect ?? [0, 0, 1, 1]) },
      uEmptyChair: shared.uniforms.uEmptyChair,
      uLiveLight: shared.uniforms.uLiveLight,
      uProbes: { value: light?.probes ?? null },
      uProbeOrigin: { value: new Vector3(...(light?.origin ?? [0, 0, 0])) },
      uProbeStep: { value: new Vector3(...(light?.step ?? [1, 1, 1])) },
      uProbeCounts: { value: new Vector3(...(light?.counts ?? [1, 1, 1])) },
      uLut: { value: light?.lut ?? null },
      uLutStops: { value: new Vector2(...(light?.stops ?? [0, 1])) },
      uLutSize: { value: light?.size ?? 1 },
    },
    defines,
    vertexShader: figureVertex,
    fragmentShader: figureFragment,
  })
}

/**
 * The live-lighting textures from the manifest's `light`: each probe's ambient cube as a float texture (a row
 * per probe, 6 RGB texels +x -x +y -y +z -z, alpha = valid) and the display LUT (lut.png as a 3D texture).
 */
export const createLiveLight = ({ probes, lut }, lutImage) => {
  const count = probes.valid.length
  const faces = new Float32Array(6 * 4 * count)
  for (let p = 0; p < count; p++) {
    for (let k = 0; k < 6; k++) {
      for (let c = 0; c < 3; c++) faces[(p * 6 + k) * 4 + c] = probes.cube[p * 18 + k * 3 + c]
      faces[(p * 6 + k) * 4 + 3] = probes.valid[p]
    }
  }
  const probeTexture = new DataTexture(faces, 6, count, RGBAFormat, FloatType)
  probeTexture.minFilter = NearestFilter
  probeTexture.magFilter = NearestFilter
  probeTexture.needsUpdate = true
  const n = lut.size
  const canvas = document.createElement('canvas')
  canvas.width = n * n
  canvas.height = n
  const context = canvas.getContext('2d', { willReadFrequently: true })
  context.drawImage(lutImage, 0, 0)
  const pixels = context.getImageData(0, 0, n * n, n).data // row = green, column = blue tile * n + red
  const table = new Uint8Array(n * n * n * 4)
  for (let b = 0; b < n; b++) {
    for (let g = 0; g < n; g++) {
      for (let r = 0; r < n; r++) {
        const from = (g * n * n + b * n + r) * 4
        const to = ((b * n + g) * n + r) * 4
        table[to] = pixels[from]
        table[to + 1] = pixels[from + 1]
        table[to + 2] = pixels[from + 2]
        table[to + 3] = 255
      }
    }
  }
  const lutTexture = new Data3DTexture(table, n, n, n)
  lutTexture.format = RGBAFormat
  lutTexture.type = UnsignedByteType
  lutTexture.minFilter = LinearFilter
  lutTexture.magFilter = LinearFilter
  lutTexture.unpackAlignment = 1
  lutTexture.colorSpace = NoColorSpace
  lutTexture.needsUpdate = true
  return {
    probes: probeTexture,
    lut: lutTexture,
    origin: probes.origin,
    step: probes.step,
    counts: probes.counts,
    size: n,
    stops: lut.stops,
    dispose: () => {
      probeTexture.dispose()
      lutTexture.dispose()
    },
  }
}

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

/** Him (and his chair and the guitar), posed by the rig's matrices, as a solid silhouette from the moon. */
export const createFigureSilhouetteMaterial = (bones) =>
  new ShaderMaterial({
    uniforms: { uBones: { value: bones } },
    defines: { BONE_COUNT: bones.length },
    vertexShader: figureSilhouetteVertex,
    fragmentShader: figureSilhouetteFragment,
    side: DoubleSide,
  })

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
