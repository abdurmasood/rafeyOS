// @ts-check
// Where the world is up to, shared by the scene that tracks it and the HUD that shows it. Kept out of MinecraftHud.jsx
// so that file exports only components, which Fast Refresh needs to update it in place.

/** @typedef {'loading' | 'ready' | 'unavailable' | 'failed'} WorldStatus */

/** Anything but READY covers the world with a card. */
export const WORLD_STATUS = Object.freeze({ LOADING: 'loading', READY: 'ready', UNAVAILABLE: 'unavailable', FAILED: 'failed' })
