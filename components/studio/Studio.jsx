'use client'

import { Suspense, memo, useCallback, useEffect, useRef, useState } from 'react'
import { Canvas } from '@react-three/fiber'
import { PerformanceMonitor } from '@react-three/drei'
import { ROOM_VIEW, canvasBox, dprFor } from '@/lib/studio/camera'
import { ASPECT_RANGE, BUILD_QUALITY, REF_ROWS, manifest } from '@/lib/studio/manifest'
import { QUALITY_EVENTS, TIERS, TOP_TIER, nextTier } from '@/lib/studio/quality'
import { STUDIO_SUPPORT, detectStudioSupport } from '@/lib/studio/webgl'
import { StudioCamera } from './StudioCamera'
import { StudioScene } from './StudioScene'

const TERMINAL_FONT = 'var(--font-terminal), ui-monospace, monospace'
const FADE_MS = 700
// Loading the plates and compiling shaders stutters; judging the GPU during it read a fast Mac as slow
const MONITOR_SETTLE_MS = 3000
const BACKGROUND = `rgb(${manifest.background.map((channel) => Math.round(channel * 255)).join(' ')})`
const GL_OPTIONS = Object.freeze({ antialias: true, alpha: false, stencil: false, powerPreference: 'high-performance' })

/** The size of the box the room lives in (its window), followed as the window is resized. */
const useBoxSize = (ref) => {
  const [size, setSize] = useState({ width: 0, height: 0 })
  useEffect(() => {
    const observer = new ResizeObserver(([entry]) => {
      const { width, height } = entry.contentRect
      setSize({ width, height })
    })
    observer.observe(ref.current)
    return () => observer.disconnect()
  }, [ref])
  return size
}

function NeedsWebGL({ reason }) {
  const detail =
    reason === STUDIO_SUPPORT.SMALL_TEXTURES ? 'this GPU cannot hold the room’s textures' : 'WebGL 2 is not available here'
  return (
    <p className="text-[#8E8E8E] text-sm px-6 text-center" style={{ fontFamily: TERMINAL_FONT }}>
      rafey: {detail}. Try a desktop browser with hardware acceleration on.
    </p>
  )
}

// Slow GPUs step down a tier: fewer haze samples, less dust, then fewer pixels
const useQualityTier = () => {
  const [tier, setTier] = useState(TOP_TIER)
  const on = (event) => () => setTier((current) => nextTier(current, event))
  return {
    quality: TIERS[tier],
    onDecline: on(QUALITY_EVENTS.DECLINE),
    onIncline: on(QUALITY_EVENTS.INCLINE),
    onFallback: on(QUALITY_EVENTS.FALLBACK),
  }
}

/** True a few seconds after the room is ready, once loading hitches are over. */
const useSettled = (ready) => {
  const [settled, setSettled] = useState(false)
  useEffect(() => {
    if (!ready) return undefined
    const timer = setTimeout(() => setSettled(true), MONITOR_SETTLE_MS)
    return () => clearTimeout(timer)
  }, [ready])
  return settled
}

function StudioCanvas({ space, paused, onActivity, music, minecraft }) {
  const [ready, setReady] = useState(false)
  const onReady = useCallback(() => setReady(true), [])
  const settled = useSettled(ready)
  const { quality, onDecline, onIncline, onFallback } = useQualityTier()
  const box = canvasBox(space, ASPECT_RANGE)
  const refRows = REF_ROWS * ROOM_VIEW.halfSize // the view shows only the room's part of the plate
  const dpr = dprFor({ box, deviceDpr: window.devicePixelRatio, refRows, perf: quality.dprFactor })
  return (
    <div
      style={{ width: box.width, height: box.height, opacity: ready ? 1 : 0, transition: `opacity ${FADE_MS}ms ease` }}
    >
      <Canvas flat linear dpr={dpr} gl={GL_OPTIONS} frameloop={paused ? 'never' : 'always'}>
        <StudioCamera />
        <Suspense fallback={null}>
          <StudioScene onReady={onReady} quality={quality} onActivity={onActivity} music={music} minecraft={minecraft} />
        </Suspense>
        {settled && <PerformanceMonitor flipflops={3} onDecline={onDecline} onIncline={onIncline} onFallback={onFallback} />}
      </Canvas>
    </div>
  )
}

/**
 * The night room, live, filling the box it's given (the "Rafey" app's window). `paused` stops drawing, e.g.
 * while minimized. onActivity(activity) hears what he's doing; music / minecraft nudge him (moods.js).
 * Memoised: the desktop re-renders every second while music plays, and the room needn't.
 * @type {import('react').NamedExoticComponent<{ paused?: boolean, onActivity?: ((activity: string) => void) | null,
 *   music?: boolean, minecraft?: boolean }>}
 */
export const Studio = memo(function Studio({ paused = false, onActivity = null, music = false, minecraft = false }) {
  const [support] = useState(() => detectStudioSupport())
  const boxRef = useRef(null)
  const space = useBoxSize(boxRef)
  const room = space.width > 0 && space.height > 0 && (
    <StudioCanvas space={space} paused={paused} onActivity={onActivity} music={music} minecraft={minecraft} />
  )
  return (
    <div
      ref={boxRef}
      className="absolute inset-0 flex items-center justify-center overflow-hidden"
      style={{ background: BACKGROUND }}
    >
      {support === STUDIO_SUPPORT.OK ? room : <NeedsWebGL reason={support} />}
      {manifest.quality === BUILD_QUALITY.DRAFT && (
        <p className="absolute top-4 right-5 m-0 text-xs text-[#8E8E8E]" style={{ fontFamily: TERMINAL_FONT }}>
          draft
        </p>
      )}
    </div>
  )
})
