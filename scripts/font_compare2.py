"""Focused font comparison: reference vs top candidates at matched sizes,
with per-character tracking to mimic the tight display spacing."""
from PIL import Image, ImageDraw, ImageFont

CACHE = "/home/z/my-project/scripts/font-cache"
TEXT = "platform for Francophone Talent"


def render_tight(fontpath, axes, size, tracking_em, weight_label, W=1560):
    f = ImageFont.truetype(f"{CACHE}/{fontpath}", size)
    try:
        f.set_variation_by_axes(axes)
    except Exception as e:
        print("var fail", fontpath, e)
    tracking = tracking_em * size
    # measure total width char by char
    x = 10
    tops, bottoms = [], []
    for ch in TEXT:
        bbox = f.getbbox(ch)
        adv = f.getlength(ch)
        if ch != " ":
            tops.append(bbox[1]); bottoms.append(bbox[3])
        x += adv + tracking
    top = min(tops); bottom = max(bottoms)
    img = Image.new("RGB", (W, bottom - top + 26), "black")
    d = ImageDraw.Draw(img)
    x = 10
    for ch in TEXT:
        d.text((x, 10 - top), ch, font=f, fill="white")
        x += f.getlength(ch) + tracking
    return img


def ref_strip(W=1560):
    ref = Image.open("/home/z/my-project/upload/pasted_image_1791955157119.png").convert("RGB")
    # crop out the leading "The " to focus on "platform..."
    w, h = ref.size
    seg = ref.crop((int(w * 0.135), 0, w, h))  # from 'p' of platform to end
    scale = W / seg.width
    return seg.resize((W, int(seg.height * scale)), Image.LANCZOS)


rows = [("REFERENCE", ref_strip())]
cands = [
    ("Schibsted Grotesk 700 tr0", "SchibstedGrotesk.ttf", [700], 0.0),
    ("Schibsted Grotesk 800 tr-0.01", "SchibstedGrotesk.ttf", [800], -0.010),
    ("Schibsted Grotesk 900 tr-0.015", "SchibstedGrotesk.ttf", [900], -0.015),
    ("Instrument Sans 700 tr0", "InstrumentSans.ttf", [100, 700], 0.0),
    ("Instrument Sans 800 tr-0.01", "InstrumentSans.ttf", [100, 800], -0.010),
    ("Inter 700 opsz32 tr0", "Inter.ttf", [32, 700], 0.0),
    ("Inter 800 opsz32 tr-0.01", "Inter.ttf", [32, 800], -0.010),
    ("Familjen Grotesk 700 tr0", "FamiljenGrotesk.ttf", [700], 0.0),
    ("Archivo 700 tr0 (fixed)", "Archivo.ttf", [100, 700], 0.0),
]
lab_font = ImageFont.truetype(f"{CACHE}/Inter.ttf", 16)
try:
    lab_font.set_variation_by_axes([14, 600])
except Exception:
    pass

for label, path, axes, tr in cands:
    img = render_tight(path, axes, 96, tr, label)
    lab = Image.new("RGB", (img.width, 26), (25, 25, 25))
    dl = ImageDraw.Draw(lab)
    dl.text((8, 4), label, font=lab_font, fill=(255, 220, 120))
    rows.append((label, lab))
    rows.append((label, img))

total_h = sum(im.height + 4 for _, im in rows)
W = max(im.width for _, im in rows)
sheet = Image.new("RGB", (W, total_h), "black")
y = 0
for _, im in rows:
    sheet.paste(im, (0, y))
    y += im.height + 4
sheet.save("/home/z/my-project/scripts/font-comparison2.png")
print("saved", sheet.size)
