"""Turn the /studio renders into web assets: base plate, packed light deltas, plant atlas, manifest.

Runs headless with no .blend (OpenImageIO + numpy ship with Blender):

    Blender -b --factory-startup --python-exit-code 1 -P tools/studio/blender/postprocess.py -- \
        --renders /Users/rafey/Blender/web-out [--base-name base]

Everything stays in display (sRGB-encoded) space: each delta is the difference between two
complete Cycles renders, so adding it back reproduces the render exactly.
"""

from __future__ import annotations

import argparse
import json
import os
import subprocess
import sys
import tempfile

import numpy as np
import OpenImageIO as oiio

HERE = os.path.dirname(__file__)
REPO_DIR = os.path.abspath(os.path.join(HERE, "..", "..", ".."))
PUBLIC_DIR = os.path.join(REPO_DIR, "public", "studio", "v1")
MANIFEST_PATH = os.path.join(REPO_DIR, "lib", "studio", "manifest.json")
CWEBP = "/opt/homebrew/bin/cwebp"

# name -> (render with the light, render without it)
DELTAS = {
    "moon": ("base", "moon_off"),
    "haze": ("base", "beam_off"),
    "candle": ("base", "candle_off"),
    "up": ("up_free", "up_off"),
    "figure": ("figure_gone", "base"),  # him and his chair rolled away: his shadows lift
    "body": ("body_gone", "base"),  # him up out of the chair: his shadows lift, the chair's stay
    "guitar": ("guitar_gone", "base"),  # the guitar off its hook: its shadow leaves the wall
    "screen": ("screen_off", "base"),  # the monitor asleep: its glow leaves the desk
    "hall": ("door_open", "base"),  # the door open: the hall's warm light comes in
    "tv": ("door_open", "door_open_tv_off"),  # the TV down the hall, through the open door: the page flickers it
    "mug": ("mug_gone", "base"),  # his mug off its coaster: its shadow and reflection go
    # Synth A's keys held down (studio_keys.py), at full resolution: each key is only a few pixels wide
    "keysA": ("keys_a", "base"),
    "keysB": ("keys_b", "base"),
    "keysBlack": ("keys_black", "base"),
}
KEY_DELTAS = ("keysA", "keysB", "keysBlack")
# Soft, rarely-seen changes packed at a fraction of the plate's resolution, so the final atlas fits the
# 7200 px texture the page requires (the page samples by rect, so resolution doesn't matter to it)
DELTA_DOWNSCALE = {"figure": 2, "body": 2, "guitar": 2, "screen": 2, "hall": 2, "tv": 2}
# A light's footprint: where its blurred contribution clears the render-noise floor
FOOTPRINT_BLUR = 6
FOOTPRINT_LOW = 1.5 / 255.0
FOOTPRINT_HIGH = 4.0 / 255.0
FOOTPRINT_FEATHER = 10
DELTA_MARGIN = 16
PLANT_MARGIN = 24
PLANT_DILATE = 12
ALPHA_FLOOR = 0.1
ATLAS_GAP = 4
MAX_TEXTURE = 7200  # lib/studio/webgl.js MIN_TEXTURE_SIZE: every texture must fit it
# Layers taken as seen rather than un-premultiplied: the chair's see-through backrest keeps what shows
# through it (him, the room), so drawn opaque on the page it matches the render at rest
COMPOSITE_LAYERS = {"e", "g"}
BASE_PLATE_WIDTH = 4800  # pixel sizes above are tuned for this width and scale with the plate
SCALE = 1.0  # set from the base plate in main()


def px(n: int) -> int:
    """A pixel distance tuned at 4800 px wide, at the current plate's resolution."""
    return max(1, round(n * SCALE))
RNG = np.random.default_rng(7)


def load(path: str) -> np.ndarray:
    buf = oiio.ImageBuf(path)
    pixels = buf.get_pixels(oiio.FLOAT)
    if pixels is None or pixels.size == 0:
        raise FileNotFoundError(path)
    return pixels


def dither_to_u8(img: np.ndarray) -> np.ndarray:
    """TPDF dither so dark gradients don't band once quantised to 8 bits."""
    noise = (RNG.random(img.shape, dtype=np.float32) - RNG.random(img.shape, dtype=np.float32)) / 255.0
    return np.clip(np.rint((img + noise) * 255.0), 0, 255).astype(np.uint8)


