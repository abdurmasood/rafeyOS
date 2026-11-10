// The black hole on screen: a canvas in `host`, drawn in two passes. The view pass traces one ray per character cell
// into a small texture; the print pass draws that texture as characters. Where the eye is comes from `onFrame`, so
// this file knows nothing of the flight. The renderer and frame scheduler are injected, so tests run it without WebGL.
import { CanvasTexture, LinearFilter, NearestFilter, ShaderMaterial, Vector2, Vector3, WebGLRenderTarget, WebGLRenderer } from 'three'
import { FullScreenQuad } from 'three/examples/jsm/postprocessing/Pass.js'
import { printFragment } from './shaders/print.glsl'
import { quadVertex, viewFragment } from './shaders/view.glsl'

/** The characters a cell can show, dimmest first. */
export const RAMP = " .'`,:;~-_+<>i!lI?/|()1{}[]rcvunxzjftLCJUYXZO0Qoahkbdpqwm*WMB8&%$#@"
/** A character cell on screen, in CSS pixels. */
export const CELL = Object.freeze({ width: 4, height: 8 })

const MIN_GRID = Object.freeze({ cols: 40, rows: 20 })
// One glyph in the atlas, in texels: large enough to stay sharp when a cell covers 8×16 device pixels
const GLYPH = Object.freeze({ width: 24, height: 48, fontPx: 38, baseline: 26 })
// The only weight the site ships of its terminal font
const GLYPH_WEIGHT = 400
const FALLBACK_FONTS = 'ui-monospace, Menlo, monospace'
const MAX_PIXEL_RATIO = 2
/** Longest frame the flight will take in one go, so a stalled tab can't fling the eye through the hole. */
const MAX_FRAME = 0.05
const CANVAS_STYLE = 'position:absolute;inset:0;width:100%;height:100%;display:block;touch-action:none;cursor:grab'

const defaultRenderer = (canvas) => new WebGLRenderer({ canvas, antialias: false, alpha: false, powerPreference: 'high-performance' })

/**
 * @typedef {{
 *   position: number[], forward: number[], right: number[], up: number[],
 *   w: number, gamma: number, halfAngle: number, discTime: number, dim: number,
 * }} ViewParams - the eye and its motion for one frame (lib/singularity/flight.js viewOf)
 */

/** The browser can't make a WebGL context; the terminal prints its one-line apology for this and only this. */
export class WebGLUnavailableError extends Error {
  /** @param {unknown} cause */
  constructor(cause) {
    super('WebGL is unavailable', { cause })
    this.name = 'WebGLUnavailableError'
  }
}

/**
 * How many character cells fit a box of CSS pixels.
 * @param {number} width @param {number} height
 */
export const gridFor = (width, height) => ({
  cols: Math.max(MIN_GRID.cols, Math.round(width / CELL.width)),
  rows: Math.max(MIN_GRID.rows, Math.round(height / CELL.height)),
})

/** Creates the canvas in `host` and a renderer on it; the canvas goes again if the browser has no WebGL. */
const mountRenderer = ({ host, doc, win, createRenderer }) => {
  const canvas = doc.createElement('canvas')
  canvas.style.cssText = CANVAS_STYLE
  host.append(canvas)
  try {
    const renderer = createRenderer(canvas)
    renderer.setPixelRatio(Math.min(win.devicePixelRatio || 1, MAX_PIXEL_RATIO))
    renderer.setClearColor(0x000000, 1)
    return { canvas, renderer }
  } catch (error) {
    canvas.remove()
    throw new WebGLUnavailableError(error)
  }
}

/** The terminal's font as the page resolved it, with fallbacks for where the variable isn't set. */
const terminalFont = (host, win) => {
  const family = win.getComputedStyle(host).getPropertyValue('--font-terminal').trim()
  return `${GLYPH_WEIGHT} ${GLYPH.fontPx}px ${family ? `${family}, ` : ''}${FALLBACK_FONTS}`
}

/** The ramp's characters side by side on one texture, painted again once the terminal font has loaded. */
const createGlyphAtlas = ({ host, doc, win }) => {
  const canvas = doc.createElement('canvas')
  canvas.width = RAMP.length * GLYPH.width
  canvas.height = GLYPH.height
  const texture = new CanvasTexture(canvas)
  texture.generateMipmaps = false
  texture.minFilter = LinearFilter
  const font = terminalFont(host, win)
  let live = true
  const paint = () => {
    const context = live ? canvas.getContext('2d') : null
    // No 2D canvas (a stripped-down browser): the cells stay blank rather than the program crashing
    if (!context) return
    context.fillStyle = '#000'
    context.fillRect(0, 0, canvas.width, canvas.height)
    context.fillStyle = '#fff'
    context.font = font
    context.textAlign = 'center'
    context.textBaseline = 'middle'
    Array.from(RAMP).forEach((glyph, index) => context.fillText(glyph, index * GLYPH.width + GLYPH.width / 2, GLYPH.baseline))
    texture.needsUpdate = true
  }
  paint()
  // The first paint may have used a fallback font; a failed load keeps it
  doc.fonts?.load?.(font).then(paint, () => {})
  const dispose = () => {
    live = false
    texture.dispose()
  }
  return { texture, dispose }
}

const fullscreenMaterial = (fragmentShader, uniforms) =>
  new ShaderMaterial({ vertexShader: quadVertex, fragmentShader, uniforms, depthTest: false, depthWrite: false })

