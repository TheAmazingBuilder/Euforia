"""OCR pipeline unit tests (Phase 19 §52): normalization, classification,
extraction on synthetic MT5 lines. Deterministic — fixed Tesseract version.
"""

from __future__ import annotations

import os
import sys

import pytest

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from app.classification import classify  # noqa: E402
from app.extraction import OcrLine, OcrWord, extract_fields, run_ocr  # noqa: E402
from app.normalization import (  # noqa: E402
    AMBIGUOUS_SEPARATOR,
    TIMEZONE_UNKNOWN,
    normalize_decimal,
    normalize_direction,
    normalize_symbol,
    normalize_timestamp,
)

from conftest import render_mt5_screenshot, render_tradingview_chart  # noqa: E402


# ── Normalization (§14/§15/§16) ──────────────────────────────────────────────

def test_decimal_mixed_separators():
    assert normalize_decimal("1,234.50").value == "1234.5"
    assert normalize_decimal("1.234,50").value == "1234.5"


def test_decimal_ambiguous_stays_ambiguous():
    result = normalize_decimal("1.234")
    assert result.value is None
    assert result.ambiguous is True
    assert AMBIGUOUS_SEPARATOR in result.notes


def test_decimal_currency_stripped():
    result = normalize_decimal("$123.45")
    assert result.value == "123.45"
    assert "CURRENCY_SYMBOL_STRIPPED" in result.notes


def test_decimal_garbage_invalid():
    assert normalize_decimal("12abc34").value is None


def test_symbol_no_broker_merge():
    assert normalize_symbol("xauusd") == "XAUUSD"
    assert normalize_symbol("GOLD") == "GOLD"  # no invented alias (§15)


def test_timestamp_wall_clock_unknown_tz():
    result = normalize_timestamp("2026.01.05 09:30:00")
    assert result.value == "2026-01-05T09:30:00"
    assert TIMEZONE_UNKNOWN in result.notes


def test_timestamp_explicit_offset_converts():
    result = normalize_timestamp("2026-01-05T09:30:00+02:00")
    assert result.value == "2026-01-05T07:30:00Z"


def test_direction():
    assert normalize_direction("Buy") == "BUY"
    assert normalize_direction("SHORT") == "SELL"
    assert normalize_direction("hold") is None


# ── Classification (§9 deterministic heuristics) ─────────────────────────────

def test_classify_mt5():
    result = classify("MetaTrader 5 Toolbox S/L T/P Profit buy 0.15")
    assert result.type == "MT5_TRADE"
    assert result.confidence >= 0.5


def test_classify_tradingview():
    result = classify("TradingView chart indicator pine")
    assert result.type == "TRADINGVIEW_CHART"


def test_classify_unknown_is_explicit():
    result = classify("random desktop window with no trading words")
    assert result.type == "UNKNOWN"


# ── Extraction on real tesseract output (deterministic fixture) ─────────────

def test_extract_fields_from_rendered_mt5():
    image, _, _ = render_mt5_screenshot()
    from PIL import Image
    import io

    with Image.open(io.BytesIO(image)) as img:
        lines = run_ocr(img, "eng")
    fields = {f.field: f for f in extract_fields(lines)}

    assert "symbol" in fields and fields["symbol"].normalizedValue == "XAUUSD"
    assert "direction" in fields and fields["direction"].normalizedValue == "BUY"
    assert "volume" in fields and fields["volume"].normalizedValue == "0.15"
    assert "entryPrice" in fields and fields["entryPrice"].normalizedValue == "2345.6"
    assert "stopLoss" in fields and fields["stopLoss"].normalizedValue == "2335.6"
    assert "takeProfit" in fields and fields["takeProfit"].normalizedValue == "2365.6"
    assert "profit" in fields and fields["profit"].normalizedValue == "123.75"
    assert "openTime" in fields and fields["openTime"].normalizedValue == "2026-01-05T09:30:00"
    # Every extracted field keeps a source region (§18).
    for key in ("symbol", "direction", "entryPrice"):
        assert fields[key].sourceRegion is not None
        assert fields[key].confidence > 0.5


def test_extract_fields_exit_price_absent_when_no_evidence():
    """Conservative extraction (§20): no close price in the fixture line →
    exitPrice is ABSENT, never invented."""
    image, _, _ = render_mt5_screenshot()
    from PIL import Image
    import io

    with Image.open(io.BytesIO(image)) as img:
        lines = run_ocr(img, "eng")
    fields = {f.field: f for f in extract_fields(lines)}
    assert "exitPrice" not in fields


def test_line_region_bounds():
    words = [
        OcrWord(text="buy", x=10, y=20, w=40, h=16, confidence=90),
        OcrWord(text="0.15", x=60, y=20, w=50, h=16, confidence=85),
    ]
    line = OcrLine(words=words)
    region = line.region
    assert region.x == 10 and region.y == 20
    assert region.width == 100 and region.height == 16