def write_webp(img: np.ndarray, path: str, quality: int, lossless: bool = False) -> None:
    os.makedirs(os.path.dirname(path), exist_ok=True)
    u8 = dither_to_u8(img)
    with tempfile.NamedTemporaryFile(suffix=".png", delete=False) as tmp:
        spec = oiio.ImageSpec(u8.shape[1], u8.shape[0], u8.shape[2], oiio.UINT8)
        out = oiio.ImageOutput.create(tmp.name)
        out.open(tmp.name, spec)
        out.write_image(u8)
        out.close()
        flags = ["-lossless", "-exact"] if lossless else ["-q", str(quality), "-sharp_yuv"]
        subprocess.run([CWEBP, *flags, "-m", "6", "-mt", "-quiet", tmp.name, "-o", path], check=True)
    os.unlink(tmp.name)
    print(f"[post] {os.path.basename(path)} {u8.shape[1]}x{u8.shape[0]}: {os.path.getsize(path) / 1024:.0f} KB")


def box_blur(img: np.ndarray, radius: int) -> np.ndarray:
    """Separable box blur of a 2D array (edge-padded), via cumulative sums."""
    out = img.astype(np.float32)
    for axis in (0, 1):
        pad = [(radius + 1, radius) if a == axis else (0, 0) for a in range(out.ndim)]
        c = np.cumsum(np.pad(out, pad, mode="edge"), axis=axis)
        n = out.shape[axis]
        out = (np.take(c, range(2 * radius + 1, 2 * radius + 1 + n), axis=axis) - np.take(c, range(0, n), axis=axis)) / (2 * radius + 1)
    return out


def smoothstep(low: float, high: float, x: np.ndarray) -> np.ndarray:
    t = np.clip((x - low) / (high - low), 0.0, 1.0)
    return t * t * (3.0 - 2.0 * t)


def footprint(delta: np.ndarray) -> np.ndarray:
    """0..1 mask of where a light really contributes; render noise elsewhere is dropped."""
    soft = box_blur(delta.max(axis=2), px(FOOTPRINT_BLUR))
    return np.clip(box_blur(smoothstep(FOOTPRINT_LOW, FOOTPRINT_HIGH, soft), px(FOOTPRINT_FEATHER)) * 2.0, 0.0, 1.0)


def bbox(mask: np.ndarray, margin: int) -> tuple[int, int, int, int] | None:
    rows, cols = np.any(mask, axis=1), np.any(mask, axis=0)
    if not rows.any():
        return None
    y0, y1 = np.argmax(rows), len(rows) - np.argmax(rows[::-1])
    x0, x1 = np.argmax(cols), len(cols) - np.argmax(cols[::-1])
    h, w = mask.shape
    return max(0, x0 - margin), max(0, y0 - margin), min(w, x1 + margin), min(h, y1 + margin)


def shelf_pack(sizes: list[tuple[int, int]], width: int) -> tuple[list[tuple[int, int]], int]:
    """Place rectangles left to right in rows (tallest first); returns positions and total height."""
    order = sorted(range(len(sizes)), key=lambda i: -sizes[i][1])
    positions: list[tuple[int, int]] = [(0, 0)] * len(sizes)
    x = y = row_h = 0
    for i in order:
        w, h = sizes[i]
        if x + w > width:
            x, y, row_h = 0, y + row_h + ATLAS_GAP, 0
        positions[i] = (x, y)
        x, row_h = x + w + ATLAS_GAP, max(row_h, h)
    return positions, y + row_h


def uv_rect(x0: int, y0: int, x1: int, y1: int, w: int, h: int) -> list[float]:
    """Pixel box (rows from the top) -> [u0, v0, u1, v1] with v up, as three.js samples images."""
    return [round(x0 / w, 6), round(1 - y1 / h, 6), round(x1 / w, 6), round(1 - y0 / h, 6)]


