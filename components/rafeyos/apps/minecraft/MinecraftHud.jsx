// What Minecraft draws over the world: the blackout it fades in from, the title over its scrim, the HUD (crosshair,
// position, hearts and air, hotbar, the picked block's name), a note when a build couldn't be saved, the pause,
// controls and death panels, and the cards that explain why the world can't show
import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { HOTBAR } from './logic/blockTypes'
import { ICON_SIZE, atlasCanvas, drawBlockIcon } from './logic/blockIcons'
import { paintAtlas } from './logic/texturePixels'
import { PANEL, STAGE } from './logic/useStartFlow'
import { WORLD_STATUS } from './logic/worldStatus'
import { ControlsPanel, DeathPanel, PausePanel, SHAPING_STATUS, TitleActions, TitleBlock } from './MinecraftMenus'
import { Vitals } from './MinecraftVitals'

const NAME_SHOWN_FOR = 1200

const format = (count) => count.toLocaleString('en-US')

const loadingStatus = (progress) => {
  if (!progress) return SHAPING_STATUS
  return `Building chunks · ${format(progress.done)} / ${format(progress.total)}`
}

const worldSummary = (editCount) => {
  if (editCount === 0) return '512 × 512 · New world'
  return `512 × 512 · ${format(editCount)} ${editCount === 1 ? 'block' : 'blocks'} changed`
}

const STATUS_CARDS = Object.freeze({
  [WORLD_STATUS.UNAVAILABLE]: {
    role: 'alert',
    title: "Minecraft can't start",
    text: "It needs WebGL, which this browser has turned off or doesn't support.",
  },
  [WORLD_STATUS.FAILED]: { role: 'alert', title: "Minecraft couldn't build its world", text: 'Close the window and open it again.' },
})
const SAVE_FAILURES = Object.freeze({
  full: "Not saved: this browser's storage is full.",
  blocked: 'Not saved: this browser blocked saving.',
})

// The atlas the icons are cut from, made once: undefined until tried, null where there's no 2D canvas
let iconAtlas
const getIconAtlas = (doc) => {
  if (iconAtlas === undefined) iconAtlas = atlasCanvas(doc, paintAtlas())
  return iconAtlas
}

const BlockIcon = ({ block }) => {
  const ref = useRef(null)
  useEffect(() => {
    const canvas = ref.current
    const atlas = getIconAtlas(canvas.ownerDocument)
    const ctx = atlas && canvas.getContext('2d')
    if (ctx) drawBlockIcon(ctx, atlas, block)
  }, [block])
  return <canvas ref={ref} width={ICON_SIZE.width} height={ICON_SIZE.height} aria-hidden="true" />
}

/** True for `ms` after `value` changes (not on mount), for the picked block's name. */
const useFlash = (value, ms) => {
  const [shown, setShown] = useState(false)
  const previous = useRef(value)
  useEffect(() => {
    if (previous.current === value) return undefined
    previous.current = value
    setShown(true)
    const timer = setTimeout(() => setShown(false), ms)
    return () => clearTimeout(timer)
  }, [value, ms])
  return shown
}

/** True from the frame after `ready`: the engine's first frame, so the blackout lifts as the fog does. */
const useLifted = (ready) => {
  const [lifted, setLifted] = useState(false)
  useEffect(() => {
    if (!ready) return undefined
    const frame = requestAnimationFrame(() => setLifted(true))
    return () => {
      cancelAnimationFrame(frame)
      setLifted(false)
    }
  }, [ready])
  return lifted
}

// Where focus goes when a surface takes over: its first button (Play, Resume, Back, Respawn)
const FIRST_BUTTON = Object.freeze({
  title: '.bk-title .btn', pause: '.bk-pause .btn', controls: '.bk-controls .btn', dead: '.bk-death .btn',
})

/** The surface that takes the keyboard: the title, the pause, death or controls panel; null while loading or in play. */
const surfaceOf = (ready, flow) => {
  if (!ready) return null
  if (flow.panel === PANEL.CONTROLS) return 'controls'
  if (flow.stage === STAGE.TITLE) return 'title'
  if (flow.dead) return 'dead'
  return flow.paused ? 'pause' : null
}

/**
 * Takes focus off a surface as it hides: to the first button of the surface replacing it, or nowhere once play takes
 * over. Left on a hidden button, Enter would still press it, and Chrome refuses the aria-hidden around it. Before
 * paint, so the hidden button never shows focused. Esc brings the pause panel up with nothing focused, so Resume
 * takes it then, as Respawn does when dying lets go of the mouse; not when leaving the window did, or it would pull
 * the keyboard back from where the player went.
 * @param {string | null} surface
 * @param {boolean} active
 * @param {{ pause: import('react').RefObject<HTMLButtonElement>, dead: import('react').RefObject<HTMLButtonElement> }} refs
 */
