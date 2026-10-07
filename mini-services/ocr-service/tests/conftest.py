"""OCR sidecar test fixtures — synthetic MT5-style screenshots rendered with
Pillow. Clean rendered text is OCR-friendly and DETERMINISTIC on a fixed
Tesseract version, which the assertions rely on.
"""

from __future__ import annotations

import base64
import hashlib
import io

from PIL import Image, ImageDraw, ImageFont

TOKEN = "test-internal-token-0123456789abcdef"  # >= 32 chars


def _font(size: int = 28):
    candidates = [
        "/usr/share/fonts/truetype/dejavu/DejaVuSansMono.ttf",
        "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf",
        "/usr/share/fonts/truetype/liberation/LiberationMono-Regular.ttf",
    ]
    for path in candidates:
        try:
            return ImageFont.truetype(path, size)
        except OSError:
            continue
    return ImageFont.load_default()


def render_mt5_screenshot() -> tuple[bytes, int, int]:
    """A minimal MT5 trade-history panel with one closed BUY trade.

    Dark text on a LIGHT background — tesseract's optimum — with generous
    monospace spacing so columns stay in one reading line.
    """
    width, height = 1150, 420
    img = Image.new("RGB", (width, height), (248, 249, 251))
    draw = ImageDraw.Draw(img)
    font = _font(30)
    small = _font(26)
    ink = (24, 26, 32)
    draw.text((24, 16), "MetaTrader 5", font=font, fill=ink)
    draw.text((24, 64), "History", font=small, fill=(110, 116, 128))
    lines = [
        "Time             Type  Volume Symbol  Price",
        "2026.01.05 09:30:00 buy 0.15 XAUUSD 2345.60",
        "S/L 2335.60  T/P 2365.60",
        "2026.01.05 10:15:00 close 0.15 XAUUSD 2353.85",
        "Profit 123.75",
    ]
    y = 130
    for line in lines:
        draw.text((24, y), line, font=small, fill=ink)
        y += 54
    buffer = io.BytesIO()
    img.save(buffer, format="PNG")
    return buffer.getvalue(), width, height


def render_mt5_with_exit_price() -> tuple[bytes, int, int]:
    """A MT5-style mobile trade card with an explicit EXIT PRICE label.

    The exit-price extractor (V2 §11) requires the explicit
    "exit price" / "close price" / "closed:" label shapes — the bare word
    "close" in a history row is an order TYPE, never a price label.
    """
    width, height = 700, 500
    img = Image.new("RGB", (width, height), (248, 249, 251))
    draw = ImageDraw.Draw(img)
    font = _font(30)
    small = _font(26)
    ink = (24, 26, 32)
    draw.text((24, 16), "MetaTrader 5", font=font, fill=ink)
    lines = [
        "buy 0.15 XAUUSD 2345.60",
        "S/L 2335.60  T/P 2365.60",
        "Exit price 2353.85",
        "Closed: 2026.01.05 10:15:00",
        "Profit 123.75",
    ]
    y = 90
    for line in lines:
        draw.text((24, y), line, font=small, fill=ink)
        y += 56
    buffer = io.BytesIO()
    img.save(buffer, format="PNG")
    return buffer.getvalue(), width, height


def render_tradingview_chart() -> tuple[bytes, int, int]:
    width, height = 800, 400
    img = Image.new("RGB", (width, height), (14, 17, 22))
    draw = ImageDraw.Draw(img)
    draw.text((20, 16), "TradingView", font=_font(30), fill=(95, 173, 86))
    draw.text((20, 64), "Chart  BTCUSD  1h", font=_font(22), fill=(200, 204, 214))
    buffer = io.BytesIO()
    img.save(buffer, format="PNG")
    return buffer.getvalue(), width, height


def render_blank() -> tuple[bytes, int, int]:
    img = Image.new("RGB", (600, 300), (255, 255, 255))
    buffer = io.BytesIO()
    img.save(buffer, format="PNG")
    return buffer.getvalue(), 600, 300


def to_request(image: bytes, width: int, height: int, request_id: str = "req-1") -> dict:
    return {
        "requestId": request_id,
        "contractVersion": "1",
        "imageBase64": base64.b64encode(image).decode("ascii"),
        "metadata": {
            "mime": "image/png",
            "sizeBytes": len(image),
            "width": width,
            "height": height,
            # The REAL checksum — the sidecar verifies it (V2 §20).
            "checksumSha256": hashlib.sha256(image).hexdigest(),
        },
        "extractionProfile": "TRADE_SUMMARY",
        "deadlineMs": 25_000,
    }


def data_url(image: bytes) -> str:
    return f"data:image/png;base64,{base64.b64encode(image).decode('ascii')}"


def render_mt5_history_multi() -> tuple[bytes, int, int]:
    """A landscape MT5 account-history panel with THREE trade rows.

    Desktop-history shape: one order row per trade, S/L stacked under the
    first, trailing signed profits on closed rows — the multi-trade
    candidates fixture.
    """
    width, height = 1400, 480
    img = Image.new("RGB", (width, height), (248, 249, 251))
    draw = ImageDraw.Draw(img)
    font = _font(30)
    small = _font(26)
    ink = (24, 26, 32)
    draw.text((24, 16), "MetaTrader 5", font=font, fill=ink)
    draw.text((24, 64), "History  EURUSD  XAUUSD  GBPUSD", font=small, fill=(110, 116, 128))
    lines = [
        "Time             Type  Volume Symbol  Price",
        "2026.01.05 09:30:00 buy 0.15 EURUSD 1.08450 +123.75",
        "2026.01.05 11:00:00 sell 0.30 XAUUSD 2645.60 -45.20",
        "S/L 2638.50  T/P 2660.00",
        "2026.01.05 13:45:00 buy 1.00 GBPUSD 1.26340 +89.10",
    ]
    y = 130
    for line in lines:
        draw.text((24, y), line, font=small, fill=ink)
        y += 58
    buffer = io.BytesIO()
    img.save(buffer, format="PNG")
    return buffer.getvalue(), width, height


def render_mt5_pdf() -> tuple[bytes, int, int]:
    """A TWO-PAGE PDF statement whose pages carry the MT5 fixture content.

    Pillow writes raster PDFs; pypdfium2 renders them back — a closed loop
    that exercises the multi-page statement pipeline deterministically.
    Returns (bytes, first_page_width, first_page_height).
    """
    base, width, height = render_mt5_screenshot()
    with Image.open(io.BytesIO(base)) as page_img:
        second = Image.new("RGB", (width, height), (248, 249, 251))
        draw = ImageDraw.Draw(second)
        draw.text((24, 16), "MetaTrader 5", font=_font(30), fill=(24, 26, 32))
        draw.text((24, 64), "History page 2 — no trade rows", font=_font(26), fill=(110, 116, 128))
        buffer = io.BytesIO()
        page_img.convert("RGB").save(
            buffer, format="PDF", save_all=True, append_images=[second], resolution=72
        )
    return buffer.getvalue(), width, height
