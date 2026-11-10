"""Rafey at the desk: set dressing, applied in memory like the tree.

He is the Rigify mannequin (studio_mannequin.py), seated, posed and dressed in his red varsity jacket and
headphones. This module pulls the chair in, finds the home keys, puts the mouse where his hand goes, and keeps
the rig: all of him and the top half of the chair are live on the page, so the bones (pivots), what each bone
moves, and where his wrists rest when he leans back are stored on the scene for export.py.
"""

from __future__ import annotations

import json
import math
import os
import random
import sys

sys.path.insert(0, os.path.dirname(__file__))

import bmesh  # noqa: E402
import bpy  # noqa: E402
from mathutils import Matrix, Vector  # noqa: E402

import studio_common as sc  # noqa: E402

CHAIR = "Chair"
KEYBOARD = "Keyboard"
MOUSE = "Mouse"
SEAT_TOP = 0.545  # top of the chair's seat cushion
CHAIR_PULL = 0.22  # m toward the desk: he sits close enough to type with a slight lean; the armrests clear the desk edge
MOUSE_PULL = 0.0  # m toward the keyboard: none, the mouse stays where Rafey put it (his arms reach it)
HAIR_SEED, HAIR_CURLS = 4, 190
HAIR_HEAD = 0.16  # m: the head radius the curl sizes were picked on; curls scale with the head they cover
METABALL_PER_SURFACE = 1 / 0.672  # metaball radius giving a surface radius, at threshold 0.6 and stiffness 2
COLOURS = {  # linear base colour and roughness, from Rafey's photo
    "Jacket": ((0.33, 0.022, 0.018), 0.65),
    "Stripe": ((0.75, 0.75, 0.72), 0.6),
    "Skin": ((0.42, 0.22, 0.14), 0.5),
    "Hair": ((0.012, 0.009, 0.007), 0.45),
    "Jeans": ((0.03, 0.045, 0.08), 0.8),
    "Shoes": ((0.035, 0.035, 0.038), 0.55),
    "Headphones": ((0.008, 0.012, 0.03), 0.35),
}
FINGER_NAMES = ("index", "middle", "ring", "little")
JOINT_BLEND = 0.006  # m either side of a joint where a procedurally weighted part bends between two bones
GAS_LIFT_TOP = 0.42  # m above the chair's origin: the top of the axis the chair swivels on
CHAIR_TOP = ("Chair Seat", "Chair Back Frame", "Chair Arms", "Chair Mechanism")  # swivel with him
CHAIR_BASE = ("Chair Base", "Chair Gas Lift")  # roll with him when he goes to the synths
DESK_TOP = "Desk Top"
DESK_EDGE_PAST_HANDS = 0.15  # m the desk-edge segment runs past each home row end: where his hands push off
SYNTH_LOW, SYNTH_HIGH, SYNTH_STAND = "Synth A (bottom)", "Synth B (top)", "Synth Stand Frame"
KEY_WHITE = "Key White"
# Where the chair's axis goes when he plays the synths: centred on the stand, between its floor rails
SYNTH_SEAT = (-1.10, 0.70)
FLOOR_PARTS_BELOW = 0.13  # m: stand parts lower than this are what the chair base could roll into
SYNTH_CLEARANCE = 0.01  # m the rolled chair keeps from the stand, the drawers and Synth A's underside
DRAWERS = "Drawers Left"
GUITAR_PARTS = ("Guitar Body", "Guitar Neck", "Guitar Hardware")  # body first: its centre is the bone's pivot
CHAIR_FABRIC = "Chair Back Mesh"  # see-through, so it gets a colour layer of its own (render.py)
CHAIR_ARMS = "Chair Arms"
ARMREST_LIFT = 0.013  # m: the wrist pivot above the armrest top, so fingertips just touch it
LAYER_FIGURE, LAYER_BACKREST = "figure", "backrest"
# Where the fingers rest: rows of key caps counted from the front (space row 0), and each finger's key
# in that row from the left, in FINGER_NAMES order (f d s a for his left hand, j k l ; for his right)
HOME_ROW = 2
HOME_KEYS = {-1: (4, 3, 2, 1), 1: (7, 8, 9, 10)}
HOME_ROW_KEYS = 13  # caps lock, a-l, ;, ', enter: the row this layout expects


