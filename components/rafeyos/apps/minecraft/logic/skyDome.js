// The sky: a dome around the camera, shaded from the horizon to the zenith, with the sun's disc and halo in it.
import { BackSide, Color, Mesh, ShaderMaterial, SphereGeometry, Vector3 } from 'three'
import { FOG, SKY } from './atmosphere'

const SKY_VERTEX = 'varying vec3 vDir; void main() { vDir = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }'
const SKY_FRAGMENT = `
  uniform vec3 horizon; uniform vec3 zenith; uniform vec3 sun; uniform float glow; varying vec3 vDir;
  void main() {
    vec3 dir = normalize(vDir);
    vec3 color = mix(horizon, zenith, pow(clamp(dir.y * 1.5, 0.0, 1.0), 0.75));
    float toward = max(dot(dir, sun), 0.0);
    color += vec3(1.0, 0.93, 0.78) * (pow(toward, 900.0) * 1.6 + pow(toward, 12.0) * 0.12) * glow;
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
    },
  }))
  // The dome (radius FOG.far) is now nearer than some terrain, so sorting behind by material id alone isn't enough
  sky.renderOrder = -1
  return sky
}
