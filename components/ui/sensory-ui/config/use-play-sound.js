"use client";;
import * as React from "react";

import { useSensoryUI } from "./provider";

/**
 * `usePlaySound` - low-level hook for imperative sound playback.
 *
 * Use this when you need to trigger a sound outside a sensory-ui component,
 * for example in a custom component or an event handler.
 *
 * @example
 * ```tsx
 * const { play } = usePlaySound({ sound: "notification.success" });
 * // ...
 * <button onClick={play}>Save</button>
 * ```
 */
export function usePlaySound(
 {
  sound,
  volume
 }
) {
  const { playSound, enabled } = useSensoryUI();

  const play = React.useCallback(() => {
    void playSound(sound, { volume });
  }, [playSound, sound, volume]);

  return { play, enabled };
}
