"""Rafey at the desk, from the free "Rigged Human Mannequin man (Rigify)" (Blendkit, Fasolka 3D, royalty-free).

Set dressing, applied in memory like the rest: the asset is appended from its own .blend (kept outside the
repo), scaled to Rafey's height, posed seated at the desk with his fingers on the home row, baked into that
pose, and dressed as Rafey (red varsity jacket, jeans, curly hair, headphones round his neck). His 69 deform
bones are mapped onto the page's 40 (studio_figure.PAGE_BONES), so the page poses him with the same rig.
Chosen by Rafey on 2026-11-10 over the hand-built figure, whose short arms limited how he could move.
"""

from __future__ import annotations

import math
import os
import sys

sys.path.insert(0, os.path.dirname(__file__))

import bmesh  # noqa: E402
import bpy  # noqa: E402
from mathutils import Matrix, Quaternion, Vector  # noqa: E402

import studio_common as sc  # noqa: E402

MESH = "Rigged Human Mannequin man "  # (sic: the asset names it with a trailing space)
RIG = "Rigged Human Mannequin man (Rigify)"
HEIGHT = 1.80  # m: Rafey's height
HIP_ABOVE_SEAT = 0.085  # m: hip joints above the seat cushion's top
HIP_BEHIND_SEAT_CENTRE = 0.03  # m: he sits back in the chair
LEAN = (math.radians(4), math.radians(4), math.radians(4))  # forward, over the three lower spine bones
NECK_BACK = (math.radians(-4), math.radians(-4))  # the neck tips back so he faces the screen
HEAD_DOWN = math.radians(6)  # looking a little down at the screen
THIGH = Vector((0.16, 1.0, -0.05))  # direction (his right side; mirrored for the left): forward, knees a little apart
ANKLE_FORWARD = 0.03  # m: ankles a little ahead of the knees
ANKLE_HEIGHT = 0.085  # m above the floor
FOOT = Vector((0.0, 0.62, -0.78))  # ankle to ball of the foot
TOE = Vector((0.0, 1.0, -0.05))
ELBOW_POLE = Vector((0.55, -0.35, -1.0))  # elbows out, back and down (his right; mirrored)
HAND_PITCH = math.radians(12)  # knuckles a little below the wrist
FINGER_CURL = (math.radians(18), math.radians(30), math.radians(14))  # per joint, base to tip: tips stay ahead of the knuckles
THUMB_CURL = (math.radians(10), math.radians(25), math.radians(20))
TIP_CLEARANCE = 0.006  # m: fingertip centre above the key cap (its skin radius)
TIP_INSET = 0.004  # m: a fingertip lands a little in front of its key's centre
TIP_TOLERANCE = (0.012, 0.012, 0.008)  # m: how far a tip may miss its key's centre (half a key cap across and deep)
FIT_PASSES = 4
FINGERS = (("index", "f_index", 1), ("middle", "f_middle", 2), ("ring", "f_ring", 3), ("little", "f_pinky", 4))
# Dressing: which part of the body each deform bone belongs to (first match wins)
ZONES = (
    ("Skin", ("DEF-hand", "DEF-palm", "DEF-f_", "DEF-thumb", "DEF-spine.004", "DEF-spine.005", "DEF-spine.006")),
    ("Shoes", ("DEF-foot", "DEF-toe")),
    ("Jeans", ("DEF-spine", "DEF-thigh", "DEF-shin")),
    ("Jacket", ("DEF-spine.001", "DEF-spine.002", "DEF-spine.003", "DEF-shoulder", "DEF-upper_arm", "DEF-forearm")),
)
THICKNESS = {"Jacket": 0.012, "Jeans": 0.006}  # m of cloth over the body, so the silhouette has some bulk
ARM_PAGE_BONES = ("shoulder", "elbow", "hand", "index", "middle", "ring", "little", "thumb")


def zone_of(group: str) -> str:
    """The clothing zone a deform bone's skin belongs to (most specific prefix wins)."""
    best = ("Jacket", 0)
    for zone, prefixes in ZONES:
        for prefix in prefixes:
            if (group == prefix or group.startswith(prefix)) and len(prefix) > best[1]:
                best = (zone, len(prefix))
    return best[0]


