"""The door where the window was (Rafey's choice, 2026-11-10), and the warm hall behind it. In memory only.

The window's hole closes (its boolean is switched off) and the moon, sky and tree outside it go. A door the size
of the one previewed goes in its place, hinged on the synth side: swung into the room it then stands behind the
doorway as the camera sees it, so the doorway, and him walking through it, stay in view. Behind the wall a short
hall shows only through the doorway (the camera also sees over the wall tops, so the hall is masked to camera
rays through the doorway, as the tree was to the window). It's lit by rooms you can't see (Rafey's pick,
2026-11-10): warm light from a kitchen doorway further down, and a TV's blue light from the room at the far end.
None of their layout shows, so Rafey's own kitchen can replace them later.

The leaf is a live part on its own bone (studio_figure.build): the page swings it.
"""

from __future__ import annotations

import json
import math
import os
import sys

sys.path.insert(0, os.path.dirname(__file__))

import bmesh  # noqa: E402
import bpy  # noqa: E402
from mathutils import Vector  # noqa: E402

import studio_common as sc  # noqa: E402
import studio_tree  # noqa: E402

WIDTH = 0.82  # m clear between the linings, as previewed
HEIGHT = 2.03  # m from the floorboards to the head lining
LINING = 0.02  # timber lining the hole through the wall
CASING = 0.07  # architrave round the opening on the room side
CASING_PROUD = 0.015  # how far it stands off the wall
LEAF = 0.04  # leaf thickness; the leaf sits in the lining, its room face flush with the wall
GAP = 0.003  # round the leaf's sides and top
FLOOR_GAP = 0.008  # under it: the hall light shows there as a warm line
WALL_IN, WALL_OUT = -2.0, -2.15  # the west wall's faces
FLOOR_TOP = 0.01  # top of the floorboards
OPEN_DEGREES = 90.0  # how far it swings into the room: the door_open render, and the page fully open
PANELS = ((0.18, 0.90), (1.08, 1.86))  # z ranges of the leaf's two raised panels, as previewed
PANEL_INSET = 0.11  # from each side of the leaf
PANEL_PROUD = 0.006
HANDLE_Z = 1.0
HANDLE_FROM_EDGE = 0.07  # the handle's spindle, in from the leaf's free edge
HANDLE_COLOUR, HANDLE_ROUGHNESS = (0.02, 0.02, 0.02), 0.35
FRAME_MATERIAL = "Window Frame"  # the cream paint the window was in
THRESHOLD_MATERIAL = "Wood Walnut"
HALL_FAR_X = -3.35  # the hall's far wall: 1.2 m from the room's wall
HALL_Y = (-2.0, 2.15)  # it runs the length of the room's wall
HALL_CEILING = 2.4
HALL_LIGHT_WATTS = 12.0  # a little fill: the rooms off the hall do the lighting
HALL_LIGHT_SIZE = 0.35
HALL_LIGHT_X = -2.75  # over the middle of the hall, in front of the door
WARM = (1.0, 0.62, 0.32)  # the previews' hall light
# Through the doorway the camera sees the hall floor in a diagonal strip and the far wall only at y 0.53..1.2, below
# 0.74 m. The kitchen's doorway sits in the far wall just short of that band, so its light fans across the floor
# the camera sees while the kitchen itself stays out of view.
KITCHEN_DOORWAY_Y = (-0.7, 0.1)
KITCHEN_BOX = ((-4.6, -1.6), (-3.45, 0.8))  # (x, y) low and high corners behind the far wall
KITCHEN_LIGHT_WATTS = 150.0
# The TV room: the hall's synth-side end is open into it; the TV faces back down the hall
TV_BOX = ((-3.9, 2.15), (-2.15, 3.2))
TV_LIGHT_WATTS = 70.0
TV_COLOUR = (0.55, 0.7, 1.0)
TV_SIZE = (1.0, 0.6)
WINDOW_OBJECTS = (sc.WINDOW_FRAME, sc.WINDOW_SKY)


def centre_y() -> float:
    """The door goes where the window was: centred on the window's hole."""
    cutter = sc.obj(sc.WINDOW_CUTTER)
    ys = [(cutter.matrix_world @ Vector(c)).y for c in cutter.bound_box]
    return round((min(ys) + max(ys)) / 2, 4)


