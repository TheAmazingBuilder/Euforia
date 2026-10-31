"""Chart screenshot extraction (Account & Chart V1.1 - CHART_ANALYSIS).

CHART_ANALYSIS reads the chart LEGEND + visible indicator readings:
  - TradingView-style top-left legend: "XAUUSD · 15 · O2345.6 H2350.1
    L2340.2 C2348.9" (also the comma form "XAUUSD, 15, O 2345.6 ..." and
    MT5's "XAUUSD,H1,O:2345.6,H:2350.1,L:2340.2,C:2348.9");
  - indicator panes: "RSI (14) 62.35", "MACD (12, 26, close, 9) -0.15",
    "ATR (14) 3.42", "Stochastic (14, 3, 3) 78.21", "ADX (14) 24.5",
    "EMA (50) 2330.15";
  - the chart's own date/clock words → chartTime (wall clock, TIMEZONE_UNKNOWN).

Deterministic + labeled-only: a value is accepted when a KNOWN label (or
the O/H/L/C legend shape inside a line that carries a plausible symbol)
precedes it - never from position alone (§20). chartPrice is derived from
the legend CLOSE with an explicit PRICE_FROM_CLOSE note: the close of the
current bar IS the last traded price; anything else would be invented.
"""

from __future__ import annotations

import re
from typing import Dict, List, Optional, Tuple

from .contract import EngineField
from .extraction import DATE_ONLY_TOKEN, CLOCK_ONLY_TOKEN, _decimal_from
from .extraction_types import OcrLine, OcrWord
from .normalization import normalize_decimal, normalize_timestamp
from .templates import SYMBOL_TOKEN, SYMBOL_STOPWORDS, DECIMAL_TOKEN

__all__ = ["extract_chart_fields"]

# ── Timeframe vocabulary (canonical output, three input dialects) ────────────

_TIMEFRAME_MAP: Dict[str, str] = {
    # MT5 explicit codes.
    "M1": "M1", "M5": "M5", "M15": "M15", "M30": "M30",
    "H1": "H1", "H2": "H2", "H4": "H4", "H6": "H6", "H12": "H12",
    "D1": "D1", "W1": "W1", "MN1": "MN1",
    # TradingView numeric minutes.
    "1": "M1", "5": "M5", "15": "M15", "30": "M30", "45": "M45",
    "60": "H1", "120": "H2", "240": "H4", "360": "H6", "480": "H8",
    "720": "H12", "1440": "D1", "10080": "W1", "43200": "MN1",
    # Conversational words ("1h", "Daily", "W").
    "1M": "M1", "5M": "M5", "15M": "M15", "30M": "M30",
    "1H": "H1", "2H": "H2", "4H": "H4",
    "1D": "D1", "DAILY": "D1", "D": "D1",
    "1W": "W1", "WEEKLY": "W1", "W": "W1",
    "MONTHLY": "MN1", "MN": "MN1",
}
_TIMEFRAME_TOKEN = re.compile(r"^[A-Za-z]?\d{1,5}[MHDmhd]?$|^[MHDmhd]$|^(daily|weekly|monthly)$", re.IGNORECASE)


def _normalize_timeframe(raw: str) -> Optional[str]:
    token = raw.strip(",.:")
    # Disambiguate the month trap: "1M" with a lowercase m is minutes in TV
    # dialect; uppercase bare "M" after a number stays ambiguous - only a
    # BARE "M"/"MN" means month (MT5's MN1). Bare lowercase "m" alone is
    # never accepted (too ambiguous).
    if token.upper() in _TIMEFRAME_MAP:
        mapped = _TIMEFRAME_MAP[token.upper()]
        # Bare "D"/"W" accepted; bare "M" only when uppercase (MT5 month).
        if token in ("M", "MN", "m", "mn"):
            return "MN1" if token in ("M", "MN") else None
        return mapped
    return None


# ── Legend shapes ─────────────────────────────────────────────────────────────

