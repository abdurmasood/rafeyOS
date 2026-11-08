"use client";;
import * as React from "react";
import { closeAudioContext, playSound as enginePlaySound } from "./engine";
import { mergeConfig, resolveRole } from "./config";

const SensoryUIContext = React.createContext(null);

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

export function useSensoryUI() {
  const ctx = React.useContext(SensoryUIContext);
  if (!ctx) {
    throw new Error(
      "[sensory-ui] useSensoryUI must be called inside <SensoryUIProvider>"
    );
  }
  return ctx;
}

// ---------------------------------------------------------------------------
// Reduced-motion hook
// ---------------------------------------------------------------------------

function useReducedMotion(pref) {
  const [matches, setMatches] = React.useState(() => {
    // Local patch: also guard a window without matchMedia (jsdom), see ../README.md
    if (typeof window === "undefined" || !window.matchMedia) return false;
    return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  });

  React.useEffect(() => {
    if (typeof window === "undefined" || !window.matchMedia) return;
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    const handler = (e) => setMatches(e.matches);
    mq.addEventListener("change", handler);
    return () => mq.removeEventListener("change", handler);
  }, []);

  if (pref === "force-off") return true;
  if (pref === "force-on") return false;
  return matches;
}

export function SensoryUIProvider({
  children,
  config: configOverride
}) {
  const config = React.useMemo(
    () => mergeConfig(configOverride ?? {}),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [JSON.stringify(configOverride)]
  );

  const [muted, setMuted] = React.useState(false);
  const reducedMotion = useReducedMotion(config.reducedMotion);
  const shouldPlay = config.enabled && !muted && !reducedMotion;

  const playSound = React.useCallback(
    async (role, options = {}) => {
      if (typeof window === "undefined") return null;
      if (!shouldPlay) return null;

      const finalVolume = (options.volume ?? 1) * config.volume;

      // Detect raw URLs / data-URIs passed via usePlaySound and bypass
      // role resolution — send them straight to the engine.
      const isRawSource =
        typeof role === "string" &&
        (role.startsWith("/") ||
          role.startsWith("http://") ||
          role.startsWith("https://") ||
          role.startsWith("data:"));

      const source = isRawSource ? role : resolveRole(role, config);
      if (!source) return null;

      try {
        return await enginePlaySound(source, { ...options, volume: finalVolume });
      } catch (err) {
        if (process.env.NODE_ENV === "development") {
          console.warn("[sensory-ui] Failed to play sound:", role, err);
        }
        return null;
      }
    },
    [shouldPlay, config]
  );

  // Clean up the AudioContext on unmount in development to avoid stale state
  // across HMR reloads.
  React.useEffect(() => {
    if (process.env.NODE_ENV !== "development") return;
    return () => {
      void closeAudioContext();
    };
  }, []);

  const value = React.useMemo(
    () => ({
      playSound,
      enabled: shouldPlay,
      volume: config.volume,
      muted,
      setMuted,
      reducedMotion,
    }),
    [playSound, shouldPlay, config.volume, muted, reducedMotion]
  );

  return (
    <SensoryUIContext.Provider value={value}>
      {children}
    </SensoryUIContext.Provider>
  );
}
