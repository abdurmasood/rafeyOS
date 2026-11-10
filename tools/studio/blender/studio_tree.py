"""Seeded tree outside the studio window: static trunk and limbs, swaying branches and leaves.

The canopy is steered into the moonbeam between the Moonlight and the window, so the
swaying leaves throw moving shadows onto the rug. Deterministic for a given SEED.
"""

from __future__ import annotations

import math
import random
from dataclasses import dataclass, field

import bmesh
import bpy
from mathutils import Vector

SEED = 11
RING_SIDES = 6
SEGMENT_LENGTH = 0.1
WALL_OUTER_X = -2.25  # keep every vertex clear of the wall (outer face at x = -2.15)
# The sky backdrop sits at x = -2.95, so only x > -2.95 is seen through the window;
# everything farther out still shadows the moonbeam (the backdrop casts no shadow).
TRUNK_BASE = Vector((-2.76, 0.5, -0.05))
TRUNK_TOP = Vector((-2.84, 0.44, 2.3))
TRUNK_RADIUS = (0.085, 0.055)
# (height on trunk, target): visible + in the beam (x2), along the beam, mid-window, low right
LIMB_TARGETS = (
    (0.55, Vector((-2.36, -0.36, 1.86))),
    (0.68, Vector((-2.42, -0.12, 2.22))),
    (0.72, Vector((-3.1, -0.6, 2.42))),
    (0.5, Vector((-2.38, 0.08, 1.7))),
    (0.42, Vector((-2.36, 0.62, 1.15))),
)
BRANCH_SPACING = 0.16
BRANCH_LENGTH = (0.28, 0.55)
TWIG_LENGTH = (0.1, 0.22)
LEAVES_PER_CLUSTER = (6, 10)
LEAF_SIZE = (0.075, 0.042)  # length, width (m)
SWAY_REACH = 0.8  # path length (m) from a static junction at which _sway reaches 1
LEAF_OUTLINE = ((0.0, 0.0), (0.25, 0.5), (0.65, 0.45), (1.0, 0.0), (0.65, -0.45), (0.25, -0.5))


@dataclass
class Tube:
    points: list[Vector]
    radii: list[float]
    sway_at_start: float = 0.0  # path length from the static junction where this tube starts
    phase: float = 0.0


@dataclass
class Leaf:
    origin: Vector
    along: Vector
    across: Vector
    sway: float
    phase: float


@dataclass
class TreeParts:
    static: list[Tube] = field(default_factory=list)
    sway: list[Tube] = field(default_factory=list)
    leaves: list[Leaf] = field(default_factory=list)


def _bezier(a: Vector, control: Vector, b: Vector, t: float) -> Vector:
    return (1 - t) ** 2 * a + 2 * (1 - t) * t * control + t * t * b


def _path(a: Vector, b: Vector, lift: float, rng: random.Random) -> list[Vector]:
    """A gently arched, slightly wobbly path from a to b."""
    control = (a + b) / 2 + Vector((0, 0, lift)) + Vector([rng.uniform(-0.06, 0.06) for _ in range(3)])
    steps = max(2, int((b - a).length / SEGMENT_LENGTH))
    points = [_bezier(a, control, b, i / steps) for i in range(steps + 1)]
    for p in points[1:-1]:
        p += Vector([rng.uniform(-0.012, 0.012) for _ in range(3)])
    return [Vector((min(p.x, WALL_OUTER_X), p.y, p.z)) for p in points]


def _tapered(count: int, start: float, end: float) -> list[float]:
    return [start + (end - start) * i / max(1, count - 1) for i in range(count)]


def _random_unit(rng: random.Random) -> Vector:
    v = Vector((rng.gauss(0, 1), rng.gauss(0, 1), rng.gauss(0, 1)))
    return v.normalized() if v.length > 1e-6 else Vector((0, 0, 1))


def _leaf_cluster(parts: TreeParts, centre: Vector, sway: float, phase: float, moon_dir: Vector, rng: random.Random) -> None:
    for _ in range(rng.randint(*LEAVES_PER_CLUSTER)):
        origin = centre + _random_unit(rng) * rng.uniform(0.0, 0.09)
        if origin.x > WALL_OUTER_X:
            continue
        along = (_random_unit(rng) + Vector((0, 0, -0.6))).normalized()
        facing = (-moon_dir + _random_unit(rng) * 0.6).normalized()
        across = facing.cross(along)
        if across.length < 1e-4:
            continue
        parts.leaves.append(Leaf(origin, along, across.normalized(), min(1.0, sway + 0.05), phase))


