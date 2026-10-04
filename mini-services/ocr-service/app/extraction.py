"""Field extraction (Phase 19 §10 stages 4–8): tesseract OCR → line
grouping → deterministic field regexes → normalization → confidence.

Extraction profile: TRADE_SUMMARY (V1, the only profile — §12). MT5-style
trade lines carry: a timestamp, buy/sell, volume, symbol, prices, and
labeled S/L / T/P / Profit values. Extraction is CONSERVATIVE (§20): when
evidence is missing, the field is absent — never invented. The recognized
words keep their bounding boxes (§18) so the review UI can highlight the
source region later.
"""

from __future__ import annotations

import re
import subprocess
import time
from dataclasses import dataclass, field as dc_field
from typing import Dict, List, Optional

import pytesseract
from pytesseract import Output

from .contract import EngineField, SourceRegion
from .normalization import (
    Normalized,
    normalize_decimal,
    normalize_direction,
    normalize_symbol,
    normalize_timestamp,
)

ENGINE_NAME = "fastapi-tesseract"

# MT5 vocabulary — the extraction evidence (deterministic, explainable).
SL_LABELS = re.compile(r"\bs[./]?l\b", re.IGNORECASE)
TP_LABELS = re.compile(r"\bt[./]?p\b", re.IGNORECASE)
PROFIT_LABELS = re.compile(r"\bprofit\b", re.IGNORECASE)
DIRECTION_WORD = re.compile(r"^(buy|sell|b|s)$", re.IGNORECASE)
DECIMAL_TOKEN = re.compile(r"^[-+]?\d{1,3}(?:[.,\s]\d{3})*(?:[.,]\d+)?|[-+]?\d+[.,]\d+|^[-+]?\d+$")
SYMBOL_TOKEN = re.compile(r"^[A-Za-z]{2,6}(?:[A-Za-z0-9]{0,4})?$")
TIME_TOKEN = re.compile(r"^\d{4}[.-]\d{2}[.-]\d{2}[ T]?\d{2}:\d{2}(?::\d{2})?$")
DATE_ONLY_TOKEN = re.compile(r"^\d{4}[.-]\d{2}[.-]\d{2}$")
CLOCK_ONLY_TOKEN = re.compile(r"^\d{2}:\d{2}(?::\d{2})?$")
# Words that disqualify a token from being a symbol (platform vocabulary).
SYMBOL_STOPWORDS = {
    "BUY", "SELL", "PROFIT", "BALANCE", "EQUITY", "MARGIN", "DEPOSIT",
    "WITHDRAWAL", "CREDIT", "SYMBOL", "TIME", "TYPE", "VOLUME", "PRICE",
    "ORDER", "DEAL", "POSITION", "METATRADER", "TRADINGVIEW", "CHART",
    "INDICATOR", "TOOLS", "MARKET", "WATCH", "NAVIGATOR", "TOOLBOX",
    "LOGIN", "ACCOUNT", "HISTORY", "EXPERT", "TRADE", "LOSS",
}


@dataclass
class OcrWord:
    text: str
    x: int
    y: int
    w: int
    h: int
    confidence: float


@dataclass
class OcrLine:
    words: List[OcrWord] = dc_field(default_factory=list)

    @property
    def text(self) -> str:
        return " ".join(word.text for word in self.words)

    @property
    def confidence(self) -> float:
        if not self.words:
            return 0.0
        return sum(word.confidence for word in self.words) / len(self.words) / 100.0

    @property
    def region(self) -> Optional[SourceRegion]:
        if not self.words:
            return None
        x0 = min(word.x for word in self.words)
        y0 = min(word.y for word in self.words)
        x1 = max(word.x + word.w for word in self.words)
        y1 = max(word.y + word.h for word in self.words)
        return SourceRegion(x=x0, y=y0, width=x1 - x0, height=y1 - y0)


