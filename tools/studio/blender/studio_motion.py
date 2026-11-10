"""Mixamo motion clips, fitted to him and baked for the page.

Rafey downloads the clips from mixamo.com (free, royalty-free; the raw files can't be redistributed, so they
live outside the repo in MIXAMO_DIR). Each clip is retargeted onto the mannequin's deform bones and baked into
the page's own bone matrices, frame by frame, so the page plays them on the rig it already has:

- Both skeletons start from a T-pose facing -Y (studio_mannequin.place turns his to face the desk, +Y), so a
  bone copies its Mixamo partner's change of world rotation from rest, turned to his facing. Deform bones
  with no partner (palms, .001 segments, the neck's second bone) follow their parent rigidly.
- The hips' travel is scaled by leg length. A looping clip (the walk) has its forward travel taken out, so it
  plays on the spot; its speed is kept for the page to move him along a path.
- Each frame of each page bone is (posed world) x (seated world)^-1 for the deform bone that stands for it:
  the matrix that carries his seated rest mesh to the clip's pose, standing at the seat's spot on the floor,
  facing the desk. The page moves that whole pose wherever he is (a "stage" transform).

Written to motion.bin: per clip, frames x its tracks x (4 int16 quaternion + 3 int16 translation), three.js axes.
"""

from __future__ import annotations

import json
import os
import struct

import bpy
from mathutils import Matrix, Quaternion, Vector

import studio_common as sc

MIXAMO_DIR = "/Users/rafey/Blender/assets/mixamo"
FPS = 15  # baked frames a second (the clips are 30), unless a clip asks for every frame
TRANSLATION_UNIT = 4000  # translations are stored as int16 in 1/4000 m (0.25 mm, up to +-8.19 m)
STRIDE = 14  # bytes per track per frame: 4 int16 quaternion + 3 int16 translation
FLOOR_Z = 0.03  # where his feet stand: on the rug
# name -> file, and whether it loops (played on the spot, its forward travel turned into a speed). There's no
# seated guitar clip, so "guitar" (played standing) lends only its upper body to him seated, as "keys" (the piano,
# played seated) does at the synths: the page takes those clips relative to the hips (clips.js)
# Fingers are only baked for clips that play something; elsewhere the page's own fingers do. "typing" (seated
# at a keyboard) is how he types: its whole upper body, his hands lifted onto the room's keyboard (clips.js).
CLIPS = {
    "walk": {"file": "walk.fbx", "loop": True},
    "standUp": {"file": "stand-up.fbx", "loop": False},
    "sitDown": {"file": "sit-down.fbx", "loop": False},
    "idle": {"file": "stand-idle.fbx", "loop": True},
    "stretch": {"file": "stretch.fbx", "loop": False},
    "neckStretch": {"file": "neck-stretch.fbx", "loop": False},
    "guitar": {"file": "guitar.fbx", "loop": True, "fps": 30, "fingers": True},
    "keys": {"file": "piano.fbx", "loop": True, "trim": 10.0, "fingers": True},  # 23 s long: 10 s is plenty
    "typing": {"file": "typing.fbx", "loop": True, "fps": 30, "fingers": True},  # every frame: it's what he does most
    "typeToSit": {"file": "type-to-sit.fbx", "loop": False},  # hands off the keys into his lap, for a long pause
    "sitToType": {"file": "sit-to-type.fbx", "loop": False},  # and back onto the keys
}
FINGER_TRACKS = ("index_", "middle_", "ring_", "little_", "thumb_")
LOOP_SEAM = 0.6  # s at the end of a trimmed loop eased back into its first frame, so it loops without a jump
SIDES = {"Left": "L", "Right": "R"}
FINGER_NAMES = {"Index": "f_index", "Middle": "f_middle", "Ring": "f_ring", "Pinky": "f_pinky", "Thumb": "thumb"}


def mixamo_partners() -> dict[str, str]:
    """Each of his deform bones and the Mixamo bone it copies."""
    pairs = {
        "DEF-spine": "Hips",
        "DEF-spine.001": "Spine",
        "DEF-spine.002": "Spine1",
        "DEF-spine.003": "Spine2",
        "DEF-spine.004": "Neck",
        "DEF-spine.006": "Head",
    }
    for side, s in SIDES.items():
        pairs |= {
            f"DEF-shoulder.{s}": f"{side}Shoulder",
            f"DEF-upper_arm.{s}": f"{side}Arm",
            f"DEF-forearm.{s}": f"{side}ForeArm",
            f"DEF-hand.{s}": f"{side}Hand",
            f"DEF-thigh.{s}": f"{side}UpLeg",
            f"DEF-shin.{s}": f"{side}Leg",
            f"DEF-foot.{s}": f"{side}Foot",
            f"DEF-toe.{s}": f"{side}ToeBase",
        }
        for finger, deform in FINGER_NAMES.items():
            for k in (1, 2, 3):
                pairs[f"DEF-{deform}.0{k}.{s}"] = f"{side}Hand{finger}{k}"
    return {d: f"mixamorig:{m}" for d, m in pairs.items()}


