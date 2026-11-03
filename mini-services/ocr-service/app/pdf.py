"""PDF statement support (ops review §4.3 - multi-page import).

MT5 account statements arrive as PDF reports; a single document can carry
DOZENS of closed trades. The sidecar renders each page to a raster with
pypdfium2 (self-contained, no poppler system dependency) and the normal
pipeline runs per page - every page contributes its own field set and its
own multi-trade candidates.

Honest limits (documented, enforced):
  - a page budget caps the render cost (statements beyond the budget are a
    RESOURCE_LIMIT failure, not a silent truncation);
  - text-layer PDFs are NOT parsed as text: every page goes through the
    same OCR pipeline (one code path, one contract);
  - vector-only scans without rasterizable content yield UNPROCESSABLE.
"""

from __future__ import annotations

import io
from typing import List, Optional

from PIL import Image

try:
    import pypdfium2 as pdfium
except ImportError:  # pragma: no cover - dependency declared in requirements
    pdfium = None  # type: ignore[assignment]

PDF_MIME = "application/pdf"
# %PDF- magic - the declared MIME is still validated upstream; this is the
# sidecar's own belt-and-braces check (§7 untrusted input discipline).
PDF_MAGIC = b"%PDF-"

# Render scale: 2.2x keeps statement typography comfortably above the
# upscale floor without exploding the pixel budget on A4 pages.
_PDF_RENDER_SCALE = 2.2
_MAX_PDF_PAGES = 10


class PdfRejected(Exception):
    """Raised for structurally unusable PDF payloads (→ UNPROCESSABLE)."""


def looks_like_pdf(data: bytes) -> bool:
    return data[: len(PDF_MAGIC)] == PDF_MAGIC


def render_pdf_pages(data: bytes, max_pixels: int) -> List[Image.Image]:
    """Render the document's pages to RGB rasters (deterministic).

    Raises PdfRejected for undecodable documents; raises ResourceLimit
    (ValueError message) when the page budget or the pixel budget would be
    exceeded - the caller maps both to stable failure categories.
    """
    if pdfium is None:  # pragma: no cover
        raise PdfRejected("pdf rendering is not available in this deployment")

    try:
        document = pdfium.PdfDocument(io.BytesIO(data))
    except Exception as exc:  # pypdfium2 raises bare PdfiumError variants
        raise PdfRejected("malformed or unsupported PDF structure") from exc

    try:
        page_count = len(document)
        if page_count == 0:
            raise PdfRejected("the PDF has no pages")
        if page_count > _MAX_PDF_PAGES:
            raise ValueError(f"pdf exceeds the page budget ({_MAX_PDF_PAGES})")

        pages: List[Image.Image] = []
        for index in range(page_count):
            page = document[index]
            try:
                bitmap = page.render(scale=_PDF_RENDER_SCALE)
            except Exception as exc:
                raise PdfRejected(f"page {index + 1} could not be rendered") from exc
            image = bitmap.to_pil().convert("RGB")
            if image.width * image.height > max_pixels:
                raise ValueError(f"page {index + 1} exceeds the pixel budget")
            pages.append(image)
        return pages
    finally:
        document.close()


def first_page_dimensions(data: bytes) -> Optional[tuple[int, int]]:
    """(width, height) of the first rendered page - PDFs carry no intrinsic
    pixel size, so the Nest side learns the dimensions from here."""
    if not looks_like_pdf(data):
        return None
    try:
        pages = render_pdf_pages(data, max_pixels=200_000_000)
        return (pages[0].width, pages[0].height) if pages else None
    except (PdfRejected, ValueError):
        return None
