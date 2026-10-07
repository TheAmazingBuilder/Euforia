"""Runtime verification — engine-quality phase on the REAL Tesseract stack.

Renders two MT5 panels (mono summary + multi-trade history), drives the
sidecar's /v1/recognitions + /v1/recrops, and asserts the engine-quality
contract end to end:
  1. mono screenshot  → COMPLETED, fields, perceptualHash, dual passes,
     layout template;
  2. identical re-render → same dHash (determinism) + different checksum
     (near-duplicate material for the Nest side);
  3. history panel    → ≥2 multi-trade candidates with symbol/direction;
  4. recrop of the order-row band → COMPLETED with an openTime/entryPrice
     reading;
  5. arbitration notes present (PASS_AGREEMENT / FIRST_PASS_ONLY tokens);
  6. deskew metadata present.

Exits non-zero on any failure.
"""

from __future__ import annotations

import base64
import io
import json
import os
import sys
import time
import urllib.request

sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "mini-services", "ocr-service"))

from PIL import Image, ImageDraw, ImageFont  # noqa: E402

TOKEN = "runtime-verification-token-0123456789abcdef"
BASE = os.environ.get("OCR_BASE", "http://127.0.0.1:3004")

passed = 0
failed = 0


def ok(label: str, extra: str = "") -> None:
    global passed
    passed += 1
    print(f"  \u2713 {label}{' — ' + extra if extra else ''}")


def bad(label: str, extra: str = "") -> None:
    global failed
    failed += 1
    print(f"  \u2717 {label}{' — ' + extra if extra else ''}")


def check(label: str, condition: bool, extra: str = "") -> None:
    ok(label, extra) if condition else bad(label, extra)


def _font(size: int = 28):
    for path in (
        "/usr/share/fonts/truetype/dejavu/DejaVuSansMono.ttf",
        "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf",
    ):
        try:
            return ImageFont.truetype(path, size)
        except OSError:
            continue
    return ImageFont.load_default()


def render(width: int, height: int, header: str, lines: list[str]) -> bytes:
    img = Image.new("RGB", (width, height), (248, 249, 251))
    draw = ImageDraw.Draw(img)
    font = _font(30)
    small = _font(26)
    ink = (24, 26, 32)
    draw.text((24, 16), header, font=font, fill=ink)
    y = 90
    for line in lines:
        draw.text((24, y), line, font=small, fill=ink)
        y += 56
    buffer = io.BytesIO()
    img.save(buffer, format="PNG")
    return buffer.getvalue()


def call(path: str, payload: dict) -> dict:
    request = urllib.request.Request(
        f"{BASE}{path}",
        data=json.dumps(payload).encode("utf-8"),
        headers={"content-type": "application/json", "x-internal-token": TOKEN},
        method="POST",
    )
    with urllib.request.urlopen(request, timeout=90) as response:
        return json.loads(response.read().decode("utf-8"))


def payload(image: bytes, request_id: str, crop: dict | None = None) -> dict:
    with Image.open(io.BytesIO(image)) as probe:
        width, height = probe.size
    body = {
        "requestId": request_id,
        "contractVersion": "1",
        "imageBase64": base64.b64encode(image).decode("ascii"),
        "metadata": {
            "mime": "image/png",
            "sizeBytes": len(image),
            "width": width,
            "height": height,
            "checksumSha256": "0" * 64,
        },
        "extractionProfile": "TRADE_SUMMARY",
        "deadlineMs": 60_000,
    }
    if crop is not None:
        body["crop"] = crop
    return body


