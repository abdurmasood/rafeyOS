"""Rafey at the desk: a stylised seated figure, typing (big round head, no neck, smooth tube limbs, fingers).

Set dressing, applied in memory like the tree. Two frames: hips and legs follow the chair; the upper
body turns square to the keyboard. Shapes and colours were picked from previews with Rafey on 2026-11-07,
in the style of a faceless 3D figure, wearing his red varsity jacket and headphones.
"""

from __future__ import annotations

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
SEAT_TOP = 0.545  # top of the chair's seat cushion
CHAIR_PULL = 0.15  # m toward the desk, so the short arms reach the keys (still clears the desk edge)
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
# Fingers across the knuckles, inner to outer: (offset, length, radius). Mirrored for the left hand.
FINGERS = (
    (-0.022, 0.05, 0.0085),  # index
    (-0.0075, 0.054, 0.0088),  # middle
    (0.0075, 0.051, 0.0085),  # ring
    (0.021, 0.042, 0.0075),  # little
)


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


def typing_hand(frame: Frame, side: int, centre: Vector, key_top: float) -> None:
    """A palm hovering over the keys, four curled fingers resting on them, the thumb on the space bar."""
    palm = Vector((centre.x, centre.y, key_top + 0.03))
    ellipsoid(frame, f"Palm {side}", "Skin", palm + Vector((0, -0.004, 0)), (0.031, 0.037, 0.012))
    for i, (across, length, radius) in enumerate(FINGERS):
        knuckle = palm + Vector((side * across, 0.025, 0.003))
        middle = knuckle + Vector((0, length * 0.5, 0.004))
        tip = Vector((knuckle.x, knuckle.y + length * 0.85, key_top + radius))
        tube(frame, f"Finger {side} {i}", "Skin", [knuckle, middle, tip], [radius, radius * 0.95, radius * 0.88])
    base = palm + Vector((-side * 0.026, -0.012, -0.004))
    middle = palm + Vector((-side * 0.039, 0.01, -0.008))
    tip = Vector((palm.x - side * 0.033, palm.y + 0.03, key_top + 0.009))
    tube(frame, f"Thumb {side}", "Skin", [base, middle, tip], [0.011, 0.0105, 0.0095])


def legs(frame: Frame) -> None:
    """Short, smooth legs; the rounded feet hang clear of the floor, as in the reference figure."""
    for side in (-1, 1):
        hip, knee, ankle = (side * 0.075, 0.0, 0.07), (side * 0.085, 0.28, 0.075), (side * 0.09, 0.31, -0.2)
        tube(frame, f"Leg {side}", "Jeans", [hip, knee, ankle], [0.07, 0.06, 0.05])
        ellipsoid(frame, f"Foot {side}", "Shoes", (side * 0.09, 0.36, -0.235), (0.055, 0.085, 0.045))


def upper_body(frame: Frame) -> Vector:
    """Torso leaning toward the keys, the head straight on top, collar and headphones. Returns the head centre."""
    ellipsoid(frame, "Torso", "Jacket", (0, 0.04, 0.2), (0.135, 0.105, 0.19), tilt_x=-20)
    head = Vector((0, 0.13, 0.36 + HEAD_R - 0.025))
    ellipsoid(frame, "Head", "Skin", head, (HEAD_R, HEAD_R, HEAD_R))
    ring(frame, "Collar", "Jacket", (0, 0.1, 0.355), 0.095, 0.022, leaning(20))
    ring(frame, "Collar Stripe", "Stripe", (0, 0.098, 0.368), 0.098, 0.007, leaning(20))
    ring(frame, "Headphones", "Headphones", (0, 0.105, 0.352), 0.112, 0.013, leaning(20))
    for side in (-1, 1):
        ellipsoid(frame, f"Headphone Cup {side}", "Headphones", (side * 0.095, 0.17, 0.35), (0.045, 0.045, 0.024))
    return head


def arms(frame: Frame, keys: Vector, key_top: float) -> None:
    for side in (-1, 1):
        shoulder = Vector((side * 0.12, 0.09, 0.3))
        hand = Vector((keys.x + side * 0.075, keys.y - 0.03, keys.z + 0.03))
        elbow, wrist = elbow_for(shoulder, hand - Vector((0, 0.06, -0.003)), Vector((side * 0.7, -0.2, -1.0)))
        tube(frame, f"Arm {side}", "Jacket", [shoulder, elbow, wrist], [0.05, 0.043, 0.038])
        along = (wrist - elbow).normalized()
        ring(frame, f"Cuff Stripe {side}", "Stripe", wrist - along * 0.03, 0.04, 0.006, along)
        palm_back = Vector((hand.x, hand.y - 0.03, key_top + 0.03))
        tube(frame, f"Wrist {side}", "Skin", [wrist - along * 0.02, palm_back], [0.016, 0.017])
        typing_hand(frame, side, hand, key_top)


def hair(frame: Frame, head: Vector) -> None:
    """Curly and fuller on top, down to the ears at the back, so the round head shows below it. No face."""
    balls = bpy.data.metaballs.new(f"{sc.FIGURE_PREFIX}Hair")
    balls.resolution, balls.render_resolution, balls.threshold = 0.02, 0.006, 0.6
    balls.materials.append(material("Hair"))
    bpy.context.scene.collection.objects.link(bpy.data.objects.new(balls.name, balls))
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
    keys = square_to_desk.matrix.inverted() @ sc.obj(KEYBOARD).matrix_world.translation
    legs(with_chair)
    head = upper_body(square_to_desk)
    arms(square_to_desk, keys, key_top)
    hair(square_to_desk, head)