/** The two passes and the cell texture between them. */
const createPasses = (glyphs) => {
  const cells = new WebGLRenderTarget(4, 4, { minFilter: NearestFilter, magFilter: NearestFilter, depthBuffer: false })
  const view = fullscreenMaterial(viewFragment, {
    uEye: { value: new Vector3() }, uForward: { value: new Vector3() }, uRight: { value: new Vector3() }, uUp: { value: new Vector3() },
    uHalfAngle: { value: 0 }, uDiscTime: { value: 0 }, uAspect: { value: 1 }, uOutwardSpeed: { value: 0 }, uGamma: { value: 1 },
  })
  const print = fullscreenMaterial(printFragment, {
    uBrightness: { value: cells.texture }, uGlyphs: { value: glyphs }, uGrid: { value: new Vector2(1, 1) },
    uGlyphCount: { value: RAMP.length }, uDim: { value: 1 },
  })
  const quads = { view: new FullScreenQuad(view), print: new FullScreenQuad(print) }
  const dispose = () => {
    quads.view.dispose()
    quads.print.dispose()
    view.dispose()
    print.dispose()
    cells.dispose()
  }
  return { cells, view, print, quads, dispose }
}

/** Draws one frame for an eye at `params`. @param {ViewParams} params */
const drawFrame = (renderer, passes, params) => {
  const view = passes.view.uniforms
  view.uEye.value.fromArray(params.position)
  view.uForward.value.fromArray(params.forward)
  view.uRight.value.fromArray(params.right)
  view.uUp.value.fromArray(params.up)
  view.uOutwardSpeed.value = params.w
  view.uGamma.value = params.gamma
  view.uHalfAngle.value = params.halfAngle
  view.uDiscTime.value = params.discTime
  passes.print.uniforms.uDim.value = params.dim
  renderer.setRenderTarget(passes.cells)
  passes.quads.view.render(renderer)
  renderer.setRenderTarget(null)
  passes.quads.print.render(renderer)
}

/**
 * Keeps the drawing buffer the size of `host` and the cell texture one texel per character.
 * @returns {{ size: { width: number, height: number }, stop: () => void }} `size` is live, and 0×0 while the host
 *   is not laid out (a minimized rafeyOS window is display:none)
 */
const watchSize = ({ host, win, renderer, passes }) => {
  const size = { width: 0, height: 0 }
  const resize = () => {
    size.width = host.clientWidth
    size.height = host.clientHeight
    if (!size.width || !size.height) return
    const { cols, rows } = gridFor(size.width, size.height)
    renderer.setSize(size.width, size.height, false)
    passes.cells.setSize(cols, rows)
    passes.print.uniforms.uGrid.value.set(cols, rows)
    passes.view.uniforms.uAspect.value = size.width / size.height
  }
  resize()
  if (typeof win.ResizeObserver === 'function') {
    const observer = new win.ResizeObserver(resize)
    observer.observe(host)
    return { size, stop: () => observer.disconnect() }
  }
  win.addEventListener('resize', resize)
  return { size, stop: () => win.removeEventListener('resize', resize) }
}

/**
 * The frame loop: `step(dt)` once per frame. Stopping cancels the next frame; starting again resets the clock, so
 * coming back from a pause isn't one giant frame.
 */
const createLoop = ({ requestFrame, cancelFrame, now, step }) => {
  let frameId = null
  let last = 0
  const frame = (time) => {
    frameId = null
    const dt = Math.min(MAX_FRAME, Math.max(0, (time - last) / 1000))
    last = time
    step(dt)
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

/**
 * Starts drawing in `host`, which it fills with its own canvas.
 * @param {{
 *   host: HTMLElement, onFrame: (dt: number) => ViewParams,
 *   createRenderer?: (canvas: HTMLCanvasElement) => object,
 *   requestFrame?: (run: (time: number) => void) => number, cancelFrame?: (id: number) => void,
 *   now?: () => number, doc?: Document, win?: Window,
 * }} options - `onFrame` is called once per drawn frame with the seconds since the last one, and returns where the
 *   eye is. It is not called while nothing would be drawn (host 0×0, tab hidden, paused), so the flight holds still.
 * @returns {{ setPaused: (paused: boolean) => void, dispose: () => void }}
 * @throws {WebGLUnavailableError} when the browser can't make a WebGL context; anything else thrown while building
 *   comes after the canvas and renderer went again, so nothing is left behind
 */
export const createSingularityEngine = (options) => {
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
    return assembleEngine({ ...options, doc, win, renderer }, releases, release)
  } catch (error) {
    release()
    throw error
  }
}

/** Everything after the renderer: atlas, passes, sizing and the loop. Each thing made adds its undo to `releases`. */
const assembleEngine = ({
  host, onFrame, renderer, doc, win,
  requestFrame = (run) => requestAnimationFrame(run), cancelFrame = (id) => cancelAnimationFrame(id),
  now = () => performance.now(),
}, releases, release) => {
  const atlas = createGlyphAtlas({ host, doc, win })
  releases.push(atlas.dispose)
  const passes = createPasses(atlas.texture)
  releases.push(passes.dispose)
  const sizing = watchSize({ host, win, renderer, passes })
  releases.push(sizing.stop)
  const loop = createLoop({ requestFrame, cancelFrame, now, step: (dt) => {
    if (!sizing.size.width || !sizing.size.height || doc.hidden) return
    drawFrame(renderer, passes, onFrame(dt))
  } })
  releases.push(loop.stop)
  loop.start()
  return Object.freeze({
    setPaused: (paused) => (paused ? loop.stop() : loop.start()),
    dispose: release,
  })
}
