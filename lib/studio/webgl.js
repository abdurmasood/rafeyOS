// Whether this browser can run the studio: WebGL2 on real hardware, with textures as wide as the plate
export const MIN_TEXTURE_SIZE = 7200

export const STUDIO_SUPPORT = Object.freeze({
  OK: 'ok',
  NO_WEBGL2: 'no-webgl2',
  SMALL_TEXTURES: 'small-textures',
})

/** @param {() => HTMLCanvasElement} createCanvas */
export const detectStudioSupport = (createCanvas = () => document.createElement('canvas')) => {
  const gl = createCanvas().getContext('webgl2', { failIfMajorPerformanceCaveat: true })
  if (!gl) return STUDIO_SUPPORT.NO_WEBGL2
  const maxTextureSize = gl.getParameter(gl.MAX_TEXTURE_SIZE)
  gl.getExtension('WEBGL_lose_context')?.loseContext()
  return maxTextureSize >= MIN_TEXTURE_SIZE ? STUDIO_SUPPORT.OK : STUDIO_SUPPORT.SMALL_TEXTURES
}
