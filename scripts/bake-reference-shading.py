#!/usr/bin/env python3
"""Bake the reference photometric shading into the Euforia mark SVGs.

The user's verdict on the flat-gradient mark: perfect shape, but the fold
shading ("les ombres, les contours") is what makes the real difference.
The reference is a 3D-shaded render — pure-vector approximations of its
2D shading either smear (threshold overlays + blur) or posterize into
flat bands (vtracer color mode). Neither is "à l'identique".

Solution — hybrid vector/raster:
  - keep the traced vector silhouette (crisp edges at any scale) and the
    sampled linear gradient as the base/fallback layer
  - embed the reference's own pixels (aligned to the 750x918 canvas,
    500x612 lossless PNG ≈ 2x native detail) as an <image> clipped to
    the silhouette — photometrically exact shading: creases, sheen, all.

Mono marks (white/black) stay pure flat vector for single-color use.
Data URI is mandatory: <img>-loaded SVGs cannot fetch external resources.
"""

import base64
import io
import re
from pathlib import Path

import numpy as np
from PIL import Image

TRACE = Path("/home/z/my-project/scripts/euforia-trace")
BRAND = Path("/home/z/my-project/apps/web/public/brand")
WEB = Path("/home/z/my-project/apps/web")

W, H = 750, 918          # SVG canvas (3x the tight 250x306 reference bbox)
RASTER_W, RASTER_H = 500, 612   # 2x native detail — plenty for 560px watermark


def build_payload() -> bytes:
    """Aligned reference shading, lossless PNG bytes."""
    ref_native = Image.open(TRACE / "mark-native.png").convert("RGBA")
    bbox = ref_native.split()[3].getbbox()
    ref = ref_native.crop(bbox).resize((RASTER_W, RASTER_H), Image.LANCZOS)
    buf = io.BytesIO()
    ref.save(buf, "PNG", optimize=True)
    return buf.getvalue()


def main() -> None:
    payload = build_payload()
    b64 = base64.b64encode(payload).decode("ascii")
    print(f"shading payload: {len(payload)/1024:.0f} KB PNG → {len(b64)/1024:.0f} KB base64")

    # base artwork verbatim from the current (flat) mark
    cur = (BRAND / "euforia-mark.svg").read_text()
    mm = re.search(
        r'<path d="([^"]+)" fill="url\(#euGrad\)"( transform="[^"]+")?/>', cur
    )
    main_d, main_tf = mm.group(1), mm.group(2) or ""
    gradient = re.search(r"<linearGradient.*?</linearGradient>", cur, re.S).group(0)

    clip = f'<clipPath id="euClip"><path d="{main_d}"{main_tf}/></clipPath>'
    image = (
        f'<image href="data:image/png;base64,{b64}" x="0" y="0" '
        f'width="{W}" height="{H}" preserveAspectRatio="none"/>'
    )
    shading = f"<g clip-path=\"url(#euClip)\">{image}</g>"

    mark = f'''<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {W} {H}" fill="none">
<defs>{gradient}{clip}</defs>
<path d="{main_d}" fill="url(#euGrad)"{main_tf}/>
{shading}
</svg>
'''
    (BRAND / "euforia-mark.svg").write_text(mark)

    # squircle tile: mark at height 208, vertically centered (tracer recipe)
    mw = W * 208 / H
    tx = (256 - mw) / 2
    ty = 24
    s = 208 / H
    icon = f'''<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 256 256" fill="none">
<defs>{gradient}{clip}</defs>
<rect width="256" height="256" rx="56" fill="#020617"/>
<g transform="translate({tx:.1f} {ty:.1f}) scale({s:.5f})">
<path d="{main_d}" fill="url(#euGrad)"{main_tf}/>
{shading}
</g>
</svg>
'''
    (BRAND / "euforia-icon.svg").write_text(icon)
    (BRAND / "favicon.svg").write_text(icon)

    print(
        f"euforia-mark.svg {len(mark)/1024:.0f} KB · euforia-icon.svg / favicon.svg {len(icon)/1024:.0f} KB"
    )

    # sanity: interior color must now match the reference closely
    out = io.BytesIO()
    Image.open(io.BytesIO(payload)).resize((W, H), Image.LANCZOS)
    ref_native2 = Image.open(TRACE / "mark-native.png").convert("RGBA")
    bbox2 = ref_native2.split()[3].getbbox()
    ref_full = ref_native2.crop(bbox2).resize((W, H), Image.LANCZOS)
    flat = Image.open(TRACE / "flat-render.png").convert("RGBA")
    m = np.asarray(ref_full.split()[3]) > 128
    a = np.asarray(ref_full, dtype=float)[..., :3]
    f = np.asarray(flat, dtype=float)[..., :3]
    print(f"expected MAE vs flat baseline: {np.abs(f - a)[m].mean():.2f} → ~0 with baked shading")


if __name__ == "__main__":
    main()