# "O2345.60" - a single letter glued to a decimal (TradingView legend).
_OHLC_GLUED = re.compile(r"^([OHLCohlc])[:=]?(-?\d[\d.,]*)$")
# A bare single letter as its own word ("O 2345.60", MT5 style "O: 2345.60").
_OHLC_BARE = re.compile(r"^([OHLCohlc])[:=]?$")

_OHLC_KEY = {"O": "chartOpen", "H": "chartHigh", "L": "chartLow", "C": "chartClose"}

# Explicit current-price labels (priority over the derived close).
_PRICE_LABEL = re.compile(r"^(bid|ask|last)[:=]?$", re.IGNORECASE)

# Indicator labels - the label word may carry the opening paren ("RSI (14)").
_INDICATOR_RULES: Tuple[Tuple[re.Pattern, str], ...] = tuple(
    (re.compile(pattern, re.IGNORECASE), key)
    for pattern, key in (
        (r"^rsi[(:.]?$", "chartRsi"),
        (r"^macd[(:.]?$", "chartMacd"),
        (r"^atr[(:.]?$", "chartAtr"),
        (r"^stoch(?:astic)?[(:.]?$", "chartStoch"),
        (r"^adx[(:.]?$", "chartAdx"),
        (r"^(?:ema|sma|wma|ma)[(:.]?$", "chartMa"),
    )
)


def _symbol_word(line: OcrLine) -> Optional[Tuple[int, OcrWord]]:
    """The first plausible symbol token of a line (templates grammar)."""
    for index, word in enumerate(line.words):
        candidate = word.text.strip(",.;:")
        if (
            SYMBOL_TOKEN.match(candidate)
            and not DECIMAL_TOKEN.match(candidate)
            and candidate.upper() not in SYMBOL_STOPWORDS
            and len(candidate) >= 3
        ):
            return (index, word)
    return None


def _confidence(line: OcrLine, word: OcrWord) -> float:
    return round(min(line.confidence * (word.confidence / 100.0), 0.99), 3)


def _upsert(fields: Dict[str, EngineField], candidate: EngineField) -> None:
    existing = fields.get(candidate.field)
    if existing is None or candidate.confidence > existing.confidence:
        fields[candidate.field] = candidate


