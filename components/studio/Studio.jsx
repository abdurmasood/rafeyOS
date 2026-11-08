'use client'

import { Suspense, useCallback, useEffect, useState } from 'react'
import { Canvas } from '@react-three/fiber'
import { PerformanceMonitor } from '@react-three/drei'
import TerminalIcon from '@/components/projects/TerminalIcon'
import { canvasBox, dprFor } from '@/lib/studio/camera'
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

const useViewport = () => {
  const [viewport, setViewport] = useState(() => ({ width: window.innerWidth, height: window.innerHeight }))
  useEffect(() => {
    const update = () => setViewport({ width: window.innerWidth, height: window.innerHeight })
    window.addEventListener('resize', update)
    return () => window.removeEventListener('resize', update)
  }, [])
  return viewport
}

const useEscape = (onExit) => {
  useEffect(() => {
    const onKey = (event) => {
      if (event.key === 'Escape') onExit()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onExit])
}

function NeedsWebGL({ reason }) {
  const detail =
    reason === STUDIO_SUPPORT.SMALL_TEXTURES ? 'this GPU cannot hold the room’s textures' : 'WebGL 2 is not available here'
  return (
    <p className="text-[#8E8E8E] text-sm px-6 text-center" style={{ fontFamily: TERMINAL_FONT }}>
      studio: {detail}. Try a desktop browser with hardware acceleration on.
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

function StudioCanvas() {
  const viewport = useViewport()
  const [ready, setReady] = useState(false)
  const onReady = useCallback(() => setReady(true), [])
  const settled = useSettled(ready)
  const { quality, onDecline, onIncline, onFallback } = useQualityTier()
  const box = canvasBox(viewport, ASPECT_RANGE)
  const dpr = dprFor({ box, deviceDpr: window.devicePixelRatio, refRows: REF_ROWS, perf: quality.dprFactor })
  return (
    <div
      style={{ width: box.width, height: box.height, opacity: ready ? 1 : 0, transition: `opacity ${FADE_MS}ms ease` }}
    >
      <Canvas flat linear dpr={dpr} gl={GL_OPTIONS}>
        <StudioCamera />
        <Suspense fallback={null}>
          <StudioScene onReady={onReady} quality={quality} />
        </Suspense>
        {settled && <PerformanceMonitor flipflops={3} onDecline={onDecline} onIncline={onIncline} onFallback={onFallback} />}
      </Canvas>
    </div>
  )
}

/** The night room, live. Esc or the terminal icon leaves. */
export function Studio({ onExit }) {
  const [support] = useState(() => detectStudioSupport())
  useEscape(onExit)
  return (
    <div className="fixed inset-0 flex items-center justify-center overflow-hidden" style={{ background: BACKGROUND }}>
      {support === STUDIO_SUPPORT.OK ? <StudioCanvas /> : <NeedsWebGL reason={support} />}
      <TerminalIcon onClick={onExit} />
      {manifest.quality === BUILD_QUALITY.DRAFT && (
        <p className="absolute top-4 right-5 m-0 text-xs text-[#8E8E8E]" style={{ fontFamily: TERMINAL_FONT }}>
          draft
        </p>
      )}
    </div>
  )
}