class Rig:
    """The bones (pivots in world space) and which bones move each live part, for the page to animate."""

    def __init__(self) -> None:
        self.bones: list[dict] = []
        self.parts: dict[str, dict] = {}
        self.rests: dict[str, list[float]] = {}
        self.mouse: list[float] | None = None
        self.key_pitch: list[float] | None = None
        self.desk: dict | None = None
        self.synth: dict | None = None
        self.headphones: dict | None = None
        self.guitar: dict | None = None
        self.motion_basis: dict | None = None

    def bone(self, name: str, parent: str | None, pivot: Vector) -> str:
        self.bones.append({"name": name, "parent": parent, "pivot": list(pivot)})
        return name

    def part(self, ob, chain: list[str], skeleton=(), blend: float = JOINT_BLEND, layer: str = LAYER_FIGURE, role: str = sc.ROLE_HIM) -> None:
        """chain[0] holds the part up to skeleton[0]; chain[k + 1] moves the segment after skeleton[k]."""
        ob[sc.FIGURE_LIVE] = True
        ob[sc.FIGURE_LAYER] = layer
        ob[sc.FIGURE_ROLE] = role
        self.parts[ob.name] = {"chain": chain, "skeleton": [list(p) for p in skeleton], "blend": blend, "layer": layer}

    def skin(self, ob, layer: str = LAYER_FIGURE) -> None:
        """A weight-painted part: its vertex groups are named after the bones that move it."""
        ob[sc.FIGURE_LIVE] = True
        ob[sc.FIGURE_LAYER] = layer
        self.parts[ob.name] = {"skin": True, "layer": layer}

    def to_json(self) -> str:
        return json.dumps(
            {
                "bones": self.bones,
                "parts": self.parts,
                "rests": self.rests,
                "mouse": self.mouse,
                "keyPitch": self.key_pitch,
                "desk": self.desk,
                "synth": self.synth,
                "headphones": self.headphones,
                "guitar": self.guitar,
                "motionBasis": self.motion_basis,
            }
        )


def side_name(side: int) -> str:
    return "L" if side < 0 else "R"


def travels(ob):
    """Arms and hands move far (to the armrests), so they cast no shadow into the plates: it would stay behind."""
    ob[sc.FIGURE_NO_SHADOW] = True
    return ob


class Frame:
    """Figure coordinates: origin on the seat, +y toward the desk, +x is his right."""

    def __init__(self, matrix: Matrix) -> None:
        self.matrix = matrix
        self.rotation = matrix.to_quaternion()

    def at(self, local: Vector | tuple[float, float, float]) -> Vector:
        return self.matrix @ Vector(local)


def material(name: str) -> bpy.types.Material:
    full = f"{sc.FIGURE_PREFIX}{name}"
    found = bpy.data.materials.get(full)
    if found is not None:
        return found
    colour, roughness = COLOURS[name]
    made = bpy.data.materials.new(full)
    made.use_nodes = True
    bsdf = next(n for n in made.node_tree.nodes if n.type == "BSDF_PRINCIPLED")
    bsdf.inputs["Base Color"].default_value = (*colour, 1.0)
    bsdf.inputs["Roughness"].default_value = roughness
    return made


def _add(ob: bpy.types.Object, colour: str, subdivisions: int) -> bpy.types.Object:
    ob.data.materials.append(material(colour))
    if subdivisions:
        smooth = ob.modifiers.new("Smooth", "SUBSURF")
        smooth.levels = smooth.render_levels = subdivisions
    bpy.context.scene.collection.objects.link(ob)
    return ob


