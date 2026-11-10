"""Rafey at the desk: a stylised seated figure, typing (big round head, no neck, smooth tube limbs, fingers).

Set dressing, applied in memory like the tree. Two frames: hips and legs follow the chair; the upper
body turns square to the keyboard. Shapes and colours were picked from previews with Rafey on 2026-11-07,
in the style of a faceless 3D figure, wearing his red varsity jacket and headphones.

All of him, and the top half of the chair, is live on the page: a rig (bones with pivots, the parts
each bone moves, where his wrists rest when he leans back) is stored on the scene for export.py.
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
CHAIR_PULL = 0.15  # m toward the desk, so the short arms reach the keys (still clears the desk edge)
MOUSE_PULL = 0.10  # m toward the keyboard: his short arms fall short of where the mouse sits (leaves a 6 cm gap)
HEAD_R = 0.16
UPPER_ARM, FOREARM = 0.20, 0.19
HAIR_SEED, HAIR_CURLS = 4, 190
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
JOINT_BLEND = 0.006  # m either side of a finger joint where the skin bends between the two bones
WRIST_BLEND = 0.02  # the wrist stretches between the still sleeve and the moving hand
ARM_BLEND = 0.03  # m either side of the shoulder and elbow where the sleeve bends
HEAD_PIVOT = (0, 0.11, 0.35)  # where the head sits on the torso
SPINE_PIVOT = (0, 0.0, 0.06)  # the hips: he leans back from here
GAS_LIFT_TOP = 0.42  # m above the chair's origin: the top of the axis the chair swivels on
CHAIR_TOP = ("Chair Seat", "Chair Back Frame", "Chair Arms", "Chair Mechanism")  # swivel with him
CHAIR_FABRIC = "Chair Back Mesh"  # see-through, so it gets a colour layer of its own (render.py)
CHAIR_ARMS = "Chair Arms"
ARMREST_LIFT = 0.013  # m: the wrist pivot above the armrest top, so fingertips just touch it
LAYER_FIGURE, LAYER_BACKREST = "figure", "backrest"
# Fingers across the knuckles, inner to outer: (offset, length, radius). Mirrored for the left hand.
FINGERS = (
    (-0.025, 0.05, 0.0085),  # index
    (-0.0085, 0.054, 0.0088),  # middle
    (0.0085, 0.051, 0.0085),  # ring
    (0.024, 0.042, 0.0075),  # little
)
# Where the fingers rest: rows of key caps counted from the front (space row 0), and each finger's key
# in that row from the left, in FINGER_NAMES order (f d s a for his left hand, j k l ; for his right)
HOME_ROW = 2
HOME_KEYS = {-1: (4, 3, 2, 1), 1: (7, 8, 9, 10)}
HOME_ROW_KEYS = 13  # caps lock, a-l, ;, ', enter: the row this layout expects
FINGER_CURL = (math.radians(20), math.radians(60))  # below level: knuckle to middle joint, middle joint to tip
TIP_INSET = 0.004  # m: a fingertip lands a little in front of its key's centre
SPLAY = 0.7  # share of the way a finger turns toward its key's centre; the hand's own width covers the rest


class Rig:
    """The bones (pivots in world space) and which bones move each live part, for the page to animate."""

    def __init__(self) -> None:
        self.bones: list[dict] = []
        self.parts: dict[str, dict] = {}
        self.rests: dict[str, list[float]] = {}
        self.mouse: list[float] | None = None
        self.key_pitch: list[float] | None = None

    def bone(self, name: str, parent: str | None, pivot: Vector) -> str:
        self.bones.append({"name": name, "parent": parent, "pivot": list(pivot)})
        return name

    def part(self, ob, chain: list[str], skeleton=(), blend: float = JOINT_BLEND, layer: str = LAYER_FIGURE) -> None:
        """chain[0] holds the part up to skeleton[0]; chain[k + 1] moves the segment after skeleton[k]."""
        ob[sc.FIGURE_LIVE] = True
        ob[sc.FIGURE_LAYER] = layer
        self.parts[ob.name] = {"chain": chain, "skeleton": [list(p) for p in skeleton], "blend": blend, "layer": layer}

    def to_json(self) -> str:
        return json.dumps({"bones": self.bones, "parts": self.parts, "rests": self.rests, "mouse": self.mouse, "keyPitch": self.key_pitch})


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


def tube(frame: Frame, name: str, colour: str, points: list, radii: list[float]) -> bpy.types.Object:
    """A smooth limb through the points, from a Skin modifier over a stick skeleton."""
    mesh = bpy.data.meshes.new(f"{sc.FIGURE_PREFIX}{name}")
    mesh.from_pydata([tuple(frame.at(p)) for p in points], [(i, i + 1) for i in range(len(points) - 1)], [])
    ob = bpy.data.objects.new(mesh.name, mesh)
    ob.modifiers.new("Skin", "SKIN").use_smooth_shade = True
    skin = mesh.skin_vertices[0].data
    for vertex, radius in zip(skin, radii):
        vertex.radius = (radius, radius)
    skin[0].use_root = True
    return _add(ob, colour, subdivisions=2)


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


def leaning(degrees: float) -> Vector:
    """Up, tipped forward toward the desk by `degrees`: the axis of the collar and headphones."""
    return Vector((0, math.sin(math.radians(degrees)), math.cos(math.radians(degrees))))


def elbow_for(shoulder: Vector, wrist: Vector, pole: Vector) -> tuple[Vector, Vector]:
    """Two-bone reach: the elbow that bends the arm toward `pole`, and the wrist the arm actually reaches."""
    span = wrist - shoulder
    reach = min(span.length, UPPER_ARM + FOREARM - 1e-4)
    along = span.normalized()
    bend = (pole - pole.dot(along) * along).normalized()
    cos_shoulder = (UPPER_ARM**2 + reach**2 - FOREARM**2) / (2 * UPPER_ARM * reach)
    angle = math.acos(max(-1.0, min(1.0, cos_shoulder)))
    elbow = shoulder + UPPER_ARM * (math.cos(angle) * along + math.sin(angle) * bend)
    return elbow, elbow + (wrist - elbow).normalized() * FOREARM


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


def jointed(frame: Frame, rig: Rig, hand: str, name: str, points: list[Vector], radii: list[float]) -> None:
    """A finger or thumb: one tube, bent at the knuckle and the middle joint by two bones."""
    first = rig.bone(f"{name}_a", hand, frame.at(points[0]))
    second = rig.bone(f"{name}_b", first, frame.at(points[1]))
    ob = travels(tube(frame, name.replace("_", " ").title(), "Skin", points, radii))
    rig.part(ob, [hand, first, second], [frame.at(p) for p in points])


def curled(length: float) -> tuple[float, float]:
    """How far forward and how far down a resting finger reaches from its knuckle to its tip."""
    half = length / 2
    return half * sum(math.cos(a) for a in FINGER_CURL), half * sum(math.sin(a) for a in FINGER_CURL)


def palm_over(keys: list[Vector], key_top: float) -> Vector:
    """The palm centre that puts the middle fingertip on its home key, the knuckles just above the palm."""
    _, middle_length, middle_radius = FINGERS[1]
    reach, drop = curled(middle_length)
    knuckle_y = keys[1].y - TIP_INSET - reach
    return Vector((sum(k.x for k in keys) / len(keys), knuckle_y - 0.025, key_top + middle_radius * 0.9 + drop - 0.003))


def typing_hand(frame: Frame, rig: Rig, side: int, palm: Vector, keys: list[Vector], key_top: float, space_y: float, hand: str) -> None:
    """A palm over the home row; four fingers arched from the knuckles onto their keys; the thumb by the space row."""
    rig.part(travels(ellipsoid(frame, f"Palm {side}", "Skin", palm + Vector((0, -0.004, 0)), (0.034, 0.037, 0.012))), [hand])
    middle_reach, _ = curled(FINGERS[1][1])
    for name, (across, length, radius), key in zip(FINGER_NAMES, FINGERS, keys):
        reach, drop = curled(length)
        # each knuckle sits as high as its own finger needs to rest on the cap (the little finger's is lowest),
        # and the shorter fingers' knuckles a little further forward, so every tip lands on its key
        forward = 0.5 * (middle_reach - reach)
        knuckle = Vector((palm.x + side * across, palm.y + 0.025 + forward, key_top + radius * 0.9 + drop))
        aim = Vector((SPLAY * (key.x - knuckle.x), reach, 0)).normalized()  # turned partly toward its key
        half = length / 2
        bend, down = FINGER_CURL
        middle = knuckle + Vector((aim.x * half * math.cos(bend), aim.y * half * math.cos(bend), -half * math.sin(bend)))
        tip = middle + Vector((aim.x * half * math.cos(down), aim.y * half * math.cos(down), -half * math.sin(down)))
        jointed(frame, rig, hand, f"{name}_{side_name(side)}", [knuckle, middle, tip], [radius, radius * 0.95, radius * 0.88])
    base = palm + Vector((-side * 0.026, -0.012, -0.004))
    middle = palm + Vector((-side * 0.039, 0.01, -0.008))
    tip = Vector((palm.x - side * 0.033, max(space_y, palm.y + 0.02), key_top + 0.009))
    jointed(frame, rig, hand, f"thumb_{side_name(side)}", [base, middle, tip], [0.011, 0.0105, 0.0095])


def legs(frame: Frame, rig: Rig) -> None:
    """Short, smooth legs; the rounded feet hang clear of the floor, as in the reference figure."""
    for side in (-1, 1):
        hip, knee, ankle = (side * 0.075, 0.0, 0.07), (side * 0.085, 0.28, 0.075), (side * 0.09, 0.31, -0.2)
        rig.part(tube(frame, f"Leg {side}", "Jeans", [hip, knee, ankle], [0.07, 0.06, 0.05]), ["swivel"])
        rig.part(ellipsoid(frame, f"Foot {side}", "Shoes", (side * 0.09, 0.36, -0.235), (0.055, 0.085, 0.045)), ["swivel"])


def upper_body(frame: Frame, rig: Rig) -> Vector:
    """Torso leaning toward the keys, the head straight on top, collar and headphones. Returns the head centre."""
    rig.part(ellipsoid(frame, "Torso", "Jacket", (0, 0.04, 0.2), (0.135, 0.105, 0.19), tilt_x=-20), ["spine"])
    head = Vector((0, 0.13, 0.36 + HEAD_R - 0.025))
    rig.bone("head", "spine", frame.at(HEAD_PIVOT))
    rig.part(ellipsoid(frame, "Head", "Skin", head, (HEAD_R, HEAD_R, HEAD_R)), ["head"])
    rig.part(ring(frame, "Collar", "Jacket", (0, 0.1, 0.355), 0.095, 0.022, leaning(20)), ["spine"])
    rig.part(ring(frame, "Collar Stripe", "Stripe", (0, 0.098, 0.368), 0.098, 0.007, leaning(20)), ["spine"])
    rig.part(ring(frame, "Headphones", "Headphones", (0, 0.105, 0.352), 0.112, 0.013, leaning(20)), ["spine"])
    for side in (-1, 1):
        cup = ellipsoid(frame, f"Headphone Cup {side}", "Headphones", (side * 0.095, 0.17, 0.35), (0.045, 0.045, 0.024))
        rig.part(cup, ["spine"])
    return head


def arms(frame: Frame, rig: Rig, home: dict[int, list[Vector]], key_top: float, space_y: float) -> None:
    """Shoulder, elbow and hand bones per side; the page reaches them to the keys or the armrests."""
    for side in (-1, 1):
        s = side_name(side)
        shoulder = Vector((side * 0.12, 0.09, 0.3))
        hand = palm_over(home[side], key_top)
        elbow, wrist = elbow_for(shoulder, hand - Vector((0, 0.06, -0.003)), Vector((side * 0.7, -0.2, -1.0)))
        along = (wrist - elbow).normalized()
        wrist_start = wrist - along * 0.02
        upper = rig.bone(f"shoulder_{s}", "spine", frame.at(shoulder))
        fore = rig.bone(f"elbow_{s}", upper, frame.at(elbow))
        hand_bone = rig.bone(f"hand_{s}", fore, frame.at(wrist_start))
        arm = travels(tube(frame, f"Arm {side}", "Jacket", [shoulder, elbow, wrist], [0.05, 0.043, 0.038]))
        rig.part(arm, ["spine", upper, fore], [frame.at(p) for p in (shoulder, elbow, wrist)], blend=ARM_BLEND)
        rig.part(travels(ring(frame, f"Cuff Stripe {side}", "Stripe", wrist - along * 0.03, 0.04, 0.006, along)), [fore])
        palm_back = Vector((hand.x, hand.y - 0.03, hand.z))
        ob = travels(tube(frame, f"Wrist {side}", "Skin", [wrist_start, palm_back], [0.016, 0.017]))
        rig.part(ob, [fore, hand_bone], [frame.at(wrist_start), frame.at(palm_back)], blend=WRIST_BLEND)
        typing_hand(frame, rig, side, hand, home[side], key_top, space_y, hand_bone)


def hair(frame: Frame, rig: Rig, head: Vector) -> None:
    """Curly and fuller on top, down to the ears at the back, so the round head shows below it. No face."""
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
        curl.co = frame.at(head + d * HEAD_R * (rng.uniform(0.97, 1.02) + 0.07 * d.z))
        curl.radius, curl.stiffness = rng.uniform(0.025, 0.037) * METABALL_PER_SURFACE, 2.0
        placed += 1


def chair_top(rig: Rig) -> None:
    """The seat, back, arms and mechanism swivel with him; the base and gas lift stay in the plates."""
    for name in CHAIR_TOP:
        rig.part(sc.obj(name), ["swivel"])
    rig.part(sc.obj(CHAIR_FABRIC), ["swivel"], layer=LAYER_BACKREST)


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
    if bpy.data.objects.get(f"{sc.FIGURE_PREFIX}Torso") is not None:
        return
    with_chair, square_to_desk, key_top = seat_frames()
    to_figure = square_to_desk.matrix.inverted()
    keys_world, space_y_world, key_pitch = home_keys(sc.obj(KEYBOARD))
    home = {side: [to_figure @ key for key in keys] for side, keys in keys_world.items()}
    space_y = (to_figure @ Vector((0, space_y_world, 0))).y
    chair = sc.obj(CHAIR)
    rig = Rig()
    rig.bone("root", None, square_to_desk.at((0, 0, 0)))
    rig.bone("swivel", "root", chair.matrix_world @ Vector((0, 0, GAS_LIFT_TOP)))
    rig.bone("spine", "swivel", square_to_desk.at(SPINE_PIVOT))
    legs(with_chair, rig)
    head = upper_body(square_to_desk, rig)
    arms(square_to_desk, rig, home, key_top, space_y)
    hair(square_to_desk, rig, head)
    chair_top(rig)
    rig.rests = armrest_rests(chair)
    rig.mouse = mouse_within_reach()
    rig.key_pitch = key_pitch
    scene[sc.FIGURE_RIG] = rig.to_json()
