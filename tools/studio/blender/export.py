"""Export the /studio geometry (proxies, plants, swaying tree, the live figure) to a Draco glb plus scene facts.

The proxies only carry positions: their colour comes from the projected Cycles plates,
so they exist for depth (occluding live plants and dust) and for world positions
(where the moon and uplight shadows land).

    Blender -b /Users/rafey/Blender/room-night.blend --python-exit-code 1 \
        -P tools/studio/blender/export.py -- [--no-set-dressing]
"""

from __future__ import annotations

import json
import math
import os
import re
import sys

sys.path.insert(0, os.path.dirname(__file__))

import bmesh  # noqa: E402
import bpy  # noqa: E402
from mathutils import Vector  # noqa: E402

import studio_common as sc  # noqa: E402
import studio_prep  # noqa: E402

EXPORT_COLLECTION = "WEB_EXPORT"
GROUND = "Ground"
RUG_SHAG = "Rug Shag"
RUG_TOP_Z = 0.04  # mean height of the shag; the rug's visible surface for world lookups
DISSOLVE_DEGREES = 0.5
# Never part of the static room proxy: live layers, volumes, helpers
NOT_ROOM = {sc.ROOM_HAZE, GROUND, sc.TREE_SWAY, sc.PHONE_CLOCK, *sc.PLANTS}


def slug(name: str) -> str:
    return re.sub(r"[^a-z0-9]+", "_", name.lower()).strip("_")


def export_collection(scene: bpy.types.Scene) -> bpy.types.Collection:
    coll = bpy.data.collections.get(EXPORT_COLLECTION) or bpy.data.collections.new(EXPORT_COLLECTION)
    if coll.name not in scene.collection.children:
        scene.collection.children.link(coll)
    return coll


def is_static_visible(ob: bpy.types.Object) -> bool:
    return (
        ob.type in {"MESH", "FONT", "CURVE"}
        and not ob.hide_render
        and ob.visible_camera
        and ob.name not in NOT_ROOM
        and not ob.get(sc.FIGURE_LIVE)  # he and the chair top are drawn live, posed by their bones
    )


def append_world_mesh(bm: bmesh.types.BMesh, ob: bpy.types.Object, depsgraph: bpy.types.Depsgraph) -> None:
    """Append ob's evaluated (modifiers applied) mesh, in world space, to bm."""
    tmp = bpy.data.meshes.new_from_object(ob.evaluated_get(depsgraph))
    tmp.transform(ob.matrix_world)
    bm.from_mesh(tmp)
    bpy.data.meshes.remove(tmp)


def rug_top_quad(bm: bmesh.types.BMesh) -> None:
    corners = [sc.obj(RUG_SHAG).matrix_world @ Vector(c) for c in sc.obj(RUG_SHAG).bound_box]
    x0, x1 = min(c.x for c in corners), max(c.x for c in corners)
    y0, y1 = min(c.y for c in corners), max(c.y for c in corners)
    verts = [bm.verts.new((x, y, RUG_TOP_Z)) for x, y in ((x0, y0), (x1, y0), (x1, y1), (x0, y1))]
    bm.faces.new(verts)


def mesh_object(name: str, bm: bmesh.types.BMesh, coll: bpy.types.Collection, role: str) -> bpy.types.Object:
    mesh = bpy.data.meshes.new(name)
    bm.to_mesh(mesh)
    bm.free()
    ob = bpy.data.objects.new(name, mesh)
    ob["studio_role"] = role
    coll.objects.link(ob)
    return ob


def build_room_proxy(scene: bpy.types.Scene, coll: bpy.types.Collection) -> bpy.types.Object:
    depsgraph = bpy.context.evaluated_depsgraph_get()
    bm = bmesh.new()
    for ob in scene.objects:
        if is_static_visible(ob):
            append_world_mesh(bm, ob, depsgraph)
    rug_top_quad(bm)
    before = len(bm.faces)
    bmesh.ops.dissolve_limit(
        bm, angle_limit=math.radians(DISSOLVE_DEGREES), verts=bm.verts[:], edges=bm.edges[:], delimit=set()
    )
    print(f"[export] proxy_room: {before} -> {len(bm.faces)} faces")
    return mesh_object("proxy_room", bm, coll, "room")


def smoothstep(edge0: float, edge1: float, x: float) -> float:
    t = max(0.0, min(1.0, (x - edge0) / (edge1 - edge0)))
    return t * t * (3 - 2 * t)


def bone_weights(point: Vector, chain: list[int], skeleton: list[Vector], blend: float) -> tuple[int, int, float]:
    """The two bones that move `point` and the second one's share, bending smoothly across each joint.

    skeleton[k] is the joint between chain[k] and chain[k + 1]; a part with no skeleton follows chain[0].
    """
    if len(chain) == 1:
        return chain[0], chain[0], 0.0
    nearest, along, travelled, joints = math.inf, 0.0, 0.0, []
    for a, b in zip(skeleton, skeleton[1:]):
        joints.append(travelled)
        segment = b - a
        t = max(0.0, min(1.0, (point - a).dot(segment) / segment.length_squared))
        distance = (point - (a + segment * t)).length
        if distance < nearest:
            nearest, along = distance, travelled + t * segment.length
        travelled += segment.length
    k = min(range(len(joints)), key=lambda j: abs(along - joints[j]))
    return chain[k], chain[k + 1], smoothstep(-blend, blend, along - joints[k])


