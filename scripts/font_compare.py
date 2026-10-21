"""Render 'The platform for Francophone Talent' in each candidate font (bold),
stacked under the reference crop for visual identification."""
from PIL import Image, ImageDraw, ImageFont

CACHE = "/home/z/my-project/scripts/font-cache"
TEXT = "The platform for Francophone Talent"
SIZE = 64

FONTS = [
    ("REFERENCE (screenshot)", None),
    ("Schibsted Grotesk 700", ("SchibstedGrotesk.ttf", [700])),
    ("Archivo 700", ("Archivo.ttf", [100, 700])),
    ("Inter 700 opsz32", ("Inter.ttf", [32, 700])),
    ("Instrument Sans 700", ("InstrumentSans.ttf", [100, 700])),
    ("Arimo 700", ("Arimo.ttf", [700])),
    ("Roboto 700", ("Roboto.ttf", [100, 700])),
    ("Hanken Grotesk 700", ("HankenGrotesk.ttf", [700])),
    ("Familjen Grotesk 700", ("FamiljenGrotesk.ttf", [700])),
]

W = 1660
rows = []
for label, spec in FONTS:
    if spec is None:
        ref = Image.open("/home/z/my-project/upload/pasted_image_1791955157119.png").convert("RGB")
        # scale reference to width W keeping aspect
        scale = W / ref.width
        ref = ref.resize((W, int(ref.height * scale)), Image.LANCZOS)
        rows.append((label, ref))
        continue
    fname, axes = spec
    f = ImageFont.truetype(f"{CACHE}/{fname}", SIZE)
    try:
        f.set_variation_by_axes(axes)
    except Exception as e:
        print("variation fail", fname, e)
    bbox = f.getbbox(TEXT)
    th = bbox[3] - bbox[1]
    img = Image.new("RGB", (W, th + 28), "black")
    d = ImageDraw.Draw(img)
    d.text((10, 10 - bbox[1]), TEXT, font=f, fill="white")
    # label strip
    lab = Image.new("RGB", (W, 30), (20, 20, 20))
    dl = ImageDraw.Draw(lab)
    lf = ImageFont.truetype(f"{CACHE}/Inter.ttf", 18)
    try:
        lf.set_variation_by_axes([14, 600])
    except Exception:
        pass
    dl.text((10, 4), label, font=lf, fill=(255, 220, 120))
    rows.append((label, lab))
    rows.append((label + " render", img))

total_h = sum(im.height + 6 for _, im in rows)
sheet = Image.new("RGB", (W, total_h), "black")
y = 0
for label, im in rows:
    sheet.paste(im, (0, y))
    y += im.height + 6
sheet.save("/home/z/my-project/scripts/font-comparison.png")
print("saved sheet", sheet.size)
