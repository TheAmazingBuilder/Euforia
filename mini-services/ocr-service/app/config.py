"""OCR sidecar configuration (Phase 19 §26/§27/§38).

Environment-driven, fail-fast: the service refuses to start without the
service-to-service token (§27 — no public unauthenticated OCR endpoints).
"""

from __future__ import annotations

import os
from dataclasses import dataclass

# Contract version mirrored from the NestJS side (ocr-engine.port.ts).
CONTRACT_VERSION = "1"


@dataclass(frozen=True)
class Settings:
    """Immutable runtime settings — read once at startup."""

    service_token: str
    max_bytes: int
    max_pixels: int
    default_deadline_ms: int
    tesseract_lang: str

    @staticmethod
    def load() -> "Settings":
        token = os.environ.get("OCR_SERVICE_TOKEN", "").strip()
        if len(token) < 32:
            raise RuntimeError(
                "OCR_SERVICE_TOKEN must be set (>= 32 chars) — the sidecar "
                "refuses unauthenticated operation (Phase 19 §27)"
            )

        def _int(name: str, default: int, minimum: int, maximum: int) -> int:
            raw = os.environ.get(name, "").strip()
            value = int(raw) if raw else default
            return max(minimum, min(maximum, value))

        return Settings(
            service_token=token,
            max_bytes=_int("OCR_MAX_BYTES", 8_388_608, 65_536, 33_554_432),
            max_pixels=_int("OCR_MAX_PIXELS", 40_000_000, 65536, 200_000_000),
            default_deadline_ms=_int("OCR_DEFAULT_DEADLINE_MS", 25_000, 2_000, 120_000),
            tesseract_lang=os.environ.get("OCR_TESSERACT_LANG", "eng").strip() or "eng",
        )


settings = Settings.load()
