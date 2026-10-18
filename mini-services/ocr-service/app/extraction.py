"""Field extraction (Phase 19 §10 stages 4–8): tesseract OCR → line
grouping → deterministic field regexes → normalization → confidence.

Extraction profile: TRADE_SUMMARY (V1, the only profile — §12). MT5-style
trade lines carry: a timestamp, buy/sell, volume, symbol, prices, and
labeled S/L / T/P / Profit values. Extraction is CONSERVATIVE (§20): when
evidence is missing, the field is absent — never invented. The recognized
words keep their bounding boxes (§18) so the review UI can highlight the
source region later.

Engine-quality phase additions:
  - LAYOUT TEMPLATES — extraction accepts a LayoutTemplate (templates.py)
    that tightens/widens plausibility windows per platform layout and may
    enable the trailing-profit rule for MT5 desktop history rows;
  - MULTI-TRADE CANDIDATES — account-history screenshots carry N trade
    rows; extract_trade_candidates() groups order rows into per-trade
    field sets (drafts for grouped confirmation). Candidates are only
    GROUPED evidence — never merged into one fake trade.
"""

from __future__ import annotations

import re
import subprocess
import time
from typing import Dict, List, Optional

import pytesseract
from pytesseract import Output

from .contract import EngineField, EngineTrade, SourceRegion
from .extraction_types import OcrLine, OcrWord  # re-exported for compat
from .normalization import (
    Normalized,
    normalize_decimal,
    normalize_direction,
    normalize_symbol,
    normalize_timestamp,
)
from .templates import (
    GENERIC,
    LayoutTemplate,
    PROFIT_LABELS,
    SL_LABELS,
    TP_LABELS,
    DIRECTION_WORD,
    SYMBOL_STOPWORDS,
    SYMBOL_TOKEN,
    TIME_TOKEN,
    apply_shape_bonus,
    find_order_rows,
    symbol_candidate,
    trailing_profit_value,
    volume_plausible,
)

__all__ = ["ENGINE_NAME", "OcrLine", "OcrWord", "extract_fields", "extract_trade_candidates", "extract_trades", "run_ocr", "tesseract_version"]

ENGINE_NAME = "fastapi-tesseract"

# MT5 vocabulary — the extraction evidence (deterministic, explainable).
# Label/direction/decimal/token patterns now live in templates.py (shared
# with the layout templates); DATE/CLOCK stay extraction-local.
DECIMAL_TOKEN = re.compile(r"^[-+]?\d{1,3}(?:[.,\s]\d{3})*(?:[.,]\d+)?|[-+]?\d+[.,]\d+|^[-+]?\d+$")
DATE_ONLY_TOKEN = re.compile(r"^\d{4}[.-]\d{2}[.-]\d{2}$")
CLOCK_ONLY_TOKEN = re.compile(r"^\d{2}:\d{2}(?::\d{2})?$")


# OcrWord / OcrLine now live in extraction_types.py (shared with
# templates.py and arbitration.py — no import cycles). Re-exported above.


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
    # A DATE-only token is not a price either (V2 fix: "Closed: 2026.01.05
    # 10:15:00" parsed the date as an exit price of 20260105).
    if DATE_ONLY_TOKEN.match(word.text):
        return None
    if not DECIMAL_TOKEN.match(word.text):
        return None
    return normalize_decimal(word.text)


def _labeled_value(line: OcrLine, label_pattern: re.Pattern) -> Optional[tuple]:
    """The numeric token that follows a label (S/L, T/P, Profit).

    V2 fix: the follower must be DECIMAL-SHAPED as a whole token (fullmatch
    on the punctuation-stripped text) and must actually normalize to a value
    (or be an explicit AMBIGUOUS separator case). The old prefix match let
    "Closed: 2026.01.05 10:15:00" extract "10:15:00" as a null-valued price.
    """
    for index, word in enumerate(line.words):
        if not label_pattern.search(word.text):
            continue
        for follower in line.words[index + 1 : index + 3]:
            candidate = follower.text.strip(",.;:")
            if not DECIMAL_TOKEN.fullmatch(candidate):
                continue
            normalized = _decimal_from(follower)
            if normalized is not None and (normalized.value is not None or normalized.ambiguous):
                return (normalized, follower)
    return None