def _branch(parts: TreeParts, start: Vector, direction: Vector, rng: random.Random, moon_dir: Vector) -> None:
    """A swaying branch with twigs and leaf clusters, starting at a static limb."""
    phase = rng.random()
    length = rng.uniform(*BRANCH_LENGTH)
    end = start + (direction + Vector((0, 0, rng.uniform(-0.15, 0.35)))).normalized() * length
    points = _path(start, end, -0.04, rng)
    parts.sway.append(Tube(points, _tapered(len(points), 0.016, 0.005), 0.0, phase))
    for i in range(1, len(points)):
        if rng.random() < 0.55:
            along_branch = sum((points[j] - points[j - 1]).length for j in range(1, i + 1))
            twig_dir = (direction + _random_unit(rng) * 0.9).normalized()
            twig_end = points[i] + twig_dir * rng.uniform(*TWIG_LENGTH)
            twig = _path(points[i], twig_end, -0.02, rng)
            parts.sway.append(Tube(twig, _tapered(len(twig), 0.006, 0.0025), along_branch, phase))
            twig_len = sum((twig[j] - twig[j - 1]).length for j in range(1, len(twig)))
            _leaf_cluster(parts, twig[-1], (along_branch + twig_len) / SWAY_REACH, phase, moon_dir, rng)
    _leaf_cluster(parts, points[-1], length / SWAY_REACH, phase, moon_dir, rng)


