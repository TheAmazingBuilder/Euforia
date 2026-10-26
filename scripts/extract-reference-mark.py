#!/usr/bin/env python3
"""Extract the Euforia mark - v2: luminance-gated mask + clean sampling.

The reference background is near-black navy (value < ~0.2); the mark's
darkest fold is still ~0.45 value. Mask on value with a soft ramp, then
sample the gradient on high-confidence mark pixels only.
"""

from PIL import Image, ImageFilter
from pathlib import Path

REF = Path("/home/z/my-project/upload/pasted_image_1791318148190.png")
OUT_DIR = Path("/home/z/my-project/scripts/euforia-trace")
OUT_DIR.mkdir(parents=True, exist_ok=True)

ref = Image.open(REF).convert("RGB")
crop = ref.crop((180, 425, 460, 775))  # 280x350
w, h = crop.size
px = crop.load()

# ── Mask: value ramp 0.20→0.34, hard 0 below ────────────────────────────
mask = Image.new("L", (w, h), 0)
mpx = mask.load()
for y in range(h):
    for x in range(w):
        r, g, b = px[x, y]
        v = max(r, g, b) / 255
        if v <= 0.20:
            mpx[x, y] = 0
        elif v >= 0.34:
            mpx[x, y] = 255
        else:
            mpx[x, y] = int((v - 0.20) / 0.14 * 255)

# despeckle: median then slight blur for edge softness
mask = mask.filter(ImageFilter.MedianFilter(3)).filter(ImageFilter.GaussianBlur(0.6))

master = Image.new("RGBA", (w, h), (0, 0, 0, 0))
master.paste(crop, (0, 0), mask)
master.save(OUT_DIR / "mark-native.png")
big = master.resize((w * 3, h * 3), Image.LANCZOS)
big.save(OUT_DIR / "mark-3x.png")

bbox = mask.getbbox()
print("tight bbox in crop:", bbox, f"(mark {bbox[2]-bbox[0]}x{bbox[3]-bbox[1]})")
bx0, by0, bx1, by1 = bbox

def patch_color(fx, fy):
    """avg color of confident mark pixels near fractional bbox position."""
    cx, cy = int(bx0 + (bx1 - bx0) * fx), int(by0 + (by1 - by0) * fy)
    rs = gs = bs = n = 0
    for dy in range(-5, 6):
        for dx in range(-5, 6):
            xx, yy = cx + dx, cy + dy
            if 0 <= xx < w and 0 <= yy < h and mpx[xx, yy] > 240:
                r, g, b = px[xx, yy]
                rs, gs, bs, n = rs + r, gs + g, bs + b, n + 1
    return (rs // n, gs // n, bs // n, n) if n else None

samples = {
    "spine-top (top band left)": (0.10, 0.18),
    "spine-mid (middle fold)": (0.06, 0.48),
    "spine-bottom (deep fold)": (0.14, 0.86),
    "bottom-band (under fold)": (0.30, 0.94),
    "mid-band right": (0.72, 0.52),
    "top-tip (top-right)": (0.94, 0.06),
    "mid-right-upper": (0.85, 0.30),
}
print("color samples:")
for name, (fx, fy) in samples.items():
    c = patch_color(fx, fy)
    if c:
        print(f"  {name:28s} #{c[0]:02X}{c[1]:02X}{c[2]:02X} n={c[3]}")
    else:
        print(f"  {name:28s} (no confident pixels - adjust position)")

print("saved mark-native.png + mark-3x.png")
