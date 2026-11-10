"""Light for him once he leaves the chair, measured by Cycles itself.

Seated, the page colours him from the render. Standing or walking, he shows sides the camera never saw and
stands in light the render never put him in, so the page lights him live instead:

- Light probes: a grid of tiny white cubes over the floor he can walk and the chair area, baked by Cycles with
  him hidden. Each face holds the light arriving from its side (an "ambient cube": six colours per probe).
- A display LUT: a grid of scene-linear colours pushed through the scene's own colour management (exposure,
  AgX and its look) and the compositor's colour-balance gain, so a live-lit colour lands on the same display
  values the plates use. Bloom is not reproduced.

Read-only on the room: everything is in memory; nothing is saved.
"""

from __future__ import annotations

import json
import os

import bpy
import numpy as np
from mathutils import Vector

import studio_common as sc

# The probe grid, Blender world metres: the floor he can walk and the chair, at knee, chest and head height
PROBE_X = (-1.9, 1.7)
PROBE_Y = (-1.7, 1.5)
PROBE_Z = (0.3, 0.9, 1.5)
PROBE_STEP = 0.4
# Each probe is a tiny white cube baked by Cycles: each face's diffuse light (direct and indirect, no colour)
# is the light arriving from that side, lamps included (they're invisible to camera rays, so panoramas miss them)
PROBE_CUBE = 0.02  # m across
BAKE_BLOCK = 4  # texels a face gets in the bake image (its middle texel is read)
BAKE_SPP = 64
FACE_NORMALS = ((1, 0, 0), (-1, 0, 0), (0, 1, 0), (0, -1, 0), (0, 0, 1), (0, 0, -1))  # Blender axes, in bake order
INSIDE_HITS = 3  # a probe whose rays meet the back of a surface in this many of six directions is inside furniture
LUT_SIZE = 33
LUT_STOPS = (-12.0, 6.0)  # log2 range of scene-linear values the LUT covers


def axis_range(span: tuple[float, float]) -> list[float]:
    count = int(round((span[1] - span[0]) / PROBE_STEP)) + 1
    return [round(span[0] + i * PROBE_STEP, 4) for i in range(count)]


def probe_points() -> tuple[list[tuple[float, float, float]], tuple[int, int, int]]:
    """Grid points x-fastest, then y, then z; and the grid's counts."""
    xs, ys, zs = axis_range(PROBE_X), axis_range(PROBE_Y), list(PROBE_Z)
    return [(x, y, z) for z in zs for y in ys for x in xs], (len(xs), len(ys), len(zs))


def solid(ob: bpy.types.Object) -> bool:
    """Whether a ray hit counts: not the room's haze volume, cutters or anything hidden from renders."""
    return not (ob.name == sc.ROOM_HAZE or ob.hide_render or ob.display_type in {"WIRE", "BOUNDS"})


def first_solid_hit(scene, depsgraph, origin: Vector, direction: Vector, reach: float = 3.0):
    """The first hit on a solid surface along a ray (passing through haze and the like), or None."""
    start = origin.copy()
    for _ in range(8):
        hit, location, normal, _, ob, _ = scene.ray_cast(depsgraph, start, direction, distance=reach)
        if not hit:
            return None
        if solid(ob):
            return normal
        start = location + direction * 1e-3
    return None


def inside_furniture(scene: bpy.types.Scene, point: tuple[float, float, float]) -> bool:
    """True when the point is inside a closed mesh: rays from it meet the backs of surfaces."""
    depsgraph = bpy.context.evaluated_depsgraph_get()
    backs = 0
    for direction in ((1, 0, 0), (-1, 0, 0), (0, 1, 0), (0, -1, 0), (0, 0, 1), (0, 0, -1)):
        d = Vector(direction)
        normal = first_solid_hit(scene, depsgraph, Vector(point), d)
        if normal is not None and normal.dot(d) > 0:
            backs += 1
    return backs >= INSIDE_HITS


def him_hidden(changes: list) -> list:
    """Hide him (not the chair or guitar) from every ray: the probes measure the room's light without him."""
    for name in [*sc.live_figure_parts(role=sc.ROLE_HIM), sc.FIGURE_SHADOW]:
        changes.append((sc.obj(name), "hide_render", True))
    return changes


