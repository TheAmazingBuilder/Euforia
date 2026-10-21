"""Account & Chart profile tests (Recognition V1.1).

Unit level: the ACCOUNT_POSITION and CHART_ANALYSIS extractors over
OcrLine fixtures (no OCR — fast, fully deterministic). API level: both
profiles through the FastAPI pipeline on rendered screenshots (real
Tesseract), asserting the wire contract (field vocabulary, candidates,
classification) and the TRADE path staying untouched.
"""

from __future__ import annotations

import os
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
os.environ.setdefault("OCR_SERVICE_TOKEN", "test-internal-token-0123456789abcdef")

import pytest
from fastapi.testclient import TestClient

from app.account_extraction import extract_account_fields
from app.chart_extraction import extract_chart_fields
from app.extraction_types import OcrLine, OcrWord
from app.main import app

from conftest import (
    TOKEN,
    render_chart_legend,
    render_mt5_account_summary,
    to_request,
    to_request_profile,
)

client = TestClient(app)


def _headers(token: str = TOKEN) -> dict:
    return {"x-internal-token": token}


def _line(*texts: str, conf: float = 95.0) -> OcrLine:
    return OcrLine(words=[OcrWord(text=t, x=10 * i, y=10, w=40, h=20, confidence=conf) for i, t in enumerate(texts)])


def _values(fields) -> dict:
    return {f.field: f.normalizedValue for f in fields}


# ── Account extractor (unit) ────────────────────────────────────────────────

def test_account_header_labeled_values():
    lines = [
        _line("Login", "5102083990"),
        _line("Server", "MetaQuotes-Demo"),
        _line("Currency", "USD"),
        _line("Leverage", "1:500"),
        _line("Balance", "10420.50"),
        _line("Equity", "10653.40"),
        _line("Margin", "421.10"),
        _line("Free", "Margin", "10232.30"),
        _line("Margin", "Level", "2529.60"),
    ]
    values = _values(extract_account_fields(lines))
    assert values["accountLogin"] == "5102083990"
    assert values["accountServer"] == "MetaQuotes-Demo"
    assert values["accountCurrency"] == "USD"
    assert values["accountLeverage"] == "1:500"
    # Canonical decimal form — trailing zeros stripped by house normalization.
    assert values["accountBalance"] == "10420.5"
    assert values["accountEquity"] == "10653.4"
    assert values["accountMargin"] == "421.1"
    assert values["accountFreeMargin"] == "10232.3"
    assert values["accountMarginLevel"] == "2529.6"


def test_account_margin_specificity_priority():
    """Free Margin / Margin Level are never swallowed by the bare Margin label."""
    lines = [
        _line("Free", "Margin", "10232.30"),
        _line("Margin", "Level", "2529.60"),
        _line("Margin", "421.10"),
    ]
    values = _values(extract_account_fields(lines))
    assert values["accountFreeMargin"] == "10232.3"
    assert values["accountMarginLevel"] == "2529.6"
    assert values["accountMargin"] == "421.1"


def test_account_no_label_no_value():
    """Unlabeled numbers are never claimed (§20 — labeled evidence only)."""
    lines = [_line("some", "10420.50", "random", "1:500")]
    assert extract_account_fields(lines) == []


# ── Chart extractor (unit) ──────────────────────────────────────────────────

def test_chart_legend_ohlc_and_symbol():
    lines = [
        _line("XAUUSD", "15", "O2345.6", "H2350.1", "L2340.2", "C2348.9"),
    ]
    values = _values(extract_chart_fields(lines))
    assert values["symbol"] == "XAUUSD"
    assert values["chartTimeframe"] == "M15"
    assert values["chartOpen"] == "2345.6"
    assert values["chartHigh"] == "2350.1"
    assert values["chartLow"] == "2340.2"
    assert values["chartClose"] == "2348.9"
    # chartPrice derives from the close with explicit provenance.
    assert values["chartPrice"] == "2348.9"


def test_chart_price_from_close_note():
    fields = {f.field: f for f in extract_chart_fields([_line("XAUUSD", "15", "O2345.6", "C2348.9")])}
    assert "PRICE_FROM_CLOSE" in fields["chartPrice"].notes


