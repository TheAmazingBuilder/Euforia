"""Image validation + advanced preprocessing (Phase 19 §7/§11/§38 + engine
quality phase).

The sidecar treats every image as UNTRUSTED (§7): the format is re-derived
with Pillow (never the declared MIME), decodability is verified, and the
pixel ceiling is enforced BEFORE any heavy work. Preprocessing (§11) is
non-destructive — the original stays upstream in COSMOZ storage; only the
in-memory working copies are transformed.

Working copies produced (engine quality phase):
  gray       — original, grayscale (reference + dHash input);
  main       — denoise → deskew → ×2 LANCZOS upscale → CLAHE (pass A);
  alternate  — Otsu binarization of `main` (pass B, sparse segmentation);
  dhash_hex  — 64-bit perceptual fingerprint for duplicate detection.
"""

from __future__ import annotations

import io
from typing import Optional

from PIL import Image, ImageOps, UnidentifiedImageError

from .contract import EngineMetadata
from .preprocessing import binarize, clahe_equalize, denoise, dhash, estimate_skew, upscale

Image.MAX_IMAGE_PIXELS = 200_000_000  # Pillow's own bomb guard (backstop)

SUPPORTED_MIME = ("image/png", "image/jpeg", "image/webp")

# Declared → actual mismatch or undecodable payload means the image is
# refused as SCREENSHOT_UNSUPPORTED (non-retryable at the Nest side, §34).


class ImageRejected(Exception):
    """Raised for structurally unusable images (maps to UNPROCESSABLE)."""


def sniff_mime(data: bytes) -> Optional[str]:
    """Format detection via Pillow — the declared MIME is advisory only (§7)."""
    if len(data) < 12:
        return None
    try:
        with Image.open(io.BytesIO(data)) as img:
            fmt = (img.format or "").upper()
    except (UnidentifiedImageError, OSError, ValueError):
        return None
    return {"PNG": "image/png", "JPEG": "image/jpeg", "WEBP": "image/webp"}.get(fmt)


class PreparedImage:
    """Working copies for the pipeline — the original bytes are never mutated (§11)."""

    def __init__(self, gray, main, alternate, width: int, height: int, dhash_hex: str, skew_deg: float, scale: int) -> None:
        self.gray = gray
        self.main = main
        self.alternate = alternate
        self.width = width
        self.height = height
        self.dhash_hex = dhash_hex
        self.skew_deg = skew_deg
        self.scale = scale

    # Backward-compatible alias — the V1 pipeline attribute name.
    @property
    def upscaled(self):
        return self.main


def validate_and_prepare(data: bytes, metadata: EngineMetadata, max_pixels: int) -> tuple[str, PreparedImage]:
    """Validate the binary against the declared metadata and prepare variants.

    Returns (actual_mime, prepared). Raises ImageRejected when the payload
    is undecodable, oversized, or contradicts the declared metadata.
    """
    actual_mime = sniff_mime(data)
    if actual_mime is None:
        raise ImageRejected("unsupported or undecodable image format")
    if actual_mime != metadata.mime:
        raise ImageRejected("declared MIME does not match the actual image content")

    try:
        with Image.open(io.BytesIO(data)) as probe:
            width, height = probe.size
            probe.verify()  # structural integrity check (truncation, corruption)
    except (UnidentifiedImageError, OSError, ValueError, SyntaxError) as exc:
        # Pillow raises SyntaxError for broken PNG chunks — same class of
        # failure for our purposes: structurally unusable.
        raise ImageRejected("malformed image structure") from exc

    if width * height > max_pixels:
        raise ImageRejected("image exceeds the supported pixel budget")
    if width != metadata.width or height != metadata.height:
        raise ImageRejected("declared dimensions do not match the actual image")

    with Image.open(io.BytesIO(data)) as img:
        img.load()
        gray = ImageOps.grayscale(img.convert("RGB"))

        # ── Advanced chain (engine quality phase) ────────────────────────
        # 1. Denoise — small panels only (the upscale re-sharpens anyway).
        if min(gray.width, gray.height) < 1200:
            denoised = denoise(gray)
        else:
            denoised = gray

        # 2. Deskew — projection-profile estimate, applied ≥ 0.35° only.
        skew = estimate_skew(denoised)
        if abs(skew) >= 0.35:
            denoised = denoised.rotate(
                skew, resample=Image.Resampling.BILINEAR, fillcolor=None, expand=False
            )

        # 3. Upscale — LANCZOS ×2 floor, budget-capped, unsharp-masked.
        scaled, _scale_used = upscale(denoised, max_pixels)

        # 4. CLAHE — dark-theme text lift (replaces global autocontrast).
        main = clahe_equalize(scaled)

        # 5. Alternate view — Otsu binarized (pass B input).
        alternate = binarize(scaled)

        # 6. Perceptual fingerprint — dHash over the reference grayscale.
        dhash_hex = dhash(gray)

    return actual_mime, PreparedImage(
        gray=gray,
        main=main,
        alternate=alternate,
        width=width,
        height=height,
        dhash_hex=dhash_hex,
        skew_deg=skew,
        scale=_scale_used,
    )
