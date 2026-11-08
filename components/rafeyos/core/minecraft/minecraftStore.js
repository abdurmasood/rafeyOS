// @ts-check
// Builds in the Minecraft app, saved to localStorage. Only the voxels that differ from the generated island are kept,
// tagged with the island they belong to, so a save stays small and a changed island never inherits old edits.
// A save from a newer build (an unknown version) is left alone: this tab loads nothing from it and never writes.
import { localStorageOrNull } from '@/lib/browserStorage'

export const MINECRAFT_KEY = 'rafeyos-minecraft'
/** Pre-rename key; read once so existing builds survive the Blocks → Minecraft rename. */
const LEGACY_KEY = 'rafeyos-blocks'
const VERSION = 1

/**
 * @typedef {Pick<Storage, 'getItem' | 'setItem'>} MinecraftStorage
 * @typedef {[number, number]} BlockEdit - [voxel index, block id]
 * @typedef {{ ok: true } | { ok: false, reason: 'full' | 'blocked' }} SaveResult
 * @typedef {{ edits: BlockEdit[], readOnly: boolean }} Disk
 */

/** @type {{ ok: true }} */
const SAVED = Object.freeze({ ok: true })
/** @type {{ ok: false, reason: 'blocked' }} */
const BLOCKED = Object.freeze({ ok: false, reason: 'blocked' })
/** @type {{ ok: false, reason: 'full' }} */
const FULL = Object.freeze({ ok: false, reason: 'full' })
// Legacy DOMException codes: 22 in most browsers, 1014 (NS_ERROR_DOM_QUOTA_REACHED) in old Firefox
const QUOTA_CODES = Object.freeze([22, 1014])

/** @param {unknown} error */
const isQuotaError = (error) => {
  if (!error || typeof error !== 'object') return false
  const { name, code } = /** @type {{ name?: unknown, code?: unknown }} */ (error)
  return name === 'QuotaExceededError' || QUOTA_CODES.includes(/** @type {number} */ (code))
}

/**
 * The stored envelope, parsed; undefined when it is absent, unreadable or not JSON.
 * @param {MinecraftStorage | null} storage
 * @returns {unknown}
 */
const readEnvelope = (storage) => {
  try {
    const raw = storage?.getItem(MINECRAFT_KEY) ?? storage?.getItem(LEGACY_KEY)
    return raw == null ? undefined : JSON.parse(raw)
  } catch {
    return undefined
  }
}

/** @param {unknown} value */
const isCount = (value) => Number.isInteger(value) && /** @type {number} */ (value) >= 0

/**
 * The well-formed [index, block] pairs in `raw`; anything else is dropped, so a hand-edited save can't break a world.
 * @param {unknown} raw
 * @returns {BlockEdit[]}
 */
const cleanEdits = (raw) =>
  Array.isArray(raw) ? raw.filter((edit) => Array.isArray(edit) && edit.length === 2 && isCount(edit[0]) && isCount(edit[1])) : []

/**
 * @param {{ storage: MinecraftStorage | null }} deps - null when the browser blocks storage
 */
export const createMinecraftStore = ({ storage }) => {
  /**
   * @param {string} world
   * @returns {Disk}
   */
  const readDisk = (world) => {
    const envelope = /** @type {{ v?: unknown, world?: unknown, edits?: unknown } | undefined} */ (readEnvelope(storage))
    if (!envelope || typeof envelope !== 'object' || !('v' in envelope)) return { edits: [], readOnly: false }
    if (envelope.v !== VERSION) return { edits: [], readOnly: true }
    return { edits: envelope.world === world ? cleanEdits(envelope.edits) : [], readOnly: false }
  }

  return Object.freeze({
    /**
     * The saved edits for `world`; none when nothing is saved, it's another island's, or a newer build's.
     * @param {string} world
     */
    load: (world) => readDisk(world).edits,
    /**
     * Replaces the save with these edits for `world`.
     * @param {string} world
     * @param {BlockEdit[]} edits
     * @returns {SaveResult}
     */
    save: (world, edits) => {
      if (!storage || readDisk(world).readOnly) return BLOCKED
      try {
        storage.setItem(MINECRAFT_KEY, JSON.stringify({ v: VERSION, world, edits }))
        return SAVED
      } catch (error) {
        return isQuotaError(error) ? FULL : BLOCKED
      }
    },
  })
}

/** @typedef {ReturnType<typeof createMinecraftStore>} MinecraftStore */

/**
 * The store on this window's localStorage; without a window (SSR) it has no storage and saves nothing.
 * @param {unknown} win
 * @returns {MinecraftStore}
 */
export const browserMinecraftStore = (win) =>
  createMinecraftStore({ storage: win && typeof win === 'object' ? localStorageOrNull(/** @type {Window & typeof globalThis} */ (win)) : null })
