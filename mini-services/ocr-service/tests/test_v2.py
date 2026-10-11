"""OCR V2 sidecar tests — preprocessing, pHash, multi-trade, crop, PDF.

Extends the V1 suite (kept untouched and green): every V1 behavior test in
test_api.py / test_pipeline.py must keep passing — the V2 additions are
strictly additive and coordinate-correct.
"""

from __future__ import annotations

import base64
import io

import pytest
from PIL import Image, ImageDraw

from conftest import TOKEN, render_mt5_screenshot, to_request
from app.document import DocumentRejected, is_pdf, render_pages
from app.phash import dhash_hex, hamming_distance
from app.preprocessing import enhance

# ── pHash (V2 duplicate detection) ──────────────────────────────────────────


def test_dhash_is_stable_and_well_formed():
    png, _w, _h = render_mt5_screenshot()
    first = dhash_hex(png)
    second = dhash_hex(png)
    assert first is not None
    assert len(first) == 16
    assert int(first, 16) >= 0
    assert first == second  # deterministic


def test_dhash_distinguishes_different_images():
    png_a, _w, _h = render_mt5_screenshot()
    img = Image.new("RGB", (600, 300), (255, 255, 255))
    draw = ImageDraw.Draw(img)
    draw.ellipse((50, 50, 550, 250), fill=(0, 0, 0))
    buffer = io.BytesIO()
    img.save(buffer, format="PNG")
    png_b = buffer.getvalue()
    hash_a = dhash_hex(png_a)
    hash_b = dhash_hex(png_b)
    assert hash_a is not None and hash_b is not None
    assert hash_a != hash_b


def test_dhash_rejects_garbage_gracefully():
    assert dhash_hex(b"not an image at all") is None
    assert dhash_hex(b"") is None


def test_hamming_distance():
    assert hamming_distance("0000000000000000", "0000000000000000") == 0
    assert hamming_distance("0000000000000000", "ffffffffffffffff") == 64
    assert hamming_distance("0f0f0f0f0f0f0f0f", "0f0f0f0f0f0f0f0f") == 0
    assert hamming_distance("0000000000000000", "8000000000000000") == 1
    assert hamming_distance("zzzz", "0000000000000000") == 64  # malformed → max


def test_dhash_survives_png_reencode():
    """A re-encoded (same pixels) screenshot must hash identically or
    within a tiny distance — the whole point of the duplicate warning."""
    png, _w, _h = render_mt5_screenshot()
    with Image.open(io.BytesIO(png)) as img:
        rebuffer = io.BytesIO()
        img.save(rebuffer, format="PNG", optimize=True)
        reencoded = rebuffer.getvalue()
    distance = hamming_distance(dhash_hex(png), dhash_hex(reencoded))
    assert distance <= 2


# ── Preprocessing (V2 quality) ──────────────────────────────────────────────


def test_enhance_reports_opencv_path_and_upscale():
    png, w, _h = render_mt5_screenshot()
    with Image.open(io.BytesIO(png)) as img:
        gray = img.convert("L")
    enhanced, meta = enhance(gray)
    assert meta.engine == "opencv+pillow"
    assert enhanced.width >= meta.upscaleScale  # always ≥ original scale 1
    assert meta.upscaleScale >= 1
    assert meta.clahe is True
    assert meta.denoised is True
    assert abs(meta.deskewAngle) <= 10.0


def test_enhance_small_image_upscales_to_target():
    img = Image.new("L", (300, 150), 250)
    enhanced, meta = enhance(img)
    assert enhanced.width >= 900  # 300 * 3 (capped)
    assert meta.upscaleScale == 3


def test_enhance_flat_image_never_crashes():
    img = Image.new("L", (200, 200), 128)
    enhanced, meta = enhance(img)
    assert enhanced.size[0] > 0
    assert meta.deskewAngle == 0.0  # no text → no rotation


# ── Document (PDF) rendering ────────────────────────────────────────────────


