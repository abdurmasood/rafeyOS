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


FIGURE_MESHES = {"figure": "figure_rafey", "backrest": "figure_backrest", "door": "figure_door"}  # one per colour layer
# For live lighting (studio_probes.py): each vertex's rest normal and diffuse colour, as scalar attributes
FIGURE_SURFACE = ("_nx", "_ny", "_nz", "_ar", "_ag", "_ab")
FALLBACK_ALBEDO = (0.18, 0.18, 0.18)


def linked_colour(socket) -> tuple[float, float, float] | None:
    """The colour feeding a socket, roughly: an RGB node's, a ramp's mean stop, or the mean of a mix's colours."""
    node = socket.links[0].from_node
    if node.type == "RGB":
        return tuple(node.outputs[0].default_value[:3])
    if node.type == "VALTORGB":
        stops = [e.color[:3] for e in node.color_ramp.elements]
        return tuple(sum(c[i] for c in stops) / len(stops) for i in range(3))
    colours = []
    for inp in node.inputs:
        if inp.type != "RGBA" or not inp.enabled:
            continue
        colours.append(linked_colour(inp) if inp.is_linked else tuple(inp.default_value[:3]))
    colours = [c for c in colours if c is not None]
    if not colours:
        return None
    return tuple(sum(c[i] for c in colours) / len(colours) for i in range(3))


def material_albedo(material) -> tuple[float, float, float]:
    """A material's diffuse colour (scene-linear) for the page's live lighting; metals count half."""
    if material is None or not material.use_nodes:
        return FALLBACK_ALBEDO
    bsdf = next((n for n in material.node_tree.nodes if n.type == "BSDF_PRINCIPLED"), None)
    if bsdf is None:
        return FALLBACK_ALBEDO
    base = bsdf.inputs["Base Color"]
    colour = (linked_colour(base) if base.is_linked else tuple(base.default_value[:3])) or FALLBACK_ALBEDO
    metal = bsdf.inputs["Metallic"]
    metallic = 0.0 if metal.is_linked else metal.default_value
    return tuple(c * (1 - 0.5 * metallic) for c in colour)


def face_albedos(mesh: bpy.types.Mesh) -> list[tuple[float, float, float]]:
    """Each face's diffuse colour, from its material slot."""
    by_slot = [material_albedo(m) for m in mesh.materials] or [FALLBACK_ALBEDO]
    return [by_slot[min(poly.material_index, len(by_slot) - 1)] for poly in mesh.polygons]


def surface_layers(bm: bmesh.types.BMesh) -> list:
    return [bm.verts.layers.float.new(attr) for attr in FIGURE_SURFACE]


def paint_albedo(bm: bmesh.types.BMesh, layers: list, first_face: int, albedos: list) -> None:
    """Give the vertices of the faces added since first_face their face's colour."""
    bm.faces.ensure_lookup_table()
    for face, colour in zip(bm.faces[first_face:], albedos):
        for vert in face.verts:
            for layer, value in zip(layers[3:], colour):
                vert[layer] = value


def store_normals(bm: bmesh.types.BMesh, layers: list) -> None:
    """Rest normals in three.js axes (custom attributes aren't converted by the y-up export)."""
    bm.normal_update()
    for vert in bm.verts:
        n = vert.normal
        for layer, value in zip(layers[:3], (n.x, n.z, -n.y)):
            vert[layer] = value


def painted_weights(ob: bpy.types.Object, depsgraph: bpy.types.Depsgraph, index: dict) -> tuple[bpy.types.Mesh, list]:
    """A weight-painted part's evaluated mesh (world space) and, per vertex, its two strongest bones and their mix."""
    mesh = bpy.data.meshes.new_from_object(ob.evaluated_get(depsgraph), preserve_all_data_layers=True, depsgraph=depsgraph)
    mesh.transform(ob.matrix_world)
    groups = {g.index: index[g.name] for g in ob.vertex_groups if g.name in index}
    weights = []
    for vert in mesh.vertices:
        ranked = sorted(((e.weight, groups[e.group]) for e in vert.groups if e.group in groups and e.weight > 0), reverse=True)
        if not ranked:
            raise sc.StudioPipelineError(f"{ob.name}: vertex {vert.index} is moved by no bone")
        (wa, a), (wb, b) = ranked[0], ranked[1] if len(ranked) > 1 else (0.0, ranked[0][1])
        weights.append((a, b, wb / (wa + wb)))
    return mesh, weights


