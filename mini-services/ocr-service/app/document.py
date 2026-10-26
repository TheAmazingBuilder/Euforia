"""PDF statement rendering (OCR V2 - multi-page import).

MetaTrader 5 (and most brokers) export account history as multi-page PDF
reports. The sidecar accepts the document bytes, renders every page to a
PNG working image with PyMuPDF (self-contained - no poppler dependency)
and hands each page to the regular pipeline. Rendering is a LOCAL,
stateless operation: no network, no persistence, pages never leave the
process boundary except as in-memory working images.

Guards:
  - page ceiling (20) and pixel budget per page - a hostile PDF cannot
    exhaust the worker (RESOURCE_LIMIT);
  - encrypted/corrupt documents are rejected as structurally unusable
    (SCREENSHOT_UNSUPPORTED at the Nest mapping, same class as images);
  - a page that renders empty simply contributes no trades (pages stay
    honest individually in the response).
"""

from __future__ import annotations

import io
import logging
from dataclasses import dataclass
from typing import List, Tuple

logger = logging.getLogger("ocr-service.document")

try:  # pragma: no cover - import guard depends on the environment
    import fitz  # PyMuPDF

    _FITZ_AVAILABLE = True
except Exception:  # pragma: no cover
    fitz = None  # type: ignore[assignment]
    _FITZ_AVAILABLE = False

MAX_PAGES = 20
RENDER_ZOOM = 2.0


class DocumentRejected(Exception):
    """Raised for structurally unusable documents (maps to UNPROCESSABLE)."""


@dataclass(frozen=True)
class RenderedPage:
    index: int
    png: bytes
    width: int
    height: int


def is_pdf(data: bytes) -> bool:
    """Header sniff - the declared MIME stays advisory (mirror of images)."""
    return data[:5] == b"%PDF-"


def render_pages(data: bytes, max_pixels_per_page: int) -> List[RenderedPage]:
    """Render every page (capped) to a PNG working image at 2x zoom."""
    if not _FITZ_AVAILABLE:  # pragma: no cover
        raise DocumentRejected("pdf rendering is unavailable in this deployment")
    try:
        doc = fitz.open(stream=data, filetype="pdf")
    except Exception as exc:
        raise DocumentRejected("unreadable or corrupt PDF document") from exc
    try:
        if doc.is_encrypted:
            raise DocumentRejected("password-protected PDF documents are not supported")
        page_count = doc.page_count
        if page_count < 1:
            raise DocumentRejected("the PDF document has no pages")
        if page_count > MAX_PAGES:
            raise DocumentRejected(
                f"the PDF document has {page_count} pages; the supported maximum is {MAX_PAGES}"
            )
        pages: List[RenderedPage] = []
        matrix = fitz.Matrix(RENDER_ZOOM, RENDER_ZOOM)
        for index in range(page_count):
            page = doc.load_page(index)
            rect = page.rect
            width = int(rect.width * RENDER_ZOOM)
            height = int(rect.height * RENDER_ZOOM)
            if width * height > max_pixels_per_page:
                raise DocumentRejected("a page exceeds the supported pixel budget")
            pix = page.get_pixmap(matrix=matrix, alpha=False)
            png = pix.tobytes("png")
            pages.append(RenderedPage(index=index, png=png, width=width, height=height))
        return pages
    finally:
        doc.close()


def render_first_page_png(data: bytes, max_pixels_per_page: int) -> Tuple[bytes, int, int]:
    """First-page render - the perceptual-hash anchor for document dedup."""
    pages = render_pages(data, max_pixels_per_page)
    first = pages[0]
    return first.png, first.width, first.height


def page_png_to_pillow(png: bytes):
    """Decode a rendered page PNG back into a PIL image (pipeline input)."""
    from PIL import Image

    return Image.open(io.BytesIO(png))
