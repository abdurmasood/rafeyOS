// The view pass: one ray per character cell, traced backward from the eye. It writes how bright that cell is into
// the red channel; print.glsl.js turns the brightness into a character.
// Units: the hole's radius is 1 and the speed of light is 1.

/** Both passes draw one shape that covers the screen, so the vertex shader only hands on where on it a pixel is. */
export const quadVertex = /* glsl */ `
varying vec2 vUv;

void main() {
  vUv = uv;
  gl_Position = vec4(position.xy, 0.0, 1.0);
}
`

export const viewFragment = /* glsl */ `
uniform vec3 uEye, uForward, uRight, uUp;
uniform float uHalfAngle, uDiscTime, uAspect, uOutwardSpeed, uGamma;
varying vec2 vUv;

float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }

float noise(vec2 p) {
  vec2 i = floor(p), f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), f.x), mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), f.x), f.y);
}

void main() {
  vec2 p = (vUv - 0.5) * vec2(uAspect, 1.0) * 2.0;
  // The centre of the screen looks straight at the hole. Distance from the centre is angle away from it, out to
  // uHalfAngle at the top edge.
  float rho = length(p), th = rho * uHalfAngle;
  if (th > 3.14159) { gl_FragColor = vec4(0.0, 0.0, 0.0, 1.0); return; }
  vec3 dir = uForward * cos(th) + (uRight * p.x + uUp * p.y) / max(rho, 1e-5) * sin(th);
  float r0 = length(uEye);
  vec3 out0 = uEye / r0;
  float fall = sqrt(1.0 / r0), lum = 0.0, escaped = 0.0;
  // The light reaching you from this direction travels the other way. Take its direction in your frame...
  float mine = -dot(dir, out0);
  vec3 across = dir + out0 * mine;
  float al = length(across);
  across = al > 1e-5 ? across / al : vec3(0.0);
  // ...and turn it into the frame of something falling freely from far away, which exists on both sides of the edge.
  // uOutwardSpeed is how fast you are moving outward relative to that falling frame. Hovering means it equals the
  // falling speed.
  float nr = (mine + uOutwardSpeed) / (1.0 + uOutwardSpeed * mine), nt = sqrt(max(0.0, 1.0 - nr * nr)), den = 1.0 - nr * fall;
  if (den > 1e-4) {
    float om = 1.0 / den, b = r0 * nt * om, radial = (1.0 - fall * fall) * nr * om - fall;
    float seen = uGamma * om * (1.0 - uOutwardSpeed * nr);
    vec3 pos = uEye, vel = normalize(out0 * (-radial) + across * (b / r0));
    // Light around a non-spinning hole follows u'' + u = 1.5 u^2. This pull, with h fixed, traces exactly that curve.
    vec3 hv = cross(pos, vel);
    float h2 = dot(hv, hv), far = (r0 + 14.0) * (r0 + 14.0);
    for (int i = 0; i < 280; i++) {
      float r2 = dot(pos, pos);
      // Inside the edge and still heading inward: this light never came from outside.
      if ((r2 < 1.0 && dot(pos, vel) < 0.0) || r2 < 0.0004) break;
      if (r2 > far && dot(pos, vel) > 0.0) { escaped = 1.0; break; }
      float dt = clamp(0.05 * sqrt(r2), 0.003, 2.0);
      vel += -1.5 * h2 * pos / pow(r2, 2.5) * dt;
      vec3 np = pos + vel * dt;
      if (pos.y * np.y < 0.0) {
        vec3 c = mix(pos, np, pos.y / (pos.y - np.y));
        float r = length(c.xz);
        // The disc: opaque, from the innermost stable orbit at 3 out to 13.
        if (r > 3.0 && r < 13.0) {
          float phi = atan(c.z, c.x);
          vec3 outw = c / r, fwd = vec3(-sin(phi), 0.0, cos(phi));
          // The gas orbits at speed beta. The light left it heading back along our ray, measured in the gas's own
          // stretched space.
          float beta = sqrt(0.5 / (r - 1.0));
          vec3 v = normalize(vel);
          float vr = dot(v, outw);
          vec3 local = normalize((v - outw * vr) + outw * vr / sqrt(1.0 - 1.0 / r));
          float doppler = sqrt(1.0 - beta * beta) / (1.0 - beta * dot(fwd, -local));
          float g = doppler * sqrt(1.0 - 1.0 / r) * seen;
          float flux = (1.0 - sqrt(3.0 / r)) / (r * r * r) * 480.0;
          float a = phi - uDiscTime * sqrt(0.5 / (r * r * r));
          float tex = 0.78 + 0.22 * noise(vec2(cos(a), sin(a)) * r * 1.1);
          lum = pow(clamp(flux * g * g * g * tex, 0.0, 6.0), 0.42) * 0.62 * smoothstep(13.0, 11.0, r);
          break;
        }
      }
      pos = np;
    }
    if (escaped > 0.5) {
      vec3 d = normalize(vel);
      float s = hash(floor(d.xy * 120.0) + floor(d.z * 120.0));
      lum = step(0.9968, s) * (0.35 + 0.65 * step(0.9992, s));
    }
  }
  gl_FragColor = vec4(clamp(lum, 0.0, 1.0), 0.0, 0.0, 1.0);
}
`
