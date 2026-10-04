"""Value normalization (Phase 19 §13/§14/§15/§16).

Mirrors the NestJS domain semantics (apps/api/src/modules/ocr/ocr.logic.ts):
  - ambiguous decimals STAY ambiguous ("1.234" → AMBIGUOUS, never 1234, §14);
  - symbols keep raw + normalized, no broker merge (§15);
  - wall-clock timestamps carry TIMEZONE_UNKNOWN — no silent timezone
    assumption (§16).

The sidecar emits rawValue + normalizedValue + notes; the Nest side owns
banding and the final validation status.
"""

from __future__ import annotations

import re
from dataclasses import dataclass, field
from datetime import datetime, timezone
from typing import List, Optional, Tuple

TIMEZONE_UNKNOWN = "TIMEZONE_UNKNOWN"
AMBIGUOUS_SEPARATOR = "AMBIGUOUS_THOUSANDS_SEPARATOR"
CURRENCY_STRIPPED = "CURRENCY_SYMBOL_STRIPPED"
EXPLICIT_UTC = "EXPLICIT_UTC"


@dataclass
class Normalized:
    raw: str
    value: Optional[str]
    notes: List[str] = field(default_factory=list)
    ambiguous: bool = False


_DECIMAL_CHARS = re.compile(r"^[0-9.,+\-]+$")


def normalize_decimal(raw: str) -> Normalized:
    """Exact decimal semantics — identical rules to the Nest side (§14)."""
    notes: List[str] = []
    text = raw.strip()
    stripped = re.sub(r"^[^0-9.,+\-]+", "", text)
    stripped = re.sub(r"[^0-9.,+\-]+$", "", stripped)
    if stripped != text:
        notes.append(CURRENCY_STRIPPED)
        text = stripped
    if not text or not _DECIMAL_CHARS.match(text):
        return Normalized(raw=raw, value=None, notes=notes)

    last_dot = text.rfind(".")
    last_comma = text.rfind(",")

    if last_dot >= 0 and last_comma >= 0:
        dec_sep = "." if last_dot > last_comma else ","
        thou_sep = "," if dec_sep == "." else "."
        cleaned = text.replace(thou_sep, "").replace(dec_sep, ".")
        return Normalized(raw=raw, value=_canonical(cleaned), notes=notes)

    sep = "." if last_dot >= 0 else ("," if last_comma >= 0 else None)
    if sep is not None:
        occurrences = text.count(sep)
        if occurrences > 1:
            return Normalized(raw=raw, value=_canonical(text.replace(sep, "")), notes=notes)
        fraction = text.split(sep)[-1]
        if len(fraction) == 3:
            notes.append(AMBIGUOUS_SEPARATOR)
            return Normalized(raw=raw, value=None, notes=notes, ambiguous=True)
        if sep == ",":
            return Normalized(raw=raw, value=_canonical(text.replace(",", ".")), notes=notes)
        return Normalized(raw=raw, value=_canonical(text), notes=notes)

    return Normalized(raw=raw, value=_canonical(text), notes=notes)


def _canonical(text: str) -> Optional[str]:
    try:
        value = float(text)
    except ValueError:
        return None
    if value != value or value in (float("inf"), float("-inf")):
        return None
    # Decimal STRING on the wire — never a float number (§14).
    text_clean = text.lstrip("+")
    if "." in text_clean:
        text_clean = text_clean.rstrip("0").rstrip(".")
        if "." not in text_clean:
            text_clean += ".0"
        return text_clean
    return text_clean


_SYMBOL_RE = re.compile(r"[^A-Z0-9]")


def normalize_symbol(raw: str) -> Optional[str]:
    cleaned = _SYMBOL_RE.sub("", raw.strip().upper())
    return cleaned if 3 <= len(cleaned) <= 16 else None


_DOTTED_TS = re.compile(r"^(\d{4})\.(\d{2})\.(\d{2})[ T](\d{2}):(\d{2})(?::(\d{2}))?$")
_DASHED_TS = re.compile(r"^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2})(?::(\d{2}))?$")
_OFFSET_TS = re.compile(r"^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:?\d{2})$")


def normalize_timestamp(raw: str) -> Normalized:
    text = re.sub(r"\s+", " ", raw.strip())
    m = _DOTTED_TS.match(text) or _DASHED_TS.match(text)
    if m:
        y, mo, d, h, mi = (int(m.group(i)) for i in range(1, 6))
        s = int(m.group(6) or 0)
        try:
            datetime(y, mo, d, h, mi, s)  # calendar validity (no rollover)
        except ValueError:
            return Normalized(raw=raw, value=None)
        return Normalized(
            raw=raw,
            value=f"{m.group(1)}-{m.group(2)}-{m.group(3)}T{m.group(4)}:{m.group(5)}:{m.group(6) or '00'}",
            notes=[TIMEZONE_UNKNOWN],
        )
    if _OFFSET_TS.match(text):
        # Explicit offset — evidence-based conversion to UTC (§16).
        parsed = datetime.fromisoformat(text.replace("Z", "+00:00"))
        if parsed.tzinfo is None:
            return Normalized(raw=raw, value=None)
        utc = parsed.astimezone(timezone.utc).replace(microsecond=0)
        return Normalized(raw=raw, value=utc.isoformat().replace("+00:00", "Z"), notes=[EXPLICIT_UTC])
    return Normalized(raw=raw, value=None)


def normalize_direction(raw: str) -> Optional[str]:
    text = raw.strip().lower()
    if text in ("buy", "b", "long"):
        return "BUY"
    if text in ("sell", "s", "short"):
        return "SELL"
    return None