def probe_cubes(points: list, valid: list) -> tuple[bpy.types.Object, bpy.types.Image, int]:
    """One mesh of small cubes (one per valid probe), each face given its own BAKE_BLOCK square in a bake image."""
    import bmesh

    faces_total = 6 * sum(valid)
    per_row = 64
    rows = (faces_total + per_row - 1) // per_row
    image = bpy.data.images.new("Studio Probe Bake", width=per_row * BAKE_BLOCK, height=rows * BAKE_BLOCK, float_buffer=True, alpha=False)
    bm = bmesh.new()
    uv = bm.loops.layers.uv.new("UVMap")
    h = PROBE_CUBE / 2
    face = 0
    for point, ok in zip(points, valid):
        if not ok:
            continue
        centre = Vector(point)
        for normal in FACE_NORMALS:
            n = Vector(normal)
            a = Vector((n.y, n.z, n.x)) if n.x == 0 else Vector((0, 1, 0))
            b = n.cross(a)
            corners = [centre + n * h + (a * sa + b * sb) * h for sa, sb in ((-1, -1), (1, -1), (1, 1), (-1, 1))]
            made = bm.faces.new([bm.verts.new(c) for c in corners])
            made.normal_update()
            if made.normal.dot(n) < 0:
                made.normal_flip()
            col, row = face % per_row, face // per_row
            u0, v0 = col / per_row, row / rows
            u1, v1 = (col + 1) / per_row, (row + 1) / rows
            pad_u, pad_v = (u1 - u0) * 0.25, (v1 - v0) * 0.25
            for loop, (u, v) in zip(made.loops, ((u0, v0), (u1, v0), (u1, v1), (u0, v1))):
                loop[uv].uv = (min(max(u, u0 + pad_u), u1 - pad_u), min(max(v, v0 + pad_v), v1 - pad_v))
            face += 1
    mesh = bpy.data.meshes.new("Studio Probes")
    bm.to_mesh(mesh)
    bm.free()
    material = bpy.data.materials.new("Studio Probe White")
    material.use_nodes = True
    nodes = material.node_tree.nodes
    bsdf = next(n for n in nodes if n.type == "BSDF_PRINCIPLED")
    bsdf.inputs["Base Color"].default_value = (1, 1, 1, 1)
    bsdf.inputs["Roughness"].default_value = 1.0
    target = nodes.new("ShaderNodeTexImage")
    target.image = image
    nodes.active = target
    mesh.materials.append(material)
    ob = bpy.data.objects.new("Studio Probes", mesh)
    bpy.context.scene.collection.objects.link(ob)
    ob.visible_shadow = False  # the probes don't shade each other or the room
    return ob, image, per_row


def render_probes(scene: bpy.types.Scene, out_dir: str, temporarily) -> None:
    """Bake the probe cubes and write probes.exr (one BAKE_BLOCK square per face) and probes.json."""
    points, counts = probe_points()
    valid = [not inside_furniture(scene, p) for p in points]
    ob, image, per_row = probe_cubes(points, valid)
    bake = scene.render.bake
    changes = him_hidden(
        [
            # the plates' cached scene doesn't hold the probe cubes; without this the bake reads nothing
            (scene.render, "use_persistent_data", False),
            (scene.cycles, "samples", BAKE_SPP),
            (bake, "use_pass_direct", True),
            (bake, "use_pass_indirect", True),
            (bake, "use_pass_color", False),  # light only: what a white surface would reflect
            (bake, "margin", 0),
        ]
    )
    with temporarily(changes):
        bpy.ops.object.select_all(action="DESELECT")
        ob.select_set(True)
        bpy.context.view_layer.objects.active = ob
        bpy.ops.object.bake(type="DIFFUSE", pass_filter={"DIRECT", "INDIRECT"}, use_clear=True, margin=0)
    width, height = image.size
    pixels = np.array(image.pixels[:], dtype=np.float32).reshape(height, width, 4)[..., :3]  # rows bottom-up
    cubes, face = [], 0
    for ok in valid:
        sides = []
        for _ in FACE_NORMALS:
            if ok:
                col, row = face % per_row, face // per_row
                x0, y0 = col * BAKE_BLOCK + BAKE_BLOCK // 2 - 1, row * BAKE_BLOCK + BAKE_BLOCK // 2 - 1
                sides.append([round(float(v), 6) for v in pixels[y0 : y0 + 2, x0 : x0 + 2].reshape(-1, 3).mean(axis=0)])
                face += 1
            else:
                sides.append([0.0, 0.0, 0.0])
        cubes.append(sides)
    bpy.data.objects.remove(ob)
    bpy.data.images.remove(image)
    with open(os.path.join(out_dir, "probes.json"), "w") as f:
        json.dump({"points": points, "counts": counts, "step": PROBE_STEP, "valid": valid, "faces": FACE_NORMALS, "cubes": cubes}, f)
    lit = np.array([c for c, ok in zip(cubes, valid) if ok])
    print(f"[render] probes: {sum(valid)} of {len(points)} baked ({counts[0]}x{counts[1]}x{counts[2]}), median face light {np.round(np.median(lit, axis=(0, 1)), 4)}")