def _tiny_pdf(page_count: int, text: str) -> bytes:
    fitz = pytest.importorskip("fitz")
    doc = fitz.open()
    for _ in range(page_count):
        page = doc.new_page(width=595, height=842)
        page.insert_text((72, 100), text, fontsize=14)
    buffer = doc.tobytes(deflate=True)
    doc.close()
    return buffer


def test_is_pdf_sniffing():
    assert is_pdf(b"%PDF-1.7 whatever")
    assert not is_pdf(b"\x89PNG....")


def test_render_pages_honors_page_ceiling():
    pdf = _tiny_pdf(3, "2026.01.05 09:30:00 buy 0.15 XAUUSD 2345.60")
    pages = render_pages(pdf, max_pixels_per_page=40_000_000)
    assert [p.index for p in pages] == [0, 1, 2]
    assert all(p.png.startswith(b"\x89PNG") for p in pages)


def test_render_pages_rejects_corrupt_document():
    with pytest.raises(DocumentRejected):
        render_pages(b"%PDF-1.7 broken", max_pixels_per_page=40_000_000)


def test_render_pages_rejects_huge_page_count():
    pdf = _tiny_pdf(3, "x")
    import app.document as document_module

    original = document_module.MAX_PAGES
    document_module.MAX_PAGES = 2
    try:
        with pytest.raises(DocumentRejected):
            render_pages(pdf, max_pixels_per_page=40_000_000)
    finally:
        document_module.MAX_PAGES = original


# ── Multi-trade extraction (row clustering) ────────────────────────────────


def _render_history_panel() -> tuple[bytes, int, int]:
    """Two trade rows — the multi-trade fixture (light theme)."""
    width, height = 1150, 460
    img = Image.new("RGB", (width, height), (248, 249, 251))
    draw = ImageDraw.Draw(img)
    draw.text((24, 16), "MetaTrader 5", font=__import__("conftest", fromlist=["_font"])._font(30), fill=(24, 26, 32))
    small = __import__("conftest", fromlist=["_font"])._font(26)
    rows = [
        "2026.01.05 09:30:00 buy 0.15 XAUUSD 2345.60",
        "S/L 2335.60  T/P 2365.60  Profit 123.75",
        "2026.01.05 11:30:00 sell 0.25 EURUSD 10450.20",
        "S/L 10460.20  T/P 10430.20  Profit -52.10",
    ]
    y = 120
    for row in rows:
        draw.text((24, y), row, font=small, fill=(24, 26, 32))
        y += 64
    buffer = io.BytesIO()
    img.save(buffer, format="PNG")
    return buffer.getvalue(), width, height


def test_extract_trades_single_direction_line_keeps_v1_path():
    from app.extraction import OcrLine, OcrWord, extract_trades

    # One direction line only → the V1 global extraction must be used.
    line = OcrLine(words=[OcrWord(text="buy", x=0, y=0, w=30, h=20, confidence=90.0)])
    trades = extract_trades([line])
    assert len(trades) == 1
    assert trades[0].pageIndex == 0


def test_recognize_multi_trade_endpoint():
    from fastapi.testclient import TestClient

    from app import main as app_module

    png, width, height = _render_history_panel()
    request = to_request(png, width, height, request_id="req-multi")
    with TestClient(app_module.app) as client:
        response = client.post(
            "/v1/recognitions",
            json=request,
            headers={"x-internal-token": TOKEN},
        )
    assert response.status_code == 200
    body = response.json()
    assert body["processingStatus"] == "COMPLETED"
    assert body["perceptualHash"] is not None
    assert len(body["perceptualHash"]) == 16
    trades = body["trades"]
    assert trades is not None and len(trades) == 2, f"expected 2 trades, got {len(trades or [])}"
    first = {f["field"]: f for f in trades[0]["fields"]}
    second = {f["field"]: f for f in trades[1]["fields"]}
    assert first["direction"]["normalizedValue"] == "BUY"
    assert first["symbol"]["normalizedValue"] == "XAUUSD"
    assert first["volume"]["normalizedValue"] == "0.15"
    assert second["direction"]["normalizedValue"] == "SELL"
    assert second["symbol"]["normalizedValue"] == "EURUSD"
    assert second["volume"]["normalizedValue"] == "0.25"
    # flat fields stay populated (back-compat with the V1 contract) —
    # they mirror the primary trade.
    flat = {f["field"] for f in body["fields"]}
    assert "symbol" in flat and "direction" in flat


