// The Minecraft world on screen: the three.js scene (sky, fog, chunk meshes, the outline on the aimed-at block), the
// frame loop, and the window it lives in. The renderer and frame scheduler are injected, so tests run it without WebGL.
import {
  BackSide, BoxGeometry, BufferAttribute, BufferGeometry, Color, DataTexture, EdgesGeometry, Fog, LineBasicMaterial,
  LineSegments, Mesh, MeshBasicMaterial, NearestFilter, NearestMipmapLinearFilter, PerspectiveCamera, RGBAFormat,
  RepeatWrapping, SRGBColorSpace, Scene, ShaderChunk, ShaderMaterial, Sphere, SphereGeometry, Vector3, WebGLRenderer,
} from 'three'
import { BLOCK, HOTBAR, TILE, isSolid } from './blockTypes'
import { ATLAS, flipRows, paintAtlas, tilePixels } from './texturePixels'
import { mipChain } from './mipmaps'
import { WORLD, inBounds } from './terrain'
import { chunksTouching, createWorld } from './world'
import { meshChunk } from './mesher'
import { createPlayer, eyePosition, liftClear, lookDirection, overlapsBlock, stepPlayer, turn } from './physics'
import { castRay } from './raycast'
import { createMinecraftInput } from './minecraftInput'
import { IDLE_DIRECTOR, applyShot, startPlaying } from './directorShot'

const SKY = Object.freeze({ horizon: '#cfe2f0', zenith: '#5f9ddc', underwater: '#2a5f9e' })
const FOG = Object.freeze({ near: 55, far: 175, underwaterNear: 1, underwaterFar: 18 })
// Fog and the far plane both measure view-space depth, so ending the view just past full fog cuts off nothing visible
const CAMERA_FAR = FOG.far + 8
const FALL_LIMIT = -20
const HUD_INTERVAL = 100
// Longest frame the physics will take in one go, so a stall can't fling the player through the world
const MAX_FRAME = 0.05
const COMPASS = Object.freeze(['N', 'W', 'S', 'E'])

const SKY_VERTEX = 'varying vec3 vDir; void main() { vDir = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }'
const SKY_FRAGMENT = `
  uniform vec3 horizon; uniform vec3 zenith; uniform vec3 sun; varying vec3 vDir;
  void main() {
    vec3 dir = normalize(vDir);
    vec3 color = mix(horizon, zenith, pow(clamp(dir.y * 1.5, 0.0, 1.0), 0.75));
    float toward = max(dot(dir, sun), 0.0);
    color += vec3(1.0, 0.93, 0.78) * (pow(toward, 900.0) * 1.6 + pow(toward, 12.0) * 0.12);
    gl_FragColor = vec4(color, 1.0);
    #include <colorspace_fragment>
  }`

const defaultRenderer = (canvas) => new WebGLRenderer({ canvas, antialias: true })

// With antialias on, a sliver of a face that covers a sample but not the pixel's centre is still shaded at the centre,
// off the face, so its varyings are extrapolated. The corner-shading vertex colour can come out negative there, the
// sRGB encode turns that into NaN, and NaN survives even full fog: black specks in the far fog. The fog depth drifts
// off the same way. Centroid sampling keeps both on the face.
const CENTROID_VARYING = /varying (\w+) (vColor|vFogDepth);/g

