// Off-screen passes behind the moving shadows: the swaying tree (and him, once he's up and walks into the
// moonbeam) seen from the moon, blurred into soft shadows, and the floor Monstera seen from its uplight (so
// its wall shadow sways too). Seated he's outside the beam, so the plates have no moon shadow of him to double.
import {
  Color,
  LinearFilter,
  Matrix4,
  Mesh,
  NearestFilter,
  PerspectiveCamera,
  Scene,
  ShaderMaterial,
  Vector2,
  WebGLRenderTarget,
} from 'three'
import { FullScreenQuad } from 'three/examples/jsm/postprocessing/Pass.js'
import { UP_FAR, createFigureSilhouetteMaterial, createMoonSilhouetteMaterial, createUpDepthMaterial } from './materials'
import { blurFragment, blurVertex } from './shaders/live.glsl'

const MOON_SIZE = 512
const UP_SIZE = 1024
// ~0.75° of blur: the moon disc's size seen from the rug, which sets the leaves' penumbra
const BLUR_STEP_PX = 1.6
const MOON_FOV_MARGIN = 1.15
const UP_FOV_MARGIN_DEG = 10
const WHITE = new Color(1, 1, 1)

const spotCamera = ({ position, direction }, fovDeg, near, far) => {
  const camera = new PerspectiveCamera(fovDeg, 1, near, far)
  camera.position.set(...position)
  camera.lookAt(position[0] + direction[0], position[1] + direction[1], position[2] + direction[2])
  camera.updateMatrixWorld()
  camera.updateProjectionMatrix()
  return camera
}

const viewProjection = (camera) => new Matrix4().multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse)

const target = (size, filter) =>
  new WebGLRenderTarget(size, size, { minFilter: filter, magFilter: filter, depthBuffer: filter === NearestFilter })

/** A twin of a glb mesh (shared geometry, own material) for an off-screen scene. */
const twin = (mesh, material) => {
  const copy = new Mesh(mesh.geometry, material)
  copy.matrixAutoUpdate = false
  copy.matrix.copy(mesh.matrixWorld)
  copy.frustumCulled = false
  return copy
}

const createBlur = () => {
  const material = new ShaderMaterial({
    uniforms: { uSource: { value: null }, uStep: { value: new Vector2() } },
    vertexShader: blurVertex,
    fragmentShader: blurFragment,
    depthTest: false,
    depthWrite: false,
  })
  const quad = new FullScreenQuad(material)
  return {
    run(gl, source, destination, stepX, stepY) {
      material.uniforms.uSource.value = source.texture
      material.uniforms.uStep.value.set(stepX, stepY)
      gl.setRenderTarget(destination)
      quad.render(gl)
    },
    dispose() {
      quad.dispose()
      material.dispose()
    },
  }
}

/**
 * @param {{ manifest, shared, tree?: { mesh, uniforms }, monstera?: { mesh, sway }, figure?: { meshes, rig } }} options
 */
export const createShadowRig = ({ manifest, shared, tree, monstera, figure = null }) => {
  const moonCamera = spotCamera(manifest.moon, manifest.moon.coneDeg * MOON_FOV_MARGIN, 0.5, 12)
  const upCamera = spotCamera(manifest.uplight, manifest.uplight.coneDeg + UP_FOV_MARGIN_DEG, 0.02, UP_FAR)
  const moonRaw = target(MOON_SIZE, LinearFilter)
  const moonHalf = target(MOON_SIZE, LinearFilter)
  const moonLit = target(MOON_SIZE, LinearFilter)
  const upLive = target(UP_SIZE, NearestFilter)
  const upRest = target(UP_SIZE, NearestFilter)
  const moonScene = new Scene()
  const upScene = new Scene()
  if (tree) moonScene.add(twin(tree.mesh, createMoonSilhouetteMaterial(tree.uniforms)))
  if (figure) {
    const silhouette = createFigureSilhouetteMaterial(figure.rig.matrices)
    for (const mesh of figure.meshes) moonScene.add(twin(mesh, silhouette))
  }
  const upDepth = monstera ? createUpDepthMaterial(shared, monstera.sway) : null
  if (monstera) upScene.add(twin(monstera.mesh, upDepth))
  const blur = createBlur()
  const { uniforms } = shared
  uniforms.uMoonShadow.value = moonLit.texture
  uniforms.uMoonViewProj.value = viewProjection(moonCamera)
  uniforms.uUpLive.value = upLive.texture
  uniforms.uUpRest.value = upRest.texture
  uniforms.uUpViewProj.value = viewProjection(upCamera)
  uniforms.uUpTexel.value.set(1 / UP_SIZE, 1 / UP_SIZE)

  const renderTo = (gl, destination, scene, camera) => {
    gl.setRenderTarget(destination)
    gl.setClearColor(WHITE, 1)
    gl.clear(true, true, false)
    gl.render(scene, camera)
  }

  return {
    /** The Monstera's at-rest shadow, rendered once: live minus rest is what the layer adds. */
    renderRest(gl) {
      if (!upDepth) return renderTo(gl, upRest, upScene, upCamera)
      upDepth.uniforms.uSwayScale.value = 0
      renderTo(gl, upRest, upScene, upCamera)
      upDepth.uniforms.uSwayScale.value = 1
    },
    render(gl) {
      renderTo(gl, moonRaw, moonScene, moonCamera)
      blur.run(gl, moonRaw, moonHalf, BLUR_STEP_PX / MOON_SIZE, 0)
      blur.run(gl, moonHalf, moonLit, 0, BLUR_STEP_PX / MOON_SIZE)
      renderTo(gl, upLive, upScene, upCamera)
    },
    dispose() {
      for (const rt of [moonRaw, moonHalf, moonLit, upLive, upRest]) rt.dispose()
      for (const scene of [moonScene, upScene]) scene.traverse((object) => object.material?.dispose())
      blur.dispose()
    },
  }
}
