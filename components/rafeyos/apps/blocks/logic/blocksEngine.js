// The Blocks world on screen: the three.js scene (sky, fog, chunk meshes, the outline on the aimed-at block), the
// frame loop, and the window it lives in. The renderer and frame scheduler are injected, so tests run it without WebGL.
import {
  BackSide, BoxGeometry, BufferAttribute, BufferGeometry, Color, DataTexture, EdgesGeometry, Fog, LineBasicMaterial,
  LineSegments, Mesh, MeshBasicMaterial, NearestFilter, PerspectiveCamera, RGBAFormat, SRGBColorSpace, Scene,
  ShaderMaterial, SphereGeometry, Vector3, WebGLRenderer,
} from 'three'
import { BLOCK, HOTBAR, isSolid } from './blockTypes'
import { ATLAS, flipRows, paintAtlas } from './texturePixels'
import { WORLD, generateIsland, inBounds } from './terrain'
import { chunksTouching, createWorld } from './world'
import { meshChunk } from './mesher'
import { createPlayer, eyePosition, liftClear, lookDirection, overlapsBlock, stepPlayer, turn } from './physics'
import { castRay } from './raycast'
import { createBlocksInput } from './blocksInput'

const SKY = Object.freeze({ horizon: '#cfe2f0', zenith: '#5f9ddc', underwater: '#2a5f9e' })
const FOG = Object.freeze({ near: 34, far: 80, underwaterNear: 1, underwaterFar: 18 })
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

const createAtlasTexture = () => {
  const pixels = new Uint8Array(flipRows(paintAtlas(), ATLAS.SIZE).buffer)
  const texture = new DataTexture(pixels, ATLAS.SIZE, ATLAS.SIZE, RGBAFormat)
  texture.magFilter = NearestFilter
  texture.minFilter = NearestFilter
  texture.generateMipmaps = false
  texture.colorSpace = SRGBColorSpace
  texture.needsUpdate = true
  return texture
}

/** Scene, camera, sky dome, fog, the two block materials and the aim outline. */
const createView = () => {
  const horizon = new Color(SKY.horizon)
  const scene = new Scene()
  scene.fog = new Fog(horizon.clone(), FOG.near, FOG.far)
  const camera = new PerspectiveCamera(72, 1, 0.05, 600)
  camera.rotation.order = 'YXZ'
  const sky = new Mesh(new SphereGeometry(400, 32, 16), new ShaderMaterial({
    side: BackSide, depthWrite: false, fog: false, vertexShader: SKY_VERTEX, fragmentShader: SKY_FRAGMENT,
    uniforms: { horizon: { value: horizon }, zenith: { value: new Color(SKY.zenith) }, sun: { value: new Vector3(0.45, 0.55, -0.7).normalize() } },
  }))
  const texture = createAtlasTexture()
  const materials = {
    solid: new MeshBasicMaterial({ map: texture, vertexColors: true }),
    water: new MeshBasicMaterial({ map: texture, vertexColors: true, transparent: true, opacity: 0.74, depthWrite: false }),
  }
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
    texture.dispose()
  }
  return { scene, camera, sky, outline, materials, horizon, underwater: new Color(SKY.underwater), dispose }
}

const toGeometry = ({ positions, uvs, colors, indices }) => {
  const geometry = new BufferGeometry()
  geometry.setAttribute('position', new BufferAttribute(positions, 3))
  geometry.setAttribute('uv', new BufferAttribute(uvs, 2))
  geometry.setAttribute('color', new BufferAttribute(colors, 3))
  geometry.setIndex(new BufferAttribute(indices, 1))
  geometry.computeBoundingSphere()
  return geometry
}