def page_tracks(page_bones: list[str]) -> dict[str, str]:
    """Each page bone a clip moves, and the deform bone whose motion it takes."""
    tracks = {"swivel": "DEF-spine", "spine": "DEF-spine.002", "head": "DEF-spine.006", "phones": "DEF-spine.004"}
    for s in ("L", "R"):
        tracks |= {f"shoulder_{s}": f"DEF-upper_arm.{s}", f"elbow_{s}": f"DEF-forearm.{s}", f"hand_{s}": f"DEF-hand.{s}"}
        for joint in ("thigh", "shin", "foot", "toe"):
            tracks[f"{joint}_{s}"] = f"DEF-{joint}.{s}"
        for finger, deform in (("index", "f_index"), ("middle", "f_middle"), ("ring", "f_ring"), ("little", "f_pinky"), ("thumb", "thumb")):
            for k, joint in enumerate("abc", start=1):
                tracks[f"{finger}_{s}_{joint}"] = f"DEF-{deform}.0{k}.{s}"
    return {page: deform for page, deform in tracks.items() if page in page_bones}


def flat_to_matrix(values: list[float]) -> Matrix:
    return Matrix([values[0:4], values[4:8], values[8:12], values[12:16]])


TO_THREE = Matrix(((1, 0, 0, 0), (0, 0, 1, 0), (0, -1, 0, 0), (0, 0, 0, 1)))  # Blender (x, y, z) -> three (x, z, -y)
FACE_DESK = Quaternion((0, 0, 1), 3.141592653589793)  # Mixamo faces -Y; he faces the desk, +Y


def depth_order(parents: dict[str, str | None]) -> list[str]:
    order, placed = [], set()
    while len(order) < len(parents):
        for name, parent in parents.items():
            if name not in placed and (parent is None or parent in placed):
                order.append(name)
                placed.add(name)
    return order


def import_clip(path: str) -> bpy.types.Object:
    before = set(bpy.data.objects)
    bpy.ops.import_scene.fbx(filepath=path)
    imported = [ob for ob in bpy.data.objects if ob not in before]
    armature = next(ob for ob in imported if ob.type == "ARMATURE")
    for ob in imported:
        if ob is not armature:
            bpy.data.objects.remove(ob)
    return armature