def opening(centre: float) -> dict:
    """The doorway as studio_tree.window_mask takes it: both wall faces, its y and z extent, the camera."""
    return {
        "faces_x": (WALL_IN, WALL_OUT),
        "y": (centre - WIDTH / 2, centre + WIDTH / 2),
        "z": (FLOOR_TOP, HEIGHT),
        "eye": sc.obj(sc.REF_CAMERA).matrix_world.translation.copy(),
    }


def hinge(centre: float) -> Vector:
    """The leaf turns about its room-side edge on the synth (+y) side."""
    return Vector((WALL_IN, centre + WIDTH / 2 - GAP, FLOOR_TOP + FLOOR_GAP))


def close_window(scene: bpy.types.Scene) -> None:
    """The wall goes solid where the window was, and the moonlight that came through it goes too."""
    walls = sc.obj("Walls")
    hole = walls.modifiers[sc.WINDOW_HOLE]
    hole.show_render = hole.show_viewport = False
    for name in (*WINDOW_OBJECTS, sc.MOONLIGHT, sc.MOONBEAM, sc.MOON_SPILL):
        sc.obj(name).hide_render = True


def _box(bm: bmesh.types.BMesh, low, high, material: int = 0) -> None:
    made = bmesh.ops.create_cube(bm, size=1.0)["verts"]
    lo, hi = Vector(low), Vector(high)
    for v in made:
        v.co = Vector(lo[i] if v.co[i] < 0 else hi[i] for i in range(3))
    for face in {f for v in made for f in v.link_faces}:
        face.material_index = material


def _object(scene, name: str, boxes: list, materials: list, origin: Vector | None = None) -> bpy.types.Object:
    """One mesh of boxes (low, high, material index), given in world space; `origin` becomes its pivot."""
    origin = origin or Vector()
    bm = bmesh.new()
    for low, high, material in boxes:
        _box(bm, Vector(low) - origin, Vector(high) - origin, material)
    mesh = bpy.data.meshes.new(name)
    bm.to_mesh(mesh)
    bm.free()
    for material in materials:
        mesh.materials.append(material)
    ob = bpy.data.objects.new(name, mesh)
    ob.location = origin
    bevel = ob.modifiers.new("Bevel", "BEVEL")
    bevel.width = 0.004
    bevel.segments = 2
    scene.collection.objects.link(ob)
    return ob


def _handle_material() -> bpy.types.Material:
    material = bpy.data.materials.new("Door Handle")
    material.use_nodes = True
    bsdf = next(n for n in material.node_tree.nodes if n.type == "BSDF_PRINCIPLED")
    bsdf.inputs["Base Color"].default_value = (*HANDLE_COLOUR, 1.0)
    bsdf.inputs["Metallic"].default_value = 1.0
    bsdf.inputs["Roughness"].default_value = HANDLE_ROUGHNESS
    return material


def cut_doorway(scene: bpy.types.Scene, centre: float) -> None:
    """A hole through the wall for the door and its linings, down to the floor slab."""
    y0, y1 = centre - WIDTH / 2 - LINING, centre + WIDTH / 2 + LINING
    cutter = _object(scene, sc.DOOR_CUTTER, [((WALL_OUT - 0.1, y0, -0.05), (WALL_IN + 0.1, y1, HEIGHT + LINING), 0)], [])
    cutter.modifiers.clear()
    cutter.display_type = "WIRE"
    cutter.hide_render = True
    walls = sc.obj("Walls")
    hole = walls.modifiers.new("Door Hole", "BOOLEAN")
    hole.operation = "DIFFERENCE"
    hole.solver = "EXACT"
    hole.object = cutter
    walls.modifiers.move(len(walls.modifiers) - 1, 0)  # cut before the bevel, as the window's hole was


def frame(scene: bpy.types.Scene, centre: float) -> bpy.types.Object:
    """Linings through the wall, the architrave round the opening, and a threshold over the floor joint."""
    y0, y1 = centre - WIDTH / 2, centre + WIDTH / 2
    top = HEIGHT + LINING
    face, proud = WALL_IN, WALL_IN + CASING_PROUD
    boxes = [
        ((WALL_OUT, y0 - LINING, -0.02), (WALL_IN, y0, top), 0),  # linings
        ((WALL_OUT, y1, -0.02), (WALL_IN, y1 + LINING, top), 0),
        ((WALL_OUT, y0 - LINING, HEIGHT), (WALL_IN, y1 + LINING, top), 0),
        ((face, y0 - LINING - CASING, -0.02), (proud, y0 - LINING, top + CASING), 0),  # architrave
        ((face, y1 + LINING, -0.02), (proud, y1 + LINING + CASING, top + CASING), 0),
        ((face, y0 - LINING - CASING, top), (proud, y1 + LINING + CASING, top + CASING), 0),
        ((WALL_OUT, y0, -0.02), (WALL_IN, y1, FLOOR_TOP), 1),  # threshold
    ]
    return _object(scene, "Door Frame", boxes, [bpy.data.materials[FRAME_MATERIAL], bpy.data.materials[THRESHOLD_MATERIAL]])


