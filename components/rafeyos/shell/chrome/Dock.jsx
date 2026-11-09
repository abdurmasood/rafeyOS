import { memo, useCallback, useEffect, useState } from 'react'
import { useDockRegistry, useLayout, useServices, useShellDispatch, useShellState, useVfs, useWindowManager, useWindowsState } from '@/components/rafeyos/state/logic/contexts'
import { APP, DOCK_FAVORITES, getApp, isImplemented } from '@/components/rafeyos/core/catalog/apps'
import { runningApps, windowsForApp } from '@/components/rafeyos/state/logic/selectors'
import { TRASH } from '@/components/rafeyos/core/vfs/buildVfs'
import { children } from '@/components/rafeyos/core/vfs/queries'
import { AppIcon } from '@/components/rafeyos/ui/icons/appIcons'
import { rectOfElement } from '@/components/rafeyos/ui/logic/dom'
import { useMenu } from '@/components/rafeyos/ui/menus/logic/useMenu'
import { dockMenuItems, dockMenuPlacement } from '@/components/rafeyos/ui/menus/logic/menus'
import { menuItem } from '@/components/rafeyos/ui/menus/logic/menuItems'
import { useEmptyTrash } from '@/components/rafeyos/ui/menus/logic/useTrashActions'
import { OVERVIEW_MODES } from '@/components/rafeyos/wm/logic/overviewModel'
import { SHELL_ACTIONS } from '@/components/rafeyos/state/logic/shellReducer'
import { useDockMagnify } from './logic/useDockMagnify'
import { useDockSounds } from './logic/useDockSounds'

const MAX_DOTS = 4
// Matches .dk's calc(var(--icon) + 6px): the button the magnifier grows from
const BUTTON_INSET = 6
const TRASH_KEY = 'trash'
const SHOW_APPS_KEY = 'apps'
// Trash and Show Apps swell as their own group, apart from the apps
const SYSTEM_KEYS = Object.freeze([TRASH_KEY, SHOW_APPS_KEY])
// The .bounce animation's length in shell.css
export const BOUNCE_MS = 900

const buttonClassName = ({ focused = false, hot = false, bouncing = false }) =>
  ['dk', focused && 'focused', hot && 'hot', bouncing && 'bounce'].filter(Boolean).join(' ')

/**
 * Pointer and focus wiring that makes a dock button the hovered one. Touch never magnifies, and nor does focus that
 * isn't :focus-visible: a menu item picked with the mouse hands focus back to its dock icon, away from the pointer.
 */
const magnifyHandlers = (key, { hover, point, blur }) => ({
  onPointerEnter: (event) => event.pointerType !== 'touch' && point(key),
  onFocus: (event) => event.currentTarget.matches(':focus-visible') && hover(key),
  onBlur: blur,
})

/** Favourites with a UI, then running apps that aren't favourites. */
export const dockApps = (windows) => [
  ...DOCK_FAVORITES.filter(isImplemented),
  ...runningApps(windows).filter((id) => !DOCK_FAVORITES.includes(id) && getApp(id).inDock),
]

const DockButton = memo(function DockButton({ appId, count, focused, hot, bouncing, magnify, onActivate, onMenu }) {
  const registry = useDockRegistry()
  const { name } = getApp(appId)
  const { bindElement } = magnify
  const register = useCallback(
    (element) => {
      if (element) registry.set(appId, element)
      else registry.delete(appId)
      bindElement(appId, element)
    },
    [registry, appId, bindElement],
  )
  return (
    <button
      type="button"
      ref={register}
      className={buttonClassName({ focused, hot, bouncing })}
      data-name={name}
      aria-label={name}
      {...magnifyHandlers(appId, magnify)}
      onClick={(event) => onActivate(appId, rectOfElement(event.currentTarget))}
      onContextMenu={(event) => {
        event.preventDefault()
        onMenu(appId, rectOfElement(event.currentTarget))
      }}
    >
      <span className="b">
        <AppIcon name={appId} tile />
      </span>
      {count > 0 && (
        <span className="dots" data-testid={`dots-${appId}`}>
          {Array.from({ length: Math.min(count, MAX_DOTS) }, (_, i) => <i key={i} />)}
        </span>
      )}
    </button>
  )
})

/** Right-click on a dock icon: the shell-styled menu beside (or above) the dock. */
const useDockMenu = (windows, dockPos) => {
  const windowManager = useWindowManager()
  const openMenu = useMenu()
  return useCallback(
    (appId, buttonRect) => {
      const appWindows = windowsForApp(windows, appId)
      const items = dockMenuItems({
        windows: appWindows,
        show: (win) => (win.minimized ? windowManager.restore(win.id) : windowManager.focus(win.id)),
        newWindow: () => windowManager.openApp(appId),
        quit: () => appWindows.forEach((win) => windowManager.close(win.id)),
      })
      const { point, anchorBottom } = dockMenuPlacement(buttonRect, dockPos)
      openMenu(items, point, { shell: true, anchorBottom, dockKey: appId })
    },
    [windows, dockPos, windowManager, openMenu],
  )
}

