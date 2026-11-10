'use client'

// The `singularity` program once its chunk has loaded: the engine's canvas, the flight it draws, the keys and
// pointer that steer it, and the few lines of text over it. Styled inline so it looks the same on the homepage and
// under rafeyOS's resets.
import { useCallback, useEffect, useRef, useState } from 'react'
import { MODE, applyDrag, applyWheel, createFlight, enter, stepFlight, viewOf } from '@/lib/singularity/flight'
import { KEY_HINT, readoutLine, screenText, statusLine } from '@/lib/singularity/readout'
import { WebGLUnavailableError, createSingularityEngine } from './singularityEngine'

const FONT = 'var(--font-terminal), ui-monospace, monospace'
const GREEN = '#39ff14'
/** Seconds of steering after which the key hint has done its job. */
const HINT_FADE_AFTER = 1.2
// Room for the touch row under the readout
const TAPS_HEIGHT = 44

/** The keys that move you while held, by `event.key` in lower case. */
const MOVE_KEYS = Object.freeze({
  w: 'inward', s: 'outward', a: 'left', arrowleft: 'left', d: 'right', arrowright: 'right', arrowup: 'up', arrowdown: 'down',
})
/** The touch row: each control holds the key it stands for. */
const TAPS = Object.freeze([['closer', 'w'], ['further', 's'], ['left', 'a'], ['right', 'd'], ['up', 'arrowup'], ['down', 'arrowdown']])

// Text sits on black so it reads over the characters behind it
const OVERLAY = Object.freeze({ position: 'absolute', background: '#000', pointerEvents: 'none', boxSizing: 'border-box' })
const CENTRED = Object.freeze({ ...OVERLAY, left: '50%', transform: 'translateX(-50%)', textAlign: 'center', padding: '6px 12px' })
const STYLES = Object.freeze({
  root: {
    position: 'relative', width: '100%', height: '100%', overflow: 'hidden', boxSizing: 'border-box', background: '#000',
    color: '#fff', fontFamily: FONT, fontSize: 13, lineHeight: 1.55, userSelect: 'none', WebkitUserSelect: 'none',
  },
  host: { position: 'absolute', inset: 0 },
  screen: {
    ...OVERLAY, inset: 0, background: 'none', display: 'grid', placeContent: 'center', gap: 14, textAlign: 'center',
    fontSize: 15, padding: 24,
  },
  detail: { color: '#b5b5b5', fontSize: 13 },
  prompt: { color: GREEN, fontSize: 13 },
  status: { ...CENTRED, top: '12%', maxWidth: '86%' },
  hint: { ...CENTRED, bottom: '10%', maxWidth: '92%', color: '#cfcfcf', transition: 'opacity 0.8s' },
  readout: { ...OVERLAY, left: 14, padding: '4px 8px', fontSize: 12, color: '#9a9a9a', fontVariantNumeric: 'tabular-nums', whiteSpace: 'pre' },
  key: { font: 'inherit', color: GREEN, background: 'none', border: `1px solid ${GREEN}`, padding: '0 5px', margin: '0 1px' },
  taps: { position: 'absolute', left: 0, right: 0, bottom: 0, display: 'flex', flexWrap: 'wrap', justifyContent: 'center', columnGap: '2ch' },
  tap: {
    all: 'unset', boxSizing: 'border-box', minHeight: TAPS_HEIGHT, display: 'inline-flex', alignItems: 'center', cursor: 'pointer',
    color: '#cfcfcf', touchAction: 'none',
  },
})

const isCoarsePointer = () => typeof window !== 'undefined' && Boolean(window.matchMedia?.('(pointer: coarse)').matches)

/** The keys held, as the flight wants them. @param {Set<string>} held */
const inputOf = (held) => {
  const input = {}
  for (const key of held) input[MOVE_KEYS[key]] = true
  return input
}

/** Everything the overlays show for this instant, with a signature so an unchanged frame doesn't render again. */
const hudOf = (flight, input) => {
  const hud = {
    mode: flight.mode, screen: screenText(flight), readout: readoutLine(flight), status: statusLine(flight, input),
    hintFaded: flight.moved > HINT_FADE_AFTER,
  }
  return { ...hud, signature: JSON.stringify(hud) }
}