def leaf(scene: bpy.types.Scene, centre: float) -> bpy.types.Object:
    """The door itself, its origin on the hinge: turning the object about z swings it into the room."""
    pivot = hinge(centre)
    y_free, y_hinge = centre - WIDTH / 2 + GAP, centre + WIDTH / 2 - GAP
    z0, z1 = FLOOR_TOP + FLOOR_GAP, HEIGHT - GAP
    room, hall = WALL_IN, WALL_IN - LEAF
    boxes = [((hall, y_free, z0), (room, y_hinge, z1), 0)]
    for low, high in PANELS:
        for x0, x1 in ((room, room + PANEL_PROUD), (hall - PANEL_PROUD, hall)):
            boxes.append(((x0, y_free + PANEL_INSET, low), (x1, y_hinge - PANEL_INSET, high), 0))
    spindle = y_free + HANDLE_FROM_EDGE
    for side in (1, -1):  # a lever each side, pointing toward the hinge
        face = room if side > 0 else hall
        boxes.append(((min(face, face + side * 0.012), spindle - 0.025, HANDLE_Z - 0.025), (max(face, face + side * 0.012), spindle + 0.025, HANDLE_Z + 0.025), 1))
        boxes.append(((min(face, face + side * 0.05), spindle - 0.008, HANDLE_Z - 0.008), (max(face, face + side * 0.05), spindle + 0.008, HANDLE_Z + 0.008), 1))
        boxes.append(((min(face + side * 0.035, face + side * 0.055), spindle - 0.01, HANDLE_Z - 0.011), (max(face + side * 0.035, face + side * 0.055), spindle + 0.12, HANDLE_Z + 0.011), 1))
    return _object(scene, sc.DOOR_LEAF, boxes, [bpy.data.materials[FRAME_MATERIAL], _handle_material()], origin=pivot)


def _masked(material: bpy.types.Material, through: dict) -> bpy.types.Material:
    """A copy of `material` that camera rays see only through the doorway (light and shadow rays always do)."""
    masked = material.copy()
    masked.name = f"{material.name} (hall)"
    nodes, links = masked.node_tree.nodes, masked.node_tree.links
    out = next(n for n in nodes if n.type == "OUTPUT_MATERIAL" and n.is_active_output)
    surface = out.inputs["Surface"].links[0].from_socket
    mix = nodes.new("ShaderNodeMixShader")
    links.new(studio_tree.window_mask(nodes, links, through), mix.inputs["Fac"])
    links.new(surface, mix.inputs[1])
    links.new(nodes.new("ShaderNodeBsdfTransparent").outputs[0], mix.inputs[2])
    links.new(mix.outputs[0], out.inputs["Surface"])
    return masked


def _lamp(scene, name: str, location, watts: float, colour, size, rotation=(0.0, 0.0, 0.0)) -> bpy.types.Object:
    """An area light no camera or reflection sees (area lights face down unless turned)."""
    light = bpy.data.lights.new(name, "AREA")
    light.energy = watts
    light.color = colour
    if isinstance(size, tuple):
        light.shape = "RECTANGLE"
        light.size, light.size_y = size
    else:
        light.size = size
    lamp = bpy.data.objects.new(name, light)
    lamp.location = location
    lamp.rotation_euler = rotation
    lamp.visible_camera = False
    lamp.visible_glossy = False
    scene.collection.objects.link(lamp)
    return lamp