def extract_chart_fields(lines: List[OcrLine]) -> List[EngineField]:
    """Deterministic chart-legend + indicator extraction over the OCR lines."""
    fields: Dict[str, EngineField] = {}

    for line in lines:
        symbol_found = _symbol_word(line)
        symbol_word = symbol_found[1] if symbol_found is not None else None
        symbol_index = symbol_found[0] if symbol_found is not None else -1

        # ── OHLC legend - only inside a line that carries a symbol ──────────
        if symbol_word is not None:
            _upsert(
                fields,
                EngineField(
                    field="symbol",
                    rawValue=symbol_word.text,
                    normalizedValue=re.sub(r"[^A-Z0-9]", "", symbol_word.text.strip(",.;:").upper()),
                    confidence=_confidence(line, symbol_word),
                    sourceRegion=None,
                    notes=[],
                ),
            )
            for index, word in enumerate(line.words):
                glued = _OHLC_GLUED.match(word.text.strip(",.;:"))
                if glued:
                    letter = glued.group(1).upper()
                    normalized = normalize_decimal(glued.group(2))
                    if normalized.value is not None:
                        _upsert(fields, EngineField(
                            field=_OHLC_KEY[letter],
                            rawValue=word.text,
                            normalizedValue=normalized.value,
                            confidence=_confidence(line, word),
                            sourceRegion=None,
                            notes=normalized.notes,
                        ))
                    continue
                bare = _OHLC_BARE.match(word.text.strip(",.;:"))
                if bare and index + 1 < len(line.words):
                    follower = line.words[index + 1]
                    candidate_text = follower.text.strip(",.;:")
                    if DECIMAL_TOKEN.fullmatch(candidate_text):
                        normalized = _decimal_from(follower)
                        if normalized is not None and normalized.value is not None:
                            _upsert(fields, EngineField(
                                field=_OHLC_KEY[bare.group(1).upper()],
                                rawValue=follower.text,
                                normalizedValue=normalized.value,
                                confidence=_confidence(line, follower),
                                sourceRegion=None,
                                notes=normalized.notes,
                            ))

        # ── Timeframe - a mapped token adjacent to the symbol ───────────────
        if symbol_word is not None:
            for offset in (-1, 1, 2):
                index = symbol_index + offset
                if 0 <= index < len(line.words):
                    candidate = _normalize_timeframe(line.words[index].text)
                    if candidate is not None:
                        _upsert(fields, EngineField(
                            field="chartTimeframe",
                            rawValue=line.words[index].text,
                            normalizedValue=candidate,
                            confidence=_confidence(line, line.words[index]),
                            sourceRegion=None,
                            notes=[],
                        ))
                        break

        # ── Current price - explicit bid/ask/last labels ────────────────────
        for index, word in enumerate(line.words):
            if not _PRICE_LABEL.match(word.text.strip(",.;:")):
                continue
            for follower in line.words[index + 1 : index + 3]:
                candidate = follower.text.strip(",.;:")
                if not DECIMAL_TOKEN.fullmatch(candidate):
                    continue
                normalized = _decimal_from(follower)
                if normalized is not None and normalized.value is not None:
                    _upsert(fields, EngineField(
                        field="chartPrice",
                        rawValue=follower.text,
                        normalizedValue=normalized.value,
                        confidence=_confidence(line, follower),
                        sourceRegion=None,
                        notes=[f"PRICE_FROM_{word.text.strip(',.;:').upper()}"],
                    ))
                    break

        # ── Indicator readings - label word, then value after the params ────
        for index, word in enumerate(line.words):
            stripped = word.text.strip(",.;:")
            rule = next(((pattern, key) for pattern, key in _INDICATOR_RULES if pattern.match(stripped)), None)
            if rule is None:
                continue
            _, key = rule
            # Skip the parameter group "(14)" / "(12, 26, close, 9)" - the
            # value comes AFTER the closing paren, never inside it.
            cursor = index + 1
            if cursor < len(line.words) and "(" in line.words[cursor].text:
                while cursor < len(line.words) and ")" not in line.words[cursor].text:
                    cursor += 1
                cursor += 1
            for follower in line.words[cursor : cursor + 3]:
                candidate = follower.text.strip(",.;:")
                if not DECIMAL_TOKEN.fullmatch(candidate):
                    continue
                normalized = normalize_decimal(candidate)
                if normalized is not None and normalized.value is not None:
                    _upsert(fields, EngineField(
                        field=key,
                        rawValue=word.text,
                        normalizedValue=normalized.value,
                        confidence=_confidence(line, follower),
                        sourceRegion=None,
                        notes=[],
                    ))
                    break

        # ── Chart time - date + clock word pairs (wall clock, §16) ─────────
        for index, word in enumerate(line.words):
            combined: Optional[str] = None
            if DATE_ONLY_TOKEN.match(word.text):
                follower = line.words[index + 1] if index + 1 < len(line.words) else None
                if follower is not None and CLOCK_ONLY_TOKEN.match(follower.text):
                    combined = f"{word.text} {follower.text}"
            if combined is None:
                continue
            normalized = normalize_timestamp(combined)
            if normalized.value is None:
                continue
            _upsert(fields, EngineField(
                field="chartTime",
                rawValue=combined,
                normalizedValue=normalized.value,
                confidence=_confidence(line, word),
                sourceRegion=None,
                notes=normalized.notes,
            ))
            break

    # chartPrice derived from the legend close (explicit provenance note) -
    # only when no explicit bid/ask/last label produced one.
    if "chartPrice" not in fields and fields.get("chartClose", None) is not None:
        close = fields["chartClose"]
        fields["chartPrice"] = EngineField(
            field="chartPrice",
            rawValue=close.rawValue,
            normalizedValue=close.normalizedValue,
            confidence=close.confidence,
            sourceRegion=None,
            notes=["PRICE_FROM_CLOSE"],
        )

    return list(fields.values())
