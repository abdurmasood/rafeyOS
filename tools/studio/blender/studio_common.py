"""Shared constants and helpers for the /studio Blender pipeline.

Every script in this folder runs headless against Rafey's original room file and
never saves it. Scene prep (open window, tree, sky, light links) is applied in
memory each run, so the .blend is never modified.

Usage (from any directory):
    /Applications/Blender.app/Contents/MacOS/Blender -b /Users/rafey/Blender/room-night.blend \
        --python-exit-code 1 -P tools/studio/blender/<script>.py -- [args]
"""

from __future__ import annotations

import argparse
import math
import os
import sys
from typing import Iterable, Sequence

import bpy
from mathutils import Matrix, Vector

# Read only. The old web copy (room-night-web.blend) now holds an unrelated night-city scene.
SOURCE_BLEND = "/Users/rafey/Blender/room-night.blend"
OUT_DIR = "/Users/rafey/Blender/web-out"
REPO_DIR = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "..", ".."))
PUBLIC_DIR = os.path.join(REPO_DIR, "public", "studio", "v1")
MANIFEST_PATH = os.path.join(REPO_DIR, "lib", "studio", "manifest.json")

REF_CAMERA = "Cam_Persp_100mm"
OVERSCAN_CAMERA = "Cam_Web_Overscan"
# tools/studio/build.sh sets this. A draft is the same pipeline at a quarter of the pixels, for a quick look.
# Final is 1.5x the 2000 px render: shrunk onto a MacBook screen, the plates stay crisper than the render at 1:1.
QUALITY_SCALES = {"draft": 0.75, "final": 1.5}
QUALITY = os.environ.get("STUDIO_QUALITY", "final")
if QUALITY not in QUALITY_SCALES:
    raise ValueError(f"STUDIO_QUALITY must be one of {sorted(QUALITY_SCALES)}, got {QUALITY!r}")
