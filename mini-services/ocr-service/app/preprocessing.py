"""Advanced image preprocessing (OCR quality phase).

The V1 pipeline only grayscaled + upscaled. Dark-theme MT5 screenshots —
the product's worst case — need more (§ engine quality review):

  1. DENOISE   — a light median filter that removes JPEG/dark-theme speckle
                 before resizing (applied only on small panels, where the
                 blur cost is re-sharpened by the upscale anyway);
  2. DESKEW    — projection-profile skew estimation (−6°..+6°) with an
                 application threshold (0.35°) so straight screenshots are
                 never rotated gratuitously;
  3. UPSCALE   — LANCZOS ×2 minimum (tesseract performs best around 2x
                 text) capped so the working copy never exceeds the pixel
                 budget, followed by a light unsharp mask;
  4. CLAHE     — contrast-limited adaptive histogram equalization (numpy,
                 bilinear tile blending): lifts text off dark backgrounds
                 without blowing out highlights the way global autocontrast
                 does;
  5. BINARIZE  — Otsu threshold variant for the sparse second pass
                 (arbitration.py) — a genuinely different view of the same
                 pixels, which is what makes the arbitrage informative;
  6. DHASH     — 64-bit difference hash for perceptual duplicate detection
                 (upload-time "already imported" — the Nest side owns the
                 storage and the user-facing decision; the sidecar only
                 computes the fingerprint).

Everything here is deterministic, dependency-light (Pillow + numpy) and
non-destructive: originals stay upstream in COSMOZ storage (§11).
"""

from __future__ import annotations

import numpy as np
from PIL import Image, ImageFilter

# Skew search window — MT5 screenshots are at worst slightly rotated by the
# user's capture tool; beyond ±6° it is a different photo, not a screenshot.
_SKEW_MIN_DEG = -6.0
_SKEW_MAX_DEG = 6.0
_SKEW_STEP_DEG = 0.5
# Below this the rotation is measurement noise — never rotate (stability).
_SKEW_APPLY_DEG = 0.35

# Working-copy ceiling: the preprocessed variant must stay well under the
# pixel budget (the sidecar already rejects oversized ORIGINALS — this caps
# the enlarged working copies so upscale can never invent a bomb).
_MAX_WORKING_PIXELS = 24_000_000

# dHash geometry: 9x8 grayscale grid → 64 horizontal-gradient bits.
_DHASH_WIDTH, _DHASH_HEIGHT = 9, 8


# ── Otsu threshold (numpy) ───────────────────────────────────────────────────

def otsu_threshold(arr: np.ndarray) -> int:
    """Otsu's binarization threshold for a uint8 grayscale array."""
    hist, _ = np.histogram(arr, bins=256, range=(0, 256))
    hist = hist.astype(np.float64)
    total = hist.sum()
    if total <= 0:
        return 128
    levels = np.arange(256, dtype=np.float64)
    weight_left = np.cumsum(hist)
    weight_right = total - weight_left
    sum_left = np.cumsum(hist * levels)
    sum_total = sum_left[-1]
    valid = (weight_left > 0) & (weight_right > 0)
    mean_left = np.where(valid, sum_left / np.maximum(weight_left, 1e-9), 0.0)
    mean_right = np.where(valid, (sum_total - sum_left) / np.maximum(weight_right, 1e-9), 0.0)
    variance_between = weight_left * weight_right * (mean_left - mean_right) ** 2
    return int(np.argmax(variance_between))


# ── Deskew ───────────────────────────────────────────────────────────────────

def _row_profile_score(arr: np.ndarray) -> float:
    """Variance of the row-sum profile — sharp text rows ⇒ peaked profile."""
    profile = arr.astype(np.float64).sum(axis=1)
    return float(profile.var())


def estimate_skew(gray: Image.Image) -> float:
    """Estimate the text skew angle in degrees (negative = counter-clockwise).

    Runs on a width-700 downsample for speed; the angle transfers 1:1 to the
    full-size image. Returns 0.0 when the measurement is inside the noise
    floor — straight screenshots are never rotated.
    """
    width = 700
    scale = min(1.0, width / max(gray.width, 1))
    probe_w = max(int(gray.width * scale), 1)
    probe_h = max(int(gray.height * scale), 1)
    probe = gray.resize((probe_w, probe_h), Image.Resampling.BILINEAR)
    arr = np.asarray(probe, dtype=np.uint8)
    threshold = otsu_threshold(arr)
    # Ink = 1 (dark pixels), background = 0 — matches dark AND light themes.
    ink = (arr < threshold).astype(np.uint8) * 255
    if ink.sum() == 0:
        return 0.0

    best_angle, best_score = 0.0, _row_profile_score(ink)
    angle = _SKEW_MIN_DEG
    while angle <= _SKEW_MAX_DEG + 1e-9:
        if abs(angle) < 1e-9:
            angle += _SKEW_STEP_DEG
            continue
        rotated = Image.fromarray(ink).rotate(
            angle, resample=Image.Resampling.BILINEAR, fillcolor=0, expand=False
        )
        score = _row_profile_score(np.asarray(rotated, dtype=np.uint8))
        if score > best_score:
            best_score, best_angle = score, angle
        angle += _SKEW_STEP_DEG
    return best_angle if abs(best_angle) >= _SKEW_APPLY_DEG else 0.0


# ── CLAHE (numpy, clip + redistribute + bilinear tile blending) ─────────────

