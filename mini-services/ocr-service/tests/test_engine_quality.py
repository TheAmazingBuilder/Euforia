"""Engine-quality phase tests: preprocessing (dHash/CLAHE/deskew/Otsu),
layout templates, dual-pass arbitration, multi-trade candidates, and the
/v1/recrops endpoint. Deterministic on a fixed Tesseract version.
"""

from __future__ import annotations

import os
import sys

import numpy as np
import pytest
from PIL import Image
import io

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
os.environ.setdefault("OCR_SERVICE_TOKEN", "test-internal-token-0123456789abcdef")

from app.preprocessing import binarize, clahe_equalize, dhash, estimate_skew, otsu_threshold, upscale
from app.templates import (
    GENERIC,
    MT5_DESKTOP_HISTORY,
    MT5_MOBILE_SUMMARY,
    choose_template,
    trailing_profit_value,
)
from app.extraction import extract_fields, extract_trade_candidates, run_ocr
from app.arbitration import (
    PASS_AGREEMENT,
    PASS_DISAGREEMENT,
    arbitrate_fields,
)
from app.contract import EngineField

from fastapi.testclient import TestClient

from app.main import app
from conftest import TOKEN, render_mt5_history_multi, render_mt5_screenshot, render_tradingview_chart, to_request

client = TestClient(app)


def _headers(token: str = TOKEN) -> dict:
    return {"x-internal-token": token}


# ── Preprocessing ────────────────────────────────────────────────────────────

def test_otsu_threshold_separates_ink_from_paper():
    img = Image.new("L", (100, 100), 240)
    for x in range(20, 80):
        for y in range(40, 60):
            img.putpixel((x, y), 30)
    arr = np.asarray(img, dtype=np.uint8)
    threshold = otsu_threshold(arr)
    assert 30 <= threshold <= 240
    binary = np.asarray(binarize(img), dtype=np.uint8)
    assert set(np.unique(binary)) == {0, 255}


def test_dhash_stable_under_recompression_and_sensitive_to_content():
    image, _, _ = render_mt5_screenshot()
    with Image.open(io.BytesIO(image)) as img:
        gray = img.convert("L")
        baseline = dhash(gray)
        # Recompress at a different quality — perceptually the same image.
        buffer = io.BytesIO()
        gray.save(buffer, format="JPEG", quality=55)
        with Image.open(io.BytesIO(buffer.getvalue())) as recompressed:
            recompressed_hash = dhash(recompressed.convert("L"))
    assert len(baseline) == 16
    assert baseline == recompressed_hash

    # A genuinely different image must produce a different fingerprint.
    with Image.open(io.BytesIO(render_tradingview_bytes())) as other:
        assert dhash(other.convert("L")) != baseline


def render_tradingview_bytes() -> bytes:
    return render_tradingview_chart()[0]