def page_bone(group: str) -> str | None:
    """The page bone that moves a deform bone's skin, or None for groups that move nothing.

    Rigify names put the side anywhere: DEF-hand.L, DEF-upper_arm.L.001, DEF-f_index.02.R.
    """
    if not group.startswith("DEF-"):
        return None
    parts = group[4:].split(".")
    side = next((p for p in parts if p in ("L", "R")), "")
    number = int(next((p for p in parts[1:] if p.isdigit()), "0"))
    base = parts[0]
    if base == "spine":
        return "swivel" if number == 0 else "spine" if number <= 3 else "head"
    if base in ("thigh", "shin", "foot", "toe"):
        return "swivel"
    if base == "shoulder":
        return "spine"
    arm = {"upper_arm": "shoulder", "forearm": "elbow", "hand": "hand", "palm": "hand"}
    if base in arm:
        return f"{arm[base]}_{side}"
    for finger, deform, _ in FINGERS + (("thumb", "thumb", 1),):
        if base == deform:
            return f"{finger}_{side}_{'abc'[number - 1]}"
    return None


def load() -> tuple[bpy.types.Object, bpy.types.Object]:
    """Append the mannequin's armature and mesh (not its control-shape widgets) into the scene."""
    path = sc.assert_mannequin()
    with bpy.data.libraries.load(path, link=False) as (_source, into):
        into.objects = [RIG, MESH]
    for ob in into.objects:
        bpy.context.scene.collection.objects.link(ob)
    return bpy.data.objects[RIG], bpy.data.objects[MESH]


def apply_mirror(mesh_ob: bpy.types.Object) -> None:
    """Bake the Mirror modifier into the mesh, keeping both sides' vertex groups."""
    keep = {m.name: m.show_viewport for m in mesh_ob.modifiers}
    for modifier in mesh_ob.modifiers:
        modifier.show_viewport = modifier.type == "MIRROR"
    depsgraph = bpy.context.evaluated_depsgraph_get()
    baked = bpy.data.meshes.new_from_object(mesh_ob.evaluated_get(depsgraph), preserve_all_data_layers=True, depsgraph=depsgraph)
    for modifier in list(mesh_ob.modifiers):
        if modifier.type == "MIRROR":
            mesh_ob.modifiers.remove(modifier)
        else:
            modifier.show_viewport = keep[modifier.name]
    mesh_ob.data = baked


def deform_parent(name: str, bones) -> str | None:
    """Where a deform bone hangs in a deform-only skeleton (Rigify parents many of them to ORG bones)."""
    side = name[-2:]
    if name in ("DEF-thigh.L", "DEF-thigh.R"):
        return "DEF-spine"
    if name in ("DEF-shoulder.L", "DEF-shoulder.R"):
        return "DEF-spine.003"
    if name in ("DEF-upper_arm.L", "DEF-upper_arm.R"):
        return f"DEF-shoulder{side}"
    if name.startswith("DEF-palm."):
        return f"DEF-hand{side}"
    for _, deform, palm in FINGERS:
        if name.startswith(f"DEF-{deform}.01"):
            return f"DEF-palm.0{palm}{side}"
    if name.startswith("DEF-thumb.01"):
        return f"DEF-palm.01{side}"
    parent = bones[name].parent
    return parent.name if parent is not None and parent.name.startswith("DEF-") else None


def strip_controls(rig: bpy.types.Object) -> None:
    """Keep only the deform bones, free of Rigify's constraints, chained to each other, straight (no B-bones)."""
    for pose_bone in rig.pose.bones:
        for constraint in list(pose_bone.constraints):
            pose_bone.constraints.remove(constraint)
    if rig.animation_data:
        rig.animation_data_clear()
    bpy.context.view_layer.objects.active = rig
    bpy.ops.object.mode_set(mode="EDIT")
    bones = rig.data.edit_bones
    parents = {b.name: deform_parent(b.name, bones) for b in bones if b.name.startswith("DEF-")}
    for name, parent in parents.items():
        bones[name].use_connect = False
        bones[name].parent = bones[parent] if parent else None
        bones[name].bbone_segments = 1
    for bone in [b for b in bones if not b.name.startswith("DEF-")]:
        bones.remove(bone)
    bpy.ops.object.mode_set(mode="OBJECT")
    for pose_bone in rig.pose.bones:
        pose_bone.rotation_mode = "QUATERNION"
        pose_bone.rotation_quaternion = Quaternion()
        pose_bone.location = Vector()
        pose_bone.scale = Vector((1, 1, 1))
    bpy.context.view_layer.update()