def build_figure_mesh(name: str, parts: dict, index: dict, coll: bpy.types.Collection) -> set[int]:
    """Live parts as one mesh; every vertex carries the two bones that move it and their mix."""
    depsgraph = bpy.context.evaluated_depsgraph_get()
    bm = bmesh.new()
    layers = [bm.verts.layers.float.new(attr) for attr in ("_bone_a", "_bone_b", "_weight_b")]
    surface = surface_layers(bm)
    for part_name, part in parts.items():
        first = len(bm.verts)
        first_face = len(bm.faces)
        if part.get("skin"):
            mesh, weights = painted_weights(sc.obj(part_name), depsgraph, index)
            albedos = face_albedos(mesh)
            bm.from_mesh(mesh)
            bpy.data.meshes.remove(mesh)
            paint_albedo(bm, surface, first_face, albedos)
            bm.verts.ensure_lookup_table()
            for vert, values in zip(bm.verts[first:], weights):
                for layer, value in zip(layers, values):
                    vert[layer] = value
            continue
        ob = sc.obj(part_name)
        tmp = bpy.data.meshes.new_from_object(ob.evaluated_get(depsgraph))
        tmp.transform(ob.matrix_world)
        albedos = face_albedos(tmp)
        bm.from_mesh(tmp)
        bpy.data.meshes.remove(tmp)
        paint_albedo(bm, surface, first_face, albedos)
        bm.verts.ensure_lookup_table()
        chain = [index[bone] for bone in part["chain"]]
        skeleton = [Vector(p) for p in part["skeleton"]]
        for vert in bm.verts[first:]:
            for layer, value in zip(layers, bone_weights(vert.co, chain, skeleton, part["blend"])):
                vert[layer] = value
    used = {round(v[layers[0]]) for v in bm.verts} | {round(v[layers[1]]) for v in bm.verts}
    store_normals(bm, surface)
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
        if parts:  # a room with a window has no door layer
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
        # the desk's front edge across his hands, where he pushes off to roll away
        **({"desk": {"edge": [sc.to_three_point(p) for p in rig["desk"]["edge"]]}} if rig.get("desk") else {}),
        # where the chair goes to play the synths, Synth A's key line (low to high) and a reach point on Synth B
        **(
            {
                "synth": {
                    "seat": sc.to_three_point(rig["synth"]["seat"]),
                    "keys": [sc.to_three_point(p) for p in rig["synth"]["keys"]],
                    "upper": sc.to_three_point(rig["synth"]["upper"]),
                }
            }
            if rig.get("synth")
            else {}
        ),
        # where the guitar hangs: the bone's pivot (body centre) and its lowest and highest points
        **(
            {"guitar": {key: sc.to_three_point(rig["guitar"][key]) for key in ("centre", "bottom", "top")}}
            if rig.get("guitar")
            else {}
        ),
        # the door that replaced the window: its hinge (the bone's pivot; it opens turning about +y), the leaf's size,
        # how far it opens (degrees), its room-side handle, the doorway and the hall behind it (three.js boxes)
        **({"door": door_facts(rig["door"])} if rig.get("door") else {}),
        # his mug on its coaster: the cup's bottom centre (the bone's pivot), its rim height and its handle
        **(
            {"mug": {"rest": sc.to_three_point(rig["mug"]["rest"]), "top": round(rig["mug"]["top"], 4), "handle": sc.to_three_point(rig["mug"]["handle"])}}
            if rig.get("mug")
            else {}
        ),
        # Synth A's keys, low to high (studio_keys.py): their top's back and front middles, half widths and groups
        "synthKeys": synth_keys(),
        # his skull (three.js centre; half-sizes across, front to back, up) and the headphones' linear colour
        **(
            {
                "headphones": {
                    "centre": sc.to_three_point(rig["headphones"]["centre"]),
                    "radii": rig["headphones"]["radii"],
                    "colour": rig["headphones"]["colour"],
                }
            }
            if rig.get("headphones")
            else {}
        ),
    }


def synth_keys() -> list[dict]:
    import studio_keys

    return studio_keys.facts()


def three_box(low, high) -> list[list[float]]:
    """A Blender-axes box as its three.js min and max corners."""
    a, b = sc.to_three_point(low), sc.to_three_point(high)
    return [[min(a[i], b[i]) for i in range(3)], [max(a[i], b[i]) for i in range(3)]]


def door_facts(door: dict) -> dict:
    (x0, x1), (y0, y1), (z0, z1) = door["opening"]["x"], door["opening"]["y"], door["opening"]["z"]
    return {
        "hinge": sc.to_three_point(door["hinge"]),
        "width": round(door["width"], 4),
        "height": round(door["height"], 4),
        "thickness": door["thickness"],
        "open": door["open"],
        "handle": sc.to_three_point(door["handle"]),
        "doorway": three_box((min(x0, x1), y0, z0), (max(x0, x1), y1, z1)),
        "hall": three_box(door["hall"]["low"], door["hall"]["high"]),
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


def opening_facts(window_corners: list[Vector] | None) -> dict:
    """The window's hole (from its cutter) or, with the door, the doorway (studio_door.py)."""
    if window_corners is not None:
        ys, zs = [c.y for c in window_corners], [c.z for c in window_corners]
    else:
        door = json.loads(bpy.context.scene[sc.DOOR_FACTS])["opening"]
        ys, zs = door["y"], door["z"]
    return {"facesX": [-2.0, -2.15], "y": [round(min(zs), 4), round(max(zs), 4)], "z": [round(-max(ys), 4), round(-min(ys), 4)]}


def scene_facts(scene: bpy.types.Scene) -> dict:
    """Positions and light setups the web scene needs, in three.js Y-up coordinates."""
    ref = sc.obj(sc.REF_CAMERA)
    moon, up = sc.obj(sc.MOONLIGHT), sc.obj(sc.UPLIGHT)
    window = sc.OPENING == sc.OPENING_WINDOW
    cutter = sc.obj(sc.WINDOW_CUTTER)
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
        # moonlight comes in only through a window: with the door in its place there's none
        **({"moon": spot(moon), "aperture": [sc.to_three_point(p) for p in aperture_blender]} if window else {}),
        "uplight": spot(up),
        "candle": {"position": sc.to_three_point(sc.obj(sc.CANDLE_LIGHT).matrix_world.translation)},
        # The opening in the west wall, window or doorway, in three.js coords: both wall faces (x), its y/z extent
        "opening": opening_facts(corners if window else None),
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
    out_dir = sc.ensure_out_dir(os.path.dirname(args.facts))
    facts = scene_facts(scene)
    import studio_motion  # Mixamo clips, fitted to him (only those downloaded)

    motion = studio_motion.bake_clips(scene, out_dir)
    if motion:
        facts["motion"] = motion
    with open(args.facts, "w") as f:
        json.dump(facts, f, indent=2)
    print(f"[export] facts -> {args.facts}")


if __name__ == "__main__":
    main()
