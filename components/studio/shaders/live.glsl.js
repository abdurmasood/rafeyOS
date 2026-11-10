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
 * The figure (him, his chair, the guitar): coloured from its Cycles layer at the rest pose, then posed by up to
 * two bones per vertex. Off the chair he is lit live instead: irradiance from the room's light probes (Cycles
 * panoramas as spherical harmonics), worked out per vertex here, through the scene's own colour transform in
 * figureFragment. Chair vertices (moved by the chair bone) can take the empty chair's layer instead.
 */
export const figureVertex = /* glsl */ `
attribute float _bone_a;
attribute float _bone_b;
attribute float _weight_b;
attribute float _nx;
attribute float _ny;
attribute float _nz;
attribute float _ar;
attribute float _ag;
attribute float _ab;
uniform mat4 uPlateViewProj;
uniform mat4 uBones[BONE_COUNT];
uniform float uChairBone;
uniform float uGuitarBone;
uniform float uLiveLight;
uniform float uGuitarLive;
varying vec4 vRestClip;
varying float vChair;
varying float vLiveShare;
varying vec3 vLive;

#ifdef HAS_LIVE_LIGHT
#define ROUGH_GRAZING 0.25
uniform sampler2D uProbes; // a row per probe: 6 texels (+x -x +y -y +z -z), the light a white surface facing each reflects; A = valid
uniform vec3 uProbeOrigin;
uniform vec3 uProbeStep;
uniform vec3 uProbeCounts;

/** The ambient cube: each axis's colour, weighted by how much the normal faces it. */
vec3 irradianceAt(int probe, vec3 n) {
  vec3 n2 = n * n;
  vec3 x = texelFetch(uProbes, ivec2(n.x >= 0.0 ? 0 : 1, probe), 0).rgb;
  vec3 y = texelFetch(uProbes, ivec2(n.y >= 0.0 ? 2 : 3, probe), 0).rgb;
  vec3 z = texelFetch(uProbes, ivec2(n.z >= 0.0 ? 4 : 5, probe), 0).rgb;
  return n2.x * x + n2.y * y + n2.z * z;
}

/** Light a white surface at p facing n would reflect, blended from the 8 probes around p (skipping any inside furniture). */
vec3 probeLight(vec3 p, vec3 n) {
  vec3 g = clamp((p - uProbeOrigin) / uProbeStep, vec3(0.0), uProbeCounts - 1.0001);
  ivec3 base = ivec3(floor(g));
  vec3 f = g - vec3(base);
  ivec3 counts = ivec3(uProbeCounts + 0.5);
  vec3 total = vec3(0.0);
  float weight = 0.0;
  for (int corner = 0; corner < 8; corner++) {
    ivec3 step = ivec3(corner & 1, (corner >> 1) & 1, (corner >> 2) & 1);
    ivec3 c = base + step;
    int probe = c.x + counts.x * (c.y + counts.y * c.z);
    vec3 share = mix(1.0 - f, f, vec3(step));
    float w = share.x * share.y * share.z * texelFetch(uProbes, ivec2(0, probe), 0).a;
    total += w * irradianceAt(probe, n);
    weight += w;
  }
  return weight > 1e-4 ? total / weight : vec3(0.0);
}
#endif

void main() {
  vec4 world = modelMatrix * vec4(position, 1.0);
  vRestClip = uPlateViewProj * world;
  mat4 a = uBones[int(_bone_a + 0.5)];
  mat4 b = uBones[int(_bone_b + 0.5)];
  vec4 posed = mix(a * world, b * world, _weight_b);
  vChair = abs(_bone_a - uChairBone) < 0.5 ? 1.0 : 0.0;
  // how live-lit this vertex is: him as he leaves the chair, the guitar once it's off its hook, never the chair
  float guitar = abs(_bone_a - uGuitarBone) < 0.5 ? 1.0 : 0.0;
  vLiveShare = (1.0 - vChair) * mix(uLiveLight, uGuitarLive, guitar);
  vLive = vec3(0.0);
#ifdef HAS_LIVE_LIGHT
  if (vLiveShare > 0.0) {
    vec3 rest = vec3(_nx, _ny, _nz);
    vec3 normal = normalize(mix(mat3(a) * rest, mat3(b) * rest, _weight_b) + vec3(1e-6));
    vec3 toEye = normalize(cameraPosition - posed.xyz);
    // diffuse (albedo x the probes' white-surface light) plus a dielectric's ~4% reflection, which is most of
    // what lights dark hair and cloth in the render; the light toward the reflected ray stands in for the room
    // Schlick's reflectance, its grazing rise held down as on a rough surface (cloth, skin, hair), so edges don't glow
    float fresnel = 0.04 + (ROUGH_GRAZING - 0.04) * pow(1.0 - max(dot(normal, toEye), 0.0), 5.0);
    vec3 diffuse = vec3(_ar, _ag, _ab) * probeLight(posed.xyz, normal);
    vec3 shine = fresnel * probeLight(posed.xyz, reflect(-toEye, normal));
    vLive = diffuse * (1.0 - fresnel) + shine;
  }
#endif
  gl_Position = projectionMatrix * viewMatrix * posed;
}
`

