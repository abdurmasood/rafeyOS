import { useEffect, useMemo, useRef, useState } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import { useGLTF, useTexture } from '@react-three/drei'
import { Color, LinearSRGBColorSpace, Matrix4, Vector3 } from 'three'
import { plateViewProjection } from '@/lib/studio/camera'
import { lineStarts, normaliseSource } from '@/lib/studio/code'
import { candleGain } from '@/lib/studio/flicker'
import { DRACO_PATH, PLATE_HALF_TAN, STUDIO_ASSETS, manifest } from '@/lib/studio/manifest'
import { carry } from '@/lib/studio/activities'
import { createClipMixer, createSeatedClip, createTypingClip, decodeMotion, sampleClip, stageMatrix } from '@/lib/studio/clips'
import { POSE, mouseReachOf } from '@/lib/studio/figurePose'
import { ACTIVITY, NUDGE, planNight } from '@/lib/studio/moods'
import { sessionFromUrl } from '@/lib/studio/session'
import { createSessionClock } from '@/lib/studio/sessionClock'
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
const HAS_LIGHT = Boolean(manifest.light)
const TEXTURE_URLS = [
  `${STUDIO_ASSETS}/base.webp`,
  ...(HAS_DELTAS ? [`${STUDIO_ASSETS}/deltas.webp`] : []),
  ...(HAS_PLANTS ? [`${STUDIO_ASSETS}/plants.webp`] : []),
  ...(HAS_LIGHT ? [`${STUDIO_ASSETS}/lut.png`] : []),
]
const BACKGROUND = new Color().setRGB(...manifest.background, LinearSRGBColorSpace)
// What he types on the monitor: the shader that draws this room. Each visit starts somewhere in the middle of it.
const CODE = normaliseSource(roomFragment)
const CODE_LINES = lineStarts(CODE)

// Importing this module starts the downloads, so the homepage's prefetch fetches the assets too
useGLTF.preload(GLB_URL, DRACO_PATH)
useTexture.preload(TEXTURE_URLS)

const prefersReducedMotion = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches
// `/os?app=studio&rest` freezes everything in the render's own pose, to diff the room against the Cycles reference
const restPose = () => new URLSearchParams(window.location.search).has('rest')
// `/os?app=studio&clip=walk` plays one motion clip on the rug, to check how a clip fits him
const clipToCheck = () => new URLSearchParams(window.location.search).get('clip')
const CLIP_CHECK = Object.freeze({ from: [1.2, 0, 0.2], yaw: Math.PI / 2, length: 2.2 }) // across the rug toward the window wall
// `/os?app=studio&live` lights him live all the time, even seated, to compare the live light with the render
const forceLive = () => new URLSearchParams(window.location.search).has('live')
// `/os?app=studio&at=<seconds>` freezes everything at one moment of his session, to check a pose
const frozenAt = () => {
  const value = new URLSearchParams(window.location.search).get('at')
  return value === null ? null : Number(value)
}