def head_of(rig, name: str) -> Vector:
    return rig.matrix_world @ rig.pose.bones[name].head


def tail_of(rig, name: str) -> Vector:
    return rig.matrix_world @ rig.pose.bones[name].tail


def turn(rig, name: str, rotation: Quaternion) -> None:
    """Rotate a pose bone by a world-space rotation about its own head; its children follow."""
    pose_bone = rig.pose.bones[name]
    world_rotation = rig.matrix_world.to_3x3().normalized()
    current = pose_bone.matrix.copy()
    turned = world_rotation.inverted() @ rotation.to_matrix() @ world_rotation @ current.to_3x3()
    matrix = turned.to_4x4()
    matrix.translation = current.translation
    pose_bone.matrix = matrix
    bpy.context.view_layer.update()


def aim(rig, name: str, direction: Vector) -> None:
    """Point a bone along a world direction by the smallest turn."""
    along = (tail_of(rig, name) - head_of(rig, name)).normalized()
    turn(rig, name, along.rotation_difference(direction.normalized()))


def bend(rig, name: str, axis: Vector, angle: float) -> None:
    turn(rig, name, Quaternion(axis.normalized(), angle))


def place(rig, seat: Vector) -> None:
    """Scale to his height, face the desk (+y) and sit his hip joints just above the seat."""
    mesh = bpy.data.objects[MESH]
    top = max((mesh.matrix_world @ Vector(c)).z for c in mesh.bound_box)
    scale = HEIGHT / top
    hips_rest = (rig.data.bones["DEF-thigh.L"].head_local + rig.data.bones["DEF-thigh.R"].head_local) / 2
    facing = Matrix.Rotation(math.pi, 4, "Z")
    target = seat + Vector((0, -HIP_BEHIND_SEAT_CENTRE, HIP_ABOVE_SEAT))
    rig.matrix_world = Matrix.Translation(target - facing.to_3x3() @ (hips_rest * scale)) @ facing @ Matrix.Diagonal((scale, scale, scale, 1))
    bpy.context.view_layer.update()


def sit_upper_body(rig) -> None:
    """Lean into the desk from the waist; the neck takes the head back up to face the screen."""
    across = Vector((1, 0, 0))
    for name, angle in zip(("DEF-spine.001", "DEF-spine.002", "DEF-spine.003"), LEAN):
        bend(rig, name, across, -angle)
    for name, angle in zip(("DEF-spine.004", "DEF-spine.005"), NECK_BACK):
        bend(rig, name, across, -angle)
    bend(rig, "DEF-spine.006", across, -HEAD_DOWN)


def sit_legs(rig) -> None:
    """Thighs forward over the seat, shins down to the floor, feet flat."""
    for sign, side in ((-1, "L"), (1, "R")):
        thigh = Vector((sign * THIGH.x, THIGH.y, THIGH.z)).normalized()
        aim(rig, f"DEF-thigh.{side}", thigh)
        knee = head_of(rig, f"DEF-shin.{side}")
        shin = (tail_of(rig, f"DEF-shin.{side}.001") - knee).length
        drop = math.sqrt(max(shin**2 - ANKLE_FORWARD**2, 0.0))
        ankle = Vector((knee.x, knee.y + ANKLE_FORWARD, max(knee.z - drop, ANKLE_HEIGHT)))
        aim(rig, f"DEF-shin.{side}", ankle - knee)
        aim(rig, f"DEF-foot.{side}", FOOT)
        aim(rig, f"DEF-toe.{side}", TOE)


def elbow_for(shoulder: Vector, wrist: Vector, upper: float, fore: float, pole: Vector) -> Vector:
    """Two-bone reach: where the elbow goes so the arm bends toward `pole`."""
    span = wrist - shoulder
    reach = min(span.length, upper + fore - 1e-4)
    along = span.normalized()
    bend_toward = (pole - pole.dot(along) * along).normalized()
    cos_shoulder = (upper**2 + reach**2 - fore**2) / (2 * upper * reach)
    angle = math.acos(max(-1.0, min(1.0, cos_shoulder)))
    return shoulder + upper * (math.cos(angle) * along + math.sin(angle) * bend_toward)


