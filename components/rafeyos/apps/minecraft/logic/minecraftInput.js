// Mouse and keyboard for Minecraft: pointer lock (or drag-to-look where the browser refuses it), held movement keys,
// break and place with hold-to-repeat, and picking a block with 1–9 or the wheel. Input only counts while the window
// is active and the player has clicked in; losing either lets go of the mouse and every held key.

export const HOLD_REPEAT = 250
// Chrome refuses a new pointer lock for about a second after Esc; a refusal that soon is no reason to give up on it
const RELOCK_COOLDOWN = 1500
// A drag-look press that moved less than this many pixels was a click, so it breaks a block
const DRAG_CLICK = 4

/**
 * @param {{
 *   canvas: HTMLCanvasElement, doc: Document, win: Window, now: () => number,
 *   on: { turn: (dx: number, dy: number) => void, breakBlock: () => void, placeBlock: () => void,
 *         select: (slot: number) => void, scroll: (step: number) => void, playingChanged: (playing: boolean) => void },
 * }} deps
 */
export const createMinecraftInput = ({ canvas, doc, win, now, on }) => {
  const keys = new Set()
  const held = new Map()
  let active = false
  let locked = false
  let dragMode = typeof canvas.requestPointerLock !== 'function'
  let dragEngaged = false
  let drag = null
  let lastUnlock = -Infinity
  let wasPlaying = false
  // Captured but muted: the mouse is taken, yet nothing reaches the game (the camera glide at the start)
  let muted = false

  const captured = () => active && (locked || (dragMode && dragEngaged))
  const playing = () => captured() && !muted
  const notify = () => {
    if (playing() === wasPlaying) return
    wasPlaying = playing()
    on.playingChanged(wasPlaying)
  }
  const release = () => {
    keys.clear()
    held.clear()
    drag = null
  }
  const fallBackToDrag = () => {
    if (now() - lastUnlock < RELOCK_COOLDOWN) return
    dragMode = true
    dragEngaged = true
    notify()
  }

  const capture = () => {
    if (dragMode) {
      dragEngaged = true
      notify()
      return
    }
    try {
      canvas.requestPointerLock()?.catch?.(fallBackToDrag)
    } catch {
      fallBackToDrag()
    }
  }

  const handlers = createHandlers({ now, on, keys, held, state: {
    playing,
    isLocked: () => locked && active && !muted,
    captured,
    isDragMode: () => dragMode,
    getDrag: () => drag,
    setDrag: (next) => { drag = next },
    disengage: () => { dragEngaged = false; release(); notify() },
    lockChanged: () => {
      locked = doc.pointerLockElement === canvas
      if (!locked) {
        lastUnlock = now()
        release()
      } else if (!active) doc.exitPointerLock?.()
      notify()
    },
    lockFailed: fallBackToDrag,
    release,
  } })
  const listen = (target, type, handler, options) => {
    target.addEventListener(type, handler, options)
    return () => target.removeEventListener(type, handler, options)
  }
  const unlisten = [
    listen(canvas, 'mousedown', handlers.mouseDown),
    listen(canvas, 'contextmenu', handlers.contextMenu),
    listen(canvas, 'wheel', handlers.wheel, { passive: false }),
    listen(doc, 'mousemove', handlers.mouseMove),
    listen(doc, 'mouseup', handlers.mouseUp),
    listen(doc, 'keydown', handlers.keyDown),
    listen(doc, 'keyup', handlers.keyUp),
    listen(doc, 'pointerlockchange', handlers.lockChange),
    listen(doc, 'pointerlockerror', handlers.lockError),
    listen(win, 'blur', release),
  ]

  return Object.freeze({
    capture,
    isPlaying: playing,
    /** @param {boolean} next - true holds every input back while the mouse stays captured */
    setMuted: (next) => {
      muted = next
      if (muted) release()
      notify()
    },
    /** @param {boolean} next - false while another window, the overview or a menu has the keyboard */
    setActive: (next) => {
      active = next
      if (!active) {
        dragEngaged = false
        release()
        if (locked) doc.exitPointerLock?.()
      }
      notify()
    },
    /** Repeats a held break or place every HOLD_REPEAT ms. @param {number} time */
    tick: (time) => {
      for (const [button, since] of held) {
        if (time - since < HOLD_REPEAT) continue
        if (button === 0) on.breakBlock()
        else on.placeBlock()
        held.set(button, time)
      }
    },
    /** @returns {import('./physics').MoveInput} */
    moveInput: () => ({
      forward: (keys.has('KeyW') ? 1 : 0) - (keys.has('KeyS') ? 1 : 0),
      strafe: (keys.has('KeyD') ? 1 : 0) - (keys.has('KeyA') ? 1 : 0),
      jump: keys.has('Space'),
      sprint: keys.has('ShiftLeft') || keys.has('ShiftRight'),
    }),
    dispose: () => {
      unlisten.forEach((stop) => stop())
      if (locked) doc.exitPointerLock?.()
      release()
    },
  })
}

/** The DOM listeners, kept apart so createMinecraftInput stays readable. */
const createHandlers = ({ now, on, keys, held, state }) => ({
  mouseDown: (event) => {
    if (!state.playing()) return
    if (state.isDragMode() && event.button === 0) {
      state.setDrag({ x: event.clientX, y: event.clientY, moved: 0 })
      return
    }
    if (event.button === 0) on.breakBlock()
    else if (event.button === 2) on.placeBlock()
    else return
    held.set(event.button, now())
  },
  mouseMove: (event) => {
    if (state.isLocked()) {
      on.turn(event.movementX, event.movementY)
      return
    }
    const drag = state.getDrag()
    if (!drag) return
    on.turn(event.clientX - drag.x, event.clientY - drag.y)
    state.setDrag({ x: event.clientX, y: event.clientY, moved: drag.moved + Math.abs(event.clientX - drag.x) + Math.abs(event.clientY - drag.y) })
  },
  mouseUp: (event) => {
    const drag = state.getDrag()
    if (drag && event.button === 0) {
      if (drag.moved < DRAG_CLICK) on.breakBlock()
      state.setDrag(null)
    }
    held.delete(event.button)
  },
  contextMenu: (event) => event.preventDefault(),
  wheel: (event) => {
    if (!state.playing()) return
    event.preventDefault()
    on.scroll(event.deltaY > 0 ? 1 : -1)
  },
  keyDown: (event) => {
    // Esc gives the mouse back; under pointer lock the browser does that itself
    if (event.code === 'Escape' && state.isDragMode() && state.captured()) {
      state.disengage()
      return
    }
    if (!state.playing()) return
    if (event.code === 'Space' || event.code.startsWith('Arrow')) event.preventDefault()
    keys.add(event.code)
    const digit = /^Digit([1-9])$/.exec(event.code)
    if (digit) on.select(Number(digit[1]) - 1)
  },
  keyUp: (event) => keys.delete(event.code),
  lockChange: () => state.lockChanged(),
  lockError: () => state.lockFailed(),
})