const holdRestPose = (studio) => {
  for (const { sway } of studio.swaying) sway.uSwayScale.value = 0
  studio.shared.uniforms.uCandleGain.value = 1
  studio.shared.uniforms.uFigureGone.value = 0
  studio.shared.uniforms.uScreenOff.value = 0
  studio.shared.uniforms.uLiveLight.value = forceLive() ? 1 : 0
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

/**
 * His whole pose for this frame, and what it does to the room: his shadow lifting as he rolls away, the
 * monitor's mode and brightness, headphones on his head. Under reduced motion he sits still at the keyboard.
 * Returns what he's doing (the night's block), or null.
 */
const poseFigure = (studio, timeline, night, frame, { time, still }) => {
  if (!studio.figure) return null
  const { rig, poser, headphones, contact, axis } = studio.figure
  if (still) {
    rig.pose()
    return null
  }
  const block = night ? night.activityAt(time) : null
  const { angles, reach, root, extras } = poser(timeline.at(time), time, block)
  const { typing: typingClip, seated: seatedClips, mixClips } = studio.figure
  const typing = typingClip ? typingClip.pose(extras.typing) : null
  const s = extras.seated
  const seated = s && seatedClips?.[s.name] ? seatedClips[s.name].pose(s.time, s.weight, s.weight, s.lift, [s.breath, 0, 0]) : null
  // in a mouse pause the clip's own trip to its mouse holds it, not his coded scroll
  const byClip = typingClip?.hasVisits && extras.typing.visit ? { ...extras, mouseHold: 0 } : extras
  const clip = holdMouse(studio.figure, angles, byClip, mixClips ? mixClips(typing, seated) : typing)
  rig.pose(angles, reach, root, clip)
  const at = studio.figure.mouseRig?.prop.at
  if (at) rig.matrices[studio.figure.mouseRig.bone].makeTranslation(at[0], at[1], at[2])
  const { uniforms } = studio.shared
  uniforms.uFigureGone.value = extras.away
  uniforms.uScreenOff.value = 1 - extras.screen.level
  uniforms.uLiveLight.value = frame.live ? 1 : extras.live
  frame.screen = extras.screen
  if (headphones) {
    headphones.object.visible = extras.phones > 0
    if (headphones.object.visible) headphones.object.matrix.copy(rig.matrices[headphones.bone])
  }
  if (contact) contact.place(root ? carry(axis, { axis, root }) : axis, extras.away)
  return block
}

/** `?clip=`: the clip alone, walking him across the rug (out of the chair: lit live, his seated shadow gone). */
const poseClipCheck = (studio, motion, name, time) => {
  const { rig, contact } = studio.figure
  const clip = motion.data.clips[name]
  if (!clip) return false
  const { bones, scratch, posed } = motion.perClip[name]
  sampleClip(clip, time, scratch)
  const along = clip.speed ? (clip.speed * time) % CLIP_CHECK.length : 0
  const dir = [-Math.sin(CLIP_CHECK.yaw), 0, -Math.cos(CLIP_CHECK.yaw)]
  const at = CLIP_CHECK.from.map((v, i) => v + dir[i] * along)
  const stage = stageMatrix(motion.data.stage, { at, yaw: CLIP_CHECK.yaw })
  const set = new Map()
  bones.forEach((bone, k) => set.set(bone, posed[k].multiplyMatrices(stage, scratch[k])))
  rig.pose({}, null, null, { bones: set, weight: 1 })
  const { uniforms } = studio.shared
  uniforms.uLiveLight.value = 1
  uniforms.uBodyGone.value = 1
  uniforms.uEmptyChair.value = 1
  contact?.place(at, 0.6)
  return true
}

/** Motion clips, fetched once the room is up. The typing clip becomes how he types. */
const useMotion = (figure, bones) => {
  const [motion, setMotion] = useState(null)
  useEffect(() => {
    if (!manifest.motion || !bones) return undefined
    let cancelled = false
    fetch(`${STUDIO_ASSETS}/${manifest.motion.file}`)
      .then((response) => response.arrayBuffer())
      .then((buffer) => {
        if (cancelled) return
        const data = decodeMotion(buffer, manifest.motion)
        const perClip = Object.fromEntries(
          Object.entries(data.clips).map(([name, clip]) => [
            name,
            {
              bones: clip.tracks.map((track) => bones.findIndex((b) => b.name === track)),
              scratch: clip.tracks.map(() => new Matrix4()),
              posed: clip.tracks.map(() => new Matrix4()),
            },
          ]),
        )
        if (data.clips.typing && figure) {
          figure.typing = createTypingClip(data.clips.typing, bones, mouseReachOf(manifest.figure))
          // the break's clips: from the same typist at the same desk, so his hands lift onto the keys the same way
          figure.seated = Object.fromEntries(
            ['typeToSit', 'sitToType'].filter((n) => data.clips[n]).map((n) => [n, createSeatedClip(data.clips[n], bones, figure.typing.lift)]),
          )
          figure.mixClips = createClipMixer()
        }
        setMotion({ data, perClip })
      })
    return () => {
      cancelled = true
    }
  }, [figure, bones])
  return motion
}

const NO_MOVE = [0, 0, 0]
/**
 * The mouse this frame: held by his hand (typing clip, scrolling, a game) it moves exactly as his hand moves it,
 * and his hand goes where it is, palm flat, fingers draped; let go, it stays put. Returns the clip pose to use.
 */
const holdMouse = (figure, angles, extras, clip) => {
  const { mouseRig, mouseFingers } = figure
  if (!mouseRig) return clip
  const typingShare = clip?.mouse ? clip.mouse.share * clip.weight : 0
  const byClip = typingShare > extras.mouseHold
  const move = byClip ? [clip.mouse.play.x, 0, clip.mouse.play.z] : (extras.mouseAim ?? NO_MOVE)
  const at = mouseRig.prop.update(Math.max(extras.mouseHold, typingShare), move, byClip)
  if (!clip?.mouse || typingShare <= 0) return clip
  // the clip's hand goes to the mouse where it is now, and holds it the way he does
  const wrist = new Vector3(mouseRig.spot[0] + at[0], mouseRig.spot[1], mouseRig.spot[2] + at[2])
  const weights = new Map(clip.weights)
  mouseFingers.forEach(([a, b, c]) => {
    angles[manifest.figure.bones[a].name] = [POSE.mouseFingers[0], 0]
    angles[manifest.figure.bones[b].name] = [POSE.mouseFingers[1], 0]
    angles[manifest.figure.bones[c].name] = [POSE.mouseFingers[1] * POSE.tipFollows, 0]
    for (const bone of [a, b, c]) weights.set(bone, clip.weight * (1 - clip.mouse.share))
  })
  return { ...clip, weights, mouse: { ...clip.mouse, wrist } }
}

/** Desktop happenings as nudges on the room clock: each stretch of music playing, each time Minecraft is open. */
const useNudges = (clock, { music, minecraft }) => {
  const [nudges, setNudges] = useState([])
  const follow = (kind, on) => {
    setNudges((list) => {
      const open = list.findLast((n) => n.kind === kind && n.end === undefined)
      if (on && !open) return [...list, { kind, start: clock.time }]
      if (!on && open) return list.map((n) => (n === open ? { ...n, end: clock.time } : n))
      return list
    })
  }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => follow(NUDGE.MUSIC, music), [music])
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => follow(NUDGE.MINECRAFT, minecraft), [minecraft])
  return nudges
}

