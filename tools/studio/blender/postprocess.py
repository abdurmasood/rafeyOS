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
}
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
COMPOSITE_LAYERS = {"e"}
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


def build_deltas(renders: dict[str, np.ndarray], plate_wh: tuple[int, int]) -> tuple[np.ndarray | None, dict]:
    """Signed light layers: positive and negative parts are packed separately at full precision.

    AgX is nonlinear, so adding a light can lower a channel in display space; dropping those
    negatives would make a full shadow miss the light-off render.
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
        x0, y0, x1, y1 = box
        window = (slice(y0, y1), slice(x0, x1))
        layer = {"rect": uv_rect(x0, y0, x1, y1, *plate_wh)}
        for sign, part in (("pos", np.clip(diff[window], 0, None)), ("neg", np.clip(-diff[window], 0, None))):
            part = part * mask[window][..., None]
            scale = float(part.max()) or 1.0
            crops[f"{name}.{sign}"] = part / scale
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

    layers = {f"{kind}_{key}" for kind in ("plants", "matte") for key in "abcde"}
    names = {"base", "moon_off", "beam_off", "candle_off", "up_free", "up_off", *layers}
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
    deltas, delta_meta = build_deltas(renders, plate_wh)
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
    os.makedirs(os.path.dirname(args.manifest), exist_ok=True)
    with open(args.manifest, "w") as f:
        json.dump(manifest, f, indent=2)
    print(f"[post] manifest -> {args.manifest}")


if __name__ == "__main__":
    main()