def test_chart_timeframe_dialects():
    cases = [
        (_line("XAUUSD", "60", "O2", "C3"), "H1"),
        (_line("XAUUSD", "H4", "O2", "C3"), "H4"),
        (_line("XAUUSD", "1h", "O2", "C3"), "H1"),
        (_line("XAUUSD", "Daily", "O2", "C3"), "D1"),
    ]
    for line, expected in cases:
        values = _values(extract_chart_fields([line]))
        assert values["chartTimeframe"] == expected, line.words


def test_chart_indicator_readings_skip_parameter_group():
    lines = [
        _line("RSI", "(14)", "62.35"),
        _line("MACD", "(12", "26", "close", "9)", "-0.15"),
        _line("EMA", "(50)", "2330.15"),
    ]
    values = _values(extract_chart_fields(lines))
    assert values["chartRsi"] == "62.35"
    assert values["chartMacd"] == "-0.15"
    assert values["chartMa"] == "2330.15"


def test_chart_explicit_price_label_beats_derived_close():
    lines = [
        _line("XAUUSD", "15", "C2348.9"),
        _line("Bid", "2350.00"),
    ]
    values = _values(extract_chart_fields(lines))
    assert values["chartPrice"] == "2350.0"


# ── API level — ACCOUNT_POSITION through the real pipeline ─────────────────

def test_api_account_profile_end_to_end():
    image, width, height = render_mt5_account_summary()
    response = client.post(
        "/v1/recognitions", json=to_request_profile(image, width, height, "ACCOUNT_POSITION"), headers=_headers()
    )
    assert response.status_code == 200
    body = response.json()
    assert body["processingStatus"] == "COMPLETED"
    keys = {f["field"] for f in body["fields"]}
    assert "accountBalance" in keys
    assert "accountEquity" in keys
    assert "accountCurrency" in keys
    by_key = {f["field"]: f for f in body["fields"]}
    assert by_key["accountBalance"]["normalizedValue"] is not None
    assert body["classification"]["platform"] == "MT5"
    # Open positions arrive as grouped candidates (evidence, not trades).
    assert len(body["tradeCandidates"]) >= 1


def test_api_chart_profile_end_to_end():
    image, width, height = render_chart_legend()
    response = client.post(
        "/v1/recognitions", json=to_request_profile(image, width, height, "CHART_ANALYSIS"), headers=_headers()
    )
    assert response.status_code == 200
    body = response.json()
    assert body["processingStatus"] == "COMPLETED"
    keys = {f["field"] for f in body["fields"]}
    assert "chartClose" in keys
    assert "chartRsi" in keys
    by_key = {f["field"]: f for f in body["fields"]}
    assert by_key["chartClose"]["normalizedValue"] is not None
    assert by_key["chartRsi"]["normalizedValue"] is not None


def test_api_trade_profile_unchanged_by_expansion():
    """The TRADE_SUMMARY path keeps its exact behavior (no regression)."""
    from conftest import render_mt5_screenshot

    image, width, height = render_mt5_screenshot()
    response = client.post(
        "/v1/recognitions", json=to_request(image, width, height), headers=_headers()
    )
    assert response.status_code == 200
    body = response.json()
    assert body["processingStatus"] == "COMPLETED"
    keys = {f["field"] for f in body["fields"]}
    assert "symbol" in keys and "entryPrice" in keys
    assert not any(key.startswith("account") or key.startswith("chart") for key in keys)


def test_api_profile_pdf_honest_warning():
    """A non-trade profile on a PDF states the honest limitation."""
    from conftest import render_mt5_pdf

    image, width, height = render_mt5_pdf()
    response = client.post(
        "/v1/recognitions",
        json={
            **to_request_profile(image, width, height, "ACCOUNT_POSITION"),
            "metadata": {**to_request(image, width, height)["metadata"], "mime": "application/pdf"},
        },
        headers=_headers(),
    )
    assert response.status_code == 200
    body = response.json()
    assert body["processingStatus"] == "COMPLETED"
    assert "PROFILE_PDF_TRADE_ONLY" in body["warnings"]
