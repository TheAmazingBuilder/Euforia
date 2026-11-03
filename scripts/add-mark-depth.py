#!/usr/bin/env python3
"""Add photometric depth to the traced Euforia mark (contours + shadows).

The silhouette is already pixel-identical to the founder's reference; what
the flat gradient misses is the 3D shading: dark creases under each ribbon
fold and bright rims on the fold tops. This script derives those shading
layers directly FROM the reference pixels:

  1. align the reference (mark-native.png) to the 750x918 SVG canvas
  2. render the current flat-gradient SVG as the "base" image
  3. shadow  map = where the reference is darker  than the flat gradient
     highlight map = where the reference is brighter
     (both normalized, edge-eroded, feathered)
  4. vectorize each level with vtracer (binary spline, full-canvas mask so
     coordinates stay in SVG space - no transforms to fight)
  5. recompose euforia-mark.svg / euforia-icon.svg / favicon.svg:
     base gradient path + <g clip><g blur> shading levels </g></g>

Mono marks (white/black) stay flat on purpose - single-color reproduction.
"""

import re
import subprocess
import sys
from pathlib import Path

import numpy as np
from PIL import Image, ImageFilter

TRACE = Path("/home/z/my-project/scripts/euforia-trace")
BRAND = Path("/home/z/my-project/apps/web/public/brand")
WEB = Path("/home/z/my-project/apps/web")

W, H = 750, 918  # SVG canvas (3x the tight 250x306 reference bbox)

# ── tuning ───────────────────────────────────────────────────────────────
SHADOW_LEVELS = [0.10, 0.20, 0.32, 0.45]   # normalized shadow thresholds
SHADOW_OPA    = [0.12, 0.12, 0.14, 0.16]   # per-level fill-opacity (cumulative)
HILITE_LEVELS = [0.06, 0.12, 0.20]
HILITE_OPA    = [0.07, 0.08, 0.10]
BLUR_STD      = 9      # feGaussianBlur stdDeviation in 750-space
ERODE_PX      = 4      # kill the antialiased edge ring
EDGE_ERODE    = 2 * ERODE_PX + 1  # MinFilter kernel


def load_images():
    ref_native = Image.open(TRACE / "mark-native.png").convert("RGBA")
    bbox = ref_native.split()[3].getbbox()
    ref = ref_native.crop(bbox).resize((W, H), Image.LANCZOS)
    flat = Image.open(TRACE / "flat-render.png").convert("RGBA")
    if flat.size != (W, H):
        flat = flat.resize((W, H), Image.LANCZOS)
    return ref, flat


def lum(img: Image.Image) -> np.ndarray:
    a = np.asarray(img, dtype=np.float64)
    return a[..., 0] * 0.2126 + a[..., 1] * 0.7152 + a[..., 2] * 0.0722


def inside_mask(ref: Image.Image, flat: Image.Image) -> np.ndarray:
    """Silhouette interior, eroded to skip the antialiased edge ring."""
    m_ref = np.asarray(ref.split()[3]) > 128
    m_flat = np.asarray(flat.split()[3]) > 128
    m = m_ref & m_flat
    m_img = Image.fromarray((m * 255).astype(np.uint8))
    m_img = m_img.filter(ImageFilter.MinFilter(EDGE_ERODE))
    return np.asarray(m_img) > 128


def build_map(base, target, mask, negative=False):
    """Normalized darkening (negative=False) / brightening map in [0,1].

    negative=False: how much darker target is than base, relative to base.
    negative=True : how much brighter target is than base.
    """
    with np.errstate(divide="ignore", invalid="ignore"):
        if negative:
            m = (target - base) / np.maximum(255 - base, 24)
        else:
            m = (base - target) / np.maximum(base, 24)
    m = np.clip(m, 0, 1)
    m[~mask] = 0
    return m


def smooth(map_arr, keep_mask):
    img = Image.fromarray((map_arr * 255).astype(np.uint8))
    img = img.filter(ImageFilter.GaussianBlur(4))
    out = np.asarray(img, dtype=np.float64) / 255
    out[~keep_mask] = 0
    return out


def trace_mask(mask_arr: np.ndarray, tag: str) -> list[str]:
    """vtracer binary spline trace of a full-canvas binary mask.

    Returns raw <path …/> elements whose coordinates are already in the
    750x918 SVG space (mask traced at full canvas - no offset games).
    """
    mask_img = Image.fromarray(np.where(mask_arr, 0, 255).astype(np.uint8))
    assert mask_img.size == (W, H)
    p = TRACE / f"depth-{tag}.png"
    mask_img.save(p)
    out = TRACE / f"depth-{tag}.svg"
    subprocess.run([
        "python3", "-c", f"""
import vtracer
vtracer.convert_image_to_svg_py(
    r"{p}", r"{out}",
    colormode="binary", hierarchical="stacked", mode="spline",
    filter_speckle=8, color_precision=8, layer_difference=16,
    corner_threshold=60, length_threshold=4.0, max_iterations=10,
    splice_threshold=45, path_precision=2,
)
""",
    ], check=True)
    text = out.read_text()
    m = re.search(r'width="(\d+)" height="(\d+)"', text)
    tw, th = int(m.group(1)), int(m.group(2))
    if (tw, th) != (W, H):
        sys.exit(f"trace canvas {tw}x{th} != {W}x{H} for {tag} - aborting")
    els = re.findall(r"<path[^>]*/?>", text)
    return els


