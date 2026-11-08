import { packRegistry } from "./registry";

/**
 * Default config - used when no overrides are provided.
 * Edit sensory.config.js at the project root or pass a `config` prop to
 * <SensoryUIProvider> to customise at runtime.
 */
export const defaultConfig = {
  enabled: true,
  volume: 0.35,
  theme: "aero",
  categories: {
    interaction: true,
    overlay: true,
    navigation: true,
    notification: true,
    hero: false, // Disabled by default - must be explicitly enabled
  },
  overrides: {},
  reducedMotion: "inherit",
};

export function mergeConfig(user) {
  return {
    ...defaultConfig,
    ...user,
    categories: {
      ...defaultConfig.categories,
      ...(user.categories ?? {}),
    },
    overrides: {
      ...defaultConfig.overrides,
      ...(user.overrides ?? {}),
    },
  };
}

/**
 * Resolve a SoundRole to its audio source.
 *
 * Resolution priority:
 *   1. config.overrides[role]    - user-defined string override (URL or base64)
 *   2. packRegistry[theme][role] - synthesizer from the active sound pack
 *   3. packRegistry.aero[role]   - fallback to "aero" if theme name is unknown
 *   4. null                      - category disabled or role not found
 */
export function resolveRole(role, config) {
  const category = role.split(".")[0];

  if (config.categories[category] === false) return null;

  // User override takes highest priority (always a string/URL)
  const override = config.overrides[role];
  if (override) return override;

  // Look up the active pack, fall back to "aero" if pack name is unknown
  const packName = config.theme;
  const pack = packRegistry[packName] ?? packRegistry.aero;
  const source = pack[role];

  return source ?? null;
}
