"""Set dressing for the web build: an opened sash window, a night sky farther out, a tree, and Rafey at the desk.

Applied in memory only. Each step is idempotent within one Blender session.
"""

from __future__ import annotations

import os
import sys

sys.path.insert(0, os.path.dirname(__file__))

import bmesh  # noqa: E402
import bpy  # noqa: E402
from mathutils import Vector  # noqa: E402

import studio_common as sc  # noqa: E402
import studio_figure  # noqa: E402
import studio_tree  # noqa: E402

SASH_X_MAX = -2.05  # frame islands outside this x form the sash; the rest is interior casing
SASH_RAISE = 0.5  # m the lower sash slides up (double-hung), leaving the bottom half open
SASH_INSET = 0.03  # the raised sash runs in its own track, just inside the upper one
LOWER_SASH_RAILS_MAX_Z = 1.4  # bottom rail (z 0.75) and meeting rail (z 1.34) belong to the lower sash
BACKDROP_X = -2.95  # rays through the window's bottom reach the ground at x = -3.03
GROUND = "Ground"
GROUND_LIGHT = "Backdrop Glow"  # light-linked to the ground only, so switching it off leaves the room as rendered
GROUND_COLOUR = (0.003, 0.003, 0.003, 1.0)  # near-black, so the page matches the terminal's #000
BACKDROP_MARGIN = 0.02  # m; any larger and the camera sees it over the wall
OPENING_FACES_X = (-2.0, -2.15)  # inner and outer faces of the wall at the window
# The night sky (Rafey picked it from five previews, 2026-11-06). Positions are in backdrop
# coordinates, 0..1 along the wall and up it.
SKY_COLOUR = (0.004, 0.004, 0.007, 1.0)  # near-black, like the page around the room
MOON_GLOW_COLOUR = (0.10, 0.11, 0.14, 1.0)  # cool, soft glow behind the leaves
MOON_GLOW_CENTRE = (0.34, 0.80)  # upper part of the backdrop, toward the moon
MOON_GLOW_RADIUS = 0.7  # the glow has faded to the sky colour by here
MOON_GLOW_FALLOFF = 2.2  # above 1: bright near the centre, gentle at the edge


def _islands(bm: bmesh.types.BMesh) -> list[list[bmesh.types.BMVert]]:
    seen: set[int] = set()
    islands = []
    for start in bm.verts:
        if start.index in seen:
            continue
        stack, island = [start], []
        while stack:
            v = stack.pop()
            if v.index in seen:
                continue
            seen.add(v.index)
            island.append(v)
            stack.extend(e.other_vert(v) for e in v.link_edges)
        islands.append(island)
    return islands


def open_window(scene: bpy.types.Scene) -> None:
    """Slide the lower sash up behind the upper one, like an opened double-hung window."""
    frame = sc.obj(sc.WINDOW_FRAME)
    if frame.get("studio_opened"):
        return
    world, local = frame.matrix_world, frame.matrix_world.inverted()
    mesh = frame.data.copy()
    bm = bmesh.new()
    bm.from_mesh(mesh)
    bm.verts.ensure_lookup_table()
    for island in _islands(bm):
        points = [world @ v.co for v in island]
        is_sash = max(p.x for p in points) < SASH_X_MAX
        is_lower_rail = max(p.z for p in points) < LOWER_SASH_RAILS_MAX_Z and (
            max(p.y for p in points) - min(p.y for p in points) > 0.5
        )
        if is_sash and is_lower_rail:
            for v in island:
                v.co = local @ ((world @ v.co) + Vector((SASH_INSET, 0.0, SASH_RAISE)))
    bm.to_mesh(mesh)
    bm.free()
    frame.data = mesh
    frame["studio_opened"] = True


def _plane(name: str, corners: list[Vector], material: bpy.types.Material) -> bpy.types.Object:
    mesh = bpy.data.meshes.new(name)
    mesh.from_pydata([tuple(c) for c in corners], [], [(0, 1, 2, 3)])
    mesh.materials.append(material)
    return bpy.data.objects.new(name, mesh)


def _socket(sockets: bpy.types.bpy_prop_collection, identifier: str) -> bpy.types.NodeSocket:
    """Mix nodes keep hidden float/vector sockets under the same names, so pick by identifier."""
    return next(s for s in sockets if s.identifier == identifier)


