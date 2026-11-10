"""Render the /studio plates: the at-rest base, light on/off variants and plant layers.

All variants share seed, samples, denoiser and compositor, so the differences
between them isolate one light (or one plant group) each.

    Blender -b /Users/rafey/Blender/room-night.blend --python-exit-code 1 \
        -P tools/studio/blender/render.py -- --variants base moon_off --spp 384
"""

from __future__ import annotations

import json
import os
import sys
import time
from contextlib import contextmanager
from typing import Any, Iterator

sys.path.insert(0, os.path.dirname(__file__))

import bpy  # noqa: E402
from bpy_extras.object_utils import world_to_camera_view  # noqa: E402
from mathutils import Vector  # noqa: E402

import studio_common as sc  # noqa: E402

MATTE_SPP = 32
# Colour layers: plant groups a and b, c for the swaying tree, d for the figure, his chair and the guitar,
# e for the chair's see-through backrest, and f / g for the chair and its backrest with him out of it
# (the empty chair, when he gets up). Each gets its own pair because on screen it overlaps things
# in the other groups, and one layer can't hold overlaps. The backrest's colour is taken as seen, him
# showing through it (postprocess.COMPOSITE_LAYERS), so plants_e shows group d too. h is the door's leaf
# (studio_door.py), which the page swings.
GROUP_KEYS = "abcdefgh"
TREE_GROUP = 2
FIGURE_GROUP = 3
BACKREST_GROUP = 4
CHAIR_GROUP = 5
EMPTY_BACKREST_GROUP = 6
DOOR_GROUP = 7

BASE: dict[str, Any] = {
    "camera": "overscan",
    "camera_hidden": sc.PLANTS,
    "hide_live_figure": True,  # his head and hands are drawn live; they still cast their shadows
    "render_hidden": (sc.TREE_SWAY, sc.PHONE_CLOCK),
}

VARIANTS: dict[str, dict[str, Any]] = {
    "ref": {"camera": "ref"},
    "full": {"camera": "overscan"},
    "base": BASE,
    "moon_off": {**BASE, "energy": {sc.MOONLIGHT: 0.0}},
    "beam_off": {**BASE, "energy": {sc.MOONBEAM: 0.0}},
    "candle_off": {
        **BASE,
        "energy": {sc.CANDLE_LIGHT: 0.0},
        "render_hidden": (*BASE["render_hidden"], sc.CANDLE_FLAME),
    },
    "up_free": {**BASE, "uplight_free": True},
    "up_off": {**BASE, "energy": {sc.UPLIGHT: 0.0}},
    "plants_a": {**BASE, "plant_group": 0},
    "plants_b": {**BASE, "plant_group": 1},
    "matte_a": {**BASE, "plant_group": 0, "matte": True},
    "matte_b": {**BASE, "plant_group": 1, "matte": True},
    "plants_c": {**BASE, "plant_group": TREE_GROUP},
    "matte_c": {**BASE, "plant_group": TREE_GROUP, "matte": True},
    "plants_d": {**BASE, "plant_group": FIGURE_GROUP},
    "matte_d": {**BASE, "plant_group": FIGURE_GROUP, "matte": True},
    "plants_e": {**BASE, "plant_group": BACKREST_GROUP, "also_visible": FIGURE_GROUP},
    "matte_e": {**BASE, "plant_group": BACKREST_GROUP, "matte": True},
    "plants_f": {**BASE, "plant_group": CHAIR_GROUP, "hide_him": True},
    "matte_f": {**BASE, "plant_group": CHAIR_GROUP, "matte": True, "hide_him": True},
    "plants_g": {**BASE, "plant_group": EMPTY_BACKREST_GROUP, "also_visible": CHAIR_GROUP, "hide_him": True},
    "matte_g": {**BASE, "plant_group": EMPTY_BACKREST_GROUP, "matte": True, "hide_him": True},
    "plants_h": {**BASE, "plant_group": DOOR_GROUP},
    "matte_h": {**BASE, "plant_group": DOOR_GROUP, "matte": True},
    # The room with him and his chair gone (rolled away), with only him gone (up out of the chair), with the
    # guitar off its hook, and with the monitor asleep: the page fades to these
    "figure_gone": {**BASE, "figure_gone": True},
    "body_gone": {**BASE, "hide_him": True},
    "guitar_gone": {**BASE, "guitar_gone": True},
    "screen_off": {**BASE, "screen_off": True},
    # The door swung open (the hall's warm light comes in), and his mug gone from its coaster (he took it for tea)
    "door_open": {**BASE, "door_open": True},
    "door_open_tv_off": {**BASE, "door_open": True, "energy": {sc.TV_LIGHT: 0.0}},  # the TV's share, to flicker
    "mug_gone": {**BASE, "mug_gone": True},
    # Synth A's keys held down, every other white key or every black key, and which key each pixel shows
    # (studio_keys.py): the page presses each key as his fingers do
    "keys_a": {**BASE, "keys_down": 0},
    "keys_b": {**BASE, "keys_down": 1},
    "keys_black": {**BASE, "keys_down": 2},
    "keys_id": {"camera": "overscan", "keys_id": True},
}


