"""Synth A's keys going down as he plays them (Rafey: "the keys should actually be pressed", 2 cm picked 2026-11-10).

Each key is its own mesh island in the synth (36 white, 27 black). The plates can't move them, so the build renders
how pressed keys look and the page swaps a key's pixels to that look as far as his fingers press it:

- keys_a / keys_b: every other white key pressed (so each pressed key has its neighbours up, and its gaps show);
  keys_black: every black key pressed (white keys always separate two black keys).
- keys_id: which key each plate pixel shows (red: key number + 1, 0 for none; green: its pressed group), rendered
  as exact flat colours, so the page can look up a pixel's key.

A key turns about its back edge, its front going down KEY_TRAVEL (twice a real key's 1 cm: at about 3 device pixels
a key, a real press barely shows). In memory only: the synth's mesh is swapped for a pressed copy and back.
"""

from __future__ import annotations

import os
import sys

sys.path.insert(0, os.path.dirname(__file__))

import bmesh  # noqa: E402
import bpy  # noqa: E402
import studio_common as sc  # noqa: E402

SYNTH = "Synth A (bottom)"
WHITE, BLACK = "Key White", "Key Black"
KEY_TRAVEL = 0.02  # m the front of a key goes down
GROUPS = ("keys_a", "keys_b", "keys_black")  # render names, in group order: the key map's green channel
ID_MATERIAL = "Studio Key ID"


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


def keys() -> list[dict]:
    """Every key, low to high along the synth: its vertex indices, colour, group and footprint (world, Blender axes).

    The keys point toward the player (+x): `back` and `front` are their x ends, `y` their sides, `top` their height."""
    synth = sc.obj(SYNTH)
    names = [m.name for m in synth.data.materials]
    bm = bmesh.new()
    bm.from_mesh(synth.data)
    bm.verts.ensure_lookup_table()
    found = []
    for island in _islands(bm):
        materials = {names[f.material_index] for v in island for f in v.link_faces}
        if not materials <= {WHITE, BLACK}:
            continue
        points = [synth.matrix_world @ v.co for v in island]
        found.append(
            {
                "verts": [v.index for v in island],
                "black": materials == {BLACK},
                "back": min(p.x for p in points),
                "front": max(p.x for p in points),
                "y": (min(p.y for p in points), max(p.y for p in points)),
                "top": max(p.z for p in points),
            }
        )
    bm.free()
    found.sort(key=lambda k: (k["y"][0] + k["y"][1]) / 2)
    white_rank = 0
    for key in found:
        if key["black"]:
            key["group"] = 2
        else:
            key["group"] = white_rank % 2
            white_rank += 1
    if len(found) > 64:
        raise sc.StudioPipelineError(f"{SYNTH} has {len(found)} keys; the page presses at most 64")
    return found


def pressed_mesh(group: int) -> bpy.types.Mesh:
    """A copy of the synth's mesh with every key of `group` held down: turned about its back edge."""
    synth = sc.obj(SYNTH)
    mesh = synth.data.copy()
    world, local = synth.matrix_world, synth.matrix_world.inverted()
    for key in keys():
        if key["group"] != group:
            continue
        length = key["front"] - key["back"]
        for i in key["verts"]:
            p = world @ mesh.vertices[i].co
            p.z -= KEY_TRAVEL * (p.x - key["back"]) / length
            mesh.vertices[i].co = local @ p
    return mesh


def press_changes(group: int) -> list:
    """(target, attribute, value) changes holding `group`'s keys down for one render (render.temporarily)."""
    return [(sc.obj(SYNTH), "data", pressed_mesh(group))]


def _id_material() -> bpy.types.Material:
    """Flat emission of each face's key colour (an attribute), so the render's pixels are exact key numbers."""
    material = bpy.data.materials.get(ID_MATERIAL)
    if material is not None:
        return material
    material = bpy.data.materials.new(ID_MATERIAL)
    material.use_nodes = True
    nodes, links = material.node_tree.nodes, material.node_tree.links
    nodes.clear()
    attribute = nodes.new("ShaderNodeAttribute")
    attribute.attribute_name = "studio_key"
    emission = nodes.new("ShaderNodeEmission")
    out = nodes.new("ShaderNodeOutputMaterial")
    links.new(attribute.outputs["Color"], emission.inputs["Color"])
    links.new(emission.outputs[0], out.inputs["Surface"])
    return material


def id_mesh() -> bpy.types.Mesh:
    """A copy of the synth's mesh where every key face glows its key's number and group, and the rest is held out."""
    synth = sc.obj(SYNTH)
    mesh = synth.data.copy()
    mesh.materials.clear()
    mesh.materials.append(_id_material())
    holdout = bpy.data.materials.get("Studio Holdout") or bpy.data.materials.new("Studio Holdout")
    holdout.use_nodes = True
    holdout.node_tree.nodes.clear()
    out = holdout.node_tree.nodes.new("ShaderNodeOutputMaterial")
    holdout.node_tree.links.new(holdout.node_tree.nodes.new("ShaderNodeHoldout").outputs[0], out.inputs["Surface"])
    mesh.materials.append(holdout)
    colour = mesh.color_attributes.new("studio_key", "FLOAT_COLOR", "POINT")
    owner = {}
    for number, key in enumerate(keys()):
        for i in key["verts"]:
            owner[i] = (number, key["group"])
    for v in mesh.vertices:
        number, group = owner.get(v.index, (-1, 0))
        colour.data[v.index].color = ((number + 1) / 255.0, group / 255.0, 0.0, 1.0)
    for poly in mesh.polygons:
        poly.material_index = 0 if all(i in owner for i in poly.vertices) else 1
    return mesh


def id_changes(scene: bpy.types.Scene) -> list:
    """Render only the keys, as exact colours in a float file: no sampling noise, filter, compositing or haze."""
    synth = sc.obj(SYNTH)
    changes = [
        (synth, "data", id_mesh()),
        (scene.render, "film_transparent", True),
        (scene.render, "use_compositing", False),
        (scene.cycles, "samples", 1),
        (scene.cycles, "use_denoising", False),
        (scene.cycles, "filter_width", 0.01),  # each pixel shows one key, never a blend of two
        (scene.render.image_settings, "file_format", "OPEN_EXR"),
        (scene.render.image_settings, "color_depth", "32"),
        (scene.render.image_settings, "color_mode", "RGBA"),
        (sc.obj(sc.ROOM_HAZE), "hide_render", True),
    ]
    hidden = {*sc.live_figure_parts(), *sc.PLANTS}  # drawn live on the page, so missing from the plates too
    for ob in scene.objects:
        if ob.name in hidden:
            changes.append((ob, "visible_camera", False))
        elif ob.type in {"MESH", "CURVES", "FONT", "CURVE"} and ob is not synth and ob.name != sc.ROOM_HAZE:
            changes.append((ob, "is_holdout", True))
    return changes


def facts() -> list[dict]:
    """Each key for the page, in three.js axes: the middle of its back and front edges on its top, its half width."""
    out = []
    for key in keys():
        middle = (key["y"][0] + key["y"][1]) / 2
        out.append(
            {
                "back": sc.to_three_point((key["back"], middle, key["top"])),
                "front": sc.to_three_point((key["front"], middle, key["top"])),
                "half": round((key["y"][1] - key["y"][0]) / 2, 4),
                "black": key["black"],
                "group": key["group"],
            }
        )
    return out