const useFocusHandoff = (surface, active, refs) => {
  // Read as the surface changes rather than watched: coming back to the window leaves focus where the click put it
  const activeRef = useRef(active)
  useLayoutEffect(() => {
    activeRef.current = active
  }, [active])
  useLayoutEffect(() => {
    const focused = document.activeElement
    const hidden = focused?.closest('.bk-title, .bk-panel')
    if (hidden?.getAttribute('aria-hidden') === 'true') {
      const next = surface && hidden.parentElement.querySelector(FIRST_BUTTON[surface])
      if (next) next.focus()
      else focused.blur()
    } else if (refs[surface] && activeRef.current) {
      refs[surface].current.focus()
    }
  }, [surface, refs])
}

const StatusCard = ({ card }) => (
  <div className="bk-cover">
    <div className="bk-card" role={card.role}>
      <h2>{card.title}</h2>
      {card.text && <p>{card.text}</p>}
    </div>
  </div>
)

/** Crosshair, position, hearts, hotbar and the picked block's name; faded out and hidden from readers off the game. */
const HudLayer = ({ hud, shown }) => {
  const named = useFlash(hud.selected, NAME_SHOWN_FOR)
  return (
    <div className={shown ? 'bk-hud' : 'bk-hud off'} aria-hidden={!shown || undefined}>
      <Vitals health={hud.health} air={hud.air} />
      <div className="bk-cross" aria-hidden="true" />
      {hud.position && <div className="bk-pos">{hud.position}</div>}
      <div className={named ? 'bk-name on' : 'bk-name'} aria-live="polite">{HOTBAR[hud.selected].label}</div>
      <div className="bk-bar" role="toolbar" aria-label="Hotbar">
        {HOTBAR.map(({ block, label }, i) => (
          <div key={label} className="bk-slot" aria-label={label} aria-current={i === hud.selected}>
            <BlockIcon block={block} />
            <b>{i + 1}</b>
          </div>
        ))}
      </div>
    </div>
  )
}

/**
 * The dim layer and the panels over it: Paused over a game that isn't being played, the death panel over one the
 * player died in, Controls wherever it was opened.
 */
const StartPanels = ({ flow, hud, refs }) => (
  <>
    <div className={flow.paused || flow.dead ? 'bk-dim shown' : 'bk-dim'} />
    <DeathPanel respawnRef={refs.dead} shown={flow.dead} cause={hud.cause ?? null} onRespawn={flow.respawn} />
    <PausePanel
      resumeRef={refs.pause}
      shown={flow.paused && flow.panel === PANEL.NONE}
      onResume={flow.resume}
      onControls={flow.openControls}
      onTitle={flow.backToTitle}
    />
    <ControlsPanel shown={flow.panel === PANEL.CONTROLS} onBack={flow.closeControls} />
  </>
)

/**
 * @param {{
 *   hud: import('./logic/engineHud').HudState, saveFailure: 'full' | 'blocked' | null,
 *   status: import('./logic/worldStatus').WorldStatus, progress: { done: number, total: number } | null,
 *   flow: ReturnType<typeof import('./logic/useStartFlow').useStartFlow>, active: boolean,
 * }} props - `status`: one of WORLD_STATUS; `progress`: the build so far, null before the first report; `active`: the
 *   window has the keyboard
 */
export const MinecraftHud = ({ hud, saveFailure, status, progress, flow, active }) => {
  const ready = status === WORLD_STATUS.READY
  const lifted = useLifted(ready)
  const resumeRef = useRef(null)
  const respawnRef = useRef(null)
  const refs = useRef({ pause: resumeRef, dead: respawnRef }).current
  useFocusHandoff(surfaceOf(ready, flow), active, refs)
  if (!ready && status !== WORLD_STATUS.LOADING) return <StatusCard card={STATUS_CARDS[status]} />
  const { stage, panel } = flow
  const onTitle = stage === STAGE.TITLE && panel === PANEL.NONE
  // Each layer keeps its slot from loading on, so the title stays one element and never jumps. The save note sits
  // outside the HUD layer so a failed save still shows on the title.
  return (
    <>
      <div className={lifted ? 'bk-blackout lift' : 'bk-blackout'} />
      <div className={onTitle ? 'bk-scrim' : 'bk-scrim off'} />
      {ready && <HudLayer hud={hud} shown={stage === STAGE.GAME} />}
      {saveFailure && <div className="bk-unsaved" role="status">{SAVE_FAILURES[saveFailure]}</div>}
      <TitleBlock status={ready ? worldSummary(flow.editCount) : loadingStatus(progress)} hidden={ready && !onTitle}>
        {ready && <TitleActions onPlay={flow.play} onControls={flow.openControls} />}
      </TitleBlock>
      {ready && <StartPanels flow={flow} hud={hud} refs={refs} />}
    </>
  )
}
