import { useEffect, useMemo, useRef } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import { useGLTF, useTexture } from '@react-three/drei'
import { Color, LinearSRGBColorSpace } from 'three'
import { plateViewProjection } from '@/lib/studio/camera'
import { lineStarts, normaliseSource } from '@/lib/studio/code'
import { candleGain } from '@/lib/studio/flicker'
import { DRACO_PATH, PLATE_HALF_TAN, STUDIO_ASSETS, manifest } from '@/lib/studio/manifest'
import { WIND_RESPONSE } from '@/lib/studio/motion'
import { createTypingTimeline } from '@/lib/studio/typing'
import { windAt, windStrength } from '@/lib/studio/wind'
import { buildStudio } from './buildStudio'
import { preparePlate } from './materials'
import { MonitorCode } from './MonitorCode'
import { PhoneClock } from './PhoneClock'
import { roomFragment } from './shaders/room.glsl'

const GLB_URL = `${STUDIO_ASSETS}/studio.glb`
const HAS_DELTAS = Object.keys(manifest.deltas ?? {}).length > 0
const HAS_PLANTS = Object.keys(manifest.plantLayers ?? {}).length > 0
const TEXTURE_URLS = [
  `${STUDIO_ASSETS}/base.webp`,
  ...(HAS_DELTAS ? [`${STUDIO_ASSETS}/deltas.webp`] : []),
  ...(HAS_PLANTS ? [`${STUDIO_ASSETS}/plants.webp`] : []),
]
const BACKGROUND = new Color().setRGB(...manifest.background, LinearSRGBColorSpace)
// What he types on the monitor: the shader that draws this room. He's already a dozen lines in when you arrive.
const CODE = normaliseSource(roomFragment)
const OPENING_LINES = 12

// Importing this module starts the downloads, so the homepage's prefetch fetches the assets too
useGLTF.preload(GLB_URL, DRACO_PATH)
useTexture.preload(TEXTURE_URLS)

const prefersReducedMotion = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches
// `/studio?rest` freezes everything in the render's own pose, to diff the page against the Cycles reference
const restPose = () => new URLSearchParams(window.location.search).has('rest')
// `/studio?at=<seconds>` freezes everything at one moment of his session, to check a pose
const frozenAt = () => {
  const value = new URLSearchParams(window.location.search).get('at')
  return value === null ? null : Number(value)
}

const holdRestPose = (studio) => {
  for (const { sway } of studio.swaying) sway.uSwayScale.value = 0
  studio.shared.uniforms.uCandleGain.value = 1
  studio.figure?.rig.pose()
}

/** Wind, flicker and dust drift for this frame. `motionTime` freezes under reduced motion. */
const advance = (studio, { time, motionTime, delta, travel }) => {
  const { uniforms } = studio.shared
  uniforms.uTime.value = motionTime
  for (const { sway, place } of studio.swaying) sway.uWind.value = windAt(motionTime, WIND_RESPONSE[place])
  uniforms.uCandleGain.value = candleGain(time, windAt(motionTime, WIND_RESPONSE.candle))
  travel.current += windStrength(motionTime) * delta
  studio.dust.material.uniforms.uTravel.value = travel.current
}

/** His whole pose for this frame; under reduced motion he sits still at the keyboard. */
const poseFigure = (studio, timeline, { time, still }) => {
  if (!studio.figure) return
  const { rig, poser } = studio.figure
  if (still) return rig.pose()
  const { angles, reach } = poser(timeline.at(time), time)
  rig.pose(angles, reach)
}

export function StudioScene({ onReady, quality }) {
  const { gl, camera } = useThree()
  const { scene } = useGLTF(GLB_URL, DRACO_PATH)
  const [base, deltas = null, plants = null] = useTexture(TEXTURE_URLS)
  const travel = useRef(0)
  const reducedMotion = useMemo(prefersReducedMotion, [])
  const rest = useMemo(restPose, [])
  const at = useMemo(frozenAt, [])
  const timeline = useMemo(() => createTypingTimeline(CODE, { startAt: lineStarts(CODE)[OPENING_LINES] }), [])

  const studio = useMemo(
    () =>
      buildStudio({
        manifest,
        plateViewProj: plateViewProjection(manifest.camera.matrix, PLATE_HALF_TAN),
        scene,
        base: preparePlate(base),
        deltas: deltas && preparePlate(deltas, { mipmaps: false }),
        plants: plants && preparePlate(plants),
        hazeSteps: quality.hazeSteps,
        pixelRatio: gl.getPixelRatio(),
      }),
    // Quality changes are applied below without rebuilding
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [scene, base, deltas, plants, gl],
  )
  useEffect(() => () => studio.dispose(), [studio])

  useEffect(() => {
    studio.room.defines.HAZE_STEPS = quality.hazeSteps
    studio.room.needsUpdate = true
    studio.dust.geometry.setDrawRange(0, quality.dust)
  }, [studio, quality])

  useEffect(() => {
    studio.shadows.renderRest(gl)
    let cancelled = false
    gl.compileAsync(scene, camera).then(() => {
      if (!cancelled) onReady()
    })
    return () => {
      cancelled = true
    }
  }, [gl, scene, camera, studio, onReady])

  // Priority 1: this loop renders the frame itself (shadow passes first, then the room)
  useFrame((state, delta) => {
    const time = at ?? state.clock.elapsedTime
    if (rest) holdRestPose(studio)
    else {
      const step = reducedMotion || at !== null ? 0 : delta
      advance(studio, { time, motionTime: reducedMotion ? 0 : time, delta: step, travel })
      poseFigure(studio, timeline, { time, still: reducedMotion })
    }
    studio.shadows.render(gl)
    gl.setRenderTarget(null)
    gl.setClearColor(BACKGROUND, 1)
    gl.render(state.scene, state.camera)
  }, 1)

  return (
    <>
      <primitive object={scene} />
      <primitive object={studio.dust} />
      <PhoneClock clock={manifest.clock} />
      {manifest.monitor && !rest && <MonitorCode monitor={manifest.monitor} timeline={timeline} reducedMotion={reducedMotion} at={at} />}
    </>
  )
}