/** Calls `onExit` once, however many ways the program is left. */
const useExit = (onExit) => {
  const doneRef = useRef(false)
  const onExitRef = useRef(onExit)
  onExitRef.current = onExit
  return useCallback((result) => {
    if (doneRef.current) return
    doneRef.current = true
    onExitRef.current(result)
  }, [])
}

/** The flight, the keys held, and the engine drawing it in `hostRef`; `hud` is what the overlays show. */
const useSimulation = (hostRef, exit) => {
  const flightRef = useRef(null)
  if (!flightRef.current) flightRef.current = createFlight()
  const heldRef = useRef(null)
  if (!heldRef.current) heldRef.current = new Set()
  const [hud, setHud] = useState(() => hudOf(flightRef.current, {}))
  const publish = useCallback(() => {
    const next = hudOf(flightRef.current, inputOf(heldRef.current))
    setHud((shown) => (shown.signature === next.signature ? shown : next))
  }, [])
  const pressEnter = useCallback(() => {
    if (enter(flightRef.current)) exit({})
    // Shown now, not at the next frame: a hidden tab draws none
    publish()
  }, [exit, publish])

  useEffect(() => {
    const onFrame = (dt) => {
      stepFlight(flightRef.current, inputOf(heldRef.current), dt)
      publish()
      return viewOf(flightRef.current)
    }
    try {
      const engine = createSingularityEngine({ host: hostRef.current, onFrame })
      return () => engine.dispose()
    } catch (error) {
      if (!(error instanceof WebGLUnavailableError)) throw error
      exit({ failed: true })
      return undefined
    }
  }, [hostRef, exit, publish])

  return { flightRef, heldRef, hud, pressEnter }
}

/** Keys from the window: held ones steer, enter starts and ends, q, escape and Ctrl+C leave. */
const useKeys = ({ heldRef, ownsKey, pressEnter, exit }) => {
  // Read through a ref so the window listeners are attached once and never see a stale `ownsKey`
  const latestRef = useRef(null)
  latestRef.current = { ownsKey, pressEnter }

  useEffect(() => {
    const held = heldRef.current
    // The Enter that ran `singularity` is still bubbling when this mounts; without this it would skip the title
    const mountedAt = performance.now()
    const onKeyDown = (event) => {
      if (event.timeStamp < mountedAt || !latestRef.current.ownsKey(event)) return
      const key = event.key.toLowerCase()
      // Ctrl+C leaves, as it does the terminal's other programs; with Shift it is copy
      const interrupts = event.ctrlKey && !event.shiftKey && !event.metaKey && !event.altKey && key === 'c'
      if (!interrupts && (event.metaKey || event.ctrlKey || event.altKey)) return
      if (interrupts || key === 'q' || key === 'escape') exit({})
      else if (key === 'enter') {
        if (!event.repeat) latestRef.current.pressEnter()
      } else if (Object.hasOwn(MOVE_KEYS, key)) held.add(key)
      else return
      event.preventDefault()
    }
    // Not asked of `ownsKey`: a key let go after its window lost focus must still be let go
    const onKeyUp = (event) => held.delete(event.key.toLowerCase())
    const releaseAll = () => held.clear()
    window.addEventListener('keydown', onKeyDown)
    window.addEventListener('keyup', onKeyUp)
    window.addEventListener('blur', releaseAll)
    return () => {
      window.removeEventListener('keydown', onKeyDown)
      window.removeEventListener('keyup', onKeyUp)
      window.removeEventListener('blur', releaseAll)
      releaseAll()
    }
  }, [heldRef, exit])
}

/** Dragging orbits and the wheel moves in and out; on the title and end screens a press is enter. */
const usePointer = ({ hostRef, flightRef, pressEnter }) => {
  const dragRef = useRef(null)

  useEffect(() => {
    const host = hostRef.current
    const onWheel = (event) => {
      if (applyWheel(flightRef.current, event.deltaY)) event.preventDefault()
    }
    // React's own wheel listener is passive, and a passive one can't stop the terminal behind from scrolling
    host.addEventListener('wheel', onWheel, { passive: false })
    return () => host.removeEventListener('wheel', onWheel)
  }, [hostRef, flightRef])

  const endDrag = () => {
    dragRef.current = null
  }
  return {
    onPointerDown: (event) => {
      const { mode } = flightRef.current
      if (mode === MODE.TITLE || mode === MODE.END) return pressEnter()
      dragRef.current = { x: event.clientX, y: event.clientY }
      // Keeps the drag when the pointer leaves the canvas
      return event.target.setPointerCapture?.(event.pointerId)
    },
    onPointerMove: (event) => {
      const drag = dragRef.current
      if (!drag) return
      applyDrag(flightRef.current, event.clientX - drag.x, event.clientY - drag.y)
      dragRef.current = { x: event.clientX, y: event.clientY }
    },
    onPointerUp: endDrag,
    onPointerCancel: endDrag,
  }
}

