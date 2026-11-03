#!/usr/bin/env python3
"""Try vtracer COLOR mode on the aligned reference mark (composited over the
flat gradient so edge blends stay plausible) - pure-vector shaded artwork.

Output: scripts/euforia-trace/color-traced.svg + color-render.png
"""

import re
import subprocess
from pathlib import Path

import numpy as np
from PIL import Image, ImageFilter

TRACE = Path("/home/z/my-project/scripts/euforia-trace")
W, H = 750, 918

# aligned reference (native crop → canvas)
ref_native = Image.open(TRACE / "mark-native.png").convert("RGBA")
bbox = ref_native.split()[3].getbbox()
ref = ref_native.crop(bbox).resize((W, H), Image.LANCZOS)
flat = Image.open(TRACE / "flat-render.png").convert("RGBA")

# composite ref over flat → opaque RGB for vtracer (edges blend into mark colors)
comp = flat.copy()
comp.alpha_composite(ref)
comp_rgb = comp.convert("RGB")
comp_rgb.save(TRACE / "color-input.png")

subprocess.run([
    "python3", "-c", f"""
import vtracer
vtracer.convert_image_to_svg_py(
    r"{TRACE}/color-input.png", r"{TRACE}/color-traced.svg",
    colormode="color", hierarchical="stacked", mode="spline",
    filter_speckle=6, color_precision=7, layer_difference=12,
    corner_threshold=60, length_threshold=4.0, max_iterations=10,
    splice_threshold=45, path_precision=1,
)
""",
], check=True)

text = (TRACE / "color-traced.svg").read_text()
m = re.search(r'width="(\d+)" height="(\d+)"', text)
print("trace canvas:", m.group(1), m.group(2))
paths = re.findall(r"<path[^>]*/?>", text)
print("paths:", len(paths), " svg bytes:", len(text))