def downscale(image: np.ndarray, factor: int) -> np.ndarray:
    """Box-average `factor` x `factor` pixel blocks (the edge rows and columns that don't fill a block are dropped)."""
    if factor == 1:
        return image
    h, w = image.shape[0] // factor * factor, image.shape[1] // factor * factor
    trimmed = image[:h, :w]
    return trimmed.reshape(h // factor, factor, w // factor, factor, -1).mean(axis=(1, 3))


def pack_atlas(crops: dict[str, np.ndarray], channels: int) -> tuple[np.ndarray, dict[str, list[float]]]:
    names = list(crops)
    sizes = [(crops[n].shape[1], crops[n].shape[0]) for n in names]
    area = sum(w * h for w, h in sizes)
    width = max(min(MAX_TEXTURE, max(4096, int(area**0.5 * 1.15))), max(w for w, _ in sizes))
    positions, height = shelf_pack(sizes, width)
    height = (height + 3) // 4 * 4
    if max(width, height) > MAX_TEXTURE:
        raise ValueError(f"atlas {width}x{height} exceeds the {MAX_TEXTURE} px texture size the web page requires")
    atlas = np.zeros((height, width, channels), dtype=np.float32)
    rects: dict[str, list[float]] = {}
    for name, (x, y), (w, h) in zip(names, positions, sizes):
        atlas[y : y + h, x : x + w] = crops[name][..., :channels]
        rects[name] = uv_rect(x, y, x + w, y + h, width, height)
    return atlas, rects


def build_deltas(renders: dict[str, np.ndarray], plate_wh: tuple[int, int], within: dict | None = None) -> tuple[np.ndarray | None, dict]:
    """Signed light layers: positive and negative parts are packed separately at full precision.

    AgX is nonlinear, so adding a light can lower a channel in display space; dropping those
    negatives would make a full shadow miss the light-off render. `within` limits a delta to a pixel box
    (x0, y0, x1, y1): the pressed keys only change the keys (the page uses them nowhere else), but moving
    geometry reshuffles the render noise around them.
    """
    crops, meta = {}, {}
    for name, (with_light, without) in DELTAS.items():
        if with_light not in renders or without not in renders:
            print(f"[post] skip delta {name}: missing renders")
            continue
        diff = renders[with_light][..., :3] - renders[without][..., :3]
        mask = footprint(np.abs(diff))
        box = bbox(mask > 0.01, px(DELTA_MARGIN))
        if box is None:
            print(f"[post] delta {name} is empty")
            continue
        if within and name in within:
            lx0, ly0, lx1, ly1 = within[name]
            box = (max(box[0], lx0), max(box[1], ly0), min(box[2], lx1), min(box[3], ly1))
        x0, y0, x1, y1 = box
        window = (slice(y0, y1), slice(x0, x1))
        layer = {"rect": uv_rect(x0, y0, x1, y1, *plate_wh)}
        for sign, part in (("pos", np.clip(diff[window], 0, None)), ("neg", np.clip(-diff[window], 0, None))):
            part = part * mask[window][..., None]
            scale = float(part.max()) or 1.0
            crops[f"{name}.{sign}"] = downscale(part / scale, DELTA_DOWNSCALE.get(name, 1))
            layer[sign] = {"scale": round(scale, 6)}
        meta[name] = layer
        print(f"[post] delta {name}: {x1 - x0}x{y1 - y0} px, +{layer['pos']['scale']:.4f} / -{layer['neg']['scale']:.4f}")
    if not crops:
        return None, {}
    atlas, rects = pack_atlas(crops, 3)
    for key, rect in rects.items():
        name, sign = key.split(".")
        meta[name][sign]["atlasRect"] = rect
    return atlas, meta


def push_pull_dilate(color: np.ndarray, valid: np.ndarray, steps: int) -> np.ndarray:
    """Grow valid colours outward so swaying edges never sample the background."""
    color, valid = color.copy(), valid.copy()
    for _ in range(steps):
        acc = np.zeros_like(color)
        cnt = np.zeros(valid.shape, dtype=np.float32)
        for dy, dx in ((0, 1), (0, -1), (1, 0), (-1, 0)):
            shifted_v = np.roll(valid, (dy, dx), axis=(0, 1))
            acc += np.roll(color, (dy, dx), axis=(0, 1)) * shifted_v[..., None]
            cnt += shifted_v
        grow = (~valid) & (cnt > 0)
        color[grow] = acc[grow] / cnt[grow][:, None]
        valid |= grow
    return color


def build_plants(renders: dict[str, np.ndarray], groups: dict[str, list[str]], plate_wh: tuple[int, int]) -> tuple[np.ndarray | None, dict]:
    """Un-premultiply each plant against the plant-free base and pack them into one atlas."""
    if "base" not in renders:
        return None, {}
    base = renders["base"][..., :3]
    crops, meta = {}, {}
    for key, plants in groups.items():
        layer, matte = renders.get(f"plants_{key}"), renders.get(f"matte_{key}")
        if layer is None or matte is None or not plants:
            continue
        alpha = matte[..., 3]
        box = bbox(alpha > 0.01, px(PLANT_MARGIN))
        if box is None:
            continue
        x0, y0, x1, y1 = box
        a = alpha[y0:y1, x0:x1, None]
        c, b = layer[y0:y1, x0:x1, :3], base[y0:y1, x0:x1]
        if key in COMPOSITE_LAYERS:
            solid = a[..., 0] > 0.01
            color = np.where(solid[..., None], c, 0.0)
        else:
            solid = a[..., 0] > ALPHA_FLOOR
            color = np.where(solid[..., None], (c - (1 - a) * b) / np.maximum(a, ALPHA_FLOOR), 0.0)
        color = push_pull_dilate(np.clip(color, 0, 1), solid, px(PLANT_DILATE))
        crops[key] = color
        meta[key] = {"plants": plants, "rect": uv_rect(x0, y0, x1, y1, *plate_wh)}
    if not crops:
        return None, {}
    atlas, rects = pack_atlas(crops, 3)
    for key in meta:
        meta[key]["atlasRect"] = rects[key]
    return atlas, meta


# Live light for him off the chair (studio_probes.py): an ambient cube per probe (the light a white surface
# facing each axis reflects), and the display LUT
CUBE_FROM_BLENDER = (0, 1, 4, 5, 3, 2)  # baked faces +X -X +Y -Y +Z -Z (Blender) -> +x -x +y -y +z -z (three.js)


def build_probes(renders_dir: str, name: str = "probes.json") -> dict | None:
    """Six colours per probe (three.js axis order), on a regular grid in three.js axes, x fastest."""
    path = os.path.join(renders_dir, name)
    if not os.path.exists(path):
        return None
    info = json.load(open(path))
    (nx, ny, nz), step = info["counts"], info["step"]
    points = info["points"]
    cubes = np.array(info["cubes"])[:, CUBE_FROM_BLENDER]
    zs = sorted({p[2] for p in points})
    order, valid = [], []
    for iz_three in range(ny):  # three z ascending = Blender y descending
        for iy_three in range(nz):  # three y ascending = Blender z ascending
            for ix in range(nx):
                k = ix + nx * ((ny - 1 - iz_three) + ny * iy_three)
                order.append(k)
                valid.append(bool(info["valid"][k]))
    xs = sorted({p[0] for p in points})
    ys = sorted({p[1] for p in points})
    lifts = [round(zs[i + 1] - zs[i], 4) for i in range(len(zs) - 1)]
    lit = cubes[[k for k, v in zip(order, valid) if v]]
    print(f"[post] {name}: {sum(valid)} valid of {len(valid)}, grid {nx}x{nz}x{ny}; light per face median {np.round(np.median(lit, axis=(0, 1)), 4)}")
    return {
        "origin": [xs[0], zs[0], -ys[-1]],
        "step": [step, lifts[0] if lifts else 1.0, step],
        "counts": [nx, nz, ny],
        "valid": [1 if v else 0 for v in valid],
        "cube": [round(float(c), 5) for k in order for c in cubes[k].ravel()],
    }


def build_lut(renders_dir: str, public: str) -> dict | None:
    """The display LUT as an exact 8-bit PNG: row = green, column = blue tile * size + red, top row green 0."""
    path = os.path.join(renders_dir, "lut.png")
    meta_path = os.path.join(renders_dir, "lut.json")
    if not (os.path.exists(path) and os.path.exists(meta_path)):
        return None
    meta = json.load(open(meta_path))
    table = load(path)[::-1, :, :3]  # Blender wrote rows bottom-up (green 0 at the bottom)
    u8 = np.clip(np.rint(table * 255.0), 0, 255).astype(np.uint8)
    out_path = os.path.join(public, "lut.png")
    spec = oiio.ImageSpec(u8.shape[1], u8.shape[0], 3, oiio.UINT8)
    out = oiio.ImageOutput.create(out_path)
    out.open(out_path, spec)
    out.write_image(u8)
    out.close()
    mid = table[meta["size"] // 2, (meta["size"] // 2) * meta["size"] + meta["size"] // 2]
    print(f"[post] lut.png {u8.shape[1]}x{u8.shape[0]} ({meta['view']} / {meta['look']}); middle entry -> {np.round(mid, 3)}")
    return {"size": meta["size"], "stops": meta["stops"]}


def build_key_map(renders_dir: str, public: str, plate_wh: tuple[int, int]) -> dict | None:
    """keys.webp: which of Synth A's keys each pixel shows (red: key number + 1, green: its pressed group), lossless
    and undithered so the page reads exact numbers; cropped to the keys, with where the crop sits on the plate."""
    path = os.path.join(renders_dir, "keys_id.exr")
    if not os.path.exists(path):
        return None
    ids = load(path)
    number = np.rint(ids[..., 0] * 255.0).astype(np.int32)
    group = np.rint(ids[..., 1] * 255.0).astype(np.int32)
    box = bbox(number > 0, 2)
    if box is None:
        return None
    x0, y0, x1, y1 = box
    u8 = np.zeros((y1 - y0, x1 - x0, 3), dtype=np.uint8)
    u8[..., 0] = np.clip(number[y0:y1, x0:x1], 0, 255)
    u8[..., 1] = np.clip(group[y0:y1, x0:x1], 0, 255)
    out = os.path.join(public, "keys.webp")
    with tempfile.NamedTemporaryFile(suffix=".png", delete=False) as tmp:
        spec = oiio.ImageSpec(u8.shape[1], u8.shape[0], 3, oiio.UINT8)
        image = oiio.ImageOutput.create(tmp.name)
        image.open(tmp.name, spec)
        image.write_image(u8)
        image.close()
        subprocess.run([CWEBP, "-lossless", "-exact", "-m", "6", "-quiet", tmp.name, "-o", out], check=True)
    os.unlink(tmp.name)
    count = int(number.max())
    print(f"[post] keys.webp {x1 - x0}x{y1 - y0}: {count} keys")
    return {"file": "keys.webp", "rect": uv_rect(x0, y0, x1, y1, *plate_wh), "count": count, "box": [x0, y0, x1, y1]}


def background_colour(base: np.ndarray) -> list[float]:
    edge = np.concatenate([base[:8].reshape(-1, base.shape[2]), base[-8:].reshape(-1, base.shape[2])])
    return [round(float(v), 5) for v in edge[:, :3].mean(axis=0)]


def main() -> None:
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument("--renders", default="/Users/rafey/Blender/web-out")
    p.add_argument("--base-name", default="base", help="render to ship as the base plate")
    p.add_argument("--facts", default=None, help="scene.json from export.py (default: <renders>/scene.json)")
    p.add_argument("--groups", default=None, help="plant_groups.json from render.py")
    p.add_argument("--public", default=PUBLIC_DIR)
    p.add_argument("--manifest", default=MANIFEST_PATH)
    args = p.parse_args(sys.argv[sys.argv.index("--") + 1 :] if "--" in sys.argv else [])

    layers = {f"{kind}_{key}" for kind in ("plants", "matte") for key in "abcdefgh"}
    names = {name for pair in DELTAS.values() for name in pair} | layers
    renders = {}
    for name in names | {args.base_name}:
        path = os.path.join(args.renders, f"{name}.png")
        if os.path.exists(path):
            renders[name] = load(path)
    if args.base_name != "base":
        renders["base"] = renders[args.base_name]
    base = renders["base"]
    plate_wh = (base.shape[1], base.shape[0])
    global SCALE
    SCALE = plate_wh[0] / BASE_PLATE_WIDTH

    write_webp(base[..., :3], os.path.join(args.public, "base.webp"), quality=95)
    keys = build_key_map(args.renders, args.public, plate_wh)
    key_box = keys.pop("box") if keys else None
    within = {name: key_box for name in KEY_DELTAS} if key_box else None
    deltas, delta_meta = build_deltas(renders, plate_wh, within)
    if deltas is not None:
        write_webp(deltas, os.path.join(args.public, "deltas.webp"), quality=92)
    groups_path = args.groups or os.path.join(args.renders, "plant_groups.json")
    groups = json.load(open(groups_path)) if os.path.exists(groups_path) else {}
    plants, plant_meta = build_plants(renders, groups, plate_wh)
    if plants is not None:
        write_webp(plants, os.path.join(args.public, "plants.webp"), quality=90)

    facts_path = args.facts or os.path.join(args.renders, "scene.json")
    manifest = json.load(open(facts_path))
    manifest.update(
        {
            "version": 1,
            "background": background_colour(base),
            "deltas": delta_meta,
            "plantLayers": plant_meta,
        }
    )
    if keys:
        manifest["keys"] = keys
    probes = build_probes(args.renders)
    lut = build_lut(args.renders, args.public)
    if probes and lut:
        manifest["light"] = {"probes": probes, "lut": lut}
        opened = build_probes(args.renders, "probes_open.json")  # the same grid with the door open (studio_door.py)
        if opened:
            manifest["light"]["probesOpen"] = opened
    os.makedirs(os.path.dirname(args.manifest), exist_ok=True)
    with open(args.manifest, "w") as f:
        json.dump(manifest, f, indent=2)
    print(f"[post] manifest -> {args.manifest}")


if __name__ == "__main__":
    main()