def palm_axis(rig, side: str) -> tuple[int, float]:
    """Which local axis of the hand bone faces out of the palm (and which way), read while the palm faces down."""
    rotation = rig.matrix_world.to_3x3().normalized() @ rig.pose.bones[f"DEF-hand.{side}"].matrix.to_3x3()
    down = Vector((0, 0, -1))
    return max(((i, s) for i in (0, 2) for s in (1.0, -1.0)), key=lambda c: (rotation.col[c[0]] * c[1]).dot(down))


def orient(rig, name: str, along: Vector, palm: Vector, axis: tuple[int, float]) -> None:
    """Set a bone's whole world orientation: pointing along `along`, its palm axis facing `palm`."""
    index, sign = axis
    y = along.normalized()
    normal = (palm - palm.dot(y) * y).normalized() * sign
    if index == 2:
        z = normal
        x = y.cross(z)
    else:
        x = normal
        z = x.cross(y)
    world = Matrix((x, y, z)).transposed()
    pose_bone = rig.pose.bones[name]
    matrix = (rig.matrix_world.to_3x3().normalized().inverted() @ world).to_4x4()
    matrix.translation = pose_bone.matrix.translation
    pose_bone.matrix = matrix
    bpy.context.view_layer.update()


def rest(rig, names) -> None:
    for name in names:
        rig.pose.bones[name].rotation_quaternion = Quaternion()
    bpy.context.view_layer.update()


def finger_bones(side: str) -> list[str]:
    return [f"DEF-{deform}.0{k}.{side}" for _, deform, _ in FINGERS for k in (1, 2, 3)] + [f"DEF-thumb.0{k}.{side}" for k in (1, 2, 3)]


def curl(rig, chain: list[str], target: Vector, angles, pitch: float) -> None:
    """Turn a finger toward its key, curl each joint down, then lift or drop it at the knuckle so its tip rests on the cap."""
    knuckle = head_of(rig, chain[0])
    flat = Vector((target.x - knuckle.x, target.y - knuckle.y, 0))
    aim(rig, chain[0], flat.normalized() + Vector((0, 0, -math.tan(pitch))))
    across = flat.normalized().cross(Vector((0, 0, 1)))
    for name, angle in zip(chain, angles):
        bend(rig, name, across, -angle)
    forward = flat.normalized()
    for _ in range(2 * FIT_PASSES):  # fingers differ in length: each curls more or less, and settles its own height
        tip = tail_of(rig, chain[-1])
        middle = head_of(rig, chain[1])
        short = (target - tip).dot(forward)  # > 0: the tip falls short of its key, so the finger uncurls
        bend(rig, chain[1], across, max(-0.25, min(0.25, short / max((tip - middle).length, 0.02))))
        tip = tail_of(rig, chain[-1])
        lever = max((tip - knuckle).dot(forward), 0.02)  # how far ahead of the knuckle the tip is
        bend(rig, chain[0], across, max(-0.2, min(0.2, (target.z - tip.z) / lever)))


def pose_hand(rig, side: str, wrist: Vector, sizes: dict, keys: list[Vector], thumb_target: Vector) -> list[Vector]:
    """Reach the wrist, set the hand flat over the keys, curl the fingers onto them. Returns each tip's miss."""
    shoulder = head_of(rig, f"DEF-upper_arm.{side}")
    sign = -1 if side == "L" else 1
    pole = Vector((sign * ELBOW_POLE.x, ELBOW_POLE.y, ELBOW_POLE.z))
    elbow = elbow_for(shoulder, wrist, sizes["upper"], sizes["fore"], pole)
    aim(rig, f"DEF-upper_arm.{side}", elbow - shoulder)
    aim(rig, f"DEF-forearm.{side}", wrist - head_of(rig, f"DEF-forearm.{side}"))
    forward = Vector((0, math.cos(HAND_PITCH), -math.sin(HAND_PITCH)))
    orient(rig, f"DEF-hand.{side}", forward, Vector((0, 0, -1)), sizes["palm"])
    rest(rig, finger_bones(side))
    misses = []
    for (_, deform, _), key in zip(FINGERS, keys):
        chain = [f"DEF-{deform}.0{k}.{side}" for k in (1, 2, 3)]
        tip = Vector((key.x, key.y - TIP_INSET, key.z + TIP_CLEARANCE))
        curl(rig, chain, tip, FINGER_CURL, HAND_PITCH)
        misses.append(tip - tail_of(rig, chain[-1]))
    curl(rig, [f"DEF-thumb.0{k}.{side}" for k in (1, 2, 3)], thumb_target, THUMB_CURL, HAND_PITCH)
    return misses