def ellipsoid(frame: Frame, name: str, colour: str, centre, radii, tilt_x: float = 0.0) -> bpy.types.Object:
    mesh = bpy.data.meshes.new(f"{sc.FIGURE_PREFIX}{name}")
    bm = bmesh.new()
    bmesh.ops.create_uvsphere(bm, u_segments=32, v_segments=16, radius=1.0)
    bm.to_mesh(mesh)
    bm.free()
    mesh.shade_smooth()
    ob = bpy.data.objects.new(mesh.name, mesh)
    turn = frame.rotation.to_matrix().to_4x4() @ Matrix.Rotation(math.radians(tilt_x), 4, "X")
    ob.matrix_world = Matrix.Translation(frame.at(centre)) @ turn @ Matrix.Diagonal((*radii, 1.0))
    return _add(ob, colour, subdivisions=1)


def ring(frame: Frame, name: str, colour: str, centre, major: float, minor: float, normal) -> bpy.types.Object:
    """A torus round `centre`, its hole facing `normal` (figure coordinates)."""
    bm = bmesh.new()
    rings, sides = 48, 12
    grid = []
    for i in range(rings):
        around = 2 * math.pi * i / rings
        row = []
        for j in range(sides):
            tube_angle = 2 * math.pi * j / sides
            spread = major + minor * math.cos(tube_angle)
            row.append(bm.verts.new((spread * math.cos(around), spread * math.sin(around), minor * math.sin(tube_angle))))
        grid.append(row)
    for i in range(rings):
        for j in range(sides):
            a, b = grid[i], grid[(i + 1) % rings]
            bm.faces.new((a[j], b[j], b[(j + 1) % sides], a[(j + 1) % sides]))
    mesh = bpy.data.meshes.new(f"{sc.FIGURE_PREFIX}{name}")
    bm.to_mesh(mesh)
    bm.free()
    mesh.shade_smooth()
    ob = bpy.data.objects.new(mesh.name, mesh)
    facing = Vector((0, 0, 1)).rotation_difference(frame.rotation @ Vector(normal))
    ob.matrix_world = Matrix.Translation(frame.at(centre)) @ facing.to_matrix().to_4x4()
    return _add(ob, colour, subdivisions=0)


def key_rows(keyboard: bpy.types.Object) -> list[list[tuple[Vector, float]]]:
    """The keyboard's key caps (top centre, width), in rows from the front, each row from the left (world space)."""
    evaluated = keyboard.evaluated_get(bpy.context.evaluated_depsgraph_get())
    mesh = evaluated.to_mesh()
    bm = bmesh.new()
    bm.from_mesh(mesh)
    seen, caps = set(), []
    for start in bm.verts:
        if start.index in seen:
            continue
        seen.add(start.index)
        stack, island = [start], []
        while stack:
            vert = stack.pop()
            island.append(keyboard.matrix_world @ vert.co)
            for edge in vert.link_edges:
                other = edge.other_vert(vert)
                if other.index not in seen:
                    seen.add(other.index)
                    stack.append(other)
        lo = Vector([min(p[i] for p in island) for i in range(3)])
        hi = Vector([max(p[i] for p in island) for i in range(3)])
        caps.append((Vector(((lo.x + hi.x) / 2, (lo.y + hi.y) / 2, hi.z)), hi.x - lo.x, (hi - lo).length))
    bm.free()
    evaluated.to_mesh_clear()
    caps.sort(key=lambda cap: -cap[2])
    rows: dict[int, list[tuple[Vector, float]]] = {}
    for centre, width, _ in caps[1:]:  # the largest island is the keyboard's body
        rows.setdefault(round(centre.y / 0.005), []).append((centre, width))
    return [sorted(rows[y], key=lambda cap: cap[0].x) for y in sorted(rows)]


def home_keys(keyboard: bpy.types.Object) -> tuple[dict[int, list[Vector]], float, list[float]]:
    """Each hand's four home keys (FINGER_NAMES order), the space row's y, and the key pitch [across, between rows]."""
    rows = key_rows(keyboard)
    home = rows[HOME_ROW] if len(rows) > HOME_ROW else []
    if len(home) != HOME_ROW_KEYS:
        raise sc.StudioPipelineError(f"{KEYBOARD} home row has {len(home)} keys, expected {HOME_ROW_KEYS}")
    across = (home[10][0].x - home[1][0].x) / 9  # a to ;
    between = home[0][0].y - rows[HOME_ROW - 1][0][0].y
    keys = {side: [home[i][0] for i in index] for side, index in HOME_KEYS.items()}
    return keys, rows[0][0][0].y, [round(across, 5), round(between, 5)]