def level_paths(map_arr, thresholds, tag):
    """Trace one <g> per threshold; each <g> holds raw vtracer paths."""
    groups = []
    for i, t in enumerate(thresholds):
        mask = map_arr > t
        if mask.sum() < 400:  # nothing meaningful at this level
            groups.append("")
            continue
        # soften the staircase before tracing
        img = Image.fromarray((mask * 255).astype(np.uint8)).filter(
            ImageFilter.GaussianBlur(2.5))
        mask_s = np.asarray(img) > 128
        els = trace_mask(mask_s, f"{tag}{i}")
        groups.append("".join(els))
        print(f"  {tag}{i}: t={t:.2f} px={int(mask.sum())} paths={len(els)}")
    return groups


def sample_shadow_color(ref: Image.Image, shadow_map: np.ndarray) -> str:
    """Average reference color of the deepest crease pixels."""
    deep = shadow_map > 0.45
    if deep.sum() < 50:
        deep = shadow_map > 0.30
    a = np.asarray(ref, dtype=np.float64)[..., :3]
    cols = a[deep]
    r, g, b = cols.mean(axis=0).astype(int)
    print(f"  crease color sampled from {int(deep.sum())} px: #{r:02X}{g:02X}{b:02X}")
    return f"#{r:02X}{g:02X}{b:02X}"


def main():
    ref, flat = load_images()

    # alignment sanity: silhouette IoU
    sr = np.asarray(ref.split()[3]) > 128
    sf = np.asarray(flat.split()[3]) > 128
    iou = (sr & sf).sum() / max(1, (sr | sf).sum())
    print(f"silhouette IoU ref vs flat: {iou:.4f}")
    if iou < 0.97:
        sys.exit("alignment broken - aborting")

    mask = inside_mask(ref, flat)
    L_ref, L_flat = lum(ref), lum(flat)

    # ── debug previews ───────────────────────────────────────────────────
    shadow_map = smooth(build_map(L_flat, L_ref, mask), mask)
    hilite_map = smooth(build_map(L_flat, L_ref, mask, negative=True), mask)
    Image.fromarray((shadow_map * 255).astype(np.uint8)).save(TRACE / "map-shadow.png")
    Image.fromarray((hilite_map * 255).astype(np.uint8)).save(TRACE / "map-hilite.png")
    print(f"shadow: max={shadow_map.max():.2f} px>0.1={int((shadow_map>0.1).sum())}")
    print(f"hilite: max={hilite_map.max():.2f} px>0.1={int((hilite_map>0.1).sum())}")

    crease = sample_shadow_color(ref, shadow_map)

    print("tracing shadow levels…")
    sh_groups = level_paths(shadow_map, SHADOW_LEVELS, "sh")
    print("tracing highlight levels…")
    hi_groups = level_paths(hilite_map, HILITE_LEVELS, "hi")

    # ── extract base artwork from the current mark.svg ──────────────────
    cur = (BRAND / "euforia-mark.svg").read_text()
    main_m = re.search(r'<path d="([^"]+)" fill="url\(#euGrad\)"( transform="[^"]+")?/>', cur)
    main_d, main_tf = main_m.group(1), main_m.group(2) or ""
    grad_m = re.search(r"<linearGradient.*?</linearGradient>", cur, re.S)
    gradient = grad_m.group(0)

    clip = f'<clipPath id="euClip"><path d="{main_d}"{main_tf}/></clipPath>'
    soft = (f'<filter id="euSoft" x="-15%" y="-15%" width="130%" height="130%">'
            f'<feGaussianBlur stdDeviation="{BLUR_STD}"/></filter>')

    sh_xml = "".join(
        f'<g fill="{crease}" opacity="{opa}">{els}</g>'
        for els, opa in zip(sh_groups, SHADOW_OPA) if els
    )
    hi_xml = "".join(
        f'<g fill="#FFFFFF" opacity="{opa}">{els}</g>'
        for els, opa in zip(hi_groups, HILITE_OPA) if els
    )
    depth = f'<g clip-path="url(#euClip)"><g filter="url(#euSoft)">{sh_xml}{hi_xml}</g></g>'

    mark_svg = f'''<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {W} {H}" fill="none">
<defs>{gradient}{clip}{soft}</defs>
<path d="{main_d}" fill="url(#euGrad)"{main_tf}/>
{depth}
</svg>
'''
    (BRAND / "euforia-mark.svg").write_text(mark_svg)

    # squircle tile: mark at height 208, centered (same recipe as the tracer)
    mw = W * 208 / H
    tx = (256 - mw) / 2
    ty = 24
    s = 208 / H
    icon_svg = f'''<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 256 256" fill="none">
<defs>{gradient}{clip}{soft}</defs>
<rect width="256" height="256" rx="56" fill="#020617"/>
<g transform="translate({tx:.1f} {ty:.1f}) scale({s:.5f})">
<path d="{main_d}" fill="url(#euGrad)"{main_tf}/>
{depth}
</g>
</svg>
'''
    (BRAND / "euforia-icon.svg").write_text(icon_svg)
    (BRAND / "favicon.svg").write_text(icon_svg)

    kb = len(mark_svg) / 1024
    print(f"euforia-mark.svg rebuilt ({kb:.0f} KB) - icon + favicon synced")


if __name__ == "__main__":
    main()