def colour_balance_gain(scene: bpy.types.Scene) -> tuple[float, float, float]:
    """The compositor's colour-balance gain (applied to scene-linear colour before the view transform)."""
    tree = scene.compositing_node_group if hasattr(scene, "compositing_node_group") else scene.node_tree
    node = next((n for n in tree.nodes if n.type == "COLORBALANCE"), None) if tree else None
    if node is None:
        return (1.0, 1.0, 1.0)
    if hasattr(node, "gain"):  # before Blender 5: a property
        return tuple(node.gain[:3])
    colour = next(i for i in node.inputs if i.identifier == "Color Gain").default_value
    base = next(i for i in node.inputs if i.identifier == "Base Gain").default_value
    return tuple(c * base for c in colour[:3])


def display_lut(scene: bpy.types.Scene, out_dir: str) -> None:
    """lut.png: LUT_SIZE^3 log-spaced scene-linear colours (laid out as LUT_SIZE tiles of LUT_SIZE x LUT_SIZE,
    blue picks the tile) saved through the scene's colour management; lut.json says how to index it."""
    n = LUT_SIZE
    low, high = LUT_STOPS
    levels = 2.0 ** (low + (high - low) * np.arange(n) / (n - 1))
    gain = colour_balance_gain(scene)
    b, g, r = np.meshgrid(levels, levels, levels, indexing="ij")  # tile = blue, row = green, column = red
    pixels = np.ones((n, n * n, 4), dtype=np.float32)  # rows (green) x (tiles of red)
    for tile in range(n):
        pixels[:, tile * n : (tile + 1) * n, 0] = r[tile] * gain[0]
        pixels[:, tile * n : (tile + 1) * n, 1] = g[tile] * gain[1]
        pixels[:, tile * n : (tile + 1) * n, 2] = b[tile] * gain[2]
    image = bpy.data.images.new("Studio LUT", width=n * n, height=n, float_buffer=True, alpha=False)
    image.pixels.foreach_set(pixels.ravel())
    settings = scene.render.image_settings
    path = os.path.join(out_dir, "lut.png")
    with_png = [(settings, "file_format", "PNG"), (settings, "color_depth", "16"), (settings, "color_mode", "RGB")]
    saved = [(t, a, getattr(t, a)) for t, a, _ in with_png]
    for t, a, v in with_png:
        setattr(t, a, v)
    try:
        image.save_render(path, scene=scene)  # the scene's view transform, look and exposure
    finally:
        for t, a, v in saved:
            setattr(t, a, v)
    bpy.data.images.remove(image)
    with open(os.path.join(out_dir, "lut.json"), "w") as f:
        json.dump({"size": n, "stops": list(LUT_STOPS), "gain": list(gain), "view": scene.view_settings.view_transform, "look": scene.view_settings.look}, f)
    print(f"[render] display LUT {n}^3 through {scene.view_settings.view_transform} / {scene.view_settings.look}, gain {gain}")
