// GLSL shared by the studio shaders. All colour work happens in display (sRGB-encoded) space;
// the canvas is `flat linear`, so what a shader writes is what the screen shows.

/**
 * World -> overscan-plate UV (v up, as three samples images). The camera never moves, so the plates
 * can't shimmer: bias toward the full-resolution mip, which keeps them as crisp as the render.
 */
export const plateChunk = /* glsl */ `
#define PLATE_LOD_BIAS -0.75
vec2 plateUv(vec4 clip) {
  return clip.xy / clip.w * 0.5 + 0.5;
}
`

/** Packed signed light layers: rect in the plate, positive/negative crops in the atlas. */
export const deltaChunk = /* glsl */ `
uniform sampler2D uDeltas;

vec3 sampleDelta(vec2 uv, vec4 rect, vec4 posRect, vec4 negRect, vec2 scale) {
  vec2 local = (uv - rect.xy) / (rect.zw - rect.xy);
  if (any(lessThan(local, vec2(0.0))) || any(greaterThan(local, vec2(1.0)))) return vec3(0.0);
  vec3 pos = texture2D(uDeltas, mix(posRect.xy, posRect.zw, local)).rgb * scale.x;
  vec3 neg = texture2D(uDeltas, mix(negRect.xy, negRect.zw, local)).rgb * scale.y;
  return pos - neg;
}

bool insideRect(vec2 uv, vec4 rect) {
  return all(greaterThanEqual(uv, rect.xy)) && all(lessThanEqual(uv, rect.zw));
}
`

/** Wind sway, identical to swayOffset() in lib/studio/wind.js. */
export const swayChunk = /* glsl */ `
uniform float uTime;
uniform float uWind;
uniform float uAmp;
uniform float uFreq;
uniform float uHeight;
uniform float uSwayScale;
uniform float uPhaseBase;
uniform float uPhaseSpread;
uniform vec3 uWindDir;
uniform vec3 uCrossDir;

float swayOffset(float sway, float phase, float amp, float freq, float t, float wind) {
  float osc = 0.65 * sin(6.2831853 * (freq * t + phase)) + 0.35 * sin(6.2831853 * (2.37 * freq * t + 1.7 * phase));
  return amp * sway * (0.55 * wind + osc * (0.2 + 0.8 * wind));
}

vec3 swayed(vec3 world, float sway, float rand) {
  float phase = uPhaseBase + uPhaseSpread * rand;
  float along = swayOffset(sway, phase, uAmp, uFreq, uTime, uWind) * uSwayScale;
  float across = swayOffset(sway, phase + 0.37, uAmp * 0.35, uFreq * 1.31, uTime, uWind) * uSwayScale;
  vec3 p = world + uWindDir * along + uCrossDir * across;
  p.y -= (along * along + across * across) / (2.0 * max(uHeight, 0.05));
  return p;
}
`

/** True when the camera sees p through the window opening (both faces of the wall). */
export const openingChunk = /* glsl */ `
uniform vec2 uOpeningX;
uniform vec4 uOpening;

bool throughOpening(vec3 p) {
  for (int i = 0; i < 2; i++) {
    float faceX = i == 0 ? uOpeningX.x : uOpeningX.y;
    float t = (faceX - cameraPosition.x) / (p.x - cameraPosition.x);
    vec3 q = cameraPosition + t * (p - cameraPosition);
    if (q.y < uOpening.x || q.y > uOpening.y || q.z < uOpening.z || q.z > uOpening.w) return false;
  }
  return true;
}
`

/** 1 where a point inside the room lies in the moonbeam that came through the window. Needs openingChunk. */
export const beamChunk = /* glsl */ `
uniform vec3 uMoonPos;
uniform vec3 uMoonDir;
uniform float uMoonCosCone;
uniform vec3 uRoomMin;
uniform vec3 uRoomMax;

float inBeam(vec3 s) {
  if (any(lessThan(s, uRoomMin)) || any(greaterThan(s, uRoomMax))) return 0.0;
  if (dot(normalize(s - uMoonPos), uMoonDir) < uMoonCosCone) return 0.0;
  float t = (uOpeningX.x - s.x) / (uMoonPos.x - s.x);
  vec3 q = s + t * (uMoonPos - s);
  return (q.y < uOpening.x || q.y > uOpening.y || q.z < uOpening.z || q.z > uOpening.w) ? 0.0 : 1.0;
}
`

/** Tree transmittance toward the moon: 1 = moonlit, 0 = under a leaf. Only inside the walls. */
export const moonShadowChunk = /* glsl */ `
uniform sampler2D uMoonShadow;
uniform mat4 uMoonViewProj;
uniform float uWallX;

float moonLit(vec3 world) {
  if (world.x < uWallX) return 1.0;
  vec4 clip = uMoonViewProj * vec4(world, 1.0);
  if (clip.w <= 0.0) return 1.0;
  vec2 uv = clip.xy / clip.w * 0.5 + 0.5;
  if (any(lessThan(uv, vec2(0.0))) || any(greaterThan(uv, vec2(1.0)))) return 1.0;
  return texture2D(uMoonShadow, uv).r;
}
`