# ── Crop re-OCR (region offset correctness) ────────────────────────────────


def test_recognize_with_crop_reports_offset_regions():
    from fastapi.testclient import TestClient

    from app import main as app_module

    png, width, height = render_mt5_screenshot()
    request = to_request(png, width, height, request_id="req-crop")
    request["cropRegion"] = {"x": 0, "y": 100, "width": width, "height": 220}
    with TestClient(app_module.app) as client:
        response = client.post(
            "/v1/recognitions",
            json=request,
            headers={"x-internal-token": TOKEN},
        )
    assert response.status_code == 200
    body = response.json()
    assert body["processingStatus"] == "COMPLETED"
    for field in body["fields"]:
        region = field.get("sourceRegion")
        if region is not None:
            # every region must sit inside the requested band (y offset 100)
            assert region["y"] >= 100
            assert region["y"] < 100 + 220


def test_recognize_degenerate_crop_is_unprocessable():
    from fastapi.testclient import TestClient

    from app import main as app_module

    png, width, height = render_mt5_screenshot()
    request = to_request(png, width, height, request_id="req-crop-bad")
    request["cropRegion"] = {"x": width + 10, "y": 0, "width": 40, "height": 40}
    with TestClient(app_module.app) as client:
        response = client.post(
            "/v1/recognitions",
            json=request,
            headers={"x-internal-token": TOKEN},
        )
    assert response.status_code == 200
    body = response.json()
    assert body["processingStatus"] == "UNPROCESSABLE"
    assert body["failure"]["category"] == "RESOURCE_LIMIT"


# ── Document endpoint (PDF through the API) ────────────────────────────────


def test_document_endpoint_extracts_trades_per_page():
    from fastapi.testclient import TestClient

    from app import main as app_module

    pdf = _tiny_pdf(2, "2026.01.05 09:30:00 buy 0.15 XAUUSD 2345.60 Profit 123.75")
    request = {
        "requestId": "req-doc",
        "contractVersion": "1",
        "documentBase64": base64.b64encode(pdf).decode("ascii"),
        "metadata": {
            "mime": "application/pdf",
            "sizeBytes": len(pdf),
            "checksumSha256": "0" * 64,
            "pageCount": 2,
        },
        "extractionProfile": "TRADE_SUMMARY",
        "deadlineMs": 60_000,
    }
    with TestClient(app_module.app) as client:
        response = client.post(
            "/v1/recognitions/document",
            json=request,
            headers={"x-internal-token": TOKEN},
        )
    assert response.status_code == 200
    body = response.json()
    assert body["processingStatus"] == "COMPLETED"
    assert len(body["pages"]) == 2
    assert body["perceptualHash"] is not None
    page_one_trades = body["pages"][0]["trades"]
    assert len(page_one_trades) == 1
    fields = {f["field"]: f for f in page_one_trades[0]["fields"]}
    assert fields["direction"]["normalizedValue"] == "BUY"
    assert fields["symbol"]["normalizedValue"] == "XAUUSD"


def test_document_endpoint_rejects_non_pdf():
    from fastapi.testclient import TestClient

    from app import main as app_module

    png, _w, _h = render_mt5_screenshot()
    request = {
        "requestId": "req-doc-bad",
        "contractVersion": "1",
        "documentBase64": base64.b64encode(png).decode("ascii"),
        "metadata": {"mime": "application/pdf", "sizeBytes": len(png), "checksumSha256": "0" * 64},
        "extractionProfile": "TRADE_SUMMARY",
        "deadlineMs": 60_000,
    }
    with TestClient(app_module.app) as client:
        response = client.post(
            "/v1/recognitions/document",
            json=request,
            headers={"x-internal-token": TOKEN},
        )
    assert response.status_code == 200
    body = response.json()
    assert body["processingStatus"] == "UNPROCESSABLE"
    assert body["failure"]["category"] == "SCREENSHOT_UNSUPPORTED"
