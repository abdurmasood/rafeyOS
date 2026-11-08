// Shaders for the things that move: plants, the tree, their shadow passes and the dust
import { beamChunk, moonShadowChunk, openingChunk, plateChunk, swayChunk } from './common.glsl'

/** Plants: coloured from their own Cycles layer at the rest pose, then swayed. */
export const plantVertex = /* glsl */ `
attribute float _sway;
attribute float _leaf_rand;
uniform mat4 uPlateViewProj;
varying vec4 vRestClip;
${swayChunk}

void main() {
  vec4 world = modelMatrix * vec4(position, 1.0);
  vRestClip = uPlateViewProj * world;
  gl_Position = projectionMatrix * viewMatrix * vec4(swayed(world.xyz, _sway, _leaf_rand), 1.0);
}
`

export const plantFragment = /* glsl */ `
uniform sampler2D uPlants;
uniform vec4 uLayerRect;
uniform vec4 uLayerAtlas;
varying vec4 vRestClip;
${plateChunk}

void main() {
  vec2 local = (plateUv(vRestClip) - uLayerRect.xy) / (uLayerRect.zw - uLayerRect.xy);
  gl_FragColor = vec4(texture2D(uPlants, mix(uLayerAtlas.xy, uLayerAtlas.zw, local), PLATE_LOD_BIAS).rgb, 1.0);
}
`

/**
 * The figure's live parts (head, hair, hands): coloured from their own Cycles layer at the rest pose,
 * then posed by up to two bones per vertex. Pairs with plantFragment.
 */
export const figureVertex = /* glsl */ `
attribute float _bone_a;
attribute float _bone_b;
attribute float _weight_b;
uniform mat4 uPlateViewProj;
uniform mat4 uBones[BONE_COUNT];
varying vec4 vRestClip;

void main() {
  vec4 world = modelMatrix * vec4(position, 1.0);
  vRestClip = uPlateViewProj * world;
  vec4 posed = mix(uBones[int(_bone_a + 0.5)] * world, uBones[int(_bone_b + 0.5)] * world, _weight_b);
  gl_Position = projectionMatrix * viewMatrix * posed;
}
`

/** The tree's twigs and leaves: only ever seen through the window, coloured like the plants. */
export const treeVertex = /* glsl */ `
attribute float _sway;
attribute float _phase;
attribute float _flutter;
uniform mat4 uPlateViewProj;
uniform float uFlutterAmp;
uniform float uFlutterFreq;
varying vec4 vRestClip;
varying vec3 vWorld;
${swayChunk}

vec3 treeSwayed(vec3 world) {
  vec3 p = swayed(world, _sway, _phase);
  float flutter = sin(6.2831853 * (uFlutterFreq * uTime + _phase * 7.0)) * uFlutterAmp * _flutter * (0.3 + 0.7 * uWind);
  return p + uCrossDir * flutter + vec3(0.0, flutter * 0.5, 0.0);
}

void main() {
  vec4 world = modelMatrix * vec4(position, 1.0);
  vec3 moved = treeSwayed(world.xyz) * uSwayScale + world.xyz * (1.0 - uSwayScale);
  vWorld = moved;
  vRestClip = uPlateViewProj * world;
  gl_Position = projectionMatrix * viewMatrix * vec4(moved, 1.0);
}
`

export const treeFragment = /* glsl */ `
uniform sampler2D uPlants;
uniform vec4 uLayerRect;
uniform vec4 uLayerAtlas;
varying vec4 vRestClip;
varying vec3 vWorld;
${plateChunk}
${openingChunk}

void main() {
  if (!throughOpening(vWorld)) discard;
  vec2 local = (plateUv(vRestClip) - uLayerRect.xy) / (uLayerRect.zw - uLayerRect.xy);
  gl_FragColor = vec4(texture2D(uPlants, mix(uLayerAtlas.xy, uLayerAtlas.zw, local), PLATE_LOD_BIAS).rgb, 1.0);
}
`

/** Moon shadow pass: the swaying tree as seen from the moon, dark on a white (lit) target. */
export const moonSilhouetteFragment = /* glsl */ `
uniform float uLeafTransmit;
void main() {
  gl_FragColor = vec4(vec3(uLeafTransmit), 1.0);
}
`

/** Uplight shadow pass: distance from the uplight, packed into RGBA. */
export const upDepthVertex = /* glsl */ `
attribute float _sway;
attribute float _leaf_rand;
varying vec3 vWorld;
${swayChunk}

void main() {
  vec4 world = modelMatrix * vec4(position, 1.0);
  vWorld = swayed(world.xyz, _sway, _leaf_rand);
  gl_Position = projectionMatrix * viewMatrix * vec4(vWorld, 1.0);
}
`

export const upDepthFragment = /* glsl */ `
#include <packing>
uniform vec3 uUpPos;
uniform float uUpFar;
varying vec3 vWorld;
void main() {
  gl_FragColor = packDepthToRGBA(clamp(length(vWorld - uUpPos) / uUpFar, 0.0, 0.999));
}
`

/** Separable Gaussian blur for the moon shadow target (gives the leaves' soft penumbra). */
export const blurVertex = /* glsl */ `
varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = vec4(position.xy, 0.0, 1.0);
}
`

export const blurFragment = /* glsl */ `
uniform sampler2D uSource;
uniform vec2 uStep;
varying vec2 vUv;
void main() {
  float weights[5] = float[](0.227027, 0.1945946, 0.1216216, 0.054054, 0.016216);
  float sum = texture2D(uSource, vUv).r * weights[0];
  for (int i = 1; i < 5; i++) {
    sum += texture2D(uSource, vUv + uStep * float(i)).r * weights[i];
    sum += texture2D(uSource, vUv - uStep * float(i)).r * weights[i];
  }
  gl_FragColor = vec4(vec3(sum), 1.0);
}
`

/** Dust motes drifting in the moonbeam: additive, only lit where the beam (and the leaves) allow. */
export const dustVertex = /* glsl */ `
attribute vec3 aSeed;
uniform float uTime;
uniform float uTravel;
uniform vec3 uBoxMin;
uniform vec3 uBoxSize;
uniform vec3 uWindDir;
uniform float uPointSize;
varying float vSeed;
varying vec3 vWorld;

void main() {
  vec3 drift = uWindDir * uTravel * 0.06 + vec3(
    sin(uTime * 0.21 + aSeed.y * 40.0) * 0.05,
    sin(uTime * 0.17 + aSeed.z * 31.0) * 0.04 - uTime * 0.004,
    cos(uTime * 0.19 + aSeed.x * 23.0) * 0.05);
  vec3 p = uBoxMin + mod(aSeed * uBoxSize + drift, uBoxSize);
  vSeed = aSeed.x;
  vWorld = p;
  vec4 view = viewMatrix * vec4(p, 1.0);
  gl_Position = projectionMatrix * view;
  gl_PointSize = uPointSize * (0.6 + 0.8 * aSeed.y);
}
`

export const dustFragment = /* glsl */ `
uniform float uTime;
uniform vec3 uDustColour;
varying float vSeed;
varying vec3 vWorld;
${openingChunk}
${beamChunk}
${moonShadowChunk}

void main() {
  vec2 offset = gl_PointCoord - 0.5;
  float r = dot(offset, offset) * 4.0;
  if (r > 1.0) discard;
  float twinkle = 0.55 + 0.45 * sin(uTime * (0.8 + vSeed * 1.7) + vSeed * 60.0);
  float light = inBeam(vWorld) * moonLit(vWorld) * twinkle * (1.0 - r);
  gl_FragColor = vec4(uDustColour * light, 1.0);
}
`