# Exit-price labels (V2 §11) — WORD-level shapes. The bare word "close" in
# a history row is an ORDER TYPE ("close 0.15 XAUUSD ...") and must never
# capture the following volume as a price; an explicit "exit" word, a
# colon-carrying "closed:"/"close:" or an "exit price" word pair are the
# only accepted label shapes.
_EXIT_WORD = re.compile(r"^(?:exit[:,]?|clos(?:e|ed|ing):)$", re.IGNORECASE)
_PRICE_FILLER = re.compile(r"^price[:,.]?$", re.IGNORECASE)


def _exit_labeled_value(line: OcrLine) -> Optional[tuple]:
    """Exit price from explicit label shapes ("Exit price 2353.85",
    "Closed: 2353.85", "exit: 2353.85"). Same decimal-shape discipline as
    _labeled_value; accepts the word "price" as a label filler."""
    for index, word in enumerate(line.words):
        if not _EXIT_WORD.match(word.text.strip(",.;:")):
            continue
        window = line.words[index + 1 : index + 4]
        if window and _PRICE_FILLER.match(window[0].text.strip(",.;:")):
            window = window[1:]
        for follower in window[:2]:
            candidate = follower.text.strip(",.;:")
            if not DECIMAL_TOKEN.fullmatch(candidate):
                continue
            normalized = _decimal_from(follower)
            if normalized is not None and (normalized.value is not None or normalized.ambiguous):
                return (normalized, follower)
    return None


def _upsert_exit(line: OcrLine, fields: Dict[str, EngineField], line_confidence: float) -> None:
    """Extract + upsert exitPrice from one line (shared by mono + candidates)."""
    labeled = _exit_labeled_value(line)
    if labeled is None:
        return
    normalized, word = labeled
    existing = fields.get("exitPrice")
    confidence = round(min(line_confidence * (word.confidence / 100.0), 0.99), 3)
    if existing is None or confidence > existing.confidence:
        fields["exitPrice"] = EngineField(
            field="exitPrice",
            rawValue=word.text,
            normalizedValue=normalized.value,
            confidence=confidence,
            sourceRegion=_region_in(line, word),
            notes=normalized.notes,
        )


def extract_fields(
    lines: List[OcrLine], template: Optional[LayoutTemplate] = None
) -> List[EngineField]:
    """Deterministic field extraction over the OCR lines (§10 stage 6–8).

    `template` (optional) carries the platform layout priors: plausibility
    windows and the trailing-profit rule. GENERIC behavior when absent —
    identical to the V1 extraction.
    """
    started = time.perf_counter()
    template = template or _GENERIC_TEMPLATE
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
                    if volume_plausible(volume_value, template):  # layout-windowed lots
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

        # Labeled risk/profit values (V2 §11: exit price via explicit
        # exit/close-price labels — see _exit_labeled_value).
        for pattern, key in (
            (SL_LABELS, "stopLoss"),
            (TP_LABELS, "takeProfit"),
            (PROFIT_LABELS, "profit"),
        ):
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

        # Exit price — explicit label shapes only.
        _upsert_exit(line, fields, line.confidence)

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

    # Trailing-profit rule — history template only, explicit sign required
    # (templates.py never invents: an unsigned trailing number is too
    # ambiguous to claim, §20).
    if template.trailing_profit and "profit" not in fields:
        for line in lines:
            if not any(DIRECTION_WORD.match(w.text) for w in line.words):
                continue
            word = trailing_profit_value(line)
            if word is None:
                continue
            normalized = normalize_decimal(word.text)
            if normalized.value is not None:
                upsert(
                    EngineField(
                        field="profit",
                        rawValue=word.text,
                        normalizedValue=normalized.value,
                        confidence=round(min(line.confidence * (word.confidence / 100.0), 0.99), 3),
                        sourceRegion=_region_in(line, word),
                        notes=normalized.notes,
                    )
                )
                break

    # Layout shape bonus — last, explainable, capped (templates.py).
    if template.name != GENERIC:
        result = [apply_shape_bonus(field, template) for field in fields.values()]
    else:
        result = list(fields.values())
    result.sort(key=lambda f: f.field)
    return result


# ── Multi-trade candidates (account-history screenshots) ────────────────────

MAX_TRADE_CANDIDATES = 20

