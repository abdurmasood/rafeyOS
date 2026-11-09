// What Minecraft draws over the world: crosshair, position, hotbar, the picked block's name, a note when a build couldn't
// be saved, and the cards that ask the player to click in, say the world is being built, or explain why it can't show
import { useEffect, useRef, useState } from 'react'
import { HOTBAR } from './logic/blockTypes'
import { ICON_SIZE, atlasCanvas, drawBlockIcon } from './logic/blockIcons'
import { paintAtlas } from './logic/texturePixels'
import { WORLD_STATUS } from './logic/worldStatus'

const NAME_SHOWN_FOR = 1200

// Status covers aren't clickable, so they drop the pointer cursor the play cover has
const STATUS_CARDS = Object.freeze({
  [WORLD_STATUS.LOADING]: { role: 'status', title: 'Building the world…' },
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
const CONTROLS = Object.freeze([
  ['W A S D', 'Walk'],
  ['Mouse', 'Look around'],
  ['Space', 'Jump, swim up'],
  ['Shift', 'Sprint'],
  ['Left click', 'Break the outlined block (hold to keep breaking)'],
  ['Right click', 'Place the selected block'],
  ['1 – 9, wheel', 'Pick a block'],
  ['Esc', 'Let go of the mouse'],
])

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

const PlayCard = ({ onPlay }) => (
  <div className="bk-cover" onClick={onPlay}>
    <div className="bk-card">
      <h2><button type="button" className="bk-play">Click to play</button></h2>
      <dl className="bk-keys">
        {CONTROLS.map(([key, action]) => (
          <div key={key}>
            <dt>{key}</dt>
            <dd>{action}</dd>
          </div>
        ))}
      </dl>
    </div>
  </div>
)

const StatusCard = ({ card }) => (
  <div className="bk-cover bk-still">
    <div className="bk-card" role={card.role}>
      <h2>{card.title}</h2>
      {card.text && <p>{card.text}</p>}
    </div>
  </div>
)

/**
 * @param {{
 *   hud: { playing: boolean, selected: number, position: string }, showCard: boolean,
 *   saveFailure: 'full' | 'blocked' | null, status: import('./logic/worldStatus').WorldStatus, onPlay: () => void,
 * }} props - `status`: one of WORLD_STATUS
 */
export const MinecraftHud = ({ hud, showCard, saveFailure, status, onPlay }) => {
  const named = useFlash(hud.selected, NAME_SHOWN_FOR)
  if (status !== WORLD_STATUS.READY) return <StatusCard card={STATUS_CARDS[status]} />
  return (
    <>
      <div className="bk-cross" aria-hidden="true" />
      {hud.position && <div className="bk-pos">{hud.position}</div>}
      {saveFailure && <div className="bk-unsaved" role="status">{SAVE_FAILURES[saveFailure]}</div>}
      <div className={named ? 'bk-name on' : 'bk-name'} aria-live="polite">{HOTBAR[hud.selected].label}</div>
      <div className="bk-bar" role="toolbar" aria-label="Hotbar">
        {HOTBAR.map(({ block, label }, i) => (
          <div key={label} className="bk-slot" aria-label={label} aria-current={i === hud.selected}>
            <BlockIcon block={block} />
            <b>{i + 1}</b>
          </div>
        ))}
      </div>
      {showCard && <PlayCard onPlay={onPlay} />}
    </>
  )
}
