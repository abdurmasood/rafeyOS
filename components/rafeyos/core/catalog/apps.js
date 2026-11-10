// @ts-check
// App list and what each app opens. Screens live in appComponents.js so this file stays free of React.
import { NODE_TYPES } from '@/components/rafeyos/core/vfs/buildVfs'
import { realPath } from '@/components/rafeyos/core/vfs/paths'

/**
 * @import { Vfs, VfsNode } from '@/components/rafeyos/core/vfs/buildVfs'
 * @import { Rect } from '@/components/rafeyos/core/geometry'
 * @import { SettingsPage } from '@/components/rafeyos/core/catalog/settingsPages'
 */

export const APP = Object.freeze({
  FILES: 'files',
  TERMINAL: 'terminal',
  EDITOR: 'editor',
  MUSIC: 'music',
  MAIL: 'mail',
  PROJECTS: 'projects',
  SETTINGS: 'settings',
  PROPERTIES: 'properties',
  MINECRAFT: 'minecraft',
  STUDIO: 'studio',
})

/** @typedef {typeof APP[keyof typeof APP]} AppId */

/**
 * One-off launch options for the apps that take them (windowsReducer keeps them on the window as `init`).
 * @typedef {{
 *   [APP.SETTINGS]: { page: SettingsPage },
 *   [APP.PROJECTS]: { slug: string },
 *   [APP.FILES]: { select: string },
 * }} AppInits
 */

/**
 * Every app's launch options; `never` for the apps that take none, so passing one fails the typecheck.
 * @typedef {{ [K in AppId]: K extends keyof AppInits ? AppInits[K] : never }} AppInitMap
 */

/**
 * @template {AppId} K
 * @typedef {{ path?: string, from?: Rect | null, init?: AppInitMap[K] | null }} OpenAppOptions
 */

/**
 * The window manager's openApp, as the layers below it see it.
 * @typedef {<K extends AppId>(appId: K, options?: OpenAppOptions<K>) => boolean} OpenApp
 */

/**
 * @typedef {{
 *   id: AppId,
 *   name: string,
 *   size: readonly number[],
 *   minSize: readonly number[],
 *   multi: boolean,
 *   inDock: boolean,
 *   defaultPath: string,
 * }} App
 */

/**
 * defaultPath: what a single-instance file app opens when launched without one (e.g. from the dock)
 * @param {{ id: AppId, name: string, size: number[], minSize: number[], multi?: boolean, inDock?: boolean, defaultPath?: string }} options
 * @returns {Readonly<App>}
 */
const app = ({ id, name, size, minSize, multi = false, inDock = true, defaultPath = '' }) =>
  Object.freeze({ id, name, size: Object.freeze(size), minSize: Object.freeze(minSize), multi, inDock, defaultPath })

export const APPS = Object.freeze({
  [APP.FILES]: app({ id: APP.FILES, name: 'Files', size: [760, 480], minSize: [480, 320], multi: true }),
  [APP.TERMINAL]: app({ id: APP.TERMINAL, name: 'Terminal', size: [640, 400], minSize: [360, 200], multi: true }),
  [APP.EDITOR]: app({ id: APP.EDITOR, name: 'Text Editor', size: [620, 440], minSize: [360, 240] }),
  [APP.MUSIC]: app({ id: APP.MUSIC, name: 'Music', size: [380, 580], minSize: [340, 480] }),
  [APP.MAIL]: app({ id: APP.MAIL, name: 'Mail', size: [600, 460], minSize: [440, 360] }),
  [APP.PROJECTS]: app({ id: APP.PROJECTS, name: 'Projects', size: [1140, 720], minSize: [560, 380] }),
  [APP.SETTINGS]: app({ id: APP.SETTINGS, name: 'Settings', size: [780, 540], minSize: [600, 420] }),
  [APP.PROPERTIES]: app({ id: APP.PROPERTIES, name: 'Properties', size: [340, 430], minSize: [340, 380], inDock: false }),
  [APP.MINECRAFT]: app({ id: APP.MINECRAFT, name: 'Minecraft', size: [960, 640], minSize: [640, 480] }),
  [APP.STUDIO]: app({ id: APP.STUDIO, name: 'Rafey', size: [1100, 720], minSize: [560, 400] }), // his night room, live
})

export const APP_IDS = Object.freeze(Object.keys(APPS))

export const DOCK_FAVORITES = Object.freeze([APP.FILES, APP.TERMINAL, APP.EDITOR, APP.MUSIC, APP.MAIL, APP.PROJECTS, APP.MINECRAFT, APP.SETTINGS])

/** @param {AppId} id */
export const getApp = (id) => {
  const entry = APPS[id]
  if (!entry) throw new Error(`Unknown app: ${id}`)
  return entry
}

/** @type {readonly AppId[]} */
export const IMPLEMENTED_APPS = Object.freeze([
  APP.FILES, APP.TERMINAL, APP.EDITOR, APP.MUSIC, APP.MAIL, APP.PROJECTS, APP.SETTINGS, APP.PROPERTIES, APP.MINECRAFT,
  APP.STUDIO,
])

/** @param {AppId} appId */
export const isImplemented = (appId) => IMPLEMENTED_APPS.includes(appId)

/** @type {Readonly<Partial<Record<VfsNode['type'], AppId>>>} The app that would open each kind of file (GNOME's default handlers) */
const HANDLERS = Object.freeze({
  [NODE_TYPES.DIR]: APP.FILES,
  [NODE_TYPES.TEXT]: APP.EDITOR,
  [NODE_TYPES.AUDIO]: APP.MUSIC,
  [NODE_TYPES.MAILTO]: APP.MAIL,
})

/**
 * @param {VfsNode | null | undefined} node null or undefined when the path is gone
 * @returns {AppId | null} null for web links (opened in the browser) and for nothing at all
 */
export const handlerFor = (node) => (node ? HANDLERS[node.type] ?? null : null)

/**
 * Web links open through the "Open Link" dialog rather than an app. Follows a symlink.
 * @param {Vfs} vfs
 * @param {string} path
 */
export const isWebLink = (vfs, path) => vfs[realPath(vfs, path)]?.type === NODE_TYPES.WEBLINK

/**
 * Audio files play as they open (Music starts the track). Follows a symlink.
 * @param {Vfs} vfs
 * @param {string} path
 */
export const isAudio = (vfs, path) => vfs[realPath(vfs, path)]?.type === NODE_TYPES.AUDIO

/** @param {AppId | null} appId */
export const unavailableNote = (appId) =>
  appId ? `${APPS[appId]?.name ?? appId} isn't available yet` : "Opening links isn't available yet"