def fit_hands(rig, home: dict[int, list[Vector]], space_y: float) -> dict[str, list[Vector]]:
    """Move each wrist until the four fingertips sit on their home keys (a s d f / j k l ;)."""
    report = {}
    for sign, side in ((-1, "L"), (1, "R")):
        keys = home[sign]
        sizes = {
            "upper": (tail_of(rig, f"DEF-upper_arm.{side}.001") - head_of(rig, f"DEF-upper_arm.{side}")).length,
            "fore": (tail_of(rig, f"DEF-forearm.{side}.001") - head_of(rig, f"DEF-forearm.{side}")).length,
            "palm": palm_axis(rig, side),
        }
        centre = sum(keys, Vector()) / len(keys)
        wrist = centre + Vector((0, -0.13, 0.03))
        thumb_target = Vector((centre.x - sign * 0.045, space_y + 0.004, centre.z + TIP_CLEARANCE))
        for _ in range(FIT_PASSES):
            misses = pose_hand(rig, side, wrist, sizes, keys, thumb_target)
            wrist += sum(misses, Vector()) / len(misses)
        report[side] = pose_hand(rig, side, wrist, sizes, keys, thumb_target)
    return report


def bake(rig: bpy.types.Object, mesh_ob: bpy.types.Object) -> None:
    """Freeze the seated pose into the mesh, in world space, and drop the armature."""
    for modifier in mesh_ob.modifiers:
        modifier.show_viewport = modifier.type == "ARMATURE"
    depsgraph = bpy.context.evaluated_depsgraph_get()
    baked = bpy.data.meshes.new_from_object(mesh_ob.evaluated_get(depsgraph), preserve_all_data_layers=True, depsgraph=depsgraph)
    world = mesh_ob.matrix_world.copy()
    for modifier in list(mesh_ob.modifiers):
        if modifier.type == "ARMATURE":
            mesh_ob.modifiers.remove(modifier)
        else:
            modifier.show_viewport = True
    mesh_ob.data = baked
    mesh_ob.parent = None
    baked.transform(world)
    mesh_ob.matrix_world = Matrix.Identity(4)
    mesh_ob.name = f"{sc.FIGURE_PREFIX}Body"


def regroup(mesh_ob: bpy.types.Object) -> dict[int, str]:
    """Replace the 69 deform groups by the page bones' groups and clothing-zone masks. Returns each vertex's main page bone."""
    names = {g.index: g.name for g in mesh_ob.vertex_groups}
    per_bone: dict[str, dict[int, float]] = {}
    per_zone: dict[str, dict[int, float]] = {}
    main: dict[int, tuple[float, str]] = {}
    for vert in mesh_ob.data.vertices:
        for entry in vert.groups:
            group = names[entry.group]
            bone = page_bone(group)
            if bone is None or entry.weight <= 0:
                continue
            total = per_bone.setdefault(bone, {}).get(vert.index, 0.0) + entry.weight
            per_bone[bone][vert.index] = total
            zone = per_zone.setdefault(zone_of(group), {})
            zone[vert.index] = zone.get(vert.index, 0.0) + entry.weight
            if total > main.get(vert.index, (0.0, ""))[0]:
                main[vert.index] = (total, bone)
    mesh_ob.vertex_groups.clear()
    for label, table in [*per_bone.items(), *((f"zone {zone}", t) for zone, t in per_zone.items())]:
        group = mesh_ob.vertex_groups.new(name=label)
        for index, weight in table.items():
            group.add([index], min(1.0, weight), "REPLACE")
    return {index: bone for index, (_, bone) in main.items()}