_GENERIC_TEMPLATE = LayoutTemplate(name=GENERIC, volume_min=0.01, volume_max=1000.0, trailing_profit=False, shape_bonus=0.0)


def extract_trade_candidates(
    lines: List[OcrLine], template: Optional[LayoutTemplate] = None
) -> List[List[EngineField]]:
    """Group order rows into per-trade field sets (multi-trade drafts).

    A candidate is an order row (direction + symbol) extended with:
      - the leading timestamp on the same row (openTime);
      - labeled S/L / T/P / Profit values from the row itself;
      - labeled values from the following lines up to the NEXT order row
        (MT5 stacks the S/L line under the order row — conftest fixture
        shape) — those lines are consumed and not re-offered;
      - the trailing signed profit when the template allows it.

    A candidate needs direction + symbol + at least one more field to be
    offered — never a naked single-word row. Capped at MAX_TRADE_CANDIDATES
    (a screenshot is not a CSV import; huge statements belong to files).
    """
    template = template or _GENERIC_TEMPLATE
    candidates: List[List[EngineField]] = []
    order_rows = find_order_rows(lines)
    if len(order_rows) < 2:
        # Single order row → the mono-trade path already covers it; do not
        # duplicate it into a candidates list (UI keeps one review card).
        return []

    for position, (index, row) in enumerate(order_rows):
        if len(candidates) >= MAX_TRADE_CANDIDATES:
            break
        next_index = order_rows[position + 1][0] if position + 1 < len(order_rows) else len(lines)
        fields: Dict[str, EngineField] = {}

        def upsert(field: EngineField) -> None:
            existing = fields.get(field.field)
            if existing is None or field.confidence > existing.confidence:
                fields[field.field] = field

        # Row scan — direction, symbol, volume, entry, openTime, labels.
        direction_seen: Optional[str] = None
        symbol_seen: Optional[str] = None
        entry_done = False
        for idx, word in enumerate(row.words):
            # Direction + volume adjacency.
            if DIRECTION_WORD.match(word.text) and direction_seen is None:
                direction = normalize_direction(word.text)
                if direction is not None:
                    direction_seen = direction
                    upsert(EngineField(
                        field="direction", rawValue=word.text, normalizedValue=direction,
                        confidence=round(min(row.confidence * (word.confidence / 100.0), 0.99), 3),
                        sourceRegion=_region_in(row, word), notes=[],
                    ))
                    for follower in row.words[idx + 1 : idx + 3]:
                        volume = _decimal_from(follower)
                        if volume is not None and volume.value is not None and volume_plausible(float(volume.value), template):
                            upsert(EngineField(
                                field="volume", rawValue=follower.text, normalizedValue=volume.value,
                                confidence=round(min(row.confidence * (follower.confidence / 100.0), 0.99), 3),
                                sourceRegion=_region_in(row, follower), notes=volume.notes,
                            ))
                            break
                continue
            # Symbol.
            if symbol_seen is None and symbol_candidate(word):
                normalized = normalize_symbol(word.text)
                if normalized is not None:
                    symbol_seen = normalized
                    upsert(EngineField(
                        field="symbol", rawValue=word.text, normalizedValue=normalized,
                        confidence=round(min(row.confidence * (word.confidence / 100.0), 0.99), 3),
                        sourceRegion=_region_in(row, word), notes=[],
                    ))
                continue
            # Entry price — first decimal after the symbol.
            if symbol_seen is not None and not entry_done and _decimal_from(word) is not None:
                normalized = _decimal_from(word)
                if normalized is not None and normalized.value is not None and float(normalized.value) > 0:
                    entry_done = True
                    upsert(EngineField(
                        field="entryPrice", rawValue=word.text, normalizedValue=normalized.value,
                        confidence=round(min(row.confidence * (word.confidence / 100.0), 0.99), 3),
                        sourceRegion=_region_in(row, word), notes=normalized.notes,
                    ))
            # Open time — leading date(+clock) on the row.
            combined: Optional[str] = None
            if TIME_TOKEN.match(word.text):
                combined = word.text
            elif DATE_ONLY_TOKEN.match(word.text):
                follower = row.words[idx + 1] if idx + 1 < len(row.words) else None
                if follower is not None and CLOCK_ONLY_TOKEN.match(follower.text):
                    combined = f"{word.text} {follower.text}"
            if combined is not None and "openTime" not in fields:
                normalized = normalize_timestamp(combined)
                if normalized.value is not None:
                    upsert(EngineField(
                        field="openTime", rawValue=combined, normalizedValue=normalized.value,
                        confidence=round(min(row.confidence * (word.confidence / 100.0), 0.99), 3),
                        sourceRegion=_region_in(row, word), notes=normalized.notes,
                    ))
            # Labeled values on the row itself.
            for pattern, key in (
                (SL_LABELS, "stopLoss"),
                (TP_LABELS, "takeProfit"),
                (PROFIT_LABELS, "profit"),
            ):
                if "profit" in fields and key == "profit" and template.trailing_profit:
                    continue
                labeled = _labeled_value(row, pattern)
                if labeled is not None:
                    normalized, token = labeled
                    upsert(EngineField(
                        field=key, rawValue=token.text, normalizedValue=normalized.value,
                        confidence=round(min(row.confidence * (token.confidence / 100.0), 0.99), 3),
                        sourceRegion=_region_in(row, token), notes=normalized.notes,
                    ))
            # Exit price on the row itself — explicit label shapes only.
            _upsert_exit(row, fields, row.confidence)

        # Follower lines up to the next order row — labeled SL/TP/profit.
        for follower_index in range(index + 1, next_index):
            follower_line = lines[follower_index]
            for pattern, key in (
                (SL_LABELS, "stopLoss"),
                (TP_LABELS, "takeProfit"),
                (PROFIT_LABELS, "profit"),
            ):
                if key in fields:
                    continue
                labeled = _labeled_value(follower_line, pattern)
                if labeled is None:
                    continue
                normalized, token = labeled
                upsert(EngineField(
                    field=key, rawValue=token.text, normalizedValue=normalized.value,
                    confidence=round(min(follower_line.confidence * (token.confidence / 100.0), 0.99), 3),
                    sourceRegion=_region_in(follower_line, token), notes=normalized.notes,
                ))
            # Exit price from follower lines too (MT5 stacks labels below).
            _upsert_exit(follower_line, fields, follower_line.confidence)

        # Trailing profit (history template only).
        if template.trailing_profit and "profit" not in fields:
            word = trailing_profit_value(row)
            if word is not None:
                normalized = normalize_decimal(word.text)
                if normalized.value is not None:
                    upsert(EngineField(
                        field="profit", rawValue=word.text, normalizedValue=normalized.value,
                        confidence=round(min(row.confidence * (word.confidence / 100.0), 0.99), 3),
                        sourceRegion=_region_in(row, word), notes=normalized.notes,
                    ))

        # Offer only structured candidates: direction + symbol + one more.
        if "direction" in fields and "symbol" in fields and len(fields) >= 3:
            candidate_fields = list(fields.values())
            if template.name != GENERIC:
                candidate_fields = [apply_shape_bonus(f, template) for f in candidate_fields]
            candidate_fields.sort(key=lambda f: f.field)
            candidates.append(candidate_fields)

    return candidates


def extract_trades(
    lines: List[OcrLine], template: Optional[LayoutTemplate] = None
) -> List["EngineTrade"]:
    """The response-level trade read (V2): clustered trades when the row
    grouping finds order rows, else the V1 flat extraction surfaced as ONE
    trade (single direction line → the V1 global path must be kept — the
    mono review card never disappears just because clustering found no row).

    Returns [] only when NOTHING was read (no fields at all) — an empty
    list, never an invented trade (§20/§21).
    """
    template = template or _GENERIC_TEMPLATE
    groups = extract_trade_candidates(lines, template)
    if groups:
        return [EngineTrade(pageIndex=0, fields=list(group)) for group in groups]
    flat = extract_fields(lines, template)
    if flat:
        return [EngineTrade(pageIndex=0, fields=flat)]
    return []


def _region_in(line: OcrLine, word: OcrWord) -> SourceRegion:
    return SourceRegion(x=word.x, y=word.y, width=word.w, height=word.h)


def tesseract_version() -> str:
    try:
        raw = pytesseract.get_tesseract_version()
        return str(raw)
    except (subprocess.SubprocessError, OSError, pytesseract.TesseractNotFoundError):
        return "unknown"