/** One solid and one water mesh per chunk (none where a chunk has no faces), rebuilt when a block near it changes. */
const createChunks = (scene, world, materials) => {
  const meshes = new Map()
  const drop = (key) => {
    for (const mesh of meshes.get(key) ?? []) {
      scene.remove(mesh)
      mesh.geometry.dispose()
    }
    meshes.delete(key)
  }
  const rebuild = (cx, cz) => {
    const key = `${cx},${cz}`
    drop(key)
    const arrays = meshChunk(world, cx, cz)
    const built = []
    if (arrays.solid.indices.length) built.push(new Mesh(toGeometry(arrays.solid), materials.solid))
    if (arrays.water.indices.length) {
      const water = new Mesh(toGeometry(arrays.water), materials.water)
      water.renderOrder = 1
      built.push(water)
    }
    if (built.length) scene.add(...built)
    meshes.set(key, built)
  }
  const perSide = WORLD.SIZE / WORLD.CHUNK
  for (let cz = 0; cz < perSide; cz++) for (let cx = 0; cx < perSide; cx++) rebuild(cx, cz)
  return { rebuild, dispose: () => [...meshes.keys()].forEach(drop) }
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

/** Points the camera from the player's eyes, finds the aimed-at block, and tints the fog blue under water. */
const updateView = (view, world, player) => {
  const { camera, scene, sky, outline } = view
  const eye = eyePosition(player)
  camera.position.set(eye.x, eye.y, eye.z)
  camera.rotation.set(player.pitch, player.yaw, 0)
  camera.updateMatrixWorld()
  sky.position.copy(camera.position)
  const target = castRay(world, eye, lookDirection(player))
  outline.visible = Boolean(target)
  if (target) outline.position.set(target.x + 0.5, target.y + 0.5, target.z + 0.5)
  const underwater = world.get(Math.floor(eye.x), Math.floor(eye.y), Math.floor(eye.z)) === BLOCK.WATER
  scene.fog.color.copy(underwater ? view.underwater : view.horizon)
  scene.fog.near = underwater ? FOG.underwaterNear : FOG.near
  scene.fog.far = underwater ? FOG.underwaterFar : FOG.far
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
    throw error
  }
}

/**
 * Starts the world in `host`, which it fills with its own canvas.
 * @param {{
 *   host: HTMLElement, edits?: ReadonlyArray<[number, number]>,
 *   onHud?: (hud: { playing: boolean, selected: number, position: string }) => void,
 *   onEdit?: (change: [number, number | null]) => void,
 *   createRenderer?: (canvas: HTMLCanvasElement) => object,
 *   requestFrame?: (run: (time: number) => void) => number, cancelFrame?: (id: number) => void,
 *   now?: () => number, doc?: Document, win?: Window,
 * }} options
 * @returns {{ setActive: (active: boolean) => void, setPaused: (paused: boolean) => void, capture: () => void, dispose: () => void }}
 * @throws when the browser can't make a WebGL context
 */
export const createBlocksEngine = ({
  host, edits = [], onHud = () => {}, onEdit = () => {}, createRenderer = defaultRenderer,
  requestFrame = (run) => requestAnimationFrame(run), cancelFrame = (id) => cancelAnimationFrame(id),
  now = () => performance.now(), doc = host.ownerDocument, win = doc.defaultView,
}) => {
  const { canvas, renderer } = mountRenderer({ host, doc, win, createRenderer })
  const island = generateIsland()
  const world = createWorld(island, edits)
  const player = liftClear(createPlayer(island.spawn), world)
  const view = createView()
  const chunks = createChunks(view.scene, world, view.materials)
  const hud = createHud(onHud, player)
  let target = null
  const editor = createEditor({ world, player, chunks, getTarget: () => target, getSelected: hud.selected, onEdit })
  const input = createBlocksInput({ canvas, doc, win, now, on: {
    turn: (dx, dy) => turn(player, dx, dy),
    breakBlock: editor.breakBlock,
    placeBlock: editor.placeBlock,
    select: hud.select,
    scroll: (step) => hud.select(hud.selected() + step),
    playingChanged: (playing) => hud.emit({ playing }),
  } })
  const unwatch = watchSize({ host, win, renderer, camera: view.camera })
  const loop = createLoop({ requestFrame, cancelFrame, now, step: (time, dt) => {
    stepPlayer(player, world, input.moveInput(), dt)
    if (player.pos.y < FALL_LIMIT) Object.assign(player, liftClear(createPlayer(island.spawn), world))
    input.tick(time)
    target = updateView(view, world, player)
    renderer.setClearColor(view.scene.fog.color)
    renderer.render(view.scene, view.camera)
    hud.track(time)
  } })
  hud.emit({})
  loop.start()

  return Object.freeze({
    setActive: (active) => input.setActive(active),
    setPaused: (paused) => (paused ? loop.stop() : loop.start()),
    capture: () => input.capture(),
    dispose: () => {
      loop.stop()
      input.dispose()
      unwatch()
      chunks.dispose()
      view.dispose()
      renderer.dispose()
      renderer.forceContextLoss?.()
      canvas.remove()
    },
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