/** A built-in material's compile hook: reads its vertex colour and fog depth at the centroid (see CENTROID_VARYING). */
const sampleAtCentroid = (shader) => {
  for (const stage of ['vertexShader', 'fragmentShader']) {
    shader[stage] = shader[stage]
      // The declarations sit in these chunks, which three inlines only after this hook
      .replace(/#include <((?:color|fog)_pars_(?:vertex|fragment))>/g, (include, name) => ShaderChunk[name])
      .replace(CENTROID_VARYING, 'centroid varying $1 $2;')
  }
}

/**
 * A square pixel-art texture with its own mip chain, so distant blocks show their tile's average instead of
 * shimmering, while close ones stay crisp.
 * @param {Uint8ClampedArray} flipped - RGBA rows bottom first, as the GPU reads them
 * @param {number} size
 * @param {number} minSize - the smallest mip level
 */
const createPixelTexture = (flipped, size, minSize) => {
  const pixels = new Uint8Array(flipped.buffer)
  const texture = new DataTexture(pixels, size, size, RGBAFormat)
  // three.js uploads exactly these levels (level 0 included) and nothing smaller
  texture.mipmaps = mipChain(pixels, size, minSize)
  texture.generateMipmaps = false
  texture.minFilter = NearestMipmapLinearFilter
  texture.magFilter = NearestFilter
  texture.colorSpace = SRGBColorSpace
  texture.needsUpdate = true
  return texture
}

/** The block atlas, and the water tile on its own so merged water surfaces can repeat it. */
const createTextures = () => {
  const atlas = paintAtlas()
  // Down to one pixel per tile: any smaller and neighbouring tiles would blend
  const blocks = createPixelTexture(flipRows(atlas, ATLAS.SIZE), ATLAS.SIZE, ATLAS.COLS)
  const water = createPixelTexture(flipRows(tilePixels(atlas, TILE.WATER), ATLAS.TILE), ATLAS.TILE, 1)
  water.wrapS = RepeatWrapping
  water.wrapT = RepeatWrapping
  return { blocks, water }
}

/** Scene, camera, sky dome, fog, the two block materials and the aim outline. */
const createView = () => {
  const horizon = new Color(SKY.horizon)
  const scene = new Scene()
  scene.fog = new Fog(horizon.clone(), FOG.near, FOG.far)
  const camera = new PerspectiveCamera(72, 1, 0.05, CAMERA_FAR)
  camera.rotation.order = 'YXZ'
  // Inside the far plane, or the dome itself would be clipped away
  const sky = new Mesh(new SphereGeometry(FOG.far, 32, 16), new ShaderMaterial({
    side: BackSide, depthWrite: false, fog: false, vertexShader: SKY_VERTEX, fragmentShader: SKY_FRAGMENT,
    uniforms: { horizon: { value: horizon }, zenith: { value: new Color(SKY.zenith) }, sun: { value: new Vector3(0.45, 0.55, -0.7).normalize() } },
  }))
  // The dome (radius FOG.far) is now nearer than some terrain, so sorting behind by material id alone isn't enough
  sky.renderOrder = -1
  const textures = createTextures()
  const materials = {
    solid: new MeshBasicMaterial({ map: textures.blocks, vertexColors: true }),
    water: new MeshBasicMaterial({ map: textures.water, vertexColors: true, transparent: true, opacity: 0.74, depthWrite: false }),
  }
  materials.solid.onBeforeCompile = sampleAtCentroid
  const box = new BoxGeometry(1.004, 1.004, 1.004)
  const outline = new LineSegments(new EdgesGeometry(box), new LineBasicMaterial({ color: 0x111111, transparent: true, opacity: 0.65 }))
  box.dispose()
  outline.visible = false
  scene.add(sky, outline)
  const dispose = () => {
    for (const object of [sky, outline]) {
      object.geometry.dispose()
      object.material.dispose()
    }
    materials.solid.dispose()
    materials.water.dispose()
    textures.blocks.dispose()
    textures.water.dispose()
  }
  return { scene, camera, sky, outline, materials, horizon, underwater: new Color(SKY.underwater), dispose }
}

// A 512² world's chunk arrays would otherwise sit in memory twice, once here and once on the GPU. Dropping ours after
// upload is safe: the engine never reads geometry back, aiming walks the voxels (raycast.js), and the bounds are set
// before upload. A lost WebGL context can't re-send them, so a restored one rebuilds the chunks instead.
function freeArray() {
  this.array = null
}

/** @param {import('./mesher').MeshArrays} arrays */
const toGeometry = ({ positions, uvs, colors, indices, bounds }) => {
  const geometry = new BufferGeometry()
  geometry.setAttribute('position', new BufferAttribute(positions, 3).onUpload(freeArray))
  geometry.setAttribute('uv', new BufferAttribute(uvs, 2).onUpload(freeArray))
  geometry.setAttribute('color', new BufferAttribute(colors, 3).onUpload(freeArray))
  geometry.setIndex(new BufferAttribute(indices, 1).onUpload(freeArray))
  geometry.boundingSphere = new Sphere(new Vector3(...bounds.center), bounds.radius)
  return geometry
}

// three uploads a mesh, and so frees our copy of its arrays (see toGeometry), only once it draws it, and it never draws
// chunks behind the player or past the fog: their arrays would stay in memory all session. So every new mesh is drawn
// once early, this many a frame, with culling off for just that draw.
export const WARM_BATCH = 64

/** Has three draw `mesh` on the next render wherever it is, then cull it as usual again. */
const drawOnceAnywhere = (mesh) => {
  mesh.frustumCulled = false
  mesh.onAfterRender = () => {
    mesh.frustumCulled = true
    // Back to Object3D's own no-op
    delete mesh.onAfterRender
  }
}

/**
 * One solid and one water mesh per chunk (none where a chunk has no faces). The first ones come prebuilt by the world
 * loader; a chunk is meshed again here when a block near it changes or the WebGL context comes back. `warm`, once a
 * frame, gets each new mesh drawn once (see WARM_BATCH).
 * @param {Map<string, { solid: import('./mesher').MeshArrays, water: import('./mesher').MeshArrays }>} chunkArrays -
 *   keyed "cx,cz", and emptied once used: the loader's settled promise still holds this map, and a full one would
 *   keep every chunk's arrays alive after upload (see toGeometry)
 */
const createChunks = (scene, world, materials, chunkArrays) => {
  const meshes = new Map()
  // Meshes not drawn yet, oldest first
  const cold = new Set()
  const drop = (key) => {
    for (const mesh of meshes.get(key) ?? []) {
      scene.remove(mesh)
      mesh.geometry.dispose()
      cold.delete(mesh)
    }
    meshes.delete(key)
  }
  const place = (key, arrays) => {
    drop(key)
    const built = []
    if (arrays.solid.indices.length) built.push(new Mesh(toGeometry(arrays.solid), materials.solid))
    if (arrays.water.indices.length) {
      const water = new Mesh(toGeometry(arrays.water), materials.water)
      water.renderOrder = 1
      built.push(water)
    }
    if (built.length) scene.add(...built)
    built.forEach((mesh) => cold.add(mesh))
    meshes.set(key, built)
  }
  const warm = () => {
    let count = 0
    for (const mesh of cold) {
      if (count++ === WARM_BATCH) return
      cold.delete(mesh)
      drawOnceAnywhere(mesh)
    }
  }
  const rebuild = (cx, cz) => place(`${cx},${cz}`, meshChunk(world, cx, cz))
  const perSide = WORLD.SIZE / WORLD.CHUNK
  const rebuildAll = () => {
    for (let cz = 0; cz < perSide; cz++) for (let cx = 0; cx < perSide; cx++) rebuild(cx, cz)
  }
  for (const [key, arrays] of chunkArrays) place(key, arrays)
  chunkArrays.clear()
  return { rebuild, rebuildAll, warm, dispose: () => [...meshes.keys()].forEach(drop) }
}

/** Breaking and placing at whatever the crosshair points at. */
const createEditor = ({ world, player, chunks, getTarget, getSelected, onEdit }) => {
  const change = (x, y, z, block) => {
    const edit = world.set(x, y, z, block)
    if (!edit) return
    chunksTouching(x, z).forEach(([cx, cz]) => chunks.rebuild(cx, cz))
    onEdit(edit)
  }
  return {
    breakBlock: () => {
      const target = getTarget()
      if (target) change(target.x, target.y, target.z, BLOCK.AIR)
    },
    placeBlock: () => {
      const target = getTarget()
      if (!target) return
      const [x, y, z] = [target.x + target.normal[0], target.y + target.normal[1], target.z + target.normal[2]]
      if (!inBounds(x, y, z) || isSolid(world.get(x, y, z)) || overlapsBlock(player, x, y, z)) return
      change(x, y, z, HOTBAR[getSelected()].block)
    },
  }
}

const positionText = ({ pos, yaw }) => {
  const heading = COMPASS[((Math.round(yaw / (Math.PI / 2)) % 4) + 4) % 4]
  return `x ${pos.x.toFixed(1)} · y ${pos.y.toFixed(1)} · z ${pos.z.toFixed(1)} · ${heading}`
}

/** Sets the fog for a camera at `eye`: thick and blue inside water, the horizon's haze anywhere else. */
const setFogAt = (view, world, eye) => {
  const { fog } = view.scene
  const underwater = world.get(Math.floor(eye.x), Math.floor(eye.y), Math.floor(eye.z)) === BLOCK.WATER
  fog.color.copy(underwater ? view.underwater : view.horizon)
  fog.near = underwater ? FOG.underwaterNear : FOG.near
  fog.far = underwater ? FOG.underwaterFar : FOG.far
}

/** Points the camera from the player's eyes, finds the aimed-at block, and tints the fog blue under water. */
const updateView = (view, world, player) => {
  const { camera, sky, outline } = view
  const eye = eyePosition(player)
  camera.position.set(eye.x, eye.y, eye.z)
  camera.rotation.set(player.pitch, player.yaw, 0)
  camera.updateMatrixWorld()
  sky.position.copy(camera.position)
  const target = castRay(world, eye, lookDirection(player))
  outline.visible = Boolean(target)
  if (target) outline.position.set(target.x + 0.5, target.y + 0.5, target.z + 0.5)
  setFogAt(view, world, eye)
  return target
}

/** Keeps the drawing buffer the size of the window's content area. */
const watchSize = ({ host, win, renderer, camera }) => {
  const resize = () => {
    const width = host.clientWidth, height = host.clientHeight
    if (!width || !height) return
    renderer.setSize(width, height, false)
    camera.aspect = width / height
    camera.updateProjectionMatrix()
  }
  resize()
  if (typeof win.ResizeObserver === 'function') {
    const observer = new win.ResizeObserver(resize)
    observer.observe(host)
    return () => observer.disconnect()
  }
  win.addEventListener('resize', resize)
  return () => win.removeEventListener('resize', resize)
}

/**
 * Meshes every chunk again when a lost WebGL context comes back: the GPU copies went with the old context, and ours
 * were freed after upload (see toGeometry).
 */
const watchContextRestore = (canvas, chunks) => {
  const restore = () => chunks.rebuildAll()
  canvas.addEventListener('webglcontextrestored', restore)
  return () => canvas.removeEventListener('webglcontextrestored', restore)
}

/** Draws one frame, warming the next batch of never-drawn chunks first (see WARM_BATCH). */
const drawFrame = ({ renderer, view, chunks }) => {
  chunks.warm()
  renderer.setClearColor(view.scene.fog.color)
  renderer.render(view.scene, view.camera)
}

/** HUD state, sent whole to `onHud` on every change; the position at most every HUD_INTERVAL ms. */
const createHud = (onHud, player) => {
  const hud = { playing: false, selected: 0, position: positionText(player) }
  let positionAt = -Infinity
  const emit = (patch) => {
    Object.assign(hud, patch)
    onHud({ ...hud })
  }
  return {
    emit,
    selected: () => hud.selected,
    select: (slot) => {
      const next = ((slot % HOTBAR.length) + HOTBAR.length) % HOTBAR.length
      if (next !== hud.selected) emit({ selected: next })
    },
    /** @param {number} time */
    track: (time) => {
      if (time - positionAt < HUD_INTERVAL) return
      positionAt = time
      const position = positionText(player)
      if (position !== hud.position) emit({ position })
    },
  }
}

/** The browser can't make a WebGL context; the scene shows its "can't start" card for this and only this. */
export class WebGLUnavailableError extends Error {
  /** @param {unknown} cause */
  constructor(cause) {
    super('WebGL is unavailable', { cause })
    this.name = 'WebGLUnavailableError'
  }
}

/** Creates the canvas in `host` and a renderer on it; the canvas goes again if the browser has no WebGL. */
const mountRenderer = ({ host, doc, win, createRenderer }) => {
  const canvas = doc.createElement('canvas')
  canvas.className = 'bk-canvas'
  host.append(canvas)
  try {
    const renderer = createRenderer(canvas)
    renderer.setPixelRatio(Math.min(win.devicePixelRatio || 1, 2))
    return { canvas, renderer }
  } catch (error) {
    canvas.remove()
    throw new WebGLUnavailableError(error)
  }
}

/**
 * Starts the world in `host`, which it fills with its own canvas.
 * @param {{
 *   host: HTMLElement, island: import('./terrain').Island,
 *   chunkArrays: Map<string, { solid: import('./mesher').MeshArrays, water: import('./mesher').MeshArrays }>,
 *   edits?: ReadonlyArray<[number, number]>,
 *   onHud?: (hud: { playing: boolean, selected: number, position: string }) => void,
 *   onEdit?: (change: [number, number | null]) => void,
 *   createRenderer?: (canvas: HTMLCanvasElement) => object,
 *   requestFrame?: (run: (time: number) => void) => number, cancelFrame?: (id: number) => void,
 *   now?: () => number, doc?: Document, win?: Window,
 *   director?: { frame: (view: { dt: number, eye: { x: number, y: number, z: number }, yaw: number, pitch: number }) =>
 *     null | { camera?: { x: number, y: number, z: number, yaw: number, pitch: number }, fogLift?: number },
 *     toPlayer: (onArrive: () => void) => void, toOrbit: () => void },
 * }} options - `island` and `chunkArrays` come from the world loader (worldLoader.js), the chunks meshed with the
 *   same `edits`. The voxels are copied into a world of the engine's own: physics, aiming and edits read them here.
 *   `chunkArrays` is consumed: the engine empties the map once its first meshes are built, so don't reuse it.
 * @returns {{ setActive: (active: boolean) => void, setPaused: (paused: boolean) => void, capture: () => void, play: (onArrive: () => void) => void, toTitle: () => void, dispose: () => void }}
 * @throws {WebGLUnavailableError} when the browser can't make a WebGL context; anything else thrown while building
 *   comes after the canvas and renderer went again, so nothing is left behind
 */
export const createMinecraftEngine = (options) => {
  const { host, createRenderer = defaultRenderer, doc = host.ownerDocument, win = doc.defaultView } = options
  const { canvas, renderer } = mountRenderer({ host, doc, win, createRenderer })
  // What's been built so far, so a throw part-way can undo it; the last made goes first
  const releases = [() => {
    renderer.dispose()
    renderer.forceContextLoss?.()
    canvas.remove()
  }]
  const release = () => {
    // Emptied as it goes, so disposing twice does nothing the second time
    while (releases.length) releases.pop()()
  }
  try {
    return assembleEngine({ ...options, doc, win, canvas, renderer }, releases, release)
  } catch (error) {
    release()
    throw error
  }
}

/** Everything after the renderer: world, view, chunks, input and the loop. Each thing made adds its undo to `releases`. */
const assembleEngine = ({
  host, island, chunkArrays, edits = [], onHud = () => {}, onEdit = () => {}, canvas, renderer,
  requestFrame = (run) => requestAnimationFrame(run), cancelFrame = (id) => cancelAnimationFrame(id),
  now = () => performance.now(), doc, win, director = IDLE_DIRECTOR,
}, releases, release) => {
  const world = createWorld(island, edits)
  const player = liftClear(createPlayer(island.spawn), world)
  const view = createView()
  releases.push(view.dispose)
  const chunks = createChunks(view.scene, world, view.materials, chunkArrays)
  releases.push(chunks.dispose)
  const shotFog = { clear: FOG, setAt: (eye) => setFogAt(view, world, eye) }
  const hud = createHud(onHud, player)
  let target = null
  const editor = createEditor({ world, player, chunks, getTarget: () => target, getSelected: hud.selected, onEdit })
  const input = createMinecraftInput({ canvas, doc, win, now, on: {
    turn: (dx, dy) => turn(player, dx, dy),
    breakBlock: editor.breakBlock,
    placeBlock: editor.placeBlock,
    select: hud.select,
    scroll: (step) => hud.select(hud.selected() + step),
    playingChanged: (playing) => hud.emit({ playing }),
  } })
  releases.push(input.dispose)
  releases.push(...[watchSize({ host, win, renderer, camera: view.camera }), watchContextRestore(canvas, chunks)])
  const loop = createLoop({ requestFrame, cancelFrame, now, step: (time, dt) => {
    stepPlayer(player, world, input.moveInput(), dt)
    if (player.pos.y < FALL_LIMIT) Object.assign(player, liftClear(createPlayer(island.spawn), world))
    input.tick(time)
    target = updateView(view, world, player)
    const shot = director.frame({ dt, eye: eyePosition(player), yaw: player.yaw, pitch: player.pitch })
    if (shot) applyShot(view, shot, shotFog)
    drawFrame({ renderer, view, chunks })
    hud.track(time)
  } })
  releases.push(loop.stop)
  hud.emit({})
  loop.start()

  return Object.freeze({
    setActive: (active) => input.setActive(active),
    setPaused: (paused) => (paused ? loop.stop() : loop.start()),
    capture: () => input.capture(),
    play: (onArrive) => startPlaying({ input, director }, onArrive),
    toTitle: () => director.toOrbit(),
    dispose: release,
  })
}

/**
 * The frame loop: `step(time, dt)` once per frame. Stopping cancels the next frame; starting again resets the clock,
 * so coming back from a minimized window isn't one giant frame.
 */
const createLoop = ({ requestFrame, cancelFrame, now, step }) => {
  let frameId = null
  let last = 0
  const frame = (time) => {
    frameId = null
    const dt = Math.min(MAX_FRAME, Math.max(0, (time - last) / 1000))
    last = time
    step(time, dt)
    frameId = requestFrame(frame)
  }
  return {
    start: () => {
      if (frameId !== null) return
      last = now()
      frameId = requestFrame(frame)
    },
    stop: () => {
      if (frameId === null) return
      cancelFrame(frameId)
      frameId = null
    },
  }
}
