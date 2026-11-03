"""Render the deterministic MT5 fixture screenshot for the LIVE OCR e2e.

Same generator as the sidecar's conftest (mini-services/ocr-service/tests/
conftest.py) - a real PNG that the REAL tesseract sidecar recognizes.
"""
import sys

sys.path.insert(0, "/home/z/my-project/mini-services/ocr-service")
sys.path.insert(0, "/home/z/my-project/mini-services/ocr-service/tests")

from conftest import render_mt5_screenshot  # noqa: E402

png, width, height = render_mt5_screenshot()
with open("/tmp/mt5-live-fixture.png", "wb") as fh:
    fh.write(png)
print(f"rendered {width}x{height}, {len(png)} bytes")