function Segments({ segments }) {
  return segments.map((segment, index) =>
    segment.key ? <kbd key={index} style={STYLES.key}>{segment.text}</kbd> : <span key={index}>{segment.text}</span>)
}

/** The title before the flight and the end after it, centred. */
function Screen({ screen }) {
  return (
    <div style={STYLES.screen}>
      <div>{screen.line}</div>
      {screen.detail && <div style={STYLES.detail}>{screen.detail}</div>}
      {screen.prompt && <div style={STYLES.prompt}>{screen.prompt}</div>}
    </div>
  )
}

/** Phones have no keys: controls that move you while held, and a way out. */
function Taps({ flying, heldRef, pressEnter, exit }) {
  const hold = (name) => (event) => {
    // Or a long press selects the label
    event.preventDefault()
    heldRef.current.add(name)
  }
  const letGo = (name) => () => heldRef.current.delete(name)
  return (
    <div className="singularity-taps" style={STYLES.taps}>
      {flying ? TAPS.map(([label, name]) => (
        <button
          key={name} type="button" style={STYLES.tap}
          onPointerDown={hold(name)} onPointerUp={letGo(name)} onPointerLeave={letGo(name)} onPointerCancel={letGo(name)}
        >[ {label} ]</button>
      )) : <button type="button" style={STYLES.tap} onClick={pressEnter}>[ enter ]</button>}
      <button type="button" style={STYLES.tap} onClick={() => exit({})}>[ quit ]</button>
    </div>
  )
}

/** The text over the canvas for the flight's current state. */
function Overlays({ hud, coarse }) {
  const flying = hud.mode === MODE.HOVER || hud.mode === MODE.FALL
  return (
    <>
      {flying && <div style={{ ...STYLES.readout, bottom: coarse ? TAPS_HEIGHT + 12 : 12 }}>{hud.readout}</div>}
      {/* The touch row already names the controls */}
      {hud.mode === MODE.HOVER && !coarse && (
        <div className="text-[13px] max-[760px]:text-[11px]" style={{ ...STYLES.hint, opacity: hud.hintFaded ? 0 : 1 }}>
          <Segments segments={KEY_HINT} />
        </div>
      )}
      <div className="text-[14px] max-[760px]:text-[11px]" style={{ ...STYLES.status, display: hud.status.length ? 'block' : 'none' }} aria-live="polite">
        <Segments segments={hud.status} />
      </div>
      {hud.screen && <Screen screen={hud.screen} />}
    </>
  )
}

/**
 * @param {{
 *   onExit: (result: { failed?: boolean }) => void, ownsKey?: (event: KeyboardEvent) => boolean,
 * }} props - `onExit`: called once, with `{}` when the visitor leaves and `{ failed: true }` when there is no WebGL;
 *   `ownsKey`: whether a key is this program's; on rafeyOS, only keys typed in its own window
 */
export function SingularityScene({ onExit, ownsKey = () => true }) {
  const hostRef = useRef(null)
  const [coarse] = useState(isCoarsePointer)
  const exit = useExit(onExit)
  const { flightRef, heldRef, hud, pressEnter } = useSimulation(hostRef, exit)
  useKeys({ heldRef, ownsKey, pressEnter, exit })
  const pointer = usePointer({ hostRef, flightRef, pressEnter })
  const flying = hud.mode === MODE.HOVER || hud.mode === MODE.FALL
  return (
    <div style={STYLES.root}>
      <div ref={hostRef} style={STYLES.host} {...pointer} />
      <Overlays hud={hud} coarse={coarse} />
      {coarse && <Taps flying={flying} heldRef={heldRef} pressEnter={pressEnter} exit={exit} />}
    </div>
  )
}
