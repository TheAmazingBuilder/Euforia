"""Crop and upscale regions of the font reference screenshot for letterform analysis."""
from PIL import Image

src = "/home/z/my-project/upload/pasted_image_1791955157119.png"
img = Image.open(src).convert("RGB")
w, h = img.size
print(f"source size: {w}x{h}")

# Full image is a single line of text. Crop into 3 overlapping segments and upscale 3x.
seg_defs = [
    ("seg1_the_platform", 0.00, 0.48),
    ("seg2_for_francophone", 0.34, 0.78),
    ("seg3_talent", 0.68, 1.00),
]
for name, x0, x1 in seg_defs:
    box = (int(w * x0), 0, int(w * x1), h)
    seg = img.crop(box)
    seg = seg.resize((seg.width * 3, seg.height * 3), Image.LANCZOS)
    out = f"/home/z/my-project/scripts/{name}.png"
    seg.save(out)
    print("saved", out, seg.size)

# Also a tight crop on distinctive letters: 'a' in platform, 't', 'f', 'r'
# from the mid region
mid = img.crop((int(w*0.18), 0, int(w*0.62), h))
mid = mid.resize((mid.width * 4, mid.height * 4), Image.LANCZOS)
mid.save("/home/z/my-project/scripts/seg4_mid_zoom.png")
print("saved seg4_mid_zoom.png", mid.size)
