#!/usr/bin/env python3
"""Chroma-key magenta backgrounds out of Recraft sprites -> transparent PNGs."""
import os
import numpy as np
from PIL import Image

SRC = os.path.join(os.path.dirname(__file__), "..", "art-src")
DST = os.path.join(os.path.dirname(__file__), "..", "public", "assets", "sprites")
MAX_DIM = 384  # scene displays ~140px; keep 2-3x for retina

os.makedirs(DST, exist_ok=True)

for fn in sorted(os.listdir(SRC)):
    if not fn.endswith("-raw.png"):
        continue
    name = fn[:-8]
    im = Image.open(os.path.join(SRC, fn)).convert("RGB")
    a = np.asarray(im).astype(np.float32)
    h, w, _ = a.shape

    # background = median of border ring pixels
    ring = np.concatenate([
        a[:8].reshape(-1, 3), a[-8:].reshape(-1, 3),
        a[:, :8].reshape(-1, 3), a[:, -8:].reshape(-1, 3),
    ])
    bg = np.median(ring, axis=0)

    # distance in normalized RGB; magenta bg is far from most subject colors
    d = np.linalg.norm(a - bg, axis=2)
    # soft key: transparent below t0, opaque above t1
    t0, t1 = 38.0, 95.0
    alpha = np.clip((d - t0) / (t1 - t0), 0, 1)
    # erode slightly to kill halo fringe
    alpha = np.clip(alpha * 1.6 - 0.3, 0, 1)

    # despill: pull r,b down toward g where the magenta cast remains
    spill = np.clip((np.minimum(a[:, :, 0], a[:, :, 2]) - a[:, :, 1]) / 255.0, 0, 1)[:, :, None]
    a[:, :, 0] -= spill[:, :, 0] * 90.0 * (1 - alpha * 0.4)
    a[:, :, 2] -= spill[:, :, 0] * 90.0 * (1 - alpha * 0.4)

    rgba = np.dstack([np.clip(a, 0, 255).astype(np.uint8), (alpha * 255).astype(np.uint8)])
    out = Image.fromarray(rgba, "RGBA")

    # crop to alpha bbox + pad
    am = alpha > 0.05
    ys, xs = np.where(am)
    if len(xs) == 0:
        print(name, "EMPTY - skipped")
        continue
    pad = int(0.04 * max(w, h))
    x0, x1 = max(0, xs.min() - pad), min(w, xs.max() + pad)
    y0, y1 = max(0, ys.min() - pad), min(h, ys.max() + pad)
    out = out.crop((x0, y0, x1, y1))
    if max(out.size) > MAX_DIM:
        out.thumbnail((MAX_DIM, MAX_DIM), Image.LANCZOS)

    dest = os.path.join(DST, name + ".png")
    out.save(dest, optimize=True)
    print(f"{name}: {out.size} -> {os.path.getsize(dest)//1024}KB")