def run_ocr(image, lang: str) -> List[OcrLine]:
    """Tesseract over the preprocessed image, grouped into reading-order lines.

    Uses `image_to_data` so every word keeps its bounding box (§18) and
    confidence — the raw material for field-level confidence (§17).
    """
    data = pytesseract.image_to_data(image, lang=lang, output_type=Output.DICT)
    lines: Dict[tuple, List[OcrWord]] = {}
    count = len(data.get("text", []))
    for i in range(count):
        raw_text = (data["text"][i] or "").strip()
        conf_raw = data["conf"][i]
        try:
            conf = float(conf_raw)
        except (TypeError, ValueError):
            conf = -1.0
        if not raw_text or conf < 0:
            continue
        word = OcrWord(
            text=raw_text,
            x=int(data["left"][i]),
            y=int(data["top"][i]),
            w=int(data["width"][i]),
            h=int(data["height"][i]),
            confidence=conf,
        )
        key = (data["block_num"][i], data["par_num"][i], data["line_num"][i])
        lines.setdefault(key, []).append(word)
    return [OcrLine(words=words) for words in lines.values()]


def _decimal_from(word: OcrWord) -> Optional[Normalized]:
    # A timestamp is NOT a price — exclude time-shaped tokens first (a real
    # bug caught by the fixture: "2026.01.05" parsed as 20260105).
    if TIME_TOKEN.match(word.text):
        return None
    if not DECIMAL_TOKEN.match(word.text):
        return None
    return normalize_decimal(word.text)


def _labeled_value(line: OcrLine, label_pattern: re.Pattern) -> Optional[tuple]:
    """The numeric token that follows a label (S/L, T/P, Profit)."""
    for index, word in enumerate(line.words):
        if not label_pattern.search(word.text):
            continue
        for follower in line.words[index + 1 : index + 3]:
            normalized = _decimal_from(follower)
            if normalized is not None:
                return (normalized, follower)
    return None


