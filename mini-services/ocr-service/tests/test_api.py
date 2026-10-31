"""OCR sidecar API tests (Phase 19 §52/§53): auth, contract, failure paths,
resource guards - via the FastAPI TestClient (no network)."""

from __future__ import annotations

import base64
import os
import sys

import pytest
from fastapi.testclient import TestClient

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
os.environ["OCR_SERVICE_TOKEN"] = "test-internal-token-0123456789abcdef"

from app.main import app  # noqa: E402  (env must be set before import)

from conftest import (  # noqa: E402
    TOKEN,
    render_blank,
    render_mt5_screenshot,
    to_request,
)

client = TestClient(app)


def _headers(token: str = TOKEN) -> dict:
    return {"x-internal-token": token}


# ── V2 §20 - declared checksum is verified, not assumed ─────────────────

def test_checksum_mismatch_is_validation_failure():
    image, width, height = render_mt5_screenshot()
    request = to_request(image, width, height)
    request["metadata"]["checksumSha256"] = "f" * 64
    response = client.post("/v1/recognitions", json=request, headers=_headers())
    assert response.status_code == 200
    body = response.json()
    assert body["processingStatus"] == "UNPROCESSABLE"
    # A transport corruption is a VALIDATION failure - not a bad image.
    assert body["failure"]["category"] == "VALIDATION_FAILED"


# ── Auth (§27) ───────────────────────────────────────────────────────────────

def test_healthz_is_public():
    response = client.get("/healthz")
    assert response.status_code == 200
    body = response.json()
    assert body["status"] == "ok"


def test_recognition_requires_token():
    image, width, height = render_mt5_screenshot()
    response = client.post("/v1/recognitions", json=to_request(image, width, height))
    assert response.status_code == 401


def test_recognition_rejects_wrong_token():
    image, width, height = render_mt5_screenshot()
    response = client.post(
        "/v1/recognitions",
        json=to_request(image, width, height),
        headers=_headers("wrong-token-wrong-token-wrong-token-123"),
    )
    assert response.status_code == 401


# ── Contract discipline ──────────────────────────────────────────────────────

def test_wrong_contract_version_is_400():
    image, width, height = render_mt5_screenshot()
    request = to_request(image, width, height)
    request["contractVersion"] = "9"
    response = client.post("/v1/recognitions", json=request, headers=_headers())
    assert response.status_code == 400


def test_malformed_base64_is_400():
    request = to_request(b"0" * 64, 10, 10)
    request["imageBase64"] = "not-base64-payload-!!!-still-invalid"
    response = client.post("/v1/recognitions", json=request, headers=_headers())
    assert response.status_code == 400


def test_unknown_fields_are_stripped():
    image, width, height = render_mt5_screenshot()
    request = to_request(image, width, height)
    request["injectedField"] = {"evil": True}
    request["metadata"]["extra"] = "x"
    response = client.post("/v1/recognitions", json=request, headers=_headers())
    assert response.status_code == 200


# ── Happy path on the deterministic fixture ──────────────────────────────────

def test_recognize_mt5_screenshot():
    image, width, height = render_mt5_screenshot()
    response = client.post(
        "/v1/recognitions", json=to_request(image, width, height, "req-mt5"), headers=_headers()
    )
    assert response.status_code == 200
    body = response.json()

    assert body["requestId"] == "req-mt5"
    assert body["contractVersion"] == "1"
    assert body["processingStatus"] == "COMPLETED"
    assert body["failure"] is None
    # V2 §18/§19 - platform + fine-grained type (the fixture is a history
    # panel; the legacy MT5_TRADE value stays reserved for old rows).
    assert body["classification"]["platform"] == "MT5"
    assert body["classification"]["type"] == "TRADE_HISTORY"

    fields = {f["field"]: f for f in body["fields"]}
    assert fields["symbol"]["normalizedValue"] == "XAUUSD"
    assert fields["direction"]["normalizedValue"] == "BUY"
    assert fields["volume"]["normalizedValue"] == "0.15"
    assert fields["entryPrice"]["normalizedValue"] == "2345.6"
    assert fields["stopLoss"]["normalizedValue"] == "2335.6"
    assert fields["takeProfit"]["normalizedValue"] == "2365.6"
    assert fields["profit"]["normalizedValue"] == "123.75"
    assert fields["openTime"]["normalizedValue"] == "2026-01-05T09:30:00"
    # LAYOUT_MATCH (engine-quality phase) may join - additive notes only.
    assert "TIMEZONE_UNKNOWN" in fields["openTime"]["notes"]

    # Confidence model (§17): numeric 0..1 everywhere.
    for field in body["fields"]:
        assert 0.0 <= field["confidence"] <= 1.0

    # Engine metadata (§33).
    meta = body["processingMetadata"]
    assert meta["engine"] == "fastapi-tesseract"
    assert meta["engineVersion"] != "unknown"
    assert meta["durationsMs"]["totalMs"] >= 0


def test_recognize_determinism():
    """Same input → byte-identical field values (deterministic pipeline)."""
    image, width, height = render_mt5_screenshot()
    first = client.post("/v1/recognitions", json=to_request(image, width, height), headers=_headers()).json()
    second = client.post("/v1/recognitions", json=to_request(image, width, height), headers=_headers()).json()
    assert first["fields"] == second["fields"]
    assert first["classification"] == second["classification"]


# ── Failure paths (§34/§35) ──────────────────────────────────────────────────

def test_blank_image_is_unprocessable():
    image, width, height = render_blank()
    response = client.post("/v1/recognitions", json=to_request(image, width, height), headers=_headers())
    assert response.status_code == 200
    body = response.json()
    assert body["processingStatus"] == "UNPROCESSABLE"
    assert body["failure"]["category"] == "SCREENSHOT_UNSUPPORTED"
    assert body["fields"] == []


def test_mime_mismatch_is_unprocessable():
    image, width, height = render_mt5_screenshot()
    request = to_request(image, width, height)
    request["metadata"]["mime"] = "image/jpeg"
    response = client.post("/v1/recognitions", json=request, headers=_headers())
    assert response.status_code == 200
    body = response.json()
    assert body["processingStatus"] == "UNPROCESSABLE"
    assert "does not match" in body["failure"]["message"]


def test_dimension_mismatch_is_unprocessable():
    image, width, height = render_mt5_screenshot()
    request = to_request(image, width, height)
    request["metadata"]["width"] = width + 1
    response = client.post("/v1/recognitions", json=request, headers=_headers())
    assert response.status_code == 200
    body = response.json()
    assert body["processingStatus"] == "UNPROCESSABLE"


def test_corrupted_image_is_unprocessable():
    image, width, height = render_mt5_screenshot()
    corrupted = bytearray(image)
    # Corrupt INSIDE the IDAT payload (≈1/3 into the file), not the IEND
    # trailer - this breaks the zlib stream / chunk CRC that verify() checks.
    offset = len(corrupted) // 3
    for i in range(8):
        corrupted[offset + i] = (corrupted[offset + i] + 37) % 256
    request = to_request(bytes(corrupted), width, height)
    response = client.post("/v1/recognitions", json=request, headers=_headers())
    assert response.status_code == 200
    body = response.json()
    assert body["processingStatus"] in ("UNPROCESSABLE", "FAILED")


def test_id_echo_prevents_stale_answers():
    """The sidecar echoes the requestId - the Nest side rejects mismatches."""
    image, width, height = render_mt5_screenshot()
    body = client.post(
        "/v1/recognitions", json=to_request(image, width, height, "req-echo"), headers=_headers()
    ).json()
    assert body["requestId"] == "req-echo"