def hair(frame: Frame, rig: Rig, head: Vector, radii: Vector) -> None:
    """Curly and fuller on top, down to the ears at the back, so the head shows below it. No face.

    `head` is the skull's centre and `radii` its half-sizes (x across, y front to back, z up).
    """
    balls = bpy.data.metaballs.new(f"{sc.FIGURE_PREFIX}Hair")
    balls.resolution, balls.render_resolution, balls.threshold = 0.02, 0.006, 0.6
    balls.materials.append(material("Hair"))
    ob = bpy.data.objects.new(balls.name, balls)
    bpy.context.scene.collection.objects.link(ob)
    rig.part(ob, ["head"])
    rng = random.Random(HAIR_SEED)
    placed = 0
    while placed < HAIR_CURLS:
        d = Vector((rng.uniform(-1, 1), rng.uniform(-1, 1), rng.uniform(-0.45, 1))).normalized()
        below_hairline = d.z < -0.05 + 0.35 * max(d.y, 0) - 0.25 * max(-d.y, 0)
        if below_hairline or (d.y > 0.35 and d.z < 0.6):
            continue
        curl = balls.elements.new(type="BALL")
        out = rng.uniform(0.97, 1.02) + 0.07 * d.z
        curl.co = frame.at(head + Vector((d.x * radii.x, d.y * radii.y, d.z * radii.z)) * out)
        size = (radii.x + radii.y + radii.z) / 3 / HAIR_HEAD
        curl.radius, curl.stiffness = rng.uniform(0.025, 0.037) * size * METABALL_PER_SURFACE, 2.0
        placed += 1


def chair_top(rig: Rig) -> None:
    """The whole chair is its own bone: it swivels with him while he sits, and stays put when he gets up."""
    for name in (*CHAIR_TOP, *CHAIR_BASE):
        rig.part(sc.obj(name), ["chair"], role=sc.ROLE_CHAIR)
    rig.part(sc.obj(CHAIR_FABRIC), ["chair"], layer=LAYER_BACKREST, role=sc.ROLE_CHAIR)


def guitar_parts(rig: Rig) -> dict:
    """The guitar comes off its hook: body, neck and hardware are live on their own bone (the hanger stays).
    Returns where it hangs: its bone pivot (the body's centre) and its long axis, neck end last."""
    parts = [sc.obj(name) for name in GUITAR_PARTS]
    for ob in parts:
        rig.part(ob, ["guitar"], role=sc.ROLE_GUITAR)
    points = [p for ob in parts for p in world_points(ob)]
    body = world_points(sc.obj(GUITAR_PARTS[0]))
    centre = sum(body, Vector()) / len(body)
    low = min(points, key=lambda p: p.z)
    high = max(points, key=lambda p: p.z)
    return {"centre": list(centre), "bottom": list(low), "top": list(high)}


def world_points(ob: bpy.types.Object) -> list[Vector]:
    evaluated = ob.evaluated_get(bpy.context.evaluated_depsgraph_get())
    points = [ob.matrix_world @ v.co for v in evaluated.to_mesh().vertices]
    evaluated.to_mesh_clear()
    return points


def desk_edge(home: dict[int, list[Vector]]) -> dict:
    """The desk's front edge (top, nearest him), across his hands: where he pushes off to roll away."""
    corners = [sc.obj(DESK_TOP).matrix_world @ Vector(c) for c in sc.obj(DESK_TOP).bound_box]
    front, top = min(c.y for c in corners), max(c.z for c in corners)
    left = min(k.x for k in home[-1]) - DESK_EDGE_PAST_HANDS
    right = max(k.x for k in home[1]) + DESK_EDGE_PAST_HANDS
    return {"edge": [[left, front, top], [right, front, top]]}


