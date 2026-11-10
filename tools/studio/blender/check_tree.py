"""Read-only report on the tree: how much of the moonbeam it blocks and how much of the window it fills.

    Blender -b /Users/rafey/Blender/room-night.blend -P tools/studio/blender/check_tree.py
"""

from __future__ import annotations

import os
import random
import sys

sys.path.insert(0, os.path.dirname(__file__))

import bpy  # noqa: E402
from mathutils import Vector  # noqa: E402

import studio_common as sc  # noqa: E402
import studio_prep  # noqa: E402

SAMPLES = 2000
TARGET_BLOCKED = (0.2, 0.4)


def hit_name(scene: bpy.types.Scene, origin: Vector, target: Vector) -> str | None:
    depsgraph = bpy.context.evaluated_depsgraph_get()
    direction = target - origin
    hit, _, _, _, ob, _ = scene.ray_cast(depsgraph, origin, direction.normalized(), distance=direction.length)
    return ob.name if hit else None


def main() -> None:
    sc.assert_source_blend()
    scene = bpy.context.scene
    studio_prep.apply(scene)
    # ray_cast ignores render visibility: drop render-hidden objects, and the backdrop for moon
    # rays (Cycles never lets it cast shadows)
    for ob in scene.objects:
        if ob.hide_render:
            ob.hide_viewport = True
    backdrop = sc.obj(sc.SKY_BACKDROP)
    backdrop.hide_viewport = True
    rng = random.Random(3)
    cutter = sc.obj("Window_Cutter")
    corners = [cutter.matrix_world @ Vector(c) for c in cutter.bound_box]
    y0, y1 = min(c.y for c in corners), max(c.y for c in corners)
    z0, z1 = min(c.z for c in corners), max(c.z for c in corners)
    aperture = [Vector((-2.15, rng.uniform(y0, y1), rng.uniform(z0, z1))) for _ in range(SAMPLES)]

    moon = sc.obj(sc.MOONLIGHT).matrix_world.translation
    blocked = {"Tree Sway": 0, "Tree Static": 0, sc.WINDOW_SASH: 0}
    reaching = 0
    for p in aperture:
        name = hit_name(scene, moon, p - (p - moon).normalized() * 0.02)
        if name in blocked:
            blocked[name] += 1
        if name is None or name in blocked:
            reaching += 1
    backdrop.hide_viewport = False
    eye = sc.obj(sc.REF_CAMERA).matrix_world.translation
    seen = {"Tree Sway": 0, "Tree Static": 0, sc.SKY_BACKDROP: 0, sc.WINDOW_SASH: 0}
    for p in aperture:
        ray = (p - eye).normalized()
        name = hit_name(scene, p + ray * 0.01, p + ray * 6.0)
        if name in seen:
            seen[name] += 1
    print(f"[tree] moon rays reaching the window: {reaching}/{SAMPLES}")
    for name, count in blocked.items():
        print(f"[tree] moon blocked by {name}: {count / max(1, reaching):.1%}")
    low, high = TARGET_BLOCKED
    share = blocked["Tree Sway"] / max(1, reaching)
    print(f"[tree] swaying share {share:.1%} -> {'OK' if low <= share <= high else 'OUT OF RANGE'} (target {low:.0%}-{high:.0%})")
    for name, count in seen.items():
        print(f"[tree] window view through opening: {name} {count / SAMPLES:.1%}")


if __name__ == "__main__":
    main()
