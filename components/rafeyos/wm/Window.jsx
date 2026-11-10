import { memo, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { useServices, useWindowManager } from '@/components/rafeyos/state/logic/contexts'
import { WINDOW_PHASES } from '@/components/rafeyos/state/logic/windowsReducer'
import { SNAP_MODES } from '@/components/rafeyos/core/geometry'
import { WindowChromeContext } from './logic/WindowChromeContext'
import { useWindowDrag } from './logic/useWindowDrag'
import { useWindowResize } from './logic/useWindowResize'
import { useWindowLifecycle } from './logic/useWindowLifecycle'
import { useOverviewTransform } from './logic/useOverviewTransform'
import { ResizeHandles } from './ResizeHandles'
import { AppBody } from './AppBody'
import { applyRect } from './logic/applyRect'

// How long the .anim transition runs when the max button or a double-click snaps the window
const SNAP_TRANSITION_MS = 230

/** The rect is written imperatively (gestures write the same style), on every committed change. */
const useRectStyle = (elementRef, rect) => {
  useLayoutEffect(() => applyRect(elementRef.current, rect), [elementRef, rect])
}

const useSnapTransition = () => {
  const [animating, setAnimating] = useState(false)
  useEffect(() => {
    if (!animating) return undefined
    const timer = setTimeout(() => setAnimating(false), SNAP_TRANSITION_MS)
    return () => clearTimeout(timer)
  }, [animating])
  return [animating, setAnimating]
}

const useChrome = ({ elementRef, winRef, isMax, minimized, focused, setAnimating }) => {
  const windowManager = useWindowManager()
  const { reducedMotion } = useServices()
  const startDrag = useWindowDrag({ elementRef, winRef })
  return useMemo(() => {
    const id = () => winRef.current.id
    const toggleMax = () => {
      if (!reducedMotion()) setAnimating(true)
      windowManager.toggleMax(id())
    }
    return {
      startDrag,
      toggleMax,
      isMax,
      // Apps that animate (Minecraft, Studio) pause while their window is minimized
      minimized,
      // Apps with window-level keys (Minecraft) only act on the focused window
      focused,
      minimize: () => windowManager.minimize(id()),
      close: () => windowManager.close(id()),
    }
  }, [winRef, windowManager, reducedMotion, startDrag, isMax, minimized, focused, setAnimating])
}

const classNameFor = ({ isMax, focused, animating }) =>
  ['win', isMax && 'max', !focused && 'backdrop', animating && 'anim'].filter(Boolean).join(' ')

/**
 * @param {{ win: object, zIndex: number, focused: boolean, overviewTarget?: object|null }} props -
 *   overviewTarget: where the Activities overview spreads this window, or null outside it
 */
export const Window = memo(function Window({ win, zIndex, focused, overviewTarget = null }) {
  const elementRef = useRef(null)
  const winRef = useRef(win)
  useLayoutEffect(() => {
    winRef.current = win
  }, [win])
  const windowManager = useWindowManager()
  const [animating, setAnimating] = useSnapTransition()
  const isMax = win.mode !== SNAP_MODES.NORMAL
  const chrome = useChrome({ elementRef, winRef, isMax, minimized: win.minimized, focused, setAnimating })
  const startResize = useWindowResize({ elementRef, winRef })
  useRectStyle(elementRef, win.rect)
  useWindowLifecycle(elementRef, win)
  const { reducedMotion } = useServices()
  useOverviewTransform(elementRef, { target: overviewTarget, rect: win.rect, minimized: win.minimized, reduced: reducedMotion() })
  const closing = win.phase === WINDOW_PHASES.CLOSING
  // role="dialog" (non-modal): a labelled, self-contained region of ordinary controls. "application"
  // would hand every key to the page and switch screen readers out of their reading mode.
  return (
    <div
      ref={elementRef}
      className={classNameFor({ isMax, focused: focused || closing, animating })}
      style={{ zIndex, pointerEvents: closing ? 'none' : undefined }}
      role="dialog"
      aria-label={win.title}
      data-app={win.appId}
      data-window-id={win.id}
      data-minimized={win.minimized || undefined}
      onPointerDown={() => focused || windowManager.focus(win.id)}
    >
      <WindowChromeContext.Provider value={chrome}>
        <div className="wcontent">
          <AppBody appId={win.appId} windowId={win.id} arg={win.arg} init={win.init} />
        </div>
      </WindowChromeContext.Provider>
      <ResizeHandles onStart={startResize} />
    </div>
  )
})