def clahe_equalize(gray: Image.Image, tiles: int = 8, clip_limit: float = 2.5) -> Image.Image:
    """Contrast-limited adaptive histogram equalization over a tile grid.

    Pure numpy: per-tile clipped histogram → CDF mapping LUT → bilinear
    interpolation between the four neighboring tile mappings. This lifts
    low-contrast dark-theme text without the global blowout of
    autocontrast. Deterministic.
    """
    arr = np.asarray(gray, dtype=np.uint8)
    height, width = arr.shape
    if width < tiles * 8 or height < tiles * 8:
        return gray  # too small for a meaningful grid — leave as-is

    # Crop the remainder so tiles divide evenly (working copy only).
    used_h, used_w = (height // tiles) * tiles, (width // tiles) * tiles
    arr = arr[:used_h, :used_w]
    tile_h, tile_w = used_h // tiles, used_w // tiles

    # Per-tile clipped histograms → normalized CDF LUTs (256 values each).
    maps = np.empty((tiles, tiles, 256), dtype=np.float32)
    for ty in range(tiles):
        for tx in range(tiles):
            tile = arr[ty * tile_h : (ty + 1) * tile_h, tx * tile_w : (tx + 1) * tile_w]
            hist, _ = np.histogram(tile, bins=256, range=(0, 256))
            hist = hist.astype(np.float64)
            # Clip + redistribute the excess uniformly (the "L" in CLAHE).
            excess_total = hist.sum() * clip_limit / 256.0
            overflow = np.maximum(hist - excess_total, 0.0)
            hist = np.minimum(hist, excess_total) + overflow.sum() / 256.0
            cdf = np.cumsum(hist)
            cdf_min = cdf[np.nonzero(cdf)[0]][0] if np.any(cdf > 0) else 0.0
            denom = max(tile.size - cdf_min, 1.0)
            maps[ty, tx] = ((cdf - cdf_min) / denom * 255.0).astype(np.float32)

    # Bilinear blend of the four nearest tile mappings (vectorized).
    ys = np.arange(used_h, dtype=np.float32)
    xs = np.arange(used_w, dtype=np.float32)
    # Continuous tile coordinates; centers of tile (i) sit at (i + 0.5).
    gy = np.clip((ys - tile_h / 2.0) / tile_h, 0.0, tiles - 1.0)
    gx = np.clip((xs - tile_w / 2.0) / tile_w, 0.0, tiles - 1.0)
    y0 = np.floor(gy).astype(np.int32)
    x0 = np.floor(gx).astype(np.int32)
    y1 = np.minimum(y0 + 1, tiles - 1)
    x1 = np.minimum(x0 + 1, tiles - 1)
    fy = (gy - y0)[:, None]
    fx = (gx - x0)[None, :]

    # Advanced indexing: maps[ty, tx, arr[y, x]] → (H, W) mapped value.
    top_left = maps[y0[:, None], x0[None, :], arr]
    top_right = maps[y0[:, None], x1[None, :], arr]
    bottom_left = maps[y1[:, None], x0[None, :], arr]
    bottom_right = maps[y1[:, None], x1[None, :], arr]
    blended = (
        (1 - fy) * (1 - fx) * top_left
        + (1 - fy) * fx * top_right
        + fy * (1 - fx) * bottom_left
        + fy * fx * bottom_right
    )
    return Image.fromarray(np.clip(blended, 0, 255).astype(np.uint8))


# ── Pipeline stages ──────────────────────────────────────────────────────────

def denoise(gray: Image.Image) -> Image.Image:
    """Light 3x3 median filter — kills speckle, keeps glyph edges usable
    once the upscale re-sharpens. Only for small panels (see module doc)."""
    return gray.filter(ImageFilter.MedianFilter(size=3))


def upscale(gray: Image.Image, pixel_budget: int) -> tuple[Image.Image, int]:
    """LANCZOS upscale with a ×2 floor — tesseract's accuracy sweet spot.

    Returns (image, applied_scale). The scale grows beyond 2 only when the
    image would otherwise stay under ~1400px wide; it never exceeds the
    working-copy pixel ceiling.
    """
    scale = max(2, int(np.ceil(1400 / max(gray.width, 1))))
    while scale > 1 and gray.width * scale * gray.height * scale > min(pixel_budget, _MAX_WORKING_PIXELS):
        scale -= 1
    if scale <= 1:
        return gray, 1
    resized = gray.resize((gray.width * scale, gray.height * scale), Image.Resampling.LANCZOS)
    sharpened = resized.filter(ImageFilter.UnsharpMask(radius=1, percent=70, threshold=2))
    return sharpened, scale


def binarize(gray: Image.Image) -> Image.Image:
    """Otsu binarization — the alternate view used by the second OCR pass."""
    arr = np.asarray(gray, dtype=np.uint8)
    threshold = otsu_threshold(arr)
    out = np.where(arr <= threshold, 0, 255).astype(np.uint8)
    return Image.fromarray(out)


def dhash(gray: Image.Image) -> str:
    """64-bit difference hash, hex-encoded (16 chars) — perceptual
    fingerprint for duplicate detection. Robust to recompression and minor
    crops; the Nest side compares Hamming distance."""
    small = gray.resize((_DHASH_WIDTH, _DHASH_HEIGHT), Image.Resampling.LANCZOS)
    arr = np.asarray(small, dtype=np.int16)
    diff = arr[:, 1:] > arr[:, :-1]  # 8 bits per row × 8 rows = 64 bits
    bits = np.packbits(diff.flatten())
    return "".join(format(byte, "02x") for byte in bits)