def white_keys(ob: bpy.types.Object) -> list[Vector]:
    """World positions of the synth's white keys (faces using its "Key White" material)."""
    slot = next((i for i, m in enumerate(ob.data.materials) if m and m.name == KEY_WHITE), None)
    if slot is None:
        raise sc.StudioPipelineError(f"{ob.name} has no {KEY_WHITE!r} material")
    return [ob.matrix_world @ ob.data.vertices[i].co for poly in ob.data.polygons if poly.material_index == slot for i in poly.vertices]


def key_bed(ob: bpy.types.Object, toward: Vector) -> tuple[Vector, Vector, float]:
    """The white keys' front edge (the side facing `toward`) as a line low note to high, and their top height."""
    keys = white_keys(ob)
    lo = Vector([min(p[i] for p in keys) for i in range(3)])
    hi = Vector([max(p[i] for p in keys) for i in range(3)])
    along_x = hi.x - lo.x > hi.y - lo.y
    if along_x:
        front = hi.y if toward.y > 0 else lo.y
        top = max(p.z for p in keys if abs(p.y - front) < 0.02)
        return Vector((lo.x, front, top)), Vector((hi.x, front, top)), top
    front = hi.x if toward.x > 0 else lo.x
    top = max(p.z for p in keys if abs(p.x - front) < 0.02)
    return Vector((front, lo.y, top)), Vector((front, hi.y, top)), top


def check_synth_fit(chair: bpy.types.Object, seat: Vector) -> None:
    """The chair rolled to the synths must stand clear of the stand's feet and rails and the drawers,
    and its armrests must pass under Synth A."""
    axis = chair.matrix_world.translation
    base = world_points(sc.obj("Chair Base"))
    radius = max((Vector((p.x, p.y)) - Vector((axis.x, axis.y))).length for p in base) + SYNTH_CLEARANCE
    floor = [p for p in world_points(sc.obj(SYNTH_STAND)) if p.z < FLOOR_PARTS_BELOW]
    drawers = [sc.obj(DRAWERS).matrix_world @ Vector(c) for c in sc.obj(DRAWERS).bound_box]
    for p in floor + drawers:
        gap = (Vector((p.x, p.y)) - Vector((seat.x, seat.y))).length
        if gap < radius:
            raise sc.StudioPipelineError(f"chair at the synths ({seat.x:.2f}, {seat.y:.2f}) hits the stand or drawers at {p}")
    arms_top = max(p.z for p in world_points(sc.obj(CHAIR_ARMS)))
    synth_under = min(p.z for p in world_points(sc.obj(SYNTH_LOW)))
    if arms_top > synth_under - SYNTH_CLEARANCE:
        raise sc.StudioPipelineError(f"armrests ({arms_top:.3f} m) don't pass under {SYNTH_LOW} ({synth_under:.3f} m)")
    print(f"[figure] chair fits at the synths: base radius {radius:.3f} m, armrests {synth_under - arms_top:.3f} m under {SYNTH_LOW}")


def synth_facts(chair: bpy.types.Object) -> dict:
    """Where he sits to play and what he plays: the seat point, Synth A's key line and a reach point on Synth B."""
    seat = Vector((*SYNTH_SEAT, chair.matrix_world.translation.z))
    check_synth_fit(chair, seat)
    centre = sum((sc.obj(SYNTH_LOW).matrix_world @ Vector(c) for c in sc.obj(SYNTH_LOW).bound_box), Vector()) / 8
    toward = (seat - centre).normalized()
    low_from, low_to, _ = key_bed(sc.obj(SYNTH_LOW), toward)
    high_from, high_to, _ = key_bed(sc.obj(SYNTH_HIGH), toward)
    return {"seat": list(seat), "keys": [list(low_from), list(low_to)], "upper": list((high_from + high_to) / 2)}


