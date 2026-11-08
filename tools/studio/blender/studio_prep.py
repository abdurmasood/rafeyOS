"""In-memory scene prep for the /studio web build. Never saved to the source .blend files.

apply(scene) runs every step in order. Each step is idempotent, so running it twice in
one session (e.g. from the MCP console) is harmless.
"""

from __future__ import annotations

import os
import sys

sys.path.insert(0, os.path.dirname(__file__))

import bpy  # noqa: E402

import studio_common as sc  # noqa: E402

# Material slot order on every plant: pot, soil, stem, leaf
POT_SLOT, SOIL_SLOT = 0, 1
SWAY_EXPONENT = 1.5
MOONBEAM_WATTS = 4000.0  # Moonbeam (3000 W) + Moonlight's share of the haze (1000 W)


def smoothstep(edge0: float, edge1: float, x: float) -> float:
    if edge1 <= edge0:
        return 0.0
    t = min(max((x - edge0) / (edge1 - edge0), 0.0), 1.0)
    return t * t * (3.0 - 2.0 * t)


def _float_point_attribute(mesh: bpy.types.Mesh, name: str) -> bpy.types.Attribute:
    existing = mesh.attributes.get(name)
    if existing is not None:
        mesh.attributes.remove(existing)
    return mesh.attributes.new(name=name, type="FLOAT", domain="POINT")


def plant_attributes(plant: bpy.types.Object) -> None:
    """Add point-domain `_sway` (0 at pot/soil, rising with height) and `_leaf_rand` for glTF export."""
    mesh = plant.data
    world_z = [(plant.matrix_world @ v.co).z for v in mesh.vertices]
    soil_top = max(
        (world_z[i] for p in mesh.polygons if p.material_index == SOIL_SLOT for i in p.vertices),
        default=min(world_z),
    )
    top = max(world_z)
    moving = [False] * len(mesh.vertices)
    leaf_rand_point = [0.0] * len(mesh.vertices)
    leaf_rand_face = mesh.attributes.get("leaf_rand")
    for poly in mesh.polygons:
        if poly.material_index > SOIL_SLOT:
            value = leaf_rand_face.data[poly.index].value if leaf_rand_face else 0.0
            for i in poly.vertices:
                moving[i] = True
                leaf_rand_point[i] = value
    sway = _float_point_attribute(mesh, "_sway")
    rand = _float_point_attribute(mesh, "_leaf_rand")
    for i, z in enumerate(world_z):
        sway.data[i].value = smoothstep(soil_top, top, z) ** SWAY_EXPONENT if moving[i] else 0.0
        rand.data[i].value = leaf_rand_point[i]
    plant["studio_role"] = "plant"
    plant["studio_height"] = round(top - soil_top, 4)


def split_moon_from_haze() -> None:
    """Moonlight lights surfaces only and Moonbeam carries all the haze, so each delta isolates one.

    The two lights share transform, cone, blend, radius and colour, so moving Moonlight's
    1000 W of haze into Moonbeam leaves the image unchanged.
    """
    moonlight = sc.obj(sc.MOONLIGHT)
    if moonlight.light_linking.receiver_collection is not None:
        return
    coll = bpy.data.collections.get("LL_Moon_Surfaces") or bpy.data.collections.new("LL_Moon_Surfaces")
    if sc.ROOM_HAZE not in coll.objects:
        coll.objects.link(sc.obj(sc.ROOM_HAZE))
    for entry in coll.collection_objects:
        entry.light_linking.link_state = "EXCLUDE"
    moonlight.light_linking.receiver_collection = coll
    sc.obj(sc.MOONBEAM).data.energy = MOONBEAM_WATTS


def apply(scene: bpy.types.Scene, *, with_set_dressing: bool = True) -> None:
    """Run every prep step. Set dressing (window, sky, tree) can be skipped for spikes."""
    sc.assert_source_blend()
    for name in sc.PLANTS:
        plant_attributes(sc.obj(name))
    split_moon_from_haze()
    if with_set_dressing:
        import studio_set_dressing

        studio_set_dressing.apply(scene)
