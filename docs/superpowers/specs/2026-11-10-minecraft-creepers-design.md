# Minecraft creepers (night hostiles) — design

Date: 2026-11-10  
Status: approved in conversation; awaiting implementation plan

## Goal

Add classic creepers to the RafeyOS Minecraft app that spawn at night alongside existing shades. They walk up, hiss, explode (player damage + real terrain crater), and stay after dawn. Look: recognizable green silhouette + face, not Mojang assets.

## Decisions

| Topic | Choice |
| --- | --- |
| Role vs shades | Alongside (both night hostiles) |
| Combat | Classic: approach → fuse → explode |
| Look | Recognizable box silhouette + face (not exact skin fidelity) |
| Terrain | Real crater via `world.set` + remesh |
| Dawn | Keep living creepers; stop new spawns only |
| Architecture | Mirror shades: separate AI + meshes |

## Architecture

- Keep shades unchanged.
- Add parallel modules: `creepers.js` (logic, no three.js) and `creeperMeshes.js` (draw).
- `life.js` owns both: step AI with the night/player frame, draw meshes, route hits so left-click can kill a creeper or shade.
- Explosion is a one-shot callback into the engine (`onBoom`), which hurts the player and applies the crater through the existing edit/remesh path (`world.set`, chunk rebuild, `life.blockChanged`).
- Spawn only while night is high enough; once spawned, creepers remain until killed or they explode — no dawn burn.

## Behavior

Constants (tune in code if feel is off; these are the defaults):

| Constant | Value | Notes |
| --- | --- | --- |
| `MAX` | 3 | Live creepers at once |
| `NIGHT_FROM` | 0.6 | Same night threshold as shades for spawning |
| `SPAWN_NEAR` / `SPAWN_FAR` | 16 / 28 | Same ring as shades |
| `SPEED` | ~2.2 blocks/s | Slower than a shade stalk |
| `FUSE_RANGE` | 3 blocks | Start fuse when this close on roughly same level |
| `FUSE_CANCEL` | 6 blocks | Cancel fuse if player gets this far |
| `FUSE_SECONDS` | 1.5 | Flash/swell then boom |
| `HITS` | 2 | Left-clicks to kill |
| `BLAST_RADIUS` | 3 blocks | Player damage + crater sphere |
| `BLAST_DAMAGE` | 10 (half-hearts; vitals scale) | 5 hearts at center; shade bite is 3 |

- Spawn at night in that ring on solid ground (not water).
- Walk toward the player; within `FUSE_RANGE` → stop, swell/flash, run fuse → explode.
- During fuse: if horizontal distance > `FUSE_CANCEL`, cancel fuse and resume walk. (No full raycast LOS for v1 — distance cancel only.)
- A successful hit interrupts fuse and applies hit cooldown like shades.
- Dawn: existing creepers stay; no new spawns until `night >= NIGHT_FROM` again.

## Explosion

- If player is within `BLAST_RADIUS` of blast center: damage + knockback away from center.
- Crater: for each integer block whose center is within `BLAST_RADIUS`, if solid and not water and `y >= 0` and in-world → set to air via the engine edit path.
- Creeper removes itself on boom.
- Persist edits through the same `onEdit` path player builds use so saves keep the crater.

## Look

- Box parts: four legs + tall body + head (classic proportions).
- Green body, darker feet; face from simple black pixel blocks (eyes + mouth).
- Fuse: pulse scale/brightness; boom: short flash + particles.
- No Mojang textures or copyrighted asset copies.

## Files / wiring

| Area | Change |
| --- | --- |
| `logic/life/creepers.js` | Spawn, AI, fuse, hit |
| `logic/life/creeperMeshes.js` | Silhouette, fuse pulse, boom FX |
| `logic/life/life.js` | Create/step/draw/hit/dispose; expose hit that prefers nearer hostile |
| `logic/minecraftEngine.js` | `onBoom` next to `onBite`; crater + hurt |
| `logic/life/vitals.js` | `CAUSE.CREEPER` |
| `MinecraftMenus.jsx` | Death copy + controls hint |

### Data flow

1. Night high enough → spawn creeper on ground near player.
2. Each frame → walk or fuse state machine.
3. Boom → `onBoom(center)` → hurt player if in radius + sphere of `world.set` → remesh + `life.blockChanged`.
4. Left-click → hit nearest creeper or shade (whichever closer within reach), else break block.

## Tests

Mirror shade/life test style:

- Spawn only at night; persists after dawn.
- Fuse start / cancel / explode.
- Crater skips water and OOB; damages player in range.
- Hit kills and interrupts fuse.
- Mesh parts exist; draw instance counts stay sane.

## Out of scope

- Charged creepers, music discs, or other mobs.
- New biomes or lighting-system rewrite.
- Exact Mojang creeper skin/UV fidelity.
- Fancy sound pack (optional simple WebAudio hiss only if cheap).

## Success criteria

- At night, green creepers appear near the player while shades still hunt.
- Getting close triggers a clear fuse then an explosion that hurts and digs a crater.
- After dawn, those creepers remain until dead/exploded; none newly spawn until night.
- Face + silhouette read as “creeper” at a glance without shipping Mojang assets.
