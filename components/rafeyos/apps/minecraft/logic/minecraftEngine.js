// The Minecraft world on screen: the three.js scene (sky, fog, chunk meshes, the outline on the aimed-at block), the
// frame loop, and the window it lives in. The renderer and frame scheduler are injected, so tests run it without WebGL.
import {
  BoxGeometry, BufferAttribute, BufferGeometry, Color, DataTexture, EdgesGeometry, Fog, LineBasicMaterial,
  LineSegments, Mesh, MeshBasicMaterial, NearestFilter, NearestMipmapLinearFilter, PerspectiveCamera, RGBAFormat,
  RepeatWrapping, SRGBColorSpace, Scene, ShaderChunk, Sphere, Vector3, WebGLRenderer,
} from 'three'
import { BLOCK, HOTBAR, TILE, isSolid } from './blockTypes'
import { ATLAS, flipRows, paintAtlas, tilePixels } from './texturePixels'
import { mipChain } from './mipmaps'
import { WORLD, inBounds } from './terrain'
import { chunksTouching, createWorld } from './world'
import { meshChunk } from './mesher'
import { createPlayer, eyePosition, isSwimming, liftClear, lookDirection, overlapsBlock, stepPlayer, turn } from './physics'
import { castRay } from './raycast'
import { createMinecraftInput } from './minecraftInput'
import { IDLE_DIRECTOR, applyShot, startPlaying } from './directorShot'
import { FOG, SKY, depthBelowSurface, seeWaterFromBelow, setAtmosphereAt } from './atmosphere'
import { createSkyDome } from './skyDome'
import { createHud } from './engineHud'
import { createLoop } from './frameLoop'
import { VITALS, createVitals, resetVitals, stepVitals } from './life/vitals'
import { createLife } from './life/life'