@contextmanager
def temporarily(changes: list[tuple[Any, str, Any]]) -> Iterator[None]:
    """Apply (target, attribute, value) changes and restore them afterwards."""
    saved = [(target, attr, getattr(target, attr)) for target, attr, _ in changes]
    try:
        for target, attr, value in changes:
            setattr(target, attr, value)
        yield
    finally:
        for target, attr, value in reversed(saved):
            setattr(target, attr, value)


def screen_rect(scene: bpy.types.Scene, ob: bpy.types.Object) -> tuple[float, float, float, float]:
    corners = [world_to_camera_view(scene, scene.camera, ob.matrix_world @ Vector(c)) for c in ob.bound_box]
    return (min(c.x for c in corners), min(c.y for c in corners), max(c.x for c in corners), max(c.y for c in corners))


def overlaps(a: tuple[float, ...], b: tuple[float, ...], margin: float = 0.004) -> bool:
    return not (a[2] + margin < b[0] or b[2] + margin < a[0] or a[3] + margin < b[1] or b[3] + margin < a[1])


def plant_groups(scene: bpy.types.Scene) -> list[list[str]]:
    """Greedily split the plants into groups whose screen rectangles never overlap."""
    rects = {name: screen_rect(scene, sc.obj(name)) for name in sc.PLANTS}
    groups: list[list[str]] = []
    for name in sc.PLANTS:
        for group in groups:
            if not any(overlaps(rects[name], rects[other]) for other in group):
                group.append(name)
                break
        else:
            groups.append([name])
    if len(groups) > 2:
        raise sc.StudioPipelineError(f"Plants need {len(groups)} groups; add variants for them: {groups}")
    return groups + [[]] * (2 - len(groups))


def layer_groups(scene: bpy.types.Scene) -> list[list[str]]:
    """Everything coloured from its own Cycles layer, in GROUP_KEYS order."""
    return [
        *plant_groups(scene),
        [sc.TREE_SWAY],
        sc.live_figure_parts("figure"),
        sc.live_figure_parts("backrest"),
        sc.live_figure_parts("figure", role=sc.ROLE_CHAIR),
        sc.live_figure_parts("backrest", role=sc.ROLE_CHAIR),
        sc.live_figure_parts("door"),
    ]


def hidden_from_every_ray(names: list[str]) -> list[tuple[Any, str, Any]]:
    return [(sc.obj(name), "hide_render", True) for name in names]


def door_open_changes() -> list[tuple[Any, str, Any]]:
    """The leaf swung fully into the room. Still hidden from the camera (the page draws it), still shadowing."""
    import studio_door

    turn = sc.obj(sc.DOOR_LEAF).rotation_euler
    return [(turn, "z", turn.z + studio_door.open_angle())]


def uplight_free_collection() -> bpy.types.Collection:
    """Shadow-link collection that stops the floor Monstera blocking the uplight."""
    name = "SL_Uplight_Free"
    coll = bpy.data.collections.get(name) or bpy.data.collections.new(name)
    if sc.FLOOR_MONSTERA not in coll.objects:
        coll.objects.link(sc.obj(sc.FLOOR_MONSTERA))
    for entry in coll.collection_objects:
        entry.light_linking.link_state = "EXCLUDE"
    return coll


def variant_changes(scene: bpy.types.Scene, spec: dict[str, Any]) -> list[tuple[Any, str, Any]]:
    changes: list[tuple[Any, str, Any]] = []
    camera_hidden = set(spec.get("camera_hidden", ()))
    if spec.get("hide_live_figure"):
        camera_hidden |= set(sc.live_figure_parts())
        for ob in bpy.context.scene.objects:
            if ob.get(sc.FIGURE_NO_SHADOW):
                changes.append((ob, "visible_shadow", False))
    group = spec.get("plant_group")
    layer = set(layer_groups(scene)[group]) if group is not None else set()
    also = spec.get("also_visible")
    visible = layer | (set(layer_groups(scene)[also]) if also is not None else set())
    camera_hidden -= visible
    for name in camera_hidden:
        changes.append((sc.obj(name), "visible_camera", False))
    for name in spec.get("render_hidden", ()):
        if name in visible:
            continue  # the swaying tree is left out of every render except its own layer
        found = bpy.data.objects.get(name)
        if found is None:
            print(f"[render] note: {name!r} not in scene, nothing to hide")
            continue
        changes.append((found, "hide_render", True))
    for name, energy in spec.get("energy", {}).items():
        changes.append((sc.obj(name).data, "energy", energy))
    if spec.get("uplight_free"):
        changes.append((sc.obj(sc.UPLIGHT).light_linking, "blocker_collection", uplight_free_collection()))
    if spec.get("figure_gone"):  # him and his chair, rolled away together
        changes += hidden_from_every_ray([*sc.live_figure_parts(role=sc.ROLE_HIM), *sc.live_figure_parts(role=sc.ROLE_CHAIR), sc.FIGURE_SHADOW])
    if spec.get("hide_him"):  # him alone: the empty chair stays
        changes += hidden_from_every_ray([*sc.live_figure_parts(role=sc.ROLE_HIM), sc.FIGURE_SHADOW])
    if spec.get("guitar_gone"):
        changes += hidden_from_every_ray(sc.live_figure_parts(role=sc.ROLE_GUITAR))
    if spec.get("keys_down") is not None:
        import studio_keys

        changes += studio_keys.press_changes(spec["keys_down"])
    if spec.get("keys_id"):
        import studio_keys

        changes += studio_keys.id_changes(scene)
    if spec.get("door_open"):
        changes += door_open_changes()
    if spec.get("mug_gone"):
        changes += hidden_from_every_ray(sc.live_figure_parts(role=sc.ROLE_MUG))
    if spec.get("screen_off"):
        glow = bpy.data.materials[sc.SCREEN_GLOW]
        emission = next(n for n in glow.node_tree.nodes if n.type == "EMISSION")
        changes.append((emission.inputs["Strength"], "default_value", 0.0))
    if spec.get("matte"):
        changes.extend(matte_changes(scene, layer))
    return changes