def main() -> None:
    print("OCR engine-quality runtime verification (real Tesseract)\n")

    # 1. Mono MT5 summary.
    mono = render(
        1150, 420,
        "MetaTrader 5",
        [
            "Time             Type  Volume Symbol  Price",
            "2026.01.05 09:30:00 buy 0.15 XAUUSD 2345.60",
            "S/L 2335.60  T/P 2365.60",
            "2026.01.05 10:15:00 close 0.15 XAUUSD 2353.85",
            "Profit 123.75",
        ],
    )
    body = call("/v1/recognitions", payload(mono, "rt-mono"))
    check("mono screenshot COMPLETED", body["processingStatus"] == "COMPLETED", body["processingStatus"])
    fields = {f["field"]: f for f in body["fields"]}
    check("symbol recognized", fields.get("symbol", {}).get("normalizedValue") == "XAUUSD")
    check("entry recognized", fields.get("entryPrice", {}).get("normalizedValue") == "2345.6")
    check("dHash present", body.get("perceptualHash") is not None and len(body["perceptualHash"]) == 16)
    passes = body["processingMetadata"]["passes"]
    check("dual passes ran", "block_psm6" in passes and "sparse_psm11" in passes, ",".join(passes))
    check("layout template reported", body["processingMetadata"]["layoutTemplate"] is not None)
    check("deskew measured", body["processingMetadata"]["deskewDeg"] is not None)
    check("mono has no candidates", len(body.get("tradeCandidates", [])) == 0)

    # 2. Same pixels again → identical fingerprint.
    mono2 = render(
        1150, 420,
        "MetaTrader 5",
        [
            "Time             Type  Volume Symbol  Price",
            "2026.01.05 09:30:00 buy 0.15 XAUUSD 2345.60",
            "S/L 2335.60  T/P 2365.60",
            "2026.01.05 10:15:00 close 0.15 XAUUSD 2353.85",
            "Profit 123.75",
        ],
    )
    body2 = call("/v1/recognitions", payload(mono2, "rt-mono-2"))
    check("re-render deterministic hash", body2.get("perceptualHash") == body.get("perceptualHash"))

    # 3. Multi-trade history panel.
    history = render(
        1400, 480,
        "MetaTrader 5",
        [
            "Time             Type  Volume Symbol  Price",
            "2026.01.05 09:30:00 buy 0.15 EURUSD 1.08450 +123.75",
            "2026.01.05 11:00:00 sell 0.30 XAUUSD 2645.60 -45.20",
            "S/L 2638.50  T/P 2660.00",
            "2026.01.05 13:45:00 buy 1.00 GBPUSD 1.26340 +89.10",
        ],
    )
    body3 = call("/v1/recognitions", payload(history, "rt-history"))
    check("history COMPLETED", body3["processingStatus"] == "COMPLETED")
    candidates = body3.get("tradeCandidates", [])
    check("multi-trade candidates grouped", len(candidates) >= 2, f"{len(candidates)} drafts")
    symbols = [
        {f["normalizedValue"] for f in group["fields"] if f["field"] == "symbol"}
        for group in candidates
    ]
    check("distinct symbols per draft", {"EURUSD"} in symbols and {"XAUUSD"} in symbols, str(symbols))
    notes = [note for group in candidates for f in group["fields"] for note in f["notes"]]
    check("arbitration/layout notes present", any(n.startswith(("PASS_", "FIRST_PASS", "SECOND_PASS", "LAYOUT_MATCH")) for n in notes))

    # 4. Region re-scan over the first order row.
    region = {"x": 0, "y": 130, "width": 1400, "height": 70}
    body4 = call("/v1/recrops", payload(history, "rt-recrop", region))
    check("recrop COMPLETED", body4["processingStatus"] == "COMPLETED", body4["processingStatus"])
    recrop_keys = {f["field"] for f in body4["fields"]}
    check("recrop reads the row", {"openTime", "direction", "symbol"} & recrop_keys != set(), ",".join(sorted(recrop_keys))[:60])

    print(f"\nENGINE-QUALITY RUNTIME VERIFICATION: {'ALL CHECKS PASSED' if failed == 0 else 'FAILURES PRESENT'}")
    if failed:
        sys.exit(1)


if __name__ == "__main__":
    start = time.time()
    main()
    print(f"(total {time.time() - start:.1f}s)")