def hall(scene: bpy.types.Scene, centre: float) -> bpy.types.Object:
    """A short hall behind the wall: floorboards and painted walls, lit from a kitchen doorway down the hall and a TV
    room at its far end, neither of which the camera sees into."""
    through = opening(centre)
    floor = _masked(bpy.data.materials["Wood Floor"], through)
    paint = _masked(bpy.data.materials["Wall Paint"], through)
    (ya, yb), t, top = HALL_Y, 0.1, HALL_CEILING
    (ka, kb) = KITCHEN_DOORWAY_Y
    (kx0, ky0), (kx1, ky1) = KITCHEN_BOX
    (tx0, ty0), (tx1, ty1) = TV_BOX
    far = HALL_FAR_X
    boxes = [
        ((far, ya, -0.3), (WALL_OUT, yb, FLOOR_TOP), 0),  # hall floor, up to the threshold
        ((far - t, ya, FLOOR_TOP), (far, ka, top), 1),  # far wall, either side of and above the kitchen doorway
        ((far - t, kb, FLOOR_TOP), (far, yb, top), 1),
        ((far - t, ka, HEIGHT), (far, kb, top), 1),
        ((far, ya - t, FLOOR_TOP), (WALL_OUT, ya, top), 1),  # the plant-shelf end is closed
        ((far, ya, top), (WALL_OUT, yb, top + t), 1),  # ceiling
        # the kitchen, behind the far wall: a closed box with its light
        ((kx0, ky0, -0.3), (kx1, ky1, FLOOR_TOP), 0),
        ((kx0 - t, ky0, FLOOR_TOP), (kx0, ky1, top), 1),
        ((kx0, ky0 - t, FLOOR_TOP), (kx1, ky0, top), 1),
        ((kx0, ky1, FLOOR_TOP), (kx1, ky1 + t, top), 1),
        ((kx0, ky0, top), (far - t, ky1, top + t), 1),
        # the TV room, off the hall's open synth-side end
        ((tx0, ty0, -0.3), (tx1, ty1, FLOOR_TOP), 0),
        ((tx0 - t, ty0, FLOOR_TOP), (tx0, ty1, top), 1),
        ((tx1, ty0, FLOOR_TOP), (tx1 + t, ty1, top), 1),
        ((tx0, ty1, FLOOR_TOP), (tx1, ty1 + t, top), 1),
        ((tx0, ty0, top), (tx1, ty1, top + t), 1),
    ]
    ob = _object(scene, sc.HALL, boxes, [floor, paint])
    ob.modifiers.clear()
    _lamp(scene, sc.HALL_LIGHT, (HALL_LIGHT_X, centre, top - 0.02), HALL_LIGHT_WATTS, WARM, HALL_LIGHT_SIZE)
    _lamp(scene, sc.KITCHEN_LIGHT, ((kx0 + kx1) / 2, (ky0 + ky1) / 2, top - 0.02), KITCHEN_LIGHT_WATTS, WARM, 0.6)
    # the TV against the TV room's far wall, facing back down the hall (turned to face -y)
    _lamp(scene, sc.TV_LIGHT, ((tx0 + tx1) / 2, ty1 - 0.05, 0.8), TV_LIGHT_WATTS, TV_COLOUR, TV_SIZE, (-math.pi / 2, 0.0, 0.0))
    return ob


def build(scene: bpy.types.Scene) -> None:
    if bpy.data.objects.get(sc.DOOR_LEAF) is not None:
        return
    centre = centre_y()
    close_window(scene)
    cut_doorway(scene, centre)
    frame(scene, centre)
    leaf(scene, centre)
    hall(scene, centre)
    through = opening(centre)
    scene[sc.DOOR_FACTS] = json.dumps(
        {
            "hinge": list(hinge(centre)),
            "width": WIDTH - 2 * GAP,  # the leaf, hinge to free edge
            "height": HEIGHT - GAP - FLOOR_TOP - FLOOR_GAP,
            "thickness": LEAF,
            "open": OPEN_DEGREES,
            "handle": [WALL_IN, centre - WIDTH / 2 + GAP + HANDLE_FROM_EDGE, HANDLE_Z],
            "opening": {"x": list(through["faces_x"]), "y": list(through["y"]), "z": list(through["z"])},
            "hall": {"low": [HALL_FAR_X, HALL_Y[0], FLOOR_TOP], "high": [WALL_OUT, HALL_Y[1], HALL_CEILING]},
        }
    )
    print(f"[door] in the window's place at y {centre}, hinged at y {hinge(centre).y:.3f}, hall to x {HALL_FAR_X}")


def open_angle() -> float:
    """Radians the leaf turns (about +z, at its hinge) to stand fully open in the room."""
    return math.radians(OPEN_DEGREES)