def armrest_rests(chair: bpy.types.Object) -> dict[str, list[float]]:
    """Where his wrists settle when he leans back: on each armrest, a little behind its middle."""
    arms_ob = sc.obj(CHAIR_ARMS)
    evaluated = arms_ob.evaluated_get(bpy.context.evaluated_depsgraph_get())
    to_chair = chair.matrix_world.inverted() @ arms_ob.matrix_world
    points = [to_chair @ v.co for v in evaluated.to_mesh().vertices]
    evaluated.to_mesh_clear()
    rests = {}
    for side in (-1, 1):
        own = [p for p in points if p.x * side > 0]
        middle = Vector(((min(p.x for p in own) + max(p.x for p in own)) / 2, (min(p.y for p in own) + max(p.y for p in own)) / 2 - 0.02, 0))
        middle.z = max(p.z for p in own) + ARMREST_LIFT
        rests[side_name(side)] = list(chair.matrix_world @ middle)
    return rests


def mouse_within_reach() -> list[float]:
    """Slide the mouse toward the keyboard (its children ride along) and return the top of it, where his palm goes."""
    mouse = sc.obj(MOUSE)
    if MOUSE_PULL:
        mouse.matrix_world = Matrix.Translation((-MOUSE_PULL, 0, 0)) @ mouse.matrix_world
        bpy.context.view_layer.update()
        riders = [child.name for child in mouse.children_recursive]
        print(f"[figure] mouse pulled {MOUSE_PULL} m toward the keyboard" + (f" with {', '.join(riders)}" if riders else ""))
    corners = [mouse.matrix_world @ Vector(c) for c in mouse.bound_box]
    return [
        (min(c.x for c in corners) + max(c.x for c in corners)) / 2,
        (min(c.y for c in corners) + max(c.y for c in corners)) / 2,
        max(c.z for c in corners),
    ]


def seat_frames() -> tuple[Frame, Frame, float]:
    """Pull the chair in, then return the chair-aligned frame, the desk-aligned frame and the key-top height."""
    chair = sc.obj(CHAIR)
    chair.matrix_world = chair.matrix_world @ Matrix.Translation((0, CHAIR_PULL, 0))
    bpy.context.view_layer.update()
    seat = chair.matrix_world @ Vector((0, 0.03, SEAT_TOP - chair.matrix_world.translation.z))
    with_chair = chair.matrix_world.to_quaternion().to_matrix().to_4x4()
    with_chair.translation = seat
    keyboard = sc.obj(KEYBOARD)
    key_top = max((keyboard.matrix_world @ Vector(c)).z for c in keyboard.bound_box) - seat.z
    return Frame(with_chair), Frame(Matrix.Translation(seat)), key_top


def build(scene: bpy.types.Scene) -> None:
    import studio_mannequin  # imports this module back, for its helpers

    if bpy.data.objects.get(f"{sc.FIGURE_PREFIX}Body") is not None:
        return
    _, square_to_desk, _ = seat_frames()
    home, space_y, key_pitch = home_keys(sc.obj(KEYBOARD))
    chair = sc.obj(CHAIR)
    seat = square_to_desk.at((0, 0, 0))
    rig = Rig()
    rig.bone("root", None, seat)
    rig.bone("swivel", "root", chair.matrix_world @ Vector((0, 0, GAS_LIFT_TOP)))
    studio_mannequin.build(rig, sys.modules[__name__], seat, home, space_y)
    rig.bone("chair", "root", chair.matrix_world @ Vector((0, 0, GAS_LIFT_TOP)))  # same axis as his swivel
    chair_top(rig)
    rig.guitar = guitar_parts(rig)
    rig.bone("guitar", None, Vector(rig.guitar["centre"]))  # not the chair's: it stays when the chair rolls
    rig.rests = armrest_rests(chair)
    rig.mouse = mouse_within_reach()
    # The mouse moves under his hand, so it's live too, on its own bone (its shadow stays in the plates: a few cm)
    rig.part(sc.obj(MOUSE), ["mouse"], role=sc.ROLE_MOUSE)
    rig.bone("mouse", None, Vector(rig.mouse))
    rig.key_pitch = key_pitch
    rig.desk = desk_edge(home)
    rig.synth = synth_facts(chair)
    scene[sc.FIGURE_RIG] = rig.to_json()