FIGURE_MESHES = {"figure": "figure_rafey", "backrest": "figure_backrest"}  # one per colour layer


def build_figure_mesh(name: str, parts: dict, index: dict, coll: bpy.types.Collection) -> set[int]:
    """Live parts as one mesh; every vertex carries the two bones that move it and their mix."""
    depsgraph = bpy.context.evaluated_depsgraph_get()
    bm = bmesh.new()
    layers = [bm.verts.layers.float.new(attr) for attr in ("_bone_a", "_bone_b", "_weight_b")]
    for part_name, part in parts.items():
        first = len(bm.verts)
        append_world_mesh(bm, sc.obj(part_name), depsgraph)
        bm.verts.ensure_lookup_table()
        chain = [index[bone] for bone in part["chain"]]
        skeleton = [Vector(p) for p in part["skeleton"]]
        for vert in bm.verts[first:]:
            for layer, value in zip(layers, bone_weights(vert.co, chain, skeleton, part["blend"])):
                vert[layer] = value
    used = {round(v[layers[0]]) for v in bm.verts} | {round(v[layers[1]]) for v in bm.verts}
    print(f"[export] {name}: {len(parts)} parts, {len(bm.faces)} faces")
    ob = mesh_object(name, bm, coll, "figure")
    ob["studio_name"] = sorted(parts)[0]  # a member of its colour layer, so the page can find that layer
    return used


def build_figure(scene: bpy.types.Scene, coll: bpy.types.Collection) -> None:
    raw = scene.get(sc.FIGURE_RIG)
    if raw is None:
        return
    rig = json.loads(raw)
    index = {bone["name"]: i for i, bone in enumerate(rig["bones"])}
    used: set[int] = set()
    for layer, name in FIGURE_MESHES.items():
        parts = {k: v for k, v in rig["parts"].items() if v["layer"] == layer}
        used |= build_figure_mesh(name, parts, index, coll)
    print(f"[export] figure bones in use: {len(used)} of {len(index)}")


def figure_facts(scene: bpy.types.Scene) -> dict | None:
    """Bones in parent-first order, pivots in three.js space, for the page to pose."""
    raw = scene.get(sc.FIGURE_RIG)
    if raw is None:
        return None
    rig = json.loads(raw)
    index = {bone["name"]: i for i, bone in enumerate(rig["bones"])}
    return {
        "bones": [
            {"name": b["name"], "parent": index[b["parent"]] if b["parent"] else -1, "pivot": sc.to_three_point(b["pivot"])}
            for b in rig["bones"]
        ],
        # where each wrist settles on the armrest when he leans back
        "rests": {side: sc.to_three_point(point) for side, point in rig["rests"].items()},
        # the top of the mouse (after it is pulled within reach), where his right palm rests
        **({"mouse": sc.to_three_point(rig["mouse"])} if rig.get("mouse") else {}),
        # metres between key centres on the room's keyboard: [across, between rows]
        **({"keyPitch": rig["keyPitch"]} if rig.get("keyPitch") else {}),
    }


def monitor_facts() -> dict:
    """The screen's corners in three.js space, as you face it: bottom-left, bottom-right, top-left."""
    screen = sc.obj(sc.MONITOR_SCREEN)
    corners = [screen.matrix_world @ Vector(c) for c in screen.bound_box]
    x0, x1 = min(c.x for c in corners), max(c.x for c in corners)
    z0, z1 = min(c.z for c in corners), max(c.z for c in corners)
    y = min(c.y for c in corners)  # the screen faces the room (-y)
    return {"corners": [sc.to_three_point(p) for p in ((x0, y, z0), (x1, y, z0), (x0, y, z1))]}


def build_ground_proxy(coll: bpy.types.Collection) -> bpy.types.Object:
    """The 120 m ground plane as its own primitive, so Draco quantises it separately."""
    bm = bmesh.new()
    append_world_mesh(bm, sc.obj(GROUND), bpy.context.evaluated_depsgraph_get())
    return mesh_object("proxy_ground", bm, coll, "ground")


def live_copy(source: bpy.types.Object, coll: bpy.types.Collection, role: str) -> bpy.types.Object:
    """Unparented twin sharing the mesh, so the glb node carries the world transform."""
    ob = bpy.data.objects.new(f"{role}_{slug(source.name)}", source.data)
    ob.matrix_world = source.matrix_world.copy()
    for key in ("studio_role", "studio_height"):
        if key in source:
            ob[key] = source[key]
    ob["studio_role"] = role
    ob["studio_name"] = source.name
    coll.objects.link(ob)
    return ob


