"""Final font showdown: Schibsted vs 4 more candidates + pixel overlay check."""
import os
import urllib.request
from PIL import Image, ImageDraw, ImageFont

CACHE = "/home/z/my-project/scripts/font-cache"
BASE = "https://github.com/google/fonts/raw/main/ofl/"
EXTRA = {
    "GolosText": "golostext/GolosText%5Bwght%5D.ttf",
    "RedHatDisplay": "redhatdisplay/RedHatDisplay%5Bwght%5D.ttf",
    "Manrope": "manrope/Manrope%5Bwght%5D.ttf",
}
for name, rel in EXTRA.items():
    dest = f"{CACHE}/{name}.ttf"
    if not os.path.exists(dest):
        try:
            urllib.request.urlretrieve(BASE + rel, dest)
            print("ok", name)
        except Exception as e:
            print("FAIL", name, e)

# General Sans from Fontshare API
gs_dest = f"{CACHE}/GeneralSans-Semibold.otf"
if not os.path.exists(gs_dest):
    try:
        urllib.request.urlretrieve(
            "https://api.fontshare.com/v2/fonts/download/general-sans",
            f"{CACHE}/general-sans.zip")
        import zipfile
        with zipfile.ZipFile(f"{CACHE}/general-sans.zip") as z:
            for n in z.namelist():
                if n.endswith("GeneralSans-Semibold.otf"):
                    with open(gs_dest, "wb") as f, z.open(n) as src:
                        f.write(src.read())
                    print("ok GeneralSans")
                    break
    except Exception as e:
        print("FAIL GeneralSans", e)

TEXT = "platform for Francophone Talent"


def render_tight(fontfile, axes, size, tracking_em, is_otf=False):
    f = ImageFont.truetype(f"{CACHE}/{fontfile}", size)
    if axes:
        try:
            f.set_variation_by_axes(axes)
        except Exception as e:
            print("var fail", fontfile, e)
    tr = tracking_em * size
    tops, bottoms, x = [], [], 10
    for ch in TEXT:
        bbox = f.getbbox(ch)
        if ch != " ":
            tops.append(bbox[1]); bottoms.append(bbox[3])
        x += f.getlength(ch) + tr
    top, bottom = min(tops), max(bottoms)
    img = Image.new("RGB", (1500, bottom - top + 20), "black")
    d = ImageDraw.Draw(img)
    x = 10
    for ch in TEXT:
        d.text((x, 8 - top), ch, font=f, fill="white")
        x += f.getlength(ch) + tr
    return img


rows = []
ref = Image.open("/home/z/my-project/upload/pasted_image_1791955157119.png").convert("RGB")
seg = ref.crop((int(ref.width * 0.135), 0, ref.width, ref.height))
rows.append(seg.resize((1500, int(seg.height * 1500 / seg.width)), Image.LANCZOS))

cands = [
    ("Schibsted 800", "SchibstedGrotesk.ttf", [800], -0.010),
    ("Golos Text 800", "GolosText.ttf", [800], -0.010),
    ("Red Hat Display 800", "RedHatDisplay.ttf", [800], -0.010),
    ("Manrope 800", "Manrope.ttf", [800], -0.010),
    ("General Sans Semibold", "GeneralSans-Semibold.otf", None, -0.010),
]
for label, path, axes, tr in cands:
    rows.append(render_tight(path, axes, 96, tr))

total = sum(im.height + 4 for im in rows)
sheet = Image.new("RGB", (1500, total), "black")
y = 0
for im in rows:
    sheet.paste(im, (0, y)); y += im.height + 4
sheet.save("/home/z/my-project/scripts/font-comparison3.png")
print("saved", sheet.size)
