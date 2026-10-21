"""Perceptual hashing (OCR V2 — duplicate detection).

A dHash 64-bit (difference hash): grayscale → 9x8 resize → adjacent-pixel
horizontal comparisons. Cheap, deterministic, robust to trivial re-encodes
(metas, slight color shifts) — exactly the "same screenshot uploaded twice"
signal the upload boundary needs. Two DIFFERENT screenshots may collide in
rare cases; the Nest side therefore treats a small hamming distance as a
user-facing WARNING, never as an automatic block.

The hash is computed over the ORIGINAL bytes (never the preprocessed
working copies) so the value is stable regardless of pipeline settings.
"""

from __future__ import annotations

import io
from typing import Optional

from PIL import Image, ImageOps, UnidentifiedImageError

_HASH_SIZE = 8  # 9x8 grid → 64 comparisons


def dhash_hex(data: bytes) -> Optional[str]:
    """16-hex-char dHash of the image bytes, or None when undecodable.

    Never raises: an unreadable payload simply yields no hash and the
    duplicate check degrades to "no warning" (the pipeline itself will
    reject the payload with its own explicit failure, as before).
    """
    if len(data) < 12:
        return None
    try:
        with Image.open(io.BytesIO(data)) as img:
            img.load()
            gray = ImageOps.grayscale(img.convert("RGB"))
    except (UnidentifiedImageError, OSError, ValueError, SyntaxError):
        return None

    resized = gray.resize((_HASH_SIZE + 1, _HASH_SIZE), Image.Resampling.LANCZOS)
    pixels = list(resized.getdata())
    bits = 0
    bit_index = 0
    for row in range(_HASH_SIZE):
        row_start = row * (_HASH_SIZE + 1)
        for col in range(_HASH_SIZE):
            left = pixels[row_start + col]
            right = pixels[row_start + col + 1]
            if left > right:
                bits |= 1 << bit_index
            bit_index += 1
    return f"{bits:016x}"


def hamming_distance(hex_a: str, hex_b: str) -> int:
    """Popcount over two 16-hex-char hashes (malformed input → 64 = max)."""
    try:
        return bin(int(hex_a, 16) ^ int(hex_b, 16)).count("1")
    except (ValueError, TypeError):
        return 64