def _night_sky() -> bpy.types.Material:
    """Near-black sky with a soft moon glow, replacing the original flat blue."""
    material = bpy.data.materials.new("Studio Night Sky")
    material.use_nodes = True
    nodes, links = material.node_tree.nodes, material.node_tree.links
    nodes.clear()
    coords, split, flat = (nodes.new(t) for t in ("ShaderNodeTexCoord", "ShaderNodeSeparateXYZ", "ShaderNodeCombineXYZ"))
    distance, fade, soften = (nodes.new(t) for t in ("ShaderNodeVectorMath", "ShaderNodeMapRange", "ShaderNodeMath"))
    colour, emission = nodes.new("ShaderNodeMix"), nodes.new("ShaderNodeEmission")
    output = nodes.new("ShaderNodeOutputMaterial")
    # Generated coordinates span the plane 0..1: y runs along the wall, z up it
    links.new(coords.outputs["Generated"], split.inputs[0])
    links.new(split.outputs["Y"], flat.inputs["X"])
    links.new(split.outputs["Z"], flat.inputs["Y"])
    distance.operation = "DISTANCE"
    links.new(flat.outputs[0], distance.inputs[0])
    distance.inputs[1].default_value = (*MOON_GLOW_CENTRE, 0.0)
    links.new(distance.outputs["Value"], fade.inputs["Value"])
    fade.inputs["From Max"].default_value = MOON_GLOW_RADIUS
    fade.inputs["To Min"].default_value, fade.inputs["To Max"].default_value = 1.0, 0.0
    soften.operation = "POWER"
    links.new(fade.outputs["Result"], soften.inputs[0])
    soften.inputs[1].default_value = MOON_GLOW_FALLOFF
    colour.data_type = "RGBA"
    links.new(soften.outputs[0], _socket(colour.inputs, "Factor_Float"))
    _socket(colour.inputs, "A_Color").default_value = SKY_COLOUR
    _socket(colour.inputs, "B_Color").default_value = MOON_GLOW_COLOUR
    links.new(_socket(colour.outputs, "Result_Color"), emission.inputs["Color"])
    links.new(emission.outputs[0], output.inputs[0])
    return material


def sky_backdrop(scene: bpy.types.Scene) -> None:
    """Put a night sky farther out than the window's own, sized to every camera ray through the opening."""
    if bpy.data.objects.get(sc.SKY_BACKDROP) is not None:
        return
    sky = sc.obj(sc.WINDOW_SKY)
    cutter = sc.obj("Window_Cutter")
    corners = [cutter.matrix_world @ Vector(c) for c in cutter.bound_box]
    y0, y1 = min(c.y for c in corners), max(c.y for c in corners)
    z0, z1 = min(c.z for c in corners), max(c.z for c in corners)
    eye = sc.obj(sc.REF_CAMERA).matrix_world.translation
    hits = []
    for face_x in OPENING_FACES_X:
        for y in (y0, y1):
            for z in (z0, z1):
                through = Vector((face_x, y, z))
                ray = (through - eye).normalized()
                hits.append(through + ray * ((BACKDROP_X - through.x) / ray.x))
    hy0, hy1 = min(h.y for h in hits), max(h.y for h in hits)
    hz0, hz1 = min(h.z for h in hits), max(h.z for h in hits)
    my = mz = BACKDROP_MARGIN
    quad = [
        Vector((BACKDROP_X, hy0 - my, hz0 - mz)),
        Vector((BACKDROP_X, hy1 + my, hz0 - mz)),
        Vector((BACKDROP_X, hy1 + my, hz1 + mz)),
        Vector((BACKDROP_X, hy0 - my, hz1 + mz)),
    ]
    backdrop = _plane(sc.SKY_BACKDROP, quad, _night_sky())
    for flag in ("visible_camera", "visible_diffuse", "visible_glossy", "visible_transmission",
                 "visible_volume_scatter", "visible_shadow"):
        setattr(backdrop, flag, getattr(sky, flag))
    scene.collection.objects.link(backdrop)
    sky.hide_render = True


def plant_tree(scene: bpy.types.Scene) -> None:
    if bpy.data.objects.get(sc.TREE_SWAY) is not None:
        return
    cutter = sc.obj("Window_Cutter")
    corners = [cutter.matrix_world @ Vector(c) for c in cutter.bound_box]
    opening = {
        "faces_x": OPENING_FACES_X,
        "y": (min(c.y for c in corners), max(c.y for c in corners)),
        "z": (min(c.z for c in corners), max(c.z for c in corners)),
        "eye": sc.obj(sc.REF_CAMERA).matrix_world.translation.copy(),
    }
    studio_tree.build(scene, sc.light_forward(sc.obj(sc.MOONLIGHT)), opening)


def black_floor(scene: bpy.types.Scene) -> None:
    """Terminal-black surroundings: a near-black floor that stays glossy for the room's reflection."""
    ground = sc.obj(GROUND)
    material = ground.material_slots[0].material
    if material.get("studio_black"):
        return
    material = material.copy()
    ground.material_slots[0].material = material
    bsdf = next(n for n in material.node_tree.nodes if n.type == "BSDF_PRINCIPLED")
    bsdf.inputs["Base Color"].default_value = GROUND_COLOUR
    material["studio_black"] = True
    sc.obj(GROUND_LIGHT).data.energy = 0.0


def apply(scene: bpy.types.Scene) -> None:
    black_floor(scene)
    open_window(scene)
    sky_backdrop(scene)
    plant_tree(scene)
    studio_figure.build(scene)