def generate(moon_dir: Vector) -> TreeParts:
    rng = random.Random(SEED)
    parts = TreeParts()
    trunk = _path(TRUNK_BASE, TRUNK_TOP, 0.05, rng)
    parts.static.append(Tube(trunk, _tapered(len(trunk), *TRUNK_RADIUS)))
    for height, target in LIMB_TARGETS:
        start = trunk[int(height * (len(trunk) - 1))]
        limb = _path(start, target, 0.22, rng)
        parts.static.append(Tube(limb, _tapered(len(limb), 0.045, 0.022)))
        spacing = max(1, int(BRANCH_SPACING / SEGMENT_LENGTH))
        for i in range(len(limb) // 3, len(limb), spacing):
            outward = (limb[min(i + 1, len(limb) - 1)] - limb[i - 1]).normalized()
            side = outward.cross(Vector((0, 0, 1)))
            side = side.normalized() if side.length > 1e-4 else Vector((0, 1, 0))
            direction = (outward * 0.6 + side * rng.choice((-1, 1)) * rng.uniform(0.4, 1.0)).normalized()
            _branch(parts, limb[i], direction, rng, moon_dir)
    return parts


def _frames(points: list[Vector]) -> list[tuple[Vector, Vector]]:
    """Parallel-transport frames along a polyline, so tube rings don't twist."""
    tangent = (points[1] - points[0]).normalized()
    normal = tangent.orthogonal().normalized()
    frames = []
    for i in range(len(points)):
        nxt = points[min(i + 1, len(points) - 1)] - points[max(i - 1, 0)]
        new_tangent = nxt.normalized() if nxt.length > 1e-6 else tangent
        normal = (normal - new_tangent * normal.dot(new_tangent)).normalized()
        frames.append((normal, new_tangent.cross(normal)))
        tangent = new_tangent
    return frames


def _add_tube(bm: bmesh.types.BMesh, tube: Tube, layers: dict | None, leaf_slot: int) -> None:
    rings = []
    along = tube.sway_at_start
    frames = _frames(tube.points)
    for i, (point, radius) in enumerate(zip(tube.points, tube.radii)):
        if i:
            along += (point - tube.points[i - 1]).length
        normal, binormal = frames[i]
        ring = []
        for k in range(RING_SIDES):
            angle = 2 * math.pi * k / RING_SIDES
            v = bm.verts.new(point + (normal * math.cos(angle) + binormal * math.sin(angle)) * radius)
            if layers:
                v[layers["sway"]] = min(1.0, along / SWAY_REACH) ** 1.5
                v[layers["phase"]] = tube.phase
                v[layers["flutter"]] = 0.0
            ring.append(v)
        rings.append(ring)
    for a, b in zip(rings, rings[1:]):
        for k in range(RING_SIDES):
            face = bm.faces.new((a[k], a[(k + 1) % RING_SIDES], b[(k + 1) % RING_SIDES], b[k]))
            face.material_index = 0


def _add_leaf(bm: bmesh.types.BMesh, leaf: Leaf, layers: dict, leaf_slot: int) -> None:
    length, width = LEAF_SIZE
    verts = []
    for u, v in LEAF_OUTLINE:
        vert = bm.verts.new(leaf.origin + leaf.along * (u * length) + leaf.across * (v * width))
        vert[layers["sway"]] = leaf.sway**1.5 if leaf.sway < 1 else 1.0
        vert[layers["phase"]] = leaf.phase
        vert[layers["flutter"]] = u
        verts.append(vert)
    bm.faces.new(verts).material_index = leaf_slot


def _math(nodes, links, operation: str, a, b):
    """One Math node; a and b are sockets or numbers."""
    node = nodes.new("ShaderNodeMath")
    node.operation = operation
    for index, value in enumerate((a, b)):
        if isinstance(value, (int, float)):
            node.inputs[index].default_value = value
        else:
            links.new(value, node.inputs[index])
    return node.outputs[0]


def window_mask(nodes, links, opening: dict):
    """1 for camera rays that did NOT come through the window opening, else 0.

    The room is an open diorama, so the camera also sees over the wall tops; the tree must
    only show through the window. Shadow rays are untouched, so it still shadows the beam.
    """
    position = nodes.new("ShaderNodeSeparateXYZ")
    links.new(nodes.new("ShaderNodeNewGeometry").outputs["Position"], position.inputs[0])
    px, py, pz = position.outputs
    eye = opening["eye"]
    (y0, y1), (z0, z1) = opening["y"], opening["z"]
    inside = None
    for face_x in opening["faces_x"]:
        t = _math(nodes, links, "DIVIDE", face_x - eye.x, _math(nodes, links, "SUBTRACT", px, eye.x))
        y = _math(nodes, links, "ADD", eye.y, _math(nodes, links, "MULTIPLY", t, _math(nodes, links, "SUBTRACT", py, eye.y)))
        z = _math(nodes, links, "ADD", eye.z, _math(nodes, links, "MULTIPLY", t, _math(nodes, links, "SUBTRACT", pz, eye.z)))
        tests = (
            _math(nodes, links, "GREATER_THAN", y, y0),
            _math(nodes, links, "LESS_THAN", y, y1),
            _math(nodes, links, "GREATER_THAN", z, z0),
            _math(nodes, links, "LESS_THAN", z, z1),
        )
        for test in tests:
            inside = test if inside is None else _math(nodes, links, "MULTIPLY", inside, test)
    outside = _math(nodes, links, "SUBTRACT", 1.0, inside)
    camera_ray = nodes.new("ShaderNodeLightPath").outputs["Is Camera Ray"]
    return _math(nodes, links, "MULTIPLY", camera_ray, outside)


def _material(name: str, colour: tuple[float, float, float], opening: dict, translucent: float = 0.0) -> bpy.types.Material:
    mat = bpy.data.materials.get(name) or bpy.data.materials.new(name)
    mat.use_nodes = True
    nodes, links = mat.node_tree.nodes, mat.node_tree.links
    nodes.clear()
    out = nodes.new("ShaderNodeOutputMaterial")
    bsdf = nodes.new("ShaderNodeBsdfPrincipled")
    bsdf.inputs["Base Color"].default_value = (*colour, 1.0)
    bsdf.inputs["Roughness"].default_value = 0.75
    surface = bsdf.outputs[0]
    if translucent:
        trans = nodes.new("ShaderNodeBsdfTranslucent")
        trans.inputs["Color"].default_value = (colour[0] * 1.6, colour[1] * 1.8, colour[2] * 1.2, 1.0)
        mix = nodes.new("ShaderNodeMixShader")
        mix.inputs["Fac"].default_value = translucent
        links.new(surface, mix.inputs[1])
        links.new(trans.outputs[0], mix.inputs[2])
        surface = mix.outputs[0]
    masked = nodes.new("ShaderNodeMixShader")
    links.new(window_mask(nodes, links, opening), masked.inputs["Fac"])
    links.new(surface, masked.inputs[1])
    links.new(nodes.new("ShaderNodeBsdfTransparent").outputs[0], masked.inputs[2])
    links.new(masked.outputs[0], out.inputs["Surface"])
    return mat


def build(scene: bpy.types.Scene, moon_dir: Vector, opening: dict) -> tuple[bpy.types.Object, bpy.types.Object]:
    """Create `Tree Static` and `Tree Sway` (with _sway/_phase/_flutter point attributes).

    `opening` describes the window ({faces_x, y, z, eye}) the tree may be seen through.
    """
    parts = generate(moon_dir)
    bark = _material("Tree Bark", (0.028, 0.02, 0.016), opening)
    leaf = _material("Tree Leaf", (0.02, 0.05, 0.018), opening, translucent=0.35)

    static_bm = bmesh.new()
    for tube in parts.static:
        _add_tube(static_bm, tube, None, 0)
    sway_bm = bmesh.new()
    layers = {name: sway_bm.verts.layers.float.new(f"_{name}") for name in ("sway", "phase", "flutter")}
    for tube in parts.sway:
        _add_tube(sway_bm, tube, layers, 1)
    for item in parts.leaves:
        _add_leaf(sway_bm, item, layers, 1)

    objects = []
    for name, bm, materials, role in (
        ("Tree Static", static_bm, (bark,), "tree_static"),
        ("Tree Sway", sway_bm, (bark, leaf), "tree"),
    ):
        old = bpy.data.objects.get(name)
        if old is not None:
            bpy.data.objects.remove(old)
        mesh = bpy.data.meshes.new(name)
        bm.to_mesh(mesh)
        bm.free()
        for mat in materials:
            mesh.materials.append(mat)
        ob = bpy.data.objects.new(name, mesh)
        ob["studio_role"] = role
        scene.collection.objects.link(ob)
        objects.append(ob)
    print(f"[tree] static tubes {len(parts.static)}, sway tubes {len(parts.sway)}, leaves {len(parts.leaves)}")
    return objects[0], objects[1]
