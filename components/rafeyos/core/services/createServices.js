// Everything rafeyOS needs from the outside world, injected so tests can pass fakes
import { sessionStorageOrNull } from '@/lib/browserStorage'
import { sharedFsStore } from '@/components/rafeyos/core/vfs/fsStore'
import { sharedSettingsStore } from '@/components/rafeyos/core/settings/settingsStore'
import { browserMinecraftStore } from '@/components/rafeyos/core/minecraft/minecraftStore'
import { browserClipboard } from './clipboard'
import { createAudio } from './audio'
import { createMediaSession } from './mediaSession'
import { loadSamples } from '@/lib/audioSamples'

const REDUCED_MOTION_QUERY = '(prefers-reduced-motion: reduce)'
const DARK_SCHEME_QUERY = '(prefers-color-scheme: dark)'

const matches = (win, query, fallback) => win?.matchMedia?.(query).matches ?? fallback

/** Calls `listener` whenever `query` starts or stops matching; returns the unsubscribe. Older Safari has only addListener. */
const watchQuery = (win, query, listener) => {
  const list = win?.matchMedia?.(query)
  if (list?.addEventListener) {
    list.addEventListener('change', listener)
    return () => list.removeEventListener?.('change', listener)
  }
  if (list?.addListener) {
    list.addListener(listener)
    return () => list.removeListener?.(listener)
  }
  return () => {}
}

/**
 * @param {{ router: { push: (href: string) => void }, win?: Window }} deps
 * @returns {{ navigate, storage, fs, settings, minecraft, now, openExternal, clipboard, createAudio, loadAudioSamples, mediaSession, reducedMotion, prefersDark, watchColorScheme }}
 */
export const createServices = ({ router, win = globalThis.window }) =>
  Object.freeze({
    navigate: (href) => router.push(href),
    storage: sessionStorageOrNull(win),
    // One per window, so a services rebuild (the router changing) keeps the same store
    fs: sharedFsStore(win),
    // The visitor's saved appearance, shared the same way
    settings: sharedSettingsStore(win),
    // Builds in the Minecraft app
    minecraft: browserMinecraftStore(win),
    now: () => new Date(),
    openExternal: (href) => win?.open(href, '_blank', 'noopener,noreferrer'),
    clipboard: browserClipboard(win),
    // (src) => audio adapter; called on the first play, which is always a user gesture
    createAudio: (src) => createAudio(src, win?.Audio),
    // (src) => Promise<Float32Array>, decoded once per page load; the Music waveform
    loadAudioSamples: loadSamples,
    // null where the browser has no Media Session API
    mediaSession: createMediaSession(win),
    reducedMotion: () => matches(win, REDUCED_MOTION_QUERY, false),
    prefersDark: () => matches(win, DARK_SCHEME_QUERY, true),
    // (listener) => unsubscribe; while no style is saved, rafeyOS follows the OS as it changes
    watchColorScheme: (listener) => watchQuery(win, DARK_SCHEME_QUERY, listener),
  })