def bake_clip(scene, name: str, spec: dict, basis: dict, all_tracks: dict[str, str]) -> dict | None:
    path = os.path.join(MIXAMO_DIR, spec["file"])
    if not os.path.exists(path):
        print(f"[export] motion: no {spec['file']} in {MIXAMO_DIR}, {name} is animated in code instead")
        return None
    tracks = {p: d for p, d in all_tracks.items() if spec.get("fingers") or not p.startswith(FINGER_TRACKS)}
    source = import_clip(path)
    action = source.animation_data.action
    start, end = (int(round(v)) for v in action.frame_range)
    rest = {n: flat_to_matrix(v) for n, v in basis["rest"].items()}
    seated = {n: flat_to_matrix(v) for n, v in basis["seated"].items()}
    parents = basis["parents"]
    order = depth_order(parents)
    partners = {d: m for d, m in mixamo_partners().items() if d in rest and m in source.pose.bones}
    src_world = source.matrix_world
    src_rest = {m: (src_world @ source.data.bones[m].matrix_local).to_quaternion() for m in partners.values()}
    hips = "mixamorig:Hips"
    toe = min((source.data.bones[b] for b in source.data.bones.keys() if b.endswith("Toe_End")), key=lambda b: (src_world @ b.head_local).z)
    src_hip_height = (src_world @ source.data.bones[hips].head_local).z - (src_world @ toe.head_local).z
    his_feet = min(rest[n].translation.z for n in rest if n.startswith("DEF-toe"))
    his_hip_height = rest["DEF-spine"].translation.z - his_feet
    ratio = his_hip_height / src_hip_height
    stage = Vector((rest["DEF-thigh.L"].translation.x + rest["DEF-thigh.R"].translation.x, rest["DEF-thigh.L"].translation.y + rest["DEF-thigh.R"].translation.y, 0)) / 2
    step = 30 // spec.get("fps", FPS)
    if spec.get("trim"):
        end = min(end, start + int(round(spec["trim"] * 30)))
    frames = list(range(start, end + 1, step))
    if spec["loop"] and frames[-1] != end:
        frames.append(end)
    hips_at = []
    for f in frames:
        scene.frame_set(f)
        hips_at.append((src_world @ source.pose.bones[hips].matrix).translation.copy())
    travel = hips_at[-1] - hips_at[0]
    travel.z = 0
    baked = []
    for i, f in enumerate(frames):
        scene.frame_set(f)
        offset = hips_at[i] - hips_at[0]
        if spec["loop"]:
            offset -= travel * (i / (len(frames) - 1))  # on the spot: the page moves him along
        offset.z = 0
        pelvis = stage + FACE_DESK @ (offset * ratio) + Vector((0, 0, FLOOR_Z + (hips_at[i].z - (src_world @ toe.head_local).z) * ratio))
        posed = {}
        for bone in order:
            parent = parents[bone]
            partner = partners.get(bone)
            if partner is None:  # follows its parent rigidly
                posed[bone] = posed[parent] @ rest[parent].inverted() @ rest[bone] if parent else rest[bone]
                continue
            change = (src_world @ source.pose.bones[partner].matrix).to_quaternion() @ src_rest[partner].inverted()
            rotation = FACE_DESK @ change @ FACE_DESK.inverted() @ rest[bone].to_quaternion()
            head = pelvis if parent is None else posed[parent] @ rest[parent].inverted() @ rest[bone].translation
            posed[bone] = Matrix.LocRotScale(head, rotation, rest[bone].to_scale())
        frame = []
        for page, deform in tracks.items():
            skin = TO_THREE @ posed[deform] @ seated[deform].inverted() @ TO_THREE.inverted()
            loc, rot, _ = skin.decompose()
            frame.append((rot, loc))
        baked.append(frame)
    bpy.data.objects.remove(source)
    bpy.data.actions.remove(action)
    duration = (frames[-1] - frames[0]) / 30
    if spec["loop"] and spec.get("trim"):
        seam = max(2, int(round(LOOP_SEAM * 30 / step)))
        for k in range(seam):
            i = len(baked) - seam + k
            w = (k + 1) / seam
            baked[i] = [(rot.slerp(baked[0][t][0], w), loc.lerp(baked[0][t][1], w)) for t, (rot, loc) in enumerate(baked[i])]
    speed = travel.length * ratio / duration if spec["loop"] else 0.0
    print(f"[export] motion {name}: {len(frames)} frames, {duration:.2f} s" + (f", {speed:.2f} m/s on the spot" if spec["loop"] else ""))
    return {"frames": baked, "duration": round(duration, 4), "loop": spec["loop"], "speed": round(speed, 4), "tracks": list(tracks)}


def bake_clips(scene: bpy.types.Scene, out_dir: str) -> dict | None:
    """Bake every clip present into out_dir/motion.bin; returns the manifest's `motion` index, or None."""
    raw = scene.get(sc.FIGURE_RIG)
    rig = json.loads(raw) if raw else None
    if not rig or not rig.get("motionBasis") or not os.path.isdir(MIXAMO_DIR):
        return None
    bones = [b["name"] for b in rig["bones"]]
    tracks = page_tracks(bones)
    clips, blob = {}, bytearray()
    for name, spec in CLIPS.items():
        clip = bake_clip(scene, name, spec, rig["motionBasis"], tracks)
        if clip is None:
            continue
        offset = len(blob)
        for frame in clip["frames"]:
            for rot, loc in frame:
                q = rot if rot.w >= 0 else -rot  # one hemisphere, so neighbouring frames slerp the short way
                units = [int(round(c * TRANSLATION_UNIT)) for c in (loc.x, loc.y, loc.z)]
                if max(abs(u) for u in units) > 32767:
                    raise sc.StudioPipelineError(f"motion {name}: a translation of {max(abs(c) for c in loc):.2f} m doesn't fit int16")
                blob += struct.pack("<4h3h", *(int(round(max(-1.0, min(1.0, c)) * 32767)) for c in (q.x, q.y, q.z, q.w)), *units)
        clips[name] = {
            "offset": offset,
            "frames": len(clip["frames"]),
            "duration": clip["duration"],
            "loop": clip["loop"],
            "speed": clip["speed"],
            "tracks": clip["tracks"],
        }
    if not clips:
        return None
    with open(os.path.join(out_dir, "motion.bin"), "wb") as f:
        f.write(blob)
    print(f"[export] motion.bin: {len(clips)} clips, {len(blob) / 1024:.0f} KB")
    rest = rig["motionBasis"]["rest"]
    stage = [(rest["DEF-thigh.L"][3] + rest["DEF-thigh.R"][3]) / 2, (rest["DEF-thigh.L"][7] + rest["DEF-thigh.R"][7]) / 2, FLOOR_Z]
    # stage: the floor point the clips stand on (under his seat), three.js axes; the page moves it to where he is
    return {"file": "motion.bin", "stride": STRIDE, "translationUnit": TRANSLATION_UNIT, "clips": clips, "stage": sc.to_three_point(stage)}
