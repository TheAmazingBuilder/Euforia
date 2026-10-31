#!/usr/bin/env python3
"""Phase 19 runtime fixture - renders a REAL MT5-style screenshot with
Pillow (same design as the pytest fixture) and prints {dataUrl, width,
height} as JSON on stdout. The upload goes through Tesseract for real."""
import base64
import io
import json
import os
import sys

from PIL import Image, ImageDraw, ImageFont

sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "mini-services", "ocr-service"))
from tests.conftest import render_mt5_screenshot  # noqa: E402

image, width, height = render_mt5_screenshot()
data_url = "data:image/png;base64," + base64.b64encode(image).decode("ascii")
print(json.dumps({"dataUrl": data_url, "width": width, "height": height, "bytes": len(image)}))