def dress(mesh_ob: bpy.types.Object, material) -> None:
    """Colour each face by the clothing zone that holds most of it, and give the clothes some thickness."""
    zones = [zone for zone, _ in ZONES]
    mesh_ob.data.materials.clear()
    for zone in zones:
        mesh_ob.data.materials.append(material(zone))
    masks = {g.index: g.name[5:] for g in mesh_ob.vertex_groups if g.name.startswith("zone ")}
    for polygon in mesh_ob.data.polygons:
        share = dict.fromkeys(zones, 0.0)
        for index in polygon.vertices:
            for entry in mesh_ob.data.vertices[index].groups:
                if entry.group in masks:
                    share[masks[entry.group]] += entry.weight
        polygon.material_index = zones.index(max(share, key=share.get))
    for position, (zone, amount) in enumerate(THICKNESS.items()):
        displace = mesh_ob.modifiers.new(f"{zone} thickness", "DISPLACE")
        displace.vertex_group, displace.strength, displace.mid_level, displace.direction = f"zone {zone}", amount, 0.0, "NORMAL"
        mesh_ob.modifiers.move(len(mesh_ob.modifiers) - 1, position)


def shadow_caster(mesh_ob: bpy.types.Object, main_bone: dict[int, str]) -> bpy.types.Object:
    """A copy of him without arms, unseen but casting his body's shadow into the plates (the live arms cast none)."""
    proxy = mesh_ob.copy()
    proxy.data = mesh_ob.data.copy()
    proxy.name = f"{sc.FIGURE_PREFIX}Shadow"
    bpy.context.scene.collection.objects.link(proxy)
    bm = bmesh.new()
    bm.from_mesh(proxy.data)
    bm.verts.ensure_lookup_table()
    arms = [v for v in bm.verts if main_bone.get(v.index, "").split("_")[0] in ARM_PAGE_BONES]
    bmesh.ops.delete(bm, geom=arms, context="VERTS")
    bm.to_mesh(proxy.data)
    bm.free()
    for ray in ("camera", "diffuse", "glossy", "transmission", "volume_scatter"):
        setattr(proxy, f"visible_{ray}", False)
    proxy.visible_shadow = True
    return proxy


def zone_points(mesh_ob: bpy.types.Object, main_bone: dict[int, str], bone: str) -> list[Vector]:
    return [mesh_ob.data.vertices[i].co.copy() for i, b in main_bone.items() if b == bone]


def radius_round(points: list[Vector], centre: Vector, axis: Vector) -> float:
    """Mean distance of points from an axis through centre."""
    axis = axis.normalized()
    return sum(((p - centre) - (p - centre).dot(axis) * axis).length for p in points) / max(1, len(points))


def check_fit(misses: dict[str, list[Vector]]) -> None:
    """Every fingertip has to land on its key cap, or the build stops."""
    for side, sides_misses in misses.items():
        for (finger, _, _), miss in zip(FINGERS, sides_misses):
            print(f"[mannequin] {finger}_{side} tip misses its key by ({miss.x * 1000:+.0f}, {miss.y * 1000:+.0f}, {miss.z * 1000:+.0f}) mm")
            if any(abs(m) > limit for m, limit in zip(miss, TIP_TOLERANCE)):
                raise sc.StudioPipelineError(f"{finger}_{side} fingertip misses its home key by {tuple(round(m, 3) for m in miss)}")


def page_skeleton(fig, rig) -> None:
    """The page's bones, pivoted where his deform bones now sit (root and swivel are already in `fig`)."""
    fig.bone("spine", "swivel", head_of(rig, "DEF-spine.001"))
    fig.bone("head", "spine", head_of(rig, "DEF-spine.004"))
    for side in ("L", "R"):
        fig.bone(f"shoulder_{side}", "spine", head_of(rig, f"DEF-upper_arm.{side}"))
        fig.bone(f"elbow_{side}", f"shoulder_{side}", head_of(rig, f"DEF-forearm.{side}"))
        fig.bone(f"hand_{side}", f"elbow_{side}", head_of(rig, f"DEF-hand.{side}"))
        for finger, deform, _ in FINGERS + (("thumb", "thumb", 1),):
            parent = f"hand_{side}"
            for k, joint in enumerate("abc", start=1):
                parent = fig.bone(f"{finger}_{side}_{joint}", parent, head_of(rig, f"DEF-{deform}.0{k}.{side}"))


