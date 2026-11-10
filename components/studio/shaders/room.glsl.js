// The static room. Proxies show the projected Cycles plate, and each light layer is added back
// with a live gain, so at rest (every gain 1, nothing moved) the pixels equal the render:
//   D = base − (1 − T_tree)·ΔMoon + (k_beam − 1)·ΔHaze + (g_candle − 1)·ΔCandle + (V_live − V_rest)·ΔUp
//       + gone·ΔFigure + up·ΔBody + taken·ΔGuitar + asleep·ΔScreen + pressed[key]·ΔKeys(key)
import { beamChunk, deltaChunk, moonShadowChunk, openingChunk, plateChunk } from './common.glsl'

export const roomVertex = /* glsl */ `
uniform mat4 uPlateViewProj;
varying vec4 vPlateClip;
varying vec3 vWorld;

void main() {
  vec4 world = modelMatrix * vec4(position, 1.0);
  vWorld = world.xyz;
  vPlateClip = uPlateViewProj * world;
  gl_Position = projectionMatrix * viewMatrix * world;
}
`

const layerUniforms = (name) => /* glsl */ `
uniform vec4 u${name}Rect;
uniform vec4 u${name}Plus;
uniform vec4 u${name}Minus;
uniform vec2 u${name}Scale;
`

const layer = (name) => `uv, u${name}Rect, u${name}Plus, u${name}Minus, u${name}Scale`

export const roomFragment = /* glsl */ `
#include <packing>
uniform sampler2D uBase;
uniform float uCandleGain;
uniform sampler2D uUpLive;
uniform sampler2D uUpRest;
uniform mat4 uUpViewProj;
uniform vec3 uUpPos;
uniform float uUpFar;
uniform vec2 uUpTexel;
varying vec4 vPlateClip;
varying vec3 vWorld;
${plateChunk}
${deltaChunk}
${openingChunk}
${beamChunk}
${moonShadowChunk}
${layerUniforms('Moon')}
${layerUniforms('Haze')}
${layerUniforms('Candle')}
${layerUniforms('Up')}

// How much of the lit haze along this view ray the swaying leaves leave lit (1 = as rendered).
// Evenly spaced samples, no per-pixel jitter: jitter left a visible screen-door grain in the beam.
float hazeGain(vec3 world) {
#if HAZE_STEPS > 0
  vec3 dir = world - cameraPosition;
  vec3 inv = 1.0 / dir;
  vec3 t0 = (uRoomMin - cameraPosition) * inv;
  vec3 t1 = (uRoomMax - cameraPosition) * inv;
  vec3 tLow = min(t0, t1);
  vec3 tHigh = max(t0, t1);
  float enter = max(max(max(tLow.x, tLow.y), tLow.z), 0.0);
  float leave = min(min(min(tHigh.x, tHigh.y), tHigh.z), 1.0);
  if (leave <= enter) return 1.0;
  float weight = 0.0;
  float lit = 0.0;
  for (int i = 0; i < HAZE_STEPS; i++) {
    vec3 s = cameraPosition + dir * mix(enter, leave, (float(i) + 0.5) / float(HAZE_STEPS));
    float w = inBeam(s);
    weight += w;
    lit += w * moonLit(s);
  }
  return weight > 0.0 ? lit / weight : 1.0;
#else
  return 1.0;
#endif
}

// Share of the uplight reaching a point past the floor Monstera's leaves (3x3 PCF)
float upVisible(sampler2D depthMap, vec3 world) {
  vec4 clip = uUpViewProj * vec4(world, 1.0);
  if (clip.w <= 0.0) return 1.0;
  vec2 uv = clip.xy / clip.w * 0.5 + 0.5;
  if (any(lessThan(uv, vec2(0.0))) || any(greaterThan(uv, vec2(1.0)))) return 1.0;
  float depth = length(world - uUpPos) / uUpFar - 0.004;
  float lit = 0.0;
  for (int x = -1; x <= 1; x++) {
    for (int y = -1; y <= 1; y++) {
      lit += step(depth, unpackRGBAToDepth(texture2D(depthMap, uv + vec2(x, y) * uUpTexel)));
    }
  }
  return lit / 9.0;
}

// him rolled away from the desk, him up out of the chair, the guitar off its hook, and the monitor asleep
uniform float uFigureGone;
uniform float uBodyGone;
uniform float uGuitarGone;
uniform float uScreenOff;
${layerUniforms('Figure')}
${layerUniforms('Body')}
${layerUniforms('Guitar')}
${layerUniforms('Screen')}

// Synth A's keys, each as far down as his fingers press it: the key map says which key a pixel shows,
// and which of the three pressed renders has that key held down
uniform sampler2D uKeyMap;
uniform vec4 uKeyRect;
uniform float uKeyPress[64];
${layerUniforms('KeysA')}
${layerUniforms('KeysB')}
${layerUniforms('KeysBlack')}

vec3 keyPressed(vec2 uv) {
  vec3 key = texture2D(uKeyMap, (uv - uKeyRect.xy) / (uKeyRect.zw - uKeyRect.xy)).rgb;
  int number = int(key.r * 255.0 + 0.5) - 1;
  if (number < 0) return vec3(0.0);
  float pressed = uKeyPress[number];
  if (pressed <= 0.0) return vec3(0.0);
  int group = int(key.g * 255.0 + 0.5);
  if (group == 0) return pressed * sampleDelta(${layer('KeysA')});
  if (group == 1) return pressed * sampleDelta(${layer('KeysB')});
  return pressed * sampleDelta(${layer('KeysBlack')});
}

void main() {
  vec2 uv = plateUv(vPlateClip);
  vec3 colour = texture2D(uBase, uv, PLATE_LOD_BIAS).rgb;
#ifdef HAS_MOON
  if (insideRect(uv, uMoonRect)) colour -= (1.0 - moonLit(vWorld)) * sampleDelta(${layer('Moon')});
#endif
#ifdef HAS_HAZE
  if (insideRect(uv, uHazeRect)) colour += (hazeGain(vWorld) - 1.0) * sampleDelta(${layer('Haze')});
#endif
#ifdef HAS_CANDLE
  colour += (uCandleGain - 1.0) * sampleDelta(${layer('Candle')});
#endif
#ifdef HAS_UPLIGHT
  if (insideRect(uv, uUpRect)) colour += (upVisible(uUpLive, vWorld) - upVisible(uUpRest, vWorld)) * sampleDelta(${layer('Up')});
#endif
#ifdef HAS_FIGURE
  if (uFigureGone > 0.0 && insideRect(uv, uFigureRect)) colour += uFigureGone * sampleDelta(${layer('Figure')});
#endif
#ifdef HAS_BODY
  if (uBodyGone > 0.0 && insideRect(uv, uBodyRect)) colour += uBodyGone * sampleDelta(${layer('Body')});
#endif
#ifdef HAS_GUITAR
  if (uGuitarGone > 0.0 && insideRect(uv, uGuitarRect)) colour += uGuitarGone * sampleDelta(${layer('Guitar')});
#endif
#ifdef HAS_SCREEN
  if (uScreenOff > 0.0 && insideRect(uv, uScreenRect)) colour += uScreenOff * sampleDelta(${layer('Screen')});
#endif
#ifdef HAS_KEYS
  if (insideRect(uv, uKeyRect)) colour += keyPressed(uv);
#endif
  gl_FragColor = vec4(clamp(colour, 0.0, 1.0), 1.0);
}
`