/**
 * onActivity(activity): called when what he's doing changes (moods.ACTIVITY); music / minecraft: whether a
 * track is playing and a Minecraft window is open on the desktop, which nudge him.
 */
export function StudioScene({ onReady, quality, onActivity = null, music = false, minecraft = false }) {
  const { gl, camera } = useThree()
  const { scene } = useGLTF(GLB_URL, DRACO_PATH)
  const textures = useTexture(TEXTURE_URLS)
  const [base, deltas = null, plants = null] = textures
  const lut = HAS_LIGHT ? textures[TEXTURE_URLS.length - 1] : null
  const travel = useRef(0)
  const reducedMotion = useMemo(prefersReducedMotion, [])
  const rest = useMemo(restPose, [])
  const at = useMemo(frozenAt, [])
  const session = useMemo(() => sessionFromUrl(window.location.search, CODE_LINES.length), [])
  const typing = useMemo(
    () => createTypingTimeline(CODE, { seed: session.seed, startAt: CODE_LINES[session.openingLine] }),
    [session],
  )
  const clock = useMemo(() => createSessionClock(at), [at])
  const nudges = useNudges(clock, { music, minecraft })
  // His night: when he codes and when he's off doing something else. The typing waits while he's away, so
  // body and monitor both read the code through it.
  const night = useMemo(
    () =>
      reducedMotion || rest
        ? null
        : planNight({ seed: session.seed, timeline: typing, reference: session.reference, first: session.first, nudges }),
    [reducedMotion, rest, session, typing, nudges],
  )
  const frame = useMemo(() => ({ screen: null, live: forceLive(), clip: clipToCheck() }), [])
  const doing = useRef(null)
  const timeline = useMemo(() => (night ? { ...typing, at: (t) => typing.at(night.codeTimeAt(t)) } : typing), [typing, night])

  const studio = useMemo(
    () =>
      buildStudio({
        manifest,
        plateViewProj: plateViewProjection(manifest.camera.matrix, PLATE_HALF_TAN),
        scene,
        base: preparePlate(base),
        deltas: deltas && preparePlate(deltas, { mipmaps: false }),
        plants: plants && preparePlate(plants),
        lutImage: lut?.image ?? null,
        hazeSteps: quality.hazeSteps,
        pixelRatio: gl.getPixelRatio(),
        seed: session.seed,
      }),
    // Quality changes are applied below without rebuilding
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [scene, base, deltas, plants, gl],
  )
  useEffect(() => () => studio.dispose(), [studio])
  const motion = useMotion(studio.figure, studio.figure ? manifest.figure.bones : null)

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

  // First of all (priority -1): the room's clock, which every other loop reads
  useFrame((_, delta) => clock.tick(delta), -1)

  // Priority 1: this loop renders the frame itself (shadow passes first, then the room)
  useFrame((state, delta) => {
    const time = clock.time
    if (rest) holdRestPose(studio)
    else {
      const step = reducedMotion || at !== null ? 0 : delta
      advance(studio, { time, motionTime: reducedMotion ? 0 : time, delta: step, travel })
      const checking = frame.clip && motion && poseClipCheck(studio, motion, frame.clip, time)
      const block = checking ? null : poseFigure(studio, timeline, night, frame, { time, still: reducedMotion })
      const activity = block?.activity ?? ACTIVITY.CODE
      if (activity !== doing.current) {
        doing.current = activity
        onActivity?.(activity)
      }
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
      {studio.figure?.headphones && <primitive object={studio.figure.headphones.object} />}
      {studio.figure?.contact && <primitive object={studio.figure.contact.object} />}
      <PhoneClock clock={manifest.clock} />
      {manifest.monitor && !rest && <MonitorCode monitor={manifest.monitor} timeline={timeline} reducedMotion={reducedMotion} clock={clock} frame={frame} />}
    </>
  )
}
