"""Image validation + preprocessing (Phase 19 §7/§11/§38).

The sidecar treats every image as UNTRUSTED (§7): the format is re-derived
with Pillow (never the declared MIME), decodability is verified, and the
pixel ceiling is enforced BEFORE any heavy work. Preprocessing (§11) is
non-destructive — the original stays upstream in COSMOZ storage; only the
in-memory working copies are transformed.
"""

from __future__ import annotations

import io
from typing import Optional

from PIL import Image, ImageOps, UnidentifiedImageError

from .contract import EngineMetadata

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

    def __init__(self, gray, upscaled, width: int, height: int) -> None:
        self.gray = gray
        self.upscaled = upscaled
        self.width = width
        self.height = height


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
        # Upscale small crops — tesseract performs better on ~2x text (§11).
        target_w = max(gray.width, 1400)
        scale = max(1, round(target_w / max(gray.width, 1)))
        upscaled = gray.resize((gray.width * scale, gray.height * scale), Image.Resampling.BILINEAR) if scale > 1 else gray
        upscaled = ImageOps.autocontrast(upscaled)

    return actual_mime, PreparedImage(gray=gray, upscaled=upscaled, width=width, height=height)