def extract_fields(lines: List[OcrLine]) -> List[EngineField]:
    """Deterministic field extraction over the OCR lines (§10 stage 6–8)."""
    started = time.perf_counter()
    fields: Dict[str, EngineField] = {}

    def upsert(field: EngineField) -> None:
        existing = fields.get(field.field)
        if existing is None or field.confidence > existing.confidence:
            fields[field.field] = field

    direction_seen: Optional[str] = None
    symbol_seen: Optional[str] = None
    volume_seen: Optional[Normalized] = None

    for line in lines:
        # Direction word anywhere in the line.
        for word in line.words:
            direction = normalize_direction(word.text) if DIRECTION_WORD.match(word.text) else None
            if direction is not None and direction_seen is None:
                direction_seen = direction
                upsert(
                    EngineField(
                        field="direction",
                        rawValue=word.text,
                        normalizedValue=direction,
                        confidence=round(min(line.confidence * (word.confidence / 100.0), 0.99), 3),
                        sourceRegion=_region_in(line, word),
                        notes=[],
                    )
                )

        # Symbol: first plausible token that is not vocabulary/number/time.
        if symbol_seen is None:
            for word in line.words:
                candidate = word.text.strip(",.;:")
                if not SYMBOL_TOKEN.match(candidate) or DECIMAL_TOKEN.match(candidate) or TIME_TOKEN.match(candidate):
                    continue
                if candidate.upper() in SYMBOL_STOPWORDS:
                    continue
                normalized = normalize_symbol(candidate)
                if normalized is None:
                    continue
                symbol_seen = normalized
                upsert(
                    EngineField(
                        field="symbol",
                        rawValue=word.text,
                        normalizedValue=normalized,
                        confidence=round(min(line.confidence * (word.confidence / 100.0), 0.99), 3),
                        sourceRegion=_region_in(line, word),
                        notes=[],
                    )
                )
                break

        # Volume: the decimal directly AFTER the direction word (order line).
        for index, word in enumerate(line.words):
            if not DIRECTION_WORD.match(word.text):
                continue
            for follower in line.words[index + 1 : index + 3]:
                normalized = _decimal_from(follower)
                if normalized is not None and volume_seen is None and normalized.value is not None:
                    volume_value = float(normalized.value)
                    if 0 < volume_value <= 1000:  # plausible lot range
                        volume_seen = normalized
                        upsert(
                            EngineField(
                                field="volume",
                                rawValue=follower.text,
                                normalizedValue=normalized.value,
                                confidence=round(min(line.confidence * (follower.confidence / 100.0), 0.99), 3),
                                sourceRegion=_region_in(line, follower),
                                notes=normalized.notes,
                            )
                        )
                    break

        # Labeled risk/profit values.
        for pattern, key in ((SL_LABELS, "stopLoss"), (TP_LABELS, "takeProfit"), (PROFIT_LABELS, "profit")):
            labeled = _labeled_value(line, pattern)
            if labeled is None:
                continue
            normalized, word = labeled
            upsert(
                EngineField(
                    field=key,
                    rawValue=word.text,
                    normalizedValue=normalized.value,
                    confidence=round(min(line.confidence * (word.confidence / 100.0), 0.99), 3),
                    sourceRegion=_region_in(line, word),
                    notes=normalized.notes,
                )
            )

        # Timestamps: MT5-style dotted/dashed wall clocks (§16 — no tz guess).
        # Tesseract splits "2026.01.05 09:30:00" into date + clock words —
        # join the adjacent pair before normalizing (never guess: only a
        # DIRECTLY adjacent pair is joined).
        for index, word in enumerate(line.words):
            combined: Optional[str] = None
            if TIME_TOKEN.match(word.text):
                combined = word.text
            elif DATE_ONLY_TOKEN.match(word.text):
                follower = line.words[index + 1] if index + 1 < len(line.words) else None
                if follower is not None and CLOCK_ONLY_TOKEN.match(follower.text):
                    combined = f"{word.text} {follower.text}"
            if combined is None:
                continue
            normalized = normalize_timestamp(combined)
            if normalized.value is None:
                continue
            key = "openTime" if "openTime" not in fields else ("closeTime" if "closeTime" not in fields else None)
            if key is None:
                break
            upsert(
                EngineField(
                    field=key,
                    rawValue=combined,
                    normalizedValue=normalized.value,
                    confidence=round(min(line.confidence * (word.confidence / 100.0), 0.99), 3),
                    sourceRegion=_region_in(line, word),
                    notes=normalized.notes,
                )
            )

    # entryPrice: the price token AFTER the symbol inside an order line that
    # carries both direction and symbol (MT5 history layout) — conservative,
    # labeled evidence only (§20). One order line is consumed per screenshot.
    for line in lines:
        words_text = [w.text for w in line.words]
        has_direction = any(DIRECTION_WORD.match(t) for t in words_text)
        symbol_index = None
        for index, word in enumerate(line.words):
            candidate = word.text.strip(",.;:")
            if (
                SYMBOL_TOKEN.match(candidate)
                and not DECIMAL_TOKEN.match(candidate)
                and not TIME_TOKEN.match(candidate)
                and candidate.upper() not in SYMBOL_STOPWORDS
            ):
                symbol_index = index
                break
        if not (has_direction and symbol_index is not None):
            continue
        for word in line.words[symbol_index + 1 : symbol_index + 3]:
            normalized = _decimal_from(word)
            if normalized is not None and normalized.value is not None and float(normalized.value) > 0:
                if "entryPrice" not in fields:
                    upsert(
                        EngineField(
                            field="entryPrice",
                            rawValue=word.text,
                            normalizedValue=normalized.value,
                            confidence=round(min(line.confidence * (word.confidence / 100.0), 0.99), 3),
                            sourceRegion=_region_in(line, word),
                            notes=normalized.notes,
                        )
                    )
                break
        if "entryPrice" in fields:
            break

    result = list(fields.values())
    result.sort(key=lambda f: f.field)
    return result


def _region_in(line: OcrLine, word: OcrWord) -> SourceRegion:
    return SourceRegion(x=word.x, y=word.y, width=word.w, height=word.h)


def tesseract_version() -> str:
    try:
        raw = pytesseract.get_tesseract_version()
        return str(raw)
    except (subprocess.SubprocessError, OSError, pytesseract.TesseractNotFoundError):
        return "unknown"
