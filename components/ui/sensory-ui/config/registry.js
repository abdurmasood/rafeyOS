import {
 softPack,
 aeroPack,
 arcadePack,
 organicPack,
 glassPack,
 industrialPack,
 minimalPack,
 retroPack,
 crispPack,
} from "../sounds/packs";

// ---------------------------------------------------------------------------
// Pack registry - maps pack name → full SoundPack
// ---------------------------------------------------------------------------

/**
 * All built-in sound packs, keyed by their `SoundPackName`.
 *
 * The engine uses this via `config.theme` to resolve a role to
 * its audio source before playback.
 */
export const packRegistry = {
  soft: softPack,
  aero: aeroPack,
  arcade: arcadePack,
  organic: organicPack,
  glass: glassPack,
  industrial: industrialPack,
  minimal: minimalPack,
  retro: retroPack,
  crisp: crispPack,
};

/**
 * Default sound pack name.
 * "aero" is the default - balanced, pleasant, professional.
 */
export const DEFAULT_PACK = "aero";

/**
 * Backwards-compat alias: the default pack's role → source mapping.
 */
export const roleRegistry = aeroPack;

