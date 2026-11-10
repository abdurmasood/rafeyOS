// @ts-check
import { useVfs, useWindowManager } from '@/components/rafeyos/state/logic/contexts'
import { useOpenPath } from '@/components/rafeyos/ui/popups/logic/useOpenPath'
import { belowElement, pointOfEvent, useMenu } from '@/components/rafeyos/ui/menus/logic/useMenu'
import { pathCommands } from '@/components/rafeyos/ui/menus/logic/pathCommands'
import { fileMenuItems } from '@/components/rafeyos/ui/menus/logic/menus'
import { useEmptyTrash, useTrashActions } from '@/components/rafeyos/ui/menus/logic/useTrashActions'
import { useNameActions } from '@/components/rafeyos/ui/menus/logic/useNameActions'
import { rectOfElement } from '@/components/rafeyos/ui/logic/dom'
import { TRASH } from '@/components/rafeyos/core/vfs/buildVfs'
import { isDir } from '@/components/rafeyos/core/vfs/queries'
import { backgroundMenuItems, mainMenuItems, viewOptionsItems } from './filesMenus'
import { FILES_ACTIONS } from './filesReducer'
import { APP } from '@/components/rafeyos/core/catalog/apps'

/**
 * @import { Dispatch, MouseEvent } from 'react'
 * @import { FilesAction, FilesState } from './filesReducer'
 */

// View options sits near the window's right edge, so it opens inwards (mockup offset)
const VIEW_OPTIONS_SHIFT = 120

/** Rename's popover points at the item's name: a list row's name cell, or the whole grid item. */
const nameAnchorOf = (/** @type {Element} */ item) => rectOfElement(item.querySelector('.n') ?? item)

/**
 * Opens one Files window's menus: an item's, the folder background's, View options and the main menu.
 * @param {{ state: FilesState, dispatch: Dispatch<FilesAction>, items: string[] }} files - the window's reducer and listing
 */
export const useFilesMenus = ({ state, dispatch, items }) => {
  const { vfs } = useVfs()
  const windowManager = useWindowManager()
  const openPath = useOpenPath()
  const openMenu = useMenu()
  const trashActions = useTrashActions()
  const emptyTrash = useEmptyTrash()
  const { newFolderIn, renameFor } = useNameActions()
  /** @param {string} path */
  const select = (path) => dispatch({ type: FILES_ACTIONS.SELECT, path, mode: 'single' })
  const inTrash = state.path === TRASH
  /** @param {string} path */
  const commandsFor = (path) => ({ ...pathCommands({ vfs, windowManager, openPath }, path), ...trashActions(path) })
  /**
   * @param {string} path
   * @param {MouseEvent} event
   */
  const itemMenu = (path, event) => {
    if (!state.selection.includes(path)) dispatch({ type: FILES_ACTIONS.SELECT, path, mode: 'single' })
    /** @param {string} _from @param {string} to */
    const onRenamed = (_from, to) => select(to)
    const rename = renameFor(path, nameAnchorOf(/** @type {Element} */ (event.currentTarget)), onRenamed)
    const commands = { ...commandsFor(path), rename, ...(inTrash ? { emptyTrash } : {}) }
    const menu = fileMenuItems({ commands, isFolder: isDir(vfs, path), onDesktop: false })
    openMenu(menu, pointOfEvent(event))
  }
  /** @param {MouseEvent} event */
  const backgroundMenu = (event) => {
    event.preventDefault()
    // Recent and Starred aren't folders, so they have no background menu
    if (!vfs[state.path]) return
    const { openTerminal, properties } = commandsFor(state.path)
    const selectAll = () => dispatch({ type: FILES_ACTIONS.SELECT_ALL, paths: items })
    const point = pointOfEvent(event)
    const newFolder = newFolderIn(state.path, { ...point, w: 0, h: 0 }, select)
    openMenu(backgroundMenuItems({ inTrash, newFolder, selectAll, openTerminal, properties, emptyTrash }), point)
  }
  /** @param {MouseEvent} event */
  const viewOptions = (event) => {
    /** @param {FilesState['view']} view */
    const setView = (view) => dispatch({ type: FILES_ACTIONS.SET_VIEW, view })
    openMenu(viewOptionsItems(setView), belowElement(event.currentTarget, VIEW_OPTIONS_SHIFT))
  }
  /** @param {MouseEvent} event */
  const mainMenu = (event) => {
    const newWindow = () => windowManager.openApp(APP.FILES, { path: state.path })
    openMenu(mainMenuItems(newWindow), belowElement(event.currentTarget))
  }
  return { itemMenu, backgroundMenu, viewOptions, mainMenu }
}