def matte_changes(scene: bpy.types.Scene, keep: set[str]) -> list[tuple[Any, str, Any]]:
    """Alpha-only render: the group's plants over a transparent film, all else held out."""
    changes: list[tuple[Any, str, Any]] = [
        (scene.render, "film_transparent", True),
        (scene.render, "use_compositing", False),
        (scene.cycles, "samples", MATTE_SPP),
        (scene.cycles, "use_denoising", False),
        (scene.render.image_settings, "color_mode", "RGBA"),
        (sc.obj(sc.ROOM_HAZE), "hide_render", True),
    ]
    for ob in scene.objects:
        if ob.type in {"MESH", "CURVES", "FONT", "CURVE"} and ob.name not in keep and ob.name != sc.ROOM_HAZE:
            changes.append((ob, "is_holdout", True))
    return changes


def configure(scene: bpy.types.Scene, spp: int) -> None:
    sc.enable_gpu(scene)
    scene.cycles.samples = spp
    scene.cycles.seed = 0
    scene.cycles.use_animated_seed = False
    scene.render.use_compositing = True
    scene.render.use_persistent_data = True
    settings = scene.render.image_settings
    settings.file_format = "PNG"
    settings.color_depth = "16"
    settings.color_mode = "RGB"
    settings.compression = 15


def render_variant(
    scene: bpy.types.Scene, name: str, out_dir: str, glare_size: float | None, percentage: int = 100
) -> str:
    spec = VARIANTS[name]
    sc.use_camera(scene, spec.get("camera", "overscan"))
    scene.render.resolution_percentage = percentage
    glare = sc.glare_node(scene)
    changes = variant_changes(scene, spec)
    if glare is not None and glare_size is not None and spec.get("camera") != "ref":
        changes.append((glare.inputs["Size"], "default_value", glare_size))
    path = os.path.join(out_dir, f"{name}.{'exr' if spec.get('keys_id') else 'png'}")
    with temporarily(changes):
        scene.render.filepath = path
        started = time.time()
        bpy.ops.render.render(write_still=True)
        print(f"[render] {name}: {time.time() - started:.1f}s -> {path}")
    return path


def main() -> None:
    sc.assert_source_blend()
    p = sc.parser(__doc__)
    p.add_argument("--variants", nargs="+", default=["base"], choices=sorted(VARIANTS))
    p.add_argument("--spp", type=int, default=384)
    p.add_argument("--out", default=sc.OUT_DIR)
    p.add_argument("--glare-size", type=float, default=None, help="Glare Size for overscan renders")
    p.add_argument("--no-prep", action="store_true", help="Render the scene as saved, without studio prep")
    p.add_argument("--no-set-dressing", action="store_true", help="Prep without the window, sky and tree")
    p.add_argument("--percentage", type=int, default=100, help="Resolution scale for quick previews")
    p.add_argument("--probes", action="store_true", help="Also render the light probes and the display LUT")
    args = p.parse_args(sc.script_args())
    scene = bpy.context.scene
    if not args.no_prep:
        import studio_prep

        studio_prep.apply(scene, with_set_dressing=not args.no_set_dressing)
    configure(scene, args.spp)
    out_dir = sc.ensure_out_dir(args.out)
    sc.use_camera(scene, "overscan")
    groups = dict(zip(GROUP_KEYS, layer_groups(scene)))
    with open(os.path.join(out_dir, "plant_groups.json"), "w") as f:
        json.dump(groups, f, indent=2)
    print(f"[render] colour layers: {groups}")
    for name in args.variants:
        render_variant(scene, name, out_dir, args.glare_size, args.percentage)
    if args.probes:
        import studio_probes

        studio_probes.display_lut(scene, out_dir)
        started = time.time()
        studio_probes.render_probes(scene, out_dir, temporarily)
        if bpy.data.objects.get(sc.DOOR_LEAF) is not None:  # and again with the door open: the hall's light comes in
            studio_probes.render_probes(scene, out_dir, temporarily, door_open_changes(), "probes_open.json")
        print(f"[render] probes took {time.time() - started:.0f}s")


if __name__ == "__main__":
    main()