PLATE_SCALE = QUALITY_SCALES[QUALITY]
REF_SIZE = round(2000 * PLATE_SCALE)
OVERSCAN_WIDTH = round(4800 * PLATE_SCALE)
OVERSCAN_HEIGHT = round(2400 * PLATE_SCALE)
# The overscan sees 1.2x the reference's field vertically (43.2 vs 36 mm) at the same pixel pitch,
# so the reference frame is exactly the centred crop of the plate.
OVERSCAN_SENSOR_HEIGHT = 43.2
REF_CROP = ((OVERSCAN_WIDTH - REF_SIZE) // 2, (OVERSCAN_HEIGHT - REF_SIZE) // 2, REF_SIZE, REF_SIZE)

MOONLIGHT = "Moonlight"
MOONBEAM = "Moonbeam (haze only)"
CANDLE_LIGHT = "Candle Light"
CANDLE_FLAME = "Candle Flame"
UPLIGHT = "Plant Uplight Spot"
ROOM_HAZE = "Room Haze"
PHONE_CLOCK = "Phone Clock"
WINDOW_SKY = "Window Sky"
WINDOW_FRAME = "Window Frame"
TREE_STATIC = "Tree Static"
TREE_SWAY = "Tree Sway"
SKY_BACKDROP = "Sky Backdrop"
WINDOW_SASH = "Window Sash"
FLOOR_MONSTERA = "Monstera (floor)"
FIGURE_PREFIX = "Rafey "  # every object and material of the seated figure (studio_figure.py)
FIGURE_LIVE = "studio_live"  # figure parts drawn live on the page (they type and look around)
FIGURE_NO_SHADOW = "studio_no_shadow"  # parts that travel far: their shadows would stay behind as ghosts
FIGURE_LAYER = "studio_layer"  # which colour layer a live part takes its colour from: "figure" or "backrest"
FIGURE_RIG = "studio_figure_rig"  # scene property: the figure's bones and which bones move each live part
MONITOR_SCREEN = "Monitor Screen"

PLANTS = (
    "Monstera (floor)",
    "Monstera mini (lower shelf)",
    "Pothos (upper shelf)",
    "Snake Plant (upper shelf)",
    "Monstera (window shelf)",
    "Pothos (window shelf)",
    "Snake Plant (window shelf)",
)

# Blender is Z-up, three.js / glTF is Y-up: (x, y, z) -> (x, z, -y).
BLENDER_TO_THREE = Matrix(((1, 0, 0, 0), (0, 0, 1, 0), (0, -1, 0, 0), (0, 0, 0, 1)))


class StudioPipelineError(RuntimeError):
    """Raised when the pipeline would touch the wrong file or finds a broken scene."""


def assert_source_blend() -> None:
    """Fail fast unless the open file is the room this pipeline was built against."""
    if os.path.realpath(bpy.data.filepath) != os.path.realpath(SOURCE_BLEND):
        raise StudioPipelineError(f"Refusing to run on {bpy.data.filepath!r}; expected {SOURCE_BLEND!r}")


def script_args(argv: Sequence[str] | None = None) -> list[str]:
    """Return the arguments after Blender's `--` separator."""
    argv = list(sys.argv if argv is None else argv)
    return argv[argv.index("--") + 1 :] if "--" in argv else []


def parser(description: str) -> argparse.ArgumentParser:
    return argparse.ArgumentParser(description=description, prog="blender -b ... -P script.py --")


def obj(name: str) -> bpy.types.Object:
    """Look up a scene object by name, failing loudly when it is missing."""
    found = bpy.data.objects.get(name)
    if found is None:
        raise StudioPipelineError(f"Object {name!r} not found")
    return found


def ensure_out_dir(path: str = OUT_DIR) -> str:
    os.makedirs(path, exist_ok=True)
    return path


def to_three_point(point: Iterable[float]) -> list[float]:
    p = BLENDER_TO_THREE @ Vector((*point, 1.0))
    return [round(p.x, 6), round(p.y, 6), round(p.z, 6)]


def to_three_direction(direction: Iterable[float]) -> list[float]:
    d = (BLENDER_TO_THREE.to_3x3() @ Vector(direction)).normalized()
    return [round(d.x, 6), round(d.y, 6), round(d.z, 6)]


def to_three_matrix(matrix_world: Matrix) -> list[float]:
    """Column-major 4x4 (three.js Matrix4.fromArray order) in Y-up space."""
    m = BLENDER_TO_THREE @ matrix_world
    return [round(m[row][col], 7) for col in range(4) for row in range(4)]


def live_figure_parts(layer: str | None = None) -> list[str]:
    """Names of the live figure and chair parts, optionally only those coloured from one layer."""
    return sorted(
        ob.name for ob in bpy.context.scene.objects if ob.get(FIGURE_LIVE) and (layer is None or ob.get(FIGURE_LAYER) == layer)
    )


def light_forward(light_obj: bpy.types.Object) -> Vector:
    """World direction a spot light points at (its local -Z)."""
    return (light_obj.matrix_world.to_quaternion() @ Vector((0, 0, -1))).normalized()


def make_overscan_camera(scene: bpy.types.Scene) -> bpy.types.Object:
    """Create (in memory) the 4800x2400 overscan twin of the reference camera."""
    existing = bpy.data.objects.get(OVERSCAN_CAMERA)
    if existing is not None:
        return existing
    ref = obj(REF_CAMERA)
    data = ref.data.copy()
    data.name = OVERSCAN_CAMERA
    data.sensor_fit = "VERTICAL"
    data.sensor_height = OVERSCAN_SENSOR_HEIGHT
    data.shift_x = 0.0
    data.shift_y = 0.0
    cam = bpy.data.objects.new(OVERSCAN_CAMERA, data)
    cam.matrix_world = ref.matrix_world.copy()
    scene.collection.objects.link(cam)
    return cam


def use_camera(scene: bpy.types.Scene, which: str) -> None:
    """Point the scene at the reference (2000^2) or overscan (4800x2400) camera."""
    if which == "ref":
        scene.camera = obj(REF_CAMERA)
        scene.render.resolution_x = REF_SIZE
        scene.render.resolution_y = REF_SIZE
    elif which == "overscan":
        scene.camera = make_overscan_camera(scene)
        scene.render.resolution_x = OVERSCAN_WIDTH
        scene.render.resolution_y = OVERSCAN_HEIGHT
    else:
        raise StudioPipelineError(f"Unknown camera {which!r}")
    scene.render.resolution_percentage = 100


def enable_gpu(scene: bpy.types.Scene) -> None:
    prefs = bpy.context.preferences.addons["cycles"].preferences
    prefs.compute_device_type = "METAL"
    prefs.get_devices()
    for device in prefs.devices:
        device.use = device.type == "METAL"
    scene.cycles.device = "GPU"


def glare_node(scene: bpy.types.Scene) -> bpy.types.Node | None:
    tree = scene.compositing_node_group
    if tree is None:
        return None
    return next((n for n in tree.nodes if n.type == "GLARE"), None)


def half_tan_fov(lens_mm: float, sensor_mm: float) -> float:
    return sensor_mm / (2.0 * lens_mm)


def degrees(radians: float) -> float:
    return math.degrees(radians)