def test_clahe_output_shape_and_range():
    image, _, _ = render_mt5_screenshot()
    with Image.open(io.BytesIO(image)) as img:
        gray = img.convert("L")
        equalized = clahe_equalize(gray)
    # CLAHE crops the working copy to the 8×8 tile grid (documented).
    assert equalized.size == ((gray.width // 8) * 8, (gray.height // 8) * 8)
    arr = np.asarray(equalized, dtype=np.uint8)
    assert arr.min() >= 0 and arr.max() <= 255


def test_deskew_estimates_a_known_rotation():
    image, _, _ = render_mt5_screenshot()
    with Image.open(io.BytesIO(image)) as img:
        gray = img.convert("L")
        rotated = gray.rotate(2.0, resample=Image.Resampling.BILINEAR, fillcolor=255)
        estimated = estimate_skew(rotated)
    # The value is the CORRECTION angle (applied back with PIL.rotate); the
    # search grid is 0.5° — magnitude must land within one step.
    assert abs(abs(estimated) - 2.0) <= 0.75


def test_deskew_leaves_straight_images_alone():
    image, _, _ = render_mt5_screenshot()
    with Image.open(io.BytesIO(image)) as img:
        assert estimate_skew(img.convert("L")) == 0.0


def test_upscale_doubles_and_respects_budget():
    image, _, _ = render_mt5_screenshot()
    with Image.open(io.BytesIO(image)) as img:
        gray = img.convert("L")
        scaled, scale = upscale(gray, 24_000_000)
    assert scale >= 2
    assert scaled.width >= gray.width * 2
    # Tiny budget → scale degrades but never explodes.
    with Image.open(io.BytesIO(image)) as img:
        _, small_scale = upscale(img.convert("L"), 1_500_000)
    assert small_scale < scale


# ── Layout templates ─────────────────────────────────────────────────────────

def test_template_selection_by_classification_and_geometry():
    assert choose_template("MT5_TRADE", 1400, 480).name == MT5_DESKTOP_HISTORY
    assert choose_template("MT5_TRADE", 600, 800).name == MT5_MOBILE_SUMMARY
    assert choose_template("TRADINGVIEW_CHART", 1400, 480).name == GENERIC
    assert choose_template(None, 1400, 480).name == GENERIC


def test_trailing_profit_requires_explicit_sign():
    from app.extraction_types import OcrLine, OcrWord

    def word(text: str) -> OcrWord:
        return OcrWord(text=text, x=0, y=0, w=10, h=10, confidence=90.0)

    signed = OcrLine(words=[word("buy"), word("0.15"), word("+123.75")])
    unsigned = OcrLine(words=[word("buy"), word("0.15"), word("123.75")])
    assert trailing_profit_value(signed) is not None
    assert trailing_profit_value(unsigned) is None


# ── Multi-trade candidates ───────────────────────────────────────────────────

def test_multi_trade_candidates_from_history_fixture():
    image, _, _ = render_mt5_history_multi()
    with Image.open(io.BytesIO(image)) as img:
        lines = run_ocr(img, "eng")
    candidates = extract_trade_candidates(lines)
    assert len(candidates) == 3
    for group in candidates:
        keys = {f.field for f in group}
        assert {"direction", "symbol"}.issubset(keys)
        assert len(keys) >= 3
    symbols = [{f.normalizedValue for f in group if f.field == "symbol"} for group in candidates]
    assert {"EURUSD"} in symbols and {"XAUUSD"} in symbols and {"GBPUSD"} in symbols


def test_mono_trade_screenshot_has_no_candidates():
    image, _, _ = render_mt5_screenshot()
    with Image.open(io.BytesIO(image)) as img:
        lines = run_ocr(img, "eng")
    # The fixture has ONE order row → the mono-trade path stays authoritative.
    assert extract_trade_candidates(lines) == []


# ── Arbitration ──────────────────────────────────────────────────────────────

def _field(key: str, value: str | None, confidence: float) -> EngineField:
    return EngineField(field=key, rawValue=value, normalizedValue=value, confidence=confidence, sourceRegion=None, notes=[])


def test_arbitration_agreement_boosts_confidence():
    merged, _ = arbitrate_fields([_field("volume", "0.15", 0.80)], [_field("volume", "0.15", 0.70)])
    assert merged[0].confidence > 0.80
    assert PASS_AGREEMENT in merged[0].notes


def test_arbitration_disagreement_keeps_higher_and_records():
    merged, _ = arbitrate_fields([_field("symbol", "XAUUSD", 0.82)], [_field("symbol", "XAUUSO", 0.40)])
    assert merged[0].normalizedValue == "XAUUSD"
    assert any(note.startswith(PASS_DISAGREEMENT) for note in merged[0].notes)


def test_arbitration_challenger_rescues_missed_field():
    merged, _ = arbitrate_fields([], [_field("profit", "123.75", 0.66)])
    assert merged[0].field == "profit"
    assert "SECOND_PASS_ONLY" in merged[0].notes


# ── /v1/recrops (targeted re-OCR) ────────────────────────────────────────────

def test_recrops_requires_crop():
    image, width, height = render_mt5_screenshot()
    request = to_request(image, width, height, "req-crop-missing")
    response = client.post("/v1/recrops", json=request, headers=_headers())
    assert response.status_code == 400


def test_recrops_reads_a_region():
    image, width, height = render_mt5_screenshot()
    request = to_request(image, width, height, "req-crop")
    # The order row sits in the middle band of the fixture.
    request["crop"] = {"x": 0, "y": 100, "width": width, "height": 140}
    response = client.post("/v1/recrops", json=request, headers=_headers())
    assert response.status_code == 200
    body = response.json()
    if body["processingStatus"] == "COMPLETED":
        keys = {f["field"] for f in body["fields"]}
        assert "openTime" in keys or "entryPrice" in keys or "direction" in keys


def test_recognize_reports_perceptual_hash_and_passes():
    image, width, height = render_mt5_screenshot()
    response = client.post(
        "/v1/recognitions", json=to_request(image, width, height, "req-phash"), headers=_headers()
    )
    body = response.json()
    assert body["perceptualHash"] is not None
    assert len(body["perceptualHash"]) == 16
    assert "block_psm6" in body["processingMetadata"]["passes"]
    assert body["processingMetadata"]["layoutTemplate"] == MT5_DESKTOP_HISTORY