// Fog and the far plane both measure view-space depth, so ending the view just past full fog cuts off nothing visible
const CAMERA_FAR = FOG.far + 8
const FALL_LIMIT = -20
// The blue wash over the world at full haze, and the smallest change in it worth a style write
const WASH = Object.freeze({ opacity: 0.22, step: 0.005 })

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
  const sky = createSkyDome()
  const textures = createTextures()
  const materials = {
    solid: new MeshBasicMaterial({ map: textures.blocks, vertexColors: true }),
    water: new MeshBasicMaterial({ map: textures.water, vertexColors: true, transparent: true, opacity: 0.74, depthWrite: false }),
  }
  materials.solid.onBeforeCompile = sampleAtCentroid
  seeWaterFromBelow(materials.water)
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
  return { scene, camera, sky, outline, materials, horizon, zenith: new Color(SKY.zenith), underwater: new Color(SKY.underwater), haze: 0, dispose }
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
const createEditor = ({ world, player, chunks, life, getTarget, getSelected, onEdit }) => {
  const change = (x, y, z, block) => {
    const edit = world.set(x, y, z, block)
    if (!edit) return
    chunksTouching(x, z).forEach(([cx, cz]) => chunks.rebuild(cx, cz))
    life.blockChanged(x, z)
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

/** Points the camera from the player's eyes, finds the aimed-at block, and sets fog and sky for the eyes' depth. */
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
  setAtmosphereAt(view, world, eye)
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

/** Draws one frame, warming the next batch of never-drawn chunks first (see WARM_BATCH), and washes it for the haze. */
const drawFrame = ({ renderer, view, chunks, wash }) => {
  chunks.warm()
  renderer.setClearColor(view.scene.fog.color)
  renderer.render(view.scene, view.camera)
  // Dimmed with the light, or the sea would glow blue on a moonless night
  wash.show(view.haze * (view.daylight ?? 1))
}

/**
 * What the vitals need from a frame: the feet, whether standing, swimming, or with the eyes under the water's surface,
 * and whether the game has the mouse.
 */
const sampleVitals = (player, world, playing) => ({
  y: player.pos.y, onGround: player.onGround, inWater: isSwimming(player, world),
  headUnder: depthBelowSurface(world, eyePosition(player)) > 0, playing,
})

/** The HUD patch for input going live or not; going live after a Respawn press is what clears the death panel. */
const playingPatch = (playing, death) => {
  if (!playing || !death.respawning) return { playing }
  death.respawning = false
  return { playing, dead: false, cause: null }
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
 * The blue wash over the world under water, WASH.opacity at full haze. It goes after the canvas in `host`, and the HUD
 * comes after `host`, so it lies between the two.
 */
const createWash = (host, doc) => {
  const element = doc.createElement('div')
  element.className = 'bk-wash'
  host.append(element)
  let shown = 0
  return {
    /** @param {number} haze - 0 in air to 1 at full depth (setAtmosphereAt) */
    show: (haze) => {
      const opacity = WASH.opacity * haze
      // Every write restyles the page, so changes too small to see are skipped; but clearing always lands on 0
      const unseen = opacity === 0 ? shown === 0 : Math.abs(opacity - shown) < WASH.step
      if (unseen) return
      shown = opacity
      element.style.opacity = String(opacity)
    },
    remove: () => element.remove(),
  }
}

/**
 * Starts the world in `host`, which it fills with its own canvas.
 * @param {{
 *   host: HTMLElement, island: import('./terrain').Island,
 *   chunkArrays: Map<string, { solid: import('./mesher').MeshArrays, water: import('./mesher').MeshArrays }>,
 *   edits?: ReadonlyArray<[number, number]>,
 *   onHud?: (hud: import('./engineHud').HudState) => void,
 *   onEdit?: (change: [number, number | null]) => void,
 *   createRenderer?: (canvas: HTMLCanvasElement) => object,
 *   requestFrame?: (run: (time: number) => void) => number, cancelFrame?: (id: number) => void,
 *   now?: () => number, doc?: Document, win?: Window,
 *   director?: { frame: (view: { dt: number, eye: { x: number, y: number, z: number }, yaw: number, pitch: number }) =>
 *     null | { camera?: { x: number, y: number, z: number, yaw: number, pitch: number }, fogLift?: number },
 *     toPlayer: (onArrive: () => void) => void, toOrbit: () => void },
 *   startTime?: number, reducedMotion?: boolean,
 * }} options - `island` and `chunkArrays` come from the world loader (worldLoader.js), the chunks meshed with the
 *   same `edits`. The voxels are copied into a world of the engine's own: physics, aiming and edits read them here.
 *   `chunkArrays` is consumed: the engine empties the map once its first meshes are built, so don't reuse it.
 *   `startTime`: the time of day to start at, a fraction from midnight (skyClock.js); 08:00 when left out.
 *   `reducedMotion`: the world's own motion (wind, water, clouds, fireflies, the walking bob) holds still.
 * @returns {{ setActive: (active: boolean) => void, setPaused: (paused: boolean) => void, capture: () => void, play: (onArrive: () => void) => void, toTitle: () => void, respawn: () => void, dispose: () => void }}
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
  now = () => performance.now(), doc, win, director = IDLE_DIRECTOR, startTime, reducedMotion = false,
}, releases, release) => {
  const world = createWorld(island, edits)
  const player = liftClear(createPlayer(island.spawn), world)
  const view = createView()
  const wash = createWash(host, doc)
  releases.push(view.dispose, wash.remove)
  const chunks = createChunks(view.scene, world, view.materials, chunkArrays)
  releases.push(chunks.dispose)
  const life = createLife({ view, world, startTime, reducedMotion })
  releases.push(life.dispose)
  const shotFog = { clear: FOG, setAt: (eye) => setAtmosphereAt(view, world, eye) }
  const hud = createHud(onHud, player)
  let target = null
  const editor = createEditor({ world, player, chunks, life, getTarget: () => target, getSelected: hud.selected, onEdit })
  const vitals = createVitals()
  const death = { respawning: false }
  const input = createMinecraftInput({ canvas, doc, win, now, on: {
    turn: (dx, dy) => turn(player, dx, dy),
    breakBlock: editor.breakBlock,
    placeBlock: editor.placeBlock,
    select: hud.select,
    scroll: (step) => hud.select(hud.selected() + step),
    playingChanged: (playing) => hud.emit(playingPatch(playing, death)),
  } })
  releases.push(input.dispose)
  releases.push(...[watchSize({ host, win, renderer, camera: view.camera }), watchContextRestore(canvas, chunks)])
  // Back to the spawn point, standing clear of anything built on it, with no fall counting toward the landing
  const respawnPlayer = () => {
    Object.assign(player, liftClear(createPlayer(island.spawn), world))
    vitals.peakY = null
  }
  // The death panel first, then the mouse let go: told the other way round, the pause panel would flash up between
  const die = () => {
    hud.emit({ dead: true, cause: vitals.cause, health: 0 })
    input.setMuted(true)
    if (doc.pointerLockElement === canvas) doc.exitPointerLock?.()
  }
  const respawn = () => {
    if (!hud.isDead()) return
    if (!death.respawning) {
      if (vitals.deadFor < VITALS.RESPAWN_DELAY) return
      respawnPlayer()
      resetVitals(vitals)
      hud.vitals(vitals)
      death.respawning = true
    }
    // Safe to press again: if the browser refused the mouse, the death panel stays and this asks once more
    input.setMuted(false)
    input.capture()
  }
  const loop = createLoop({ requestFrame, cancelFrame, now, step: (time, dt) => {
    stepPlayer(player, world, input.moveInput(), dt)
    if (player.pos.y < FALL_LIMIT) respawnPlayer()
    const events = stepVitals(vitals, sampleVitals(player, world, input.isPlaying()), dt)
    if (events.some((event) => event.type === 'dead')) die()
    hud.vitals(vitals)
    life.beforeView(dt, player)
    input.tick(time)
    target = updateView(view, world, player)
    const shot = director.frame({ dt, eye: eyePosition(player), yaw: player.yaw, pitch: player.pitch })
    if (shot) applyShot(view, shot, shotFog)
    life.afterView(dt, { shot, player, playing: input.isPlaying() })
    drawFrame({ renderer, view, chunks, wash })
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
    respawn,
    dispose: release,
  })
}
