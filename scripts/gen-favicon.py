"""Generate the Cosmoz favicon.ico from the constellation icon.svg.

The default create-next-app favicon.ico in src/app/ shadows the metadata
icon (/icon.svg) in the browser tab. This script renders the SAME
constellation design at 16/32/48/256 px via Playwright (Chromium), then
packs the PNGs into a single multi-size ICO with Pillow.

Output: apps/web/src/app/favicon.ico (overwritten in place).
"""
from pathlib import Path
from playwright.sync_api import sync_playwright
from PIL import Image
import io

WEB = Path("/home/z/my-project/apps/web")
SVG = (WEB / "public" / "icon.svg").read_text()
SIZES = [256, 48, 32, 16]  # largest first for quality downscale
OUT = WEB / "src" / "app" / "favicon.ico"

# Standalone HTML page: transparent background, exact SVG at each size.
html = f"""<!doctype html><html><body style="margin:0;background:transparent">
{SVG.replace('<svg ', '<svg width="512" height="512" ')}
</body></html>"""

frames: list[Image.Image] = []
with sync_playwright() as p:
    browser = p.chromium.launch()
    page = browser.new_page(viewport={"width": 512, "height": 512}, device_scale_factor=1)
    page.set_content(html)
    page.wait_for_timeout(250)
    png_bytes = page.screenshot(omit_background=True, clip={"x": 0, "y": 0, "width": 512, "height": 512})
    browser.close()

master = Image.open(io.BytesIO(png_bytes)).convert("RGBA")
for size in SIZES:
    img = master.resize((size, size), Image.LANCZOS)
    frames.append(img)

OUT.parent.mkdir(parents=True, exist_ok=True)
frames[0].save(OUT, format="ICO", sizes=[(s, s) for s in SIZES], append_images=frames[1:])
print("written:", OUT, OUT.stat().st_size, "bytes")

# Sanity: re-open and list embedded sizes
with Image.open(OUT) as ico:
    print("embedded sizes:", sorted(ico.info.get("sizes", [])))
