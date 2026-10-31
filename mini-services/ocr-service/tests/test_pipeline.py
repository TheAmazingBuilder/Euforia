"""OCR pipeline unit tests (Phase 19 §52): normalization, classification,
extraction on synthetic MT5 lines. Deterministic - fixed Tesseract version.
"""

from __future__ import annotations

import os
import sys

import pytest

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from app.classification import classify, detect_platform, detect_screenshot_type  # noqa: E402
from app.extraction import OcrLine, OcrWord, extract_fields, run_ocr  # noqa: E402
from app.normalization import (  # noqa: E402
    AMBIGUOUS_SEPARATOR,
    TIMEZONE_UNKNOWN,
    normalize_decimal,
    normalize_direction,
    normalize_symbol,
    normalize_timestamp,
)

from conftest import render_mt5_screenshot, render_mt5_with_exit_price, render_tradingview_chart  # noqa: E402


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


def test_direction_long_short_synonyms():
    """V2 §11 - LONG/SHORT are first-class direction vocabulary."""
    assert normalize_direction("long") == "BUY"
    assert normalize_direction("Long") == "BUY"
    assert normalize_direction("short") == "SELL"


def test_direction_words_match_long_short_in_lines():
    """The extraction regex accepts the synonyms (regression: they used to
    be accepted by normalize_direction but never matched by DIRECTION_WORD)."""
    words = [
        OcrWord(text="long", x=10, y=20, w=40, h=16, confidence=90),
        OcrWord(text="0.50", x=60, y=20, w=50, h=16, confidence=88),
        OcrWord(text="EURUSD", x=120, y=20, w=70, h=16, confidence=92),
    ]
    fields = {f.field: f for f in extract_fields([OcrLine(words=words)])}
    assert fields["direction"].normalizedValue == "BUY"
    assert fields["volume"].normalizedValue == "0.5"


# ── Classification (§9 deterministic heuristics + V2 §18/§19) ─────────

def test_classify_mt5_trade_detail():
    """One direction word + trade labels = a single TRADE_DETAIL card."""
    result = classify("MetaTrader 5 Toolbox S/L T/P Profit buy 0.15")
    assert result.platform == "MT5"
    assert result.type == "TRADE_DETAIL"
    assert result.confidence >= 0.2


def test_classify_mt5_history_table():
    """History vocabulary + several order rows = TRADE_HISTORY."""
    result = classify(
        "MetaTrader 5 History "
        "2026.01.05 09:30 buy 0.15 EURUSD 1.08 "
        "2026.01.05 11:00 sell 0.30 XAUUSD 2645.6"
    )
    assert result.platform == "MT5"
    assert result.type == "TRADE_HISTORY"


def test_classify_tradingview():
    result = classify("TradingView chart indicator pine")
    assert result.platform == "TRADINGVIEW"
    assert result.type == "CHART"


def test_classify_unknown_is_explicit():
    result = classify("random desktop window with no trading words")
    assert result.type == "UNKNOWN"
    assert result.platform == "UNKNOWN"


# ── Platform breadth (V2 §18 - every supported platform detects) ───────

@pytest.mark.parametrize(
    ("text", "platform"),
    [
        ("MetaTrader 5 market watch toolbox", "MT5"),
        ("MetaTrader 4 terminal quotes", "MT4"),
        ("cTrader Spotware platform", "CTRADER"),
        ("NinjaTrader control center", "NINJATRADER"),
        ("Interactive Brokers Trader Workstation", "INTERACTIVE_BROKERS"),
        ("IBKR account window", "INTERACTIVE_BROKERS"),
        ("Deriv DTrader dashboard", "DERIV"),
        ("TradingView pine editor", "TRADINGVIEW"),
    ],
)
def test_platform_detection_breadth(text, platform):
    assert detect_platform(text)[0] == platform


def test_platform_unknown_below_threshold_is_explicit():
    name, confidence = detect_platform("buy 0.5 EURUSD profit")
    assert name == "UNKNOWN"
    assert confidence < 0.2


# ── Screenshot-type breadth (V2 §19) ──────────────────────────────

@pytest.mark.parametrize(
    ("text", "type"),
    [
        ("balance equity margin free margin deposit withdrawal", "ACCOUNT_SUMMARY"),
        ("open positions symbol volume swap", "OPEN_POSITION"),
        ("new order market execution volume price", "ORDER"),
        ("chart candles m5 timeframe", "CHART"),
        ("buy 0.15 XAUUSD S/L T/P Profit", "TRADE_DETAIL"),
        ("account history deals buy sell", "TRADE_HISTORY"),
    ],
)
def test_screenshot_type_breadth(text, type):
    detected, confidence = detect_screenshot_type(text, "MT5")
    assert detected == type
    assert confidence >= 0.2


def test_screenshot_type_never_guesses_below_threshold():
    detected, _confidence = detect_screenshot_type("window title bar file edit", "UNKNOWN")
    assert detected == "UNKNOWN"


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


def test_extract_fields_exit_price_with_explicit_label():
    """V2 §11 - an explicit "Exit price" label yields exitPrice, and the
    bare word "close" in a history row still extracts nothing (it is an
    order type there, never a price label)."""
    image, _, _ = render_mt5_with_exit_price()
    from PIL import Image
    import io

    with Image.open(io.BytesIO(image)) as img:
        lines = run_ocr(img, "eng")
    fields = {f.field: f for f in extract_fields(lines)}
    assert "exitPrice" in fields
    assert fields["exitPrice"].normalizedValue == "2353.85"


def test_line_region_bounds():
    words = [
        OcrWord(text="buy", x=10, y=20, w=40, h=16, confidence=90),
        OcrWord(text="0.15", x=60, y=20, w=50, h=16, confidence=85),
    ]
    line = OcrLine(words=words)
    region = line.region
    assert region.x == 10 and region.y == 20
    assert region.width == 100 and region.height == 16