def scene_facts(scene: bpy.types.Scene) -> dict:
    """Positions and light setups the web scene needs, in three.js Y-up coordinates."""
    ref = sc.obj(sc.REF_CAMERA)
    moon, up = sc.obj(sc.MOONLIGHT), sc.obj(sc.UPLIGHT)
    cutter = sc.obj("Window_Cutter")
    corners = [cutter.matrix_world @ Vector(c) for c in cutter.bound_box]
    frame = [sc.obj(sc.WINDOW_FRAME).matrix_world @ Vector(c) for c in sc.obj(sc.WINDOW_FRAME).bound_box]
    walls = [sc.obj("Walls").matrix_world @ Vector(c) for c in sc.obj("Walls").bound_box]

    def spot(light: bpy.types.Object) -> dict:
        return {
            "position": sc.to_three_point(light.matrix_world.translation),
            "direction": sc.to_three_direction(sc.light_forward(light)),
            "coneDeg": round(math.degrees(light.data.spot_size), 4),
            "blend": round(light.data.spot_blend, 4),
            "radius": round(light.data.shadow_soft_size, 4),
        }

    wall_x = sum(c.x for c in frame) / len(frame)
    aperture_blender = [
        (wall_x, min(c.y for c in corners), min(c.z for c in corners)),
        (wall_x, max(c.y for c in corners), max(c.z for c in corners)),
    ]
    clock = sc.obj(sc.PHONE_CLOCK)
    return {
        "camera": {
            "matrix": sc.to_three_matrix(ref.matrix_world),
            "lens": ref.data.lens,
            "sensor": ref.data.sensor_width,
            "near": ref.data.clip_start,
            "far": ref.data.clip_end,
        },
        "quality": sc.QUALITY,
        "plate": {"width": sc.OVERSCAN_WIDTH, "height": sc.OVERSCAN_HEIGHT, "crop": list(sc.REF_CROP)},
        "moon": spot(moon),
        "uplight": spot(up),
        "candle": {"position": sc.to_three_point(sc.obj(sc.CANDLE_LIGHT).matrix_world.translation)},
        "aperture": [sc.to_three_point(p) for p in aperture_blender],
        # The window opening in three.js coords: both wall faces (x) and the hole's y/z extent
        "opening": {
            "facesX": [-2.0, -2.15],
            "y": [round(min(c.z for c in corners), 4), round(max(c.z for c in corners), 4)],
            "z": [round(-max(c.y for c in corners), 4), round(-min(c.y for c in corners), 4)],
        },
        "room": [
            sc.to_three_point((min(c.x for c in walls), min(c.y for c in walls), min(c.z for c in walls))),
            sc.to_three_point((max(c.x for c in walls), max(c.y for c in walls), max(c.z for c in walls))),
        ],
        "clock": {"matrix": sc.to_three_matrix(clock.matrix_world), "box": [list(clock.bound_box[0]), list(clock.bound_box[6])]},
        "plants": [
            {"name": n, "slug": slug(n), "height": sc.obj(n)["studio_height"]} for n in sc.PLANTS
        ],
        "figure": figure_facts(scene),
        "monitor": monitor_facts(),
    }


def export_glb(coll: bpy.types.Collection, path: str) -> None:
    bpy.ops.object.select_all(action="DESELECT")
    for ob in coll.objects:
        ob.select_set(True)
    os.makedirs(os.path.dirname(path), exist_ok=True)
    bpy.ops.export_scene.gltf(
        filepath=path,
        export_format="GLB",
        use_selection=True,
        export_apply=True,
        export_normals=False,
        export_texcoords=True,
        export_tangents=False,
        export_materials="NONE",
        export_vertex_color="NONE",
        export_attributes=True,
        export_extras=True,
        export_cameras=False,
        export_lights=False,
        export_yup=True,
        export_animations=False,
        export_skins=False,
        export_morph=False,
        export_draco_mesh_compression_enable=True,
        export_draco_mesh_compression_level=6,
        export_draco_position_quantization=16,
        export_draco_generic_quantization=12,
        export_draco_texcoord_quantization=12,
    )
    print(f"[export] {path}: {os.path.getsize(path) / 1024:.0f} KB")


def main() -> None:
    sc.assert_source_blend()
    p = sc.parser(__doc__)
    p.add_argument("--no-set-dressing", action="store_true")
    p.add_argument("--glb", default=os.path.join(sc.PUBLIC_DIR, "studio.glb"))
    p.add_argument("--facts", default=os.path.join(sc.OUT_DIR, "scene.json"))
    args = p.parse_args(sc.script_args())
    scene = bpy.context.scene
    studio_prep.apply(scene, with_set_dressing=not args.no_set_dressing)
    coll = export_collection(scene)
    build_room_proxy(scene, coll)
    build_ground_proxy(coll)
    for name in sc.PLANTS:
        live_copy(sc.obj(name), coll, "plant")
    tree = bpy.data.objects.get(sc.TREE_SWAY)
    if tree is not None:
        live_copy(tree, coll, "tree")
    build_figure(scene, coll)
    export_glb(coll, args.glb)
    sc.ensure_out_dir(os.path.dirname(args.facts))
    with open(args.facts, "w") as f:
        json.dump(scene_facts(scene), f, indent=2)
    print(f"[export] facts -> {args.facts}")


if __name__ == "__main__":
    main()