export const figureFragment = /* glsl */ `
uniform sampler2D uPlants;
uniform vec4 uLayerRect;
uniform vec4 uLayerAtlas;
uniform vec4 uEmptyRect;
uniform vec4 uEmptyAtlas;
uniform float uEmptyChair;
varying vec4 vRestClip;
varying float vChair;
varying float vLiveShare;
varying vec3 vLive;
${plateChunk}

#ifdef HAS_LIVE_LIGHT
uniform sampler3D uLut;
uniform vec2 uLutStops; // log2 range of scene-linear light the LUT covers
uniform float uLutSize;

/** Scene-linear light to the plates' display values, through Blender's own exposure, AgX and look. */
vec3 display(vec3 linear) {
  vec3 coord = clamp((log2(max(linear, vec3(exp2(uLutStops.x)))) - uLutStops.x) / (uLutStops.y - uLutStops.x), 0.0, 1.0);
  return texture(uLut, coord * (uLutSize - 1.0) / uLutSize + 0.5 / uLutSize).rgb;
}
#endif

vec3 layerColour(vec4 rect, vec4 atlas) {
  vec2 local = (plateUv(vRestClip) - rect.xy) / (rect.zw - rect.xy);
  return texture2D(uPlants, mix(atlas.xy, atlas.zw, local), PLATE_LOD_BIAS).rgb;
}

void main() {
  vec3 colour = layerColour(uLayerRect, uLayerAtlas);
#ifdef HAS_EMPTY_CHAIR
  if (vChair > 0.5 && uEmptyChair > 0.0) colour = mix(colour, layerColour(uEmptyRect, uEmptyAtlas), uEmptyChair);
#endif
#ifdef HAS_LIVE_LIGHT
  if (vLiveShare > 0.0) colour = mix(colour, display(vLive), vLiveShare);
#endif
  gl_FragColor = vec4(colour, 1.0);
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

/** His silhouette seen from the moon, posed like he is: he blocks the moonbeam when he walks through it. */
export const figureSilhouetteVertex = /* glsl */ `
attribute float _bone_a;
attribute float _bone_b;
attribute float _weight_b;
uniform mat4 uBones[BONE_COUNT];

void main() {
  vec4 world = modelMatrix * vec4(position, 1.0);
  vec4 posed = mix(uBones[int(_bone_a + 0.5)] * world, uBones[int(_bone_b + 0.5)] * world, _weight_b);
  gl_Position = projectionMatrix * viewMatrix * posed;
}
`

export const figureSilhouetteFragment = /* glsl */ `
void main() {
  gl_FragColor = vec4(vec3(0.0), 1.0);
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