def landmarks(rig) -> dict:
    """Where the neck, wrists and their directions are, read before the armature goes."""
    neck = head_of(rig, "DEF-spine.004")
    marks = {"neck": neck, "up": (tail_of(rig, "DEF-spine.005") - neck).normalized()}
    for side in ("L", "R"):
        wrist = head_of(rig, f"DEF-hand.{side}")
        marks[f"wrist_{side}"] = wrist
        marks[f"along_{side}"] = (wrist - head_of(rig, f"DEF-forearm.{side}.001")).normalized()
    return marks


def accessories(fig, figure, mesh_ob, main_bone: dict[int, str], marks: dict) -> None:
    """Collar, collar stripe and headphones round his neck, white cuff stripes, curly hair: his varsity look."""
    frame = figure.Frame(Matrix.Identity(4))
    neck, up = marks["neck"], marks["up"]
    head_points = zone_points(mesh_ob, main_bone, "head")
    neck_band = [p for p in head_points if 0 <= (p - neck).dot(up) <= 0.06]
    collar = radius_round(neck_band, neck, up) + THICKNESS["Jacket"] + 0.016
    fig.part(figure.ring(frame, "Collar", "Jacket", neck + up * 0.004, collar, 0.017, up), ["spine"])
    fig.part(figure.ring(frame, "Collar Stripe", "Stripe", neck + up * 0.019, collar + 0.002, 0.006, up), ["spine"])
    fig.part(figure.ring(frame, "Headphones", "Headphones", neck - up * 0.006, collar + 0.022, 0.011, up), ["spine"])
    forward, right = Vector((0, 1, 0)), Vector((1, 0, 0))
    for sign in (-1, 1):
        cup = neck + right * sign * (collar + 0.03) + forward * 0.02 - up * 0.006
        fig.part(figure.ellipsoid(frame, f"Headphone Cup {sign}", "Headphones", cup, (0.014, 0.034, 0.034)), ["spine"])
    for side in ("L", "R"):
        wrist, along = marks[f"wrist_{side}"], marks[f"along_{side}"]
        band = [p for p in zone_points(mesh_ob, main_bone, f"elbow_{side}") if -0.06 <= (p - wrist).dot(along) <= 0]
        cuff = radius_round(band, wrist, along) + THICKNESS["Jacket"] + 0.003
        stripe = figure.ring(frame, f"Cuff Stripe {side}", "Stripe", wrist - along * 0.03, cuff, 0.005, along)
        fig.part(figure.travels(stripe), [f"elbow_{side}"])
    skull = [p for p in head_points if (p - neck).dot(up) > 0.08]
    low = Vector([min(p[i] for p in skull) for i in range(3)])
    high = Vector([max(p[i] for p in skull) for i in range(3)])
    figure.hair(frame, fig, (low + high) / 2, (high - low) / 2)


def build(fig, figure, seat: Vector, home: dict[int, list[Vector]], space_y: float) -> None:
    """Seat, pose, bake, dress and rig him: adds his bones and parts to `fig` (a studio_figure.Rig)."""
    rig, mesh_ob = load()
    apply_mirror(mesh_ob)
    strip_controls(rig)
    place(rig, seat)
    sit_upper_body(rig)
    sit_legs(rig)
    check_fit(fit_hands(rig, home, space_y))
    page_skeleton(fig, rig)
    marks = landmarks(rig)
    bake(rig, mesh_ob)
    bpy.data.objects.remove(rig)
    main_bone = regroup(mesh_ob)
    unknown = {g.name for g in mesh_ob.vertex_groups if not g.name.startswith("zone ")} - {b["name"] for b in fig.bones}
    if unknown:
        raise sc.StudioPipelineError(f"skin groups with no page bone: {sorted(unknown)}")
    dress(mesh_ob, figure.material)
    shadow_caster(mesh_ob, main_bone)
    fig.skin(figure.travels(mesh_ob))  # the shadow caster casts his body's shadow; the live body casts none
    accessories(fig, figure, mesh_ob, main_bone, marks)