/** Show Apps opens the overview's app grid, or closes it when the grid is already up. */
const ShowAppsButton = ({ hot, magnify }) => {
  const { overview } = useShellState()
  const shellDispatch = useShellDispatch()
  const showing = overview?.mode === OVERVIEW_MODES.APPS
  const { bindElement } = magnify
  const bind = useCallback((element) => bindElement(SHOW_APPS_KEY, element), [bindElement])
  return (
    <button
      type="button"
      ref={bind}
      className={buttonClassName({ focused: showing, hot })}
      data-name="Show Apps"
      aria-label="Show Apps"
      aria-pressed={showing}
      {...magnifyHandlers(SHOW_APPS_KEY, magnify)}
      onClick={() => shellDispatch(showing ? { type: SHELL_ACTIONS.CLOSE_OVERVIEW } : { type: SHELL_ACTIONS.OPEN_OVERVIEW, mode: OVERVIEW_MODES.APPS })}
    >
      <span className="b">
        <AppIcon name="apps" tile />
      </span>
    </button>
  )
}

/** The bin: opens Files at Trash; its menu empties it. */
const TrashButton = ({ hot, magnify, dockPos, onOpen }) => {
  const { vfs } = useVfs()
  const openMenu = useMenu()
  const emptyTrash = useEmptyTrash()
  const { bindElement } = magnify
  const bind = useCallback((element) => bindElement(TRASH_KEY, element), [bindElement])
  return (
    <button
      type="button"
      ref={bind}
      className={buttonClassName({ hot })}
      data-name="Trash"
      aria-label="Trash"
      {...magnifyHandlers(TRASH_KEY, magnify)}
      onClick={onOpen}
      onContextMenu={(event) => {
        event.preventDefault()
        const { point, anchorBottom } = dockMenuPlacement(rectOfElement(event.currentTarget), dockPos)
        openMenu([menuItem('Empty Trash', emptyTrash)], point, { shell: true, anchorBottom, dockKey: TRASH_KEY })
      }}
    >
      <span className="b">
        <AppIcon name="trash" tile full={children(vfs, TRASH).length > 0} />
      </span>
    </button>
  )
}

export const Dock = () => {
  const windows = useWindowsState()
  const { dockPos, iconSize } = useLayout()
  const { reducedMotion } = useServices()
  const windowManager = useWindowManager()
  const shellDispatch = useShellDispatch()
  const openDockMenu = useDockMenu(windows, dockPos)
  const focusedApp = windows.byId[windows.focusedId]?.appId ?? null
  const apps = dockApps(windows)
  const { hot, controls: magnify } = useDockMagnify({ groups: [apps, SYSTEM_KEYS], rest: iconSize + BUTTON_INSET, reduced: reducedMotion })
  const playClick = useDockSounds(hot)
  // A right-clicked icon stays swollen until its menu closes (an item chosen, or a click elsewhere)
  const heldKey = useShellState().menu?.dockKey ?? null
  useEffect(() => magnify.hold(heldKey), [magnify, heldKey])
  const [bouncing, setBouncing] = useState(null)
  // A timer, not animationend: that never fires in a hidden tab, which would leave the class stuck
  useEffect(() => {
    if (!bouncing) return undefined
    const timer = setTimeout(() => setBouncing(null), BOUNCE_MS)
    return () => clearTimeout(timer)
  }, [bouncing])
  // Dock clicks leave the overview first, then act as usual
  const leaveShell = useCallback(() => {
    shellDispatch({ type: SHELL_ACTIONS.CLOSE_TRANSIENTS })
    shellDispatch({ type: SHELL_ACTIONS.CLOSE_OVERVIEW })
  }, [shellDispatch])
  // Launching an app that isn't running bounces its icon, the way the macOS dock does
  const activate = useCallback(
    (appId, from) => {
      const launching = windowsForApp(windows, appId).length === 0
      leaveShell()
      windowManager.activateApp(appId, from)
      if (launching && !reducedMotion()) setBouncing(appId)
    },
    [windows, leaveShell, windowManager, reducedMotion],
  )
  const openTrash = (event) => {
    leaveShell()
    windowManager.openApp(APP.FILES, { path: TRASH, from: rectOfElement(event.currentTarget) })
  }
  return (
    <div className={`dock ${dockPos}`} role="toolbar" aria-label="Dock" onPointerLeave={magnify.leave} onClick={playClick}>
      {apps.map((appId) => (
        <DockButton
          key={appId}
          appId={appId}
          count={windowsForApp(windows, appId).length}
          focused={focusedApp === appId}
          hot={hot === appId}
          bouncing={bouncing === appId}
          magnify={magnify}
          onActivate={activate}
          onMenu={openDockMenu}
        />
      ))}
      <div className="dsep" />
      <TrashButton hot={hot === TRASH_KEY} magnify={magnify} dockPos={dockPos} onOpen={openTrash} />
      <ShowAppsButton hot={hot === SHOW_APPS_KEY} magnify={magnify} />
    </div>
  )
}
