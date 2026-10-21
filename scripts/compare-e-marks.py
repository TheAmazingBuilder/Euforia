#!/usr/bin/env python3
"""Side-by-side comparison: user's reference mark vs kit render.

Crops the mark from the pasted reference image and tiles it next to the
kit's euforia-mark-1024.png for a rigorous geometry/gradient comparison.
"""

from PIL import Image
from pathlib import Path

REF = Path("/home/z/my-project/upload/pasted_image_1791318148190.png")
KIT = Path("/home/z/my-project/apps/web/public/brand/png/euforia-mark-1024.png")
OUT = Path("/home/z/my-project/scripts/shots/e-compare.png")

ref = Image.open(REF).convert("RGBA")
kit = Image.open(KIT).convert("RGBA")

# Mark occupies roughly x 185-450, y 435-765 in the 1233x1233 reference
crop = ref.crop((185, 435, 455, 770))  # ~270x335
crop = crop.resize((335, 335), Image.LANCZOS)
kit_sq = kit.resize((335, 335), Image.LANCZOS)

canvas = Image.new("RGBA", (700, 335), (2, 6, 23, 255))
canvas.paste(crop, (5, 0))
canvas.paste(kit_sq, (360, 0))
OUT.parent.mkdir(parents=True, exist_ok=True)
canvas.save(OUT)
print(f"saved {OUT} — LEFT: reference | RIGHT: kit")
