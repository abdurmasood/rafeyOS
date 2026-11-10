// The sky: a dome around the camera, shaded from the horizon to the zenith, with the sun's disc and halo in it, and at
// night square stars that twinkle and a square pixel moon opposite the sun.
import { BackSide, Color, Mesh, ShaderMaterial, SphereGeometry, Vector3 } from 'three'
import { FOG, SKY } from './atmosphere'

const SKY_VERTEX = 'varying vec3 vDir; void main() { vDir = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }'
// Stars: one cell in ~260 of a 150-per-unit grid over the dome, faded in toward the zenith. The moon: a square seen
// along the moon's direction, 8 × 8 pixels with a few darker ones for its seas.
const SKY_FRAGMENT = `
  uniform vec3 horizon; uniform vec3 zenith; uniform vec3 sun; uniform float glow; varying vec3 vDir;
  uniform float night; uniform vec3 moon; uniform float time;
  void main() {
    vec3 dir = normalize(vDir);
    vec3 color = mix(horizon, zenith, pow(clamp(dir.y * 1.5, 0.0, 1.0), 0.75));
    float toward = max(dot(dir, sun), 0.0);
    color += vec3(1.0, 0.93, 0.78) * (pow(toward, 900.0) * 1.6 + pow(toward, 12.0) * 0.12) * glow;
    if (night > 0.0) {
      vec3 cell = floor(dir * 150.0);
      float seed = fract(sin(dot(cell, vec3(12.9898, 78.233, 37.719))) * 43758.5453);
      float twinkle = 0.65 + 0.35 * sin(time * (1.5 + seed * 3.0) + seed * 80.0);
      float star = step(0.9962, seed) * smoothstep(0.0, 0.22, dir.y) * night * twinkle;
      color += vec3(0.85, 0.9, 1.0) * star * (0.55 + 0.45 * fract(seed * 97.0));
      vec3 across = normalize(cross(moon, vec3(0.0, 1.0, 0.0)));
      vec3 up = cross(across, moon);
      float facing = dot(dir, moon);
      vec2 onMoon = vec2(dot(dir, across), dot(dir, up)) / max(facing, 0.001);
      if (facing > 0.0 && abs(onMoon.x) < 0.045 && abs(onMoon.y) < 0.045) {
        vec2 pixel = floor((onMoon + 0.045) / 0.09 * 8.0);
        float sea = step(0.72, fract(sin(dot(pixel, vec2(31.7, 11.3))) * 9182.3));
        color = mix(color, mix(vec3(0.93, 0.94, 0.88), vec3(0.74, 0.76, 0.74), sea), night);
      }
      color += vec3(0.55, 0.62, 0.8) * pow(max(facing, 0.0), 60.0) * 0.18 * night;
    }
    gl_FragColor = vec4(color, 1.0);
    #include <colorspace_fragment>
  }`

/** The dome, kept on the camera by the engine. Radius FOG.far: inside the far plane, or it would be clipped away. */
export const createSkyDome = () => {
  const sky = new Mesh(new SphereGeometry(FOG.far, 32, 16), new ShaderMaterial({
    side: BackSide, depthWrite: false, fog: false, vertexShader: SKY_VERTEX, fragmentShader: SKY_FRAGMENT,
    // Their own Colors: setAtmosphereAt rewrites these in place, and view.horizon is also the fog's dry-air colour
    uniforms: {
      horizon: { value: new Color(SKY.horizon) }, zenith: { value: new Color(SKY.zenith) },
      sun: { value: new Vector3(0.45, 0.55, -0.7).normalize() }, glow: { value: 1 },
      night: { value: 0 }, moon: { value: new Vector3(0, -1, 0) }, time: { value: 0 },
    },
  }))
  // The dome (radius FOG.far) is now nearer than some terrain, so sorting behind by material id alone isn't enough
  sky.renderOrder = -1
  return sky
}
