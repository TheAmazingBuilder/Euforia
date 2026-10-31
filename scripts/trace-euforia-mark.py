#!/usr/bin/env python3
"""Vector-trace the reference mark and build the corrected Euforia SVG set.

  1. vtracer binary trace of the 3x alpha mask (spline curves)
  2. extract path `d` data, renormalize to the tight mark bbox (250x306)
  3. emit the corrected asset set:
       euforia-mark.svg        bare mark, sampled linear gradient (L→TR axis)
       euforia-mark-white.svg  bare mark, flat white
       euforia-mark-black.svg  bare mark, flat #020617
       euforia-icon.svg        navy squircle tile + gradient mark (favicon)
       favicon.svg             = euforia-icon.svg
  All geometry comes from the user's reference image - identical to it.
"""

import re
import subprocess
from pathlib import Path
from PIL import Image

TRACE_DIR = Path("/home/z/my-project/scripts/euforia-trace")
BRAND = Path("/home/z/my-project/apps/web/public/brand")

# ── 1. binary mask image for vtracer (mark = black on white) ────────────
master = Image.open(TRACE_DIR / "mark-native.png")  # 280x350 RGBA
alpha = master.split()[3]
mask_img = Image.new("L", master.size, 255)
mask_img.paste(0, mask=alpha.point(lambda a: 255 if a > 110 else 0))
mask_img = mask_img.crop(master.split()[3].getbbox())  # tight 250x306
mask_big = mask_img.resize((mask_img.width * 3, mask_img.height * 3), Image.LANCZOS)
mask_big_path = TRACE_DIR / "mask-binary.png"
mask_big.save(mask_big_path)
print(f"mask for tracing: {mask_big.size}")

# ── 2. trace ─────────────────────────────────────────────────────────────
vtracer = TRACE_DIR / "traced.svg"
subprocess.run([
    "python3", "-c", f"""
import vtracer
vtracer.convert_image_to_svg_py(
    r"{mask_big_path}", r"{vtracer}",
    colormode="binary", hierarchical="stacked", mode="spline",
    filter_speckle=12, color_precision=8, layer_difference=16,
    corner_threshold=60, length_threshold=4.0, max_iterations=10,
    splice_threshold=45, path_precision=2,
)
""",
], check=True)

svg_text = vtracer.read_text()
path_els = re.findall(r'<path[^>]*>', svg_text)
print(f"traced path elements: {len(path_els)}, svg size: {len(svg_text)} bytes")
biggest_el = max(path_els, key=len)
d_attr = re.search(r'd="([^"]+)"', biggest_el).group(1)
path_tf_m = re.search(r'transform="([^"]+)"', biggest_el)
path_tf = path_tf_m.group(1) if path_tf_m else ""
# parse translate(dx,dy) if present - gradient coords live in the path's
# LOCAL space (same space as d), so global gradient targets get un-shifted
pdx, pdy = 0.0, 0.0
mt = re.match(r"translate\(\s*(-?[\d.]+)[\s,]+(-?[\d.]+)\s*\)", path_tf)
if mt:
    pdx, pdy = float(mt.group(1)), float(mt.group(2))
print(f"path transform: '{path_tf}' (dx={pdx}, dy={pdy})")
# vtracer traced at 3x scale with its own viewBox - renormalize: parse width/height
m = re.search(r'width="(\d+)" height="(\d+)"', svg_text)
tw, th = int(m.group(1)), int(m.group(2))
sx, sy = mask_img.width / tw, mask_img.height / th
print(f"trace canvas {tw}x{th} → scale ({sx:.4f},{sy:.4f})")

if abs(sx - 1 / 3) > 0.01 or abs(sy - 1 / 3) > 0.01:
    print("WARNING: unexpected trace scale - inspect manually")
    sx = sy = 1 / 3  # assume 3x as built

# Everything stays in the TRACED space (tw x th = 750x918) - the path is
# used verbatim, no numeric rescaling (relative commands stay valid).
MARK_W, MARK_H = tw, th

def svg_with(fill: str, extra_defs: str = "", tile: bool = False) -> str:
    tf_attr = f' transform="{path_tf}"' if path_tf else ""
    path_el = f'<path d="{d_attr}" fill="{fill}"{tf_attr}/>'
    if tile:
        # 256 squircle: mark scaled to height 208 → width 750*208/918
        mw = MARK_W * 208 / MARK_H
        tx = (256 - mw) / 2
        ty = 24
        s = 208 / MARK_H
        return f'''<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 256 256" fill="none">
<defs>{extra_defs}</defs>
<rect width="256" height="256" rx="56" fill="#020617"/>
<g transform="translate({tx:.1f} {ty:.1f}) scale({s:.5f})">
{path_el}
</g>
</svg>
'''
    return f'''<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {MARK_W} {MARK_H}" fill="none">
<defs>{extra_defs}</defs>
{path_el}
</svg>
'''

# gradient targets in GLOBAL space (0,588)→(750,156); un-shift into path-local
G0X, G0Y, G1X, G1Y = 0 - pdx, 588 - pdy, 750 - pdx, 156 - pdy
gradient = f'''<linearGradient id="euGrad" x1="{G0X:.2f}" y1="{G0Y:.2f}" x2="{G1X:.2f}" y2="{G1Y:.2f}" gradientUnits="userSpaceOnUse">
  <stop offset="0" stop-color="#7B22F4"/>
  <stop offset="0.28" stop-color="#6318E8"/>
  <stop offset="0.62" stop-color="#4299FD"/>
  <stop offset="1" stop-color="#28D6F6"/>
</linearGradient>'''

(BRAND / "euforia-mark.svg").write_text(svg_with("url(#euGrad)", gradient))
(BRAND / "euforia-mark-white.svg").write_text(svg_with("#FFFFFF"))
(BRAND / "euforia-mark-black.svg").write_text(svg_with("#020617"))
icon = svg_with("url(#euGrad)", gradient, tile=True)
(BRAND / "euforia-icon.svg").write_text(icon)
(BRAND / "favicon.svg").write_text(icon)

# save the raw path + metrics for the PNG/icon pipeline
(TRACE_DIR / "mark-path.txt").write_text(d_attr)
(TRACE_DIR / "mark-metrics.txt").write_text(f"{MARK_W} {MARK_H}\n")
print(f"mark {MARK_W}x{MARK_H} - SVGs written to {BRAND}")
