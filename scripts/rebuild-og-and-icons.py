#!/usr/bin/env python3
"""Rebuild og-image.png + derived icons from the corrected (traced) E assets.

og layout mirrors the user's reference lockup: navy #020617, gradient mark
left, white "Euforia" wordmark (Carlito-Bold - closest available to the
reference geometric sans), letter-spaced violet→cyan tagline.
"""

from PIL import Image, ImageDraw, ImageFont
from pathlib import Path

WEB = Path("/home/z/my-project/apps/web")
BRAND = WEB / "public" / "brand"
PNG = BRAND / "png"
FONT_BOLD = "/usr/share/fonts/truetype/english/Carlito-Bold.ttf"

VIOLET_TXT = (167, 139, 250)  # #A78BFA
CYAN_TXT = (34, 211, 238)     # #22D3EE

# ── og-image 1200x630 ────────────────────────────────────────────────────
og = Image.new("RGBA", (1200, 630), (2, 6, 23, 255))
draw = ImageDraw.Draw(og)

mark = Image.open(PNG / "euforia-mark-512.png").convert("RGBA")
mark_h = 380
mark_w = int(mark.width * mark_h / mark.height)
mark = mark.resize((mark_w, mark_h), Image.LANCZOS)
og.paste(mark, (110, (630 - mark_h) // 2), mark)

font_word = ImageFont.truetype(FONT_BOLD, 170)
font_tag = ImageFont.truetype(FONT_BOLD, 34)

# wordmark
wx, wy = 110 + mark_w + 70, 200
draw.text((wx, wy), "Euforia", font=font_word, fill=(248, 250, 252, 255))

# tagline with letter-spacing + horizontal gradient fill
tagline = "TRADE SMARTER. GROW FASTER."
tracking = 10
# measure total width
w_total = 0
for ch in tagline:
    w_total += draw.textlength(ch, font=font_tag) + tracking
w_total -= tracking
tag_y = wy + 210
# gradient strip + text mask
grad = Image.new("RGBA", (int(w_total) + 4, 60))
gd = ImageDraw.Draw(grad)
for x in range(grad.width):
    t = x / max(1, grad.width - 1)
    col = tuple(int(VIOLET_TXT[i] + (CYAN_TXT[i] - VIOLET_TXT[i]) * t) for i in range(3)) + (255,)
    gd.line([(x, 0), (x, 60)], fill=col)
mask = Image.new("L", grad.size, 0)
md = ImageDraw.Draw(mask)
cx = 0
for ch in tagline:
    md.text((cx, 8), ch, font=font_tag, fill=255)
    cx += draw.textlength(ch, font=font_tag) + tracking
og.paste(grad, (wx, tag_y), mask)

og.convert("RGB").save(BRAND / "og-image.png", "PNG", optimize=True)
print("og-image.png rebuilt (1200x630, corrected mark)")

# ── icon.svg (root) + favicon.ico + apple-icon.png ──────────────────────
fav_svg = (BRAND / "favicon.svg").read_text()
(WEB / "public" / "icon.svg").write_text(fav_svg)
print("public/icon.svg ← favicon.svg (corrected mark)")

ico_src = Image.open(PNG / "icon-128.png").convert("RGBA")
ico_src.save(WEB / "src" / "app" / "favicon.ico", format="ICO", sizes=[(16, 16), (32, 32), (48, 48)])
print("favicon.ico rebuilt (16/32/48)")

apple = Image.open(PNG / "icon-512.png").convert("RGBA").resize((180, 180), Image.LANCZOS)
apple.save(WEB / "src" / "app" / "apple-icon.png", "PNG", optimize=True)
print("apple-icon.png rebuilt (180x180)")
