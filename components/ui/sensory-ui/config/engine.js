/**
 * sensory-ui Sound Engine
 *
 * The lowest runtime layer — handles AudioContext lifecycle, buffer decoding/
 * caching, and playback scheduling via the Web Audio API.
 *
 * This module is framework-agnostic (no React dependency). All React-specific
 * wiring lives in provider.tsx and use-play-sound.ts.
 */

let audioContext = null;
const bufferCache = new Map();

/** Tracks the most recently started playback so rapid re-triggers cancel the
 *  previous sound, preventing overlapping audio when users spam-click. */
let activePlayback = null;

export function getAudioContext() {
  // If the cached context was closed (e.g. after `closeAudioContext()` or a
  // browser-initiated close), recreate it so playback can recover.
  if (audioContext?.state === "closed") {
    audioContext = null;
    // Buffers decoded on the old context are no longer usable.
    bufferCache.clear();
  }
  if (!audioContext) {
    audioContext = new AudioContext();
  }
  return audioContext;
}

/**
 * Decode a base64 data URI into an AudioBuffer.
 * Used when sounds are embedded as base64-encoded TS modules.
 */
async function decodeBase64DataUri(dataUri) {
  const cached = bufferCache.get(dataUri);
  if (cached) return cached;

  const ctx = getAudioContext();
  const base64 = dataUri.split(",")[1];
  if (!base64) throw new Error("[sensory-ui] Invalid data URI");

  const binaryString = atob(base64);
  const bytes = new Uint8Array(binaryString.length);
  for (let i = 0; i < binaryString.length; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }

  const audioBuffer = await ctx.decodeAudioData(bytes.buffer.slice(0));
  bufferCache.set(dataUri, audioBuffer);
  return audioBuffer;
}

/**
 * Fetch and decode an audio source into an AudioBuffer.
 * Accepts both regular URLs and base64 data URIs.
 * Results are cached by source string so each is decoded only once.
 */
export async function decodeAudioData(source) {
  // Handle base64 data URIs directly - no network fetch needed
  if (source.startsWith("data:")) {
    return decodeBase64DataUri(source);
  }

  // Regular URL path (e.g. user override pointing to /sounds/custom/...)
  const cached = bufferCache.get(source);
  if (cached) return cached;

  const ctx = getAudioContext();
  const response = await fetch(source);
  if (!response.ok) {
    throw new Error(`[sensory-ui] Failed to fetch audio: ${response.status} ${response.statusText}`);
  }
  const arrayBuffer = await response.arrayBuffer();
  const audioBuffer = await ctx.decodeAudioData(arrayBuffer);

  bufferCache.set(source, audioBuffer);
  return audioBuffer;
}

export async function playSound(source, options = {}) {
  const { volume = 1, playbackRate = 1, onEnd } = options;

  const ctx = getAudioContext();

  // Resume if suspended (autoplay policy) or interrupted (Safari phone-call/tab-switch).
  // getAudioContext() guarantees the context is never "closed", so checking
  // for "running" is sufficient.
  if (ctx.state !== "running") {
    await ctx.resume();
  }

  // Cancel the previously playing sound to prevent overlapping audio
  // when users spam-click or rapidly trigger interactions.
  if (activePlayback) {
    try { activePlayback.stop(); } catch { /* ok */ }
    activePlayback = null;
  }

  // If the source is a synthesizer function, call it directly - no decoding step.
  if (typeof source === "function") {
    const playback = source(ctx, {
      volume,
      playbackRate,
      onEnd: () => {
        if (activePlayback === playback) activePlayback = null;
        onEnd?.();
      },
    });
    activePlayback = playback;
    return playback;
  }

  const buffer = await decodeAudioData(source);
  const bufferSource = ctx.createBufferSource();
  const gain = ctx.createGain();

  bufferSource.buffer = buffer;
  bufferSource.playbackRate.value = playbackRate;
  gain.gain.value = Math.max(0, Math.min(1, volume));

  bufferSource.connect(gain);
  gain.connect(ctx.destination);

  bufferSource.onended = () => {
    if (activePlayback === playback) activePlayback = null;
    onEnd?.();
  };

  bufferSource.start(0);

  const playback = {
    stop: () => {
      try {
        bufferSource.stop();
      } catch {
        // No-op if already stopped.
      }
    },
  };

  activePlayback = playback;
  return playback;
}

export function clearBufferCache() {
  bufferCache.clear();
}

export async function closeAudioContext() {
  if (audioContext) {
    await audioContext.close();
    audioContext = null;
    // Buffers decoded on the closed context are no longer usable; clear them so
    // the next getAudioContext() starts with a clean cache.
    bufferCache.clear();
    activePlayback = null;
  }
}
