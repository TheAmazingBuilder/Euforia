"""FastAPI OCR sidecar (Phase 19 §4/§26/§27 + engine quality phase).

Boundary discipline:
  - NO users, NO authnz decisions, NO trading state, NO persistence (§4):
    the sidecar is a STATELESS processing function over one image;
  - service-to-service shared token (§27) - no public unauthenticated OCR;
  - strict request schema; unknown fields stripped by pydantic;
  - per-image failures answer 200 with processingStatus
    UNPROCESSABLE/FAILED (the Nest side maps them, §34); request-level
    problems (auth, size, schema) are HTTP errors;
  - no LLM (§28) - deterministic OCR (Tesseract ×2 passes with field-level
    arbitrage) + keyword classification + layout templates;
  - never logs image bytes or secrets (§36): request ids, sizes, durations.

Pipeline v3 (V2 spec):
  validate (checksum verified) → [crop] → preprocess (denoise → deskew →
  ×2 LANCZOS → CLAHE | binarized alternate) → pass A (PSM 3 auto) ⇄
  pass B (PSM 11 sparse) → field arbitrage → platform + screenshot-type
  detection → layout-template priors → multi-trade candidates → dHash
  fingerprint → response.
"""

from __future__ import annotations

import base64
import binascii
import hashlib
import io
import logging
import time
from typing import Optional

from fastapi import FastAPI, HTTPException, Request
from fastapi.responses import JSONResponse
from PIL import Image, ImageOps

from .account_extraction import extract_account_fields
from .arbitration import PASS_NAMES, arbitrate_fields, run_sparse_pass
from .chart_extraction import extract_chart_fields
from .classification import classify
from .config import CONTRACT_VERSION, settings
from .contract import (
    EngineRequest,
    EngineResponse,
    EngineProcessingMetadata,
    EngineFailure,
    EngineTrade,
    EngineTradeCandidate,
    EngineDocumentPage,
    EngineDocumentRequest,
    EngineDocumentResponse,
    SourceRegion,
)
from .extraction import ENGINE_NAME, extract_fields, extract_trade_candidates, extract_trades, run_ocr, tesseract_version
from .pdf import PDF_MIME, PdfRejected, looks_like_pdf, render_pdf_pages
from .templates import choose_template
from .validation import ChecksumMismatch, ImageRejected, prepare_gray, validate_and_prepare
from .preprocessing import binarize, clahe_equalize, dhash as compute_dhash, upscale as upscale_image

logger = logging.getLogger("ocr-service")
logging.basicConfig(level=logging.INFO, format="%(message)s")

PIPELINE_VERSION = "3.0.0"
ENGINE_VERSION = tesseract_version()

app = FastAPI(title="Cosmoz OCR Service", version=PIPELINE_VERSION, docs_url=None, redoc_url=None)


@app.middleware("http")
async def internal_token_guard(request: Request, call_next):
    """Service-to-service auth (§27) - every route except /healthz is guarded."""
    if request.url.path == "/healthz" or request.method == "HEAD":
        return await call_next(request)
    token = request.headers.get("x-internal-token", "")
    if token != settings.service_token:
        return JSONResponse(
            status_code=401,
            content={"error": "Unauthorized", "message": "missing or invalid internal token"},
        )
    return await call_next(request)


@app.get("/healthz")
def healthz() -> dict:
    """Liveness for orchestration - carries NO user data."""
    return {"status": "ok", "engine": ENGINE_NAME, "engineVersion": ENGINE_VERSION, "pipeline": PIPELINE_VERSION}


def _respond(
    request_id: str,
    processing_status: str,
    classification,
    fields,
    warnings: list,
    failure: Optional[EngineFailure],
    durations: dict,
    trade_candidates: Optional[list] = None,
    perceptual_hash: Optional[str] = None,
    passes: Optional[list] = None,
    layout_template: Optional[str] = None,
    deskew_deg: Optional[float] = None,
    document_pages: Optional[int] = None,
    document_width: Optional[int] = None,
    document_height: Optional[int] = None,
    trades: Optional[list] = None,
) -> JSONResponse:
    body = EngineResponse(
        requestId=request_id,
        contractVersion=CONTRACT_VERSION,
        processingStatus=processing_status,  # type: ignore[arg-type]
        classification=classification,
        fields=fields,
        trades=trades or None,
        tradeCandidates=trade_candidates or [],
        warnings=warnings,
        perceptualHash=perceptual_hash,
        processingMetadata=EngineProcessingMetadata(
            engine=ENGINE_NAME,
            engineVersion=ENGINE_VERSION,
            pipelineVersion=PIPELINE_VERSION,
            durationsMs=durations,
            passes=passes or [],
            layoutTemplate=layout_template,
            deskewDeg=deskew_deg,
            documentPages=document_pages,
            documentWidth=document_width,
            documentHeight=document_height,
        ),
        failure=failure,
    )
    return JSONResponse(status_code=200, content=body.model_dump(mode="json"))


def _respond_document(
    request_id: str,
    processing_status: str,
    pages: list,
    perceptual_hash: Optional[str],
    failure: Optional[EngineFailure],
    durations: dict,
    warnings: Optional[list] = None,
    document_pages: Optional[int] = None,
    document_width: Optional[int] = None,
    document_height: Optional[int] = None,
) -> JSONResponse:
    body = EngineDocumentResponse(
        requestId=request_id,
        contractVersion=CONTRACT_VERSION,
        processingStatus=processing_status,  # type: ignore[arg-type]
        pages=pages,
        perceptualHash=perceptual_hash,
        processingMetadata=EngineProcessingMetadata(
            engine=ENGINE_NAME,
            engineVersion=ENGINE_VERSION,
            pipelineVersion=PIPELINE_VERSION,
            durationsMs=durations,
            passes=list(PASS_NAMES),
            documentPages=document_pages,
            documentWidth=document_width,
            documentHeight=document_height,
        ),
        warnings=warnings or [],
        failure=failure,
    )
    return JSONResponse(status_code=200, content=body.model_dump(mode="json"))


def _intersect_region(region: SourceRegion, width: int, height: int) -> Optional[SourceRegion]:
    """Clip a requested region against the image bounds. Returns None when
    the region lies ENTIRELY outside the image - a caller-side mistake that
    must surface as UNPROCESSABLE/RESOURCE_LIMIT (never silently clamped to
    a strip the user did not select)."""
    if region.x >= width or region.y >= height:
        return None
    left = max(0, region.x)
    top = max(0, region.y)
    right = min(width, region.x + region.width)
    bottom = min(height, region.y + region.height)
    if right <= left or bottom <= top:
        return None
    return SourceRegion(x=left, y=top, width=right - left, height=bottom - top)


def _rescale_regions(fields: list, scale: int, offset_x: int = 0, offset_y: int = 0) -> None:
    """Map OCR word boxes from the UPSCALED working copy back to ORIGINAL
    coordinates (÷ scale, + crop origin) - §18: the review UI highlight must
    point at the real asset pixels. Mutates the EngineField list in place."""
    if scale <= 1 and offset_x == 0 and offset_y == 0:
        return
    for field in fields:
        region = field.sourceRegion
        if region is None:
            continue
        field.sourceRegion = SourceRegion(
            x=offset_x + region.x // scale,
            y=offset_y + region.y // scale,
            width=max(1, region.width // scale),
            height=max(1, region.height // scale),
        )


def _rescale_result_regions(
    fields: list,
    candidates: Optional[list],
    trades: Optional[list],
    scale: int,
    offset_x: int = 0,
    offset_y: int = 0,
) -> None:
    """Rescale every region of one recognition result (flat fields, candidate
    groups, grouped trades) - one consistent coordinate story (§18)."""
    _rescale_regions(fields, scale, offset_x, offset_y)
    for group in candidates or []:
        _rescale_regions(group.fields, scale, offset_x, offset_y)
    for trade in trades or []:
        _rescale_regions(trade.fields, scale, offset_x, offset_y)


def _crop_bytes(image_bytes: bytes, region: SourceRegion):
    """Decode + crop the original to the requested region (re-OCR by crop).

    The Nest side validates the region against the stored asset dimensions
    before calling; the sidecar clamps defensively anyway. Returns a PIL
    RGB image or None when the decode fails.
    """
    try:
        with Image.open(io.BytesIO(image_bytes)) as img:
            img.load()
            left = max(0, min(region.x, img.width - 1))
            top = max(0, min(region.y, img.height - 1))
            right = max(left + 1, min(region.x + region.width, img.width))
            bottom = max(top + 1, min(region.y + region.height, img.height))
            return img.convert("RGB").crop((left, top, right, bottom))
    except (UnidentifiedImageError, OSError, ValueError, SyntaxError):
        return None


def _recognize_pdf(request: EngineRequest, image_bytes: bytes, started: float) -> JSONResponse:
    """Multi-page PDF statement pipeline (ops review §4.3).

    Every page runs the SAME pipeline as a screenshot (preprocess → two
    passes → arbitrage → template priors → candidates); the document-level
    result aggregates the pages: candidates concatenate (capped), the
    primary field set comes from the FIRST page that produced candidates
    (else page 1), classification reads the combined text. The soft deadline
    is honored BETWEEN pages - an overrun stops further pages and carries an
    explicit partial warning (never a silent truncation).
    """
    request_id = request.requestId

    def durations() -> dict:
        return {"totalMs": int((time.perf_counter() - started) * 1000)}

    deadline_seconds = request.deadlineMs / 1000.0

    if not looks_like_pdf(image_bytes):
        return _respond(
            request_id, "UNPROCESSABLE", None, [], [],
            EngineFailure(category="SCREENSHOT_UNSUPPORTED", message="the payload is not a PDF document"),
            durations(),
        )
    try:
        pages = render_pdf_pages(image_bytes, settings.max_pixels)
    except PdfRejected as exc:
        return _respond(
            request_id, "UNPROCESSABLE", None, [], [],
            EngineFailure(category="SCREENSHOT_UNSUPPORTED", message=str(exc)),
            durations(),
        )
    except ValueError as exc:
        return _respond(
            request_id, "UNPROCESSABLE", None, [], [],
            EngineFailure(category="RESOURCE_LIMIT", message=str(exc)),
            durations(),
        )

    first_page = pages[0]
    first_gray = ImageOps.grayscale(first_page)

    doc_hash = compute_dhash(first_gray)

    combined_text_parts = []
    page_field_sets = []
    all_candidates: list = []
    partial = False
    processed_pages = 0

    for page in pages:
        if time.perf_counter() - started > deadline_seconds:
            partial = True
            break
        gray = ImageOps.grayscale(page)
        scaled, _ = upscale_image(gray, settings.max_pixels)
        main = clahe_equalize(scaled)
        alternate = binarize(scaled)
        try:
            lines = run_ocr(main, settings.tesseract_lang)
            sparse = run_sparse_pass(alternate, settings.tesseract_lang)
        except (RuntimeError, OSError):
            return _respond(
                request_id, "FAILED", None, [], [],
                EngineFailure(category="OCR_UNAVAILABLE", message="tesseract engine failed"),
                durations(),
            )
        combined_text_parts.append(" ".join(line.text for line in lines))
        page_field_sets.append((lines, sparse))
        processed_pages += 1

    text_joined = " ".join(part for part in combined_text_parts if part.strip())
    if not text_joined.strip():
        return _respond(
            request_id, "UNPROCESSABLE", None, [], [],
            EngineFailure(category="SCREENSHOT_UNSUPPORTED", message="no readable text found in this document"),
            durations(),
        )

    classification = classify(text_joined)
    template = choose_template(classification.type, first_page.width, first_page.height, classification.platform)

    warnings: list[str] = []
    if partial:
        warnings.append(f"PDF_DEADLINE_PARTIAL:{processed_pages}")
    # Statement PDFs are TRADE-vocabulary documents (Account & Chart V1.1):
    # the extraction stays on the trade path and the answer says so honestly.
    if request.extractionProfile != "TRADE_SUMMARY":
        warnings.append("PROFILE_PDF_TRADE_ONLY")

    # Primary fields - the first page whose block pass yields fields, else
    # the first page (an honest default, never merged across pages: merging
    # would fabricate one trade out of many, §21).
    fields = []
    for lines, sparse in page_field_sets:
        candidate_fields = extract_fields(lines, template)
        if sparse:
            challenger = extract_fields(sparse, template)
            candidate_fields, _ = arbitrate_fields(candidate_fields, challenger)
        if candidate_fields:
            fields = candidate_fields
            break

    # Candidates concatenate across pages (each page grouped independently -
    # never cross-page merging: rows from different pages are not related).
    for lines, _sparse in page_field_sets:
        for group in extract_trade_candidates(lines, template):
            if len(all_candidates) >= 20:
                break
            all_candidates.append(EngineTradeCandidate(fields=group))

    logger.info(
        "pdf recognition request_id=%s pages=%d/%d candidates=%d total_ms=%d",
        request_id,
        processed_pages,
        len(pages),
        len(all_candidates),
        durations()["totalMs"],
    )

    return _respond(
        request_id,
        "COMPLETED",
        classification,
        fields,
        warnings,
        None,
        {"totalMs": durations()["totalMs"]},
        trade_candidates=all_candidates,
        perceptual_hash=doc_hash,
        passes=list(PASS_NAMES),
        layout_template=template.name,
        document_pages=len(pages),
        document_width=first_page.width,
        document_height=first_page.height,
    )


@app.post("/v1/recognitions")
def recognize(request: EngineRequest) -> JSONResponse:
    if request.contractVersion != CONTRACT_VERSION:
        raise HTTPException(status_code=400, detail="unsupported contractVersion")

    started = time.perf_counter()
    request_id = request.requestId
    image_size = len(request.imageBase64)

    def durations() -> dict:
        return {"totalMs": int((time.perf_counter() - started) * 1000)}

    # Request-level size guard (§38) - before base64 decoding.
    if image_size > settings.max_bytes * 1.4:  # base64 inflation factor
        return JSONResponse(
            status_code=413,
            content={"error": "ResourceLimit", "message": "image payload exceeds the sidecar limit"},
        )

    try:
        image_bytes = base64.b64decode(request.imageBase64, validate=True)
    except (binascii.Error, ValueError):
        raise HTTPException(status_code=400, detail="imageBase64 is not valid base64")

    if len(image_bytes) > settings.max_bytes:
        return JSONResponse(
            status_code=413,
            content={"error": "ResourceLimit", "message": "decoded image exceeds the sidecar limit"},
        )

    # Declared checksum verified for EVERY payload (V2 §20) - before the
    # PDF branch: PDF statements ride the same integrity discipline.
    if hashlib.sha256(image_bytes).hexdigest() != request.metadata.checksumSha256.lower():
        return _respond(
            request_id,
            processing_status="UNPROCESSABLE",
            classification=None,
            fields=[],
            warnings=[],
            failure=EngineFailure(
                category="VALIDATION_FAILED",
                message="declared checksum does not match the image bytes",
            ),
            durations=durations(),
        )

    # PDF statements (ops §4.3) - multi-page documents take the dedicated
    # per-page pipeline (one code path per page, same extraction rules).
    if request.metadata.mime == PDF_MIME:
        return _recognize_pdf(request, image_bytes, started)

    try:
        _mime, prepared = validate_and_prepare(image_bytes, request.metadata, settings.max_pixels)
    except ChecksumMismatch as exc:
        # V2 §20 - a checksum mismatch means the bytes were corrupted in
        # transit: a caller-side validation failure, NOT a bad image.
        return _respond(
            request_id,
            processing_status="UNPROCESSABLE",
            classification=None,
            fields=[],
            warnings=[],
            failure=EngineFailure(category="VALIDATION_FAILED", message=str(exc)),
            durations=durations(),
        )
    except ImageRejected as exc:
        return _respond(
            request_id,
            processing_status="UNPROCESSABLE",
            classification=None,
            fields=[],
            warnings=[],
            failure=EngineFailure(category="SCREENSHOT_UNSUPPORTED", message=str(exc)),
            durations=durations(),
        )  # mime is advisory - validation already reconciled it with the metadata

    # Deadline honoring between heavy stages (soft - best effort, §26).
    deadline_seconds = request.deadlineMs / 1000.0

    # V2 §24 - pixel-rect zone re-read on the main route: the pipeline runs
    # on the CROP (the Nest side validated the region against the asset
    # dims; the sidecar still rejects a fully-outside region instead of
    # silently reading something the user did not select). Reported regions
    # are offset by the crop origin so every box stays in ORIGINAL-asset
    # coordinates (§18).
    crop_offset_x = 0
    crop_offset_y = 0
    working = prepared
    if request.cropRegion is not None:
        clipped = _intersect_region(request.cropRegion, prepared.width, prepared.height)
        if clipped is None:
            return _respond(
                request_id,
                processing_status="UNPROCESSABLE",
                classification=None,
                fields=[],
                warnings=[],
                failure=EngineFailure(
                    category="RESOURCE_LIMIT",
                    message="crop region lies entirely outside the image bounds",
                ),
                durations=durations(),
            )
        zone_gray = prepared.gray.crop(
            (clipped.x, clipped.y, clipped.x + clipped.width, clipped.y + clipped.height)
        )
        working = prepare_gray(zone_gray, settings.max_pixels)
        crop_offset_x = clipped.x
        crop_offset_y = clipped.y

    ocr_started = time.perf_counter()
    try:
        # Pass A - block segmentation over the full preprocessing chain.
        lines = run_ocr(working.main, settings.tesseract_lang)
        # Pass B - sparse segmentation over the Otsu-binarized variant
        # (arbitration challenger; failures degrade to single-pass, never
        # fail the request - the primary pass is the contract).
        try:
            sparse_lines = run_sparse_pass(working.alternate, settings.tesseract_lang)
            passes_ran = list(PASS_NAMES)
        except (RuntimeError, OSError):
            sparse_lines = []
            passes_ran = [PASS_NAMES[0]]
    except (RuntimeError, OSError) as exc:  # tesseract binary failure
        logger.error("tesseract failure request_id=%s error=%s", request_id, type(exc).__name__)
        return _respond(
            request_id,
            processing_status="FAILED",
            classification=None,
            fields=[],
            warnings=[],
            failure=EngineFailure(category="OCR_UNAVAILABLE", message="tesseract engine failed"),
            durations=durations(),
        )
    ocr_ms = int((time.perf_counter() - ocr_started) * 1000)

    if time.perf_counter() - started > deadline_seconds:
        return _respond(
            request_id,
            processing_status="FAILED",
            classification=None,
            fields=[],
            warnings=[],
            failure=EngineFailure(category="PROCESSING_TIMEOUT", message="processing exceeded the deadline"),
            durations=durations(),
        )

    text_joined = " ".join(line.text for line in lines)
    if not lines or not text_joined.strip():
        # No readable text at all - nothing usable for a trade review (§20:
        # an explicit UNPROCESSABLE, never an empty pretend-result).
        return _respond(
            request_id,
            processing_status="UNPROCESSABLE",
            classification=None,
            fields=[],
            warnings=[],
            failure=EngineFailure(
                category="SCREENSHOT_UNSUPPORTED",
                message="no readable text found in this screenshot",
            ),
            durations=durations(),
            perceptual_hash=None if request.cropRegion is not None else prepared.dhash_hex,
            passes=passes_ran,
            deskew_deg=working.skew_deg,
        )

    classification = classify(text_joined)
    template = choose_template(classification.type, working.width, working.height, classification.platform)

    # Profile routing (Account & Chart V1.1): the OCR passes are shared, the
    # FIELD GRAMMAR is profile-specific. Each branch arbitrates its own
    # fields with the same challenger pass (agreement boosts, disagreements
    # recorded - identical semantics across profiles).
    profile = request.extractionProfile
    if profile == "ACCOUNT_POSITION":
        fields = extract_account_fields(lines)
        if sparse_lines:
            challenger_fields = extract_account_fields(sparse_lines)
            fields, _all_clear = arbitrate_fields(fields, challenger_fields)
            warnings: list[str] = []
        else:
            warnings = ["SECOND_PASS_UNAVAILABLE"]
        # Open positions reuse the trade-row grammar - each position is one
        # candidate draft for grouped confirmation (evidence, never a trade).
        candidates = extract_trade_candidates(lines, template)
        trade_candidates = [EngineTradeCandidate(fields=group) for group in candidates]
        trades = [EngineTrade(pageIndex=0, fields=group) for group in candidates]
    elif profile == "CHART_ANALYSIS":
        fields = extract_chart_fields(lines)
        if sparse_lines:
            challenger_fields = extract_chart_fields(sparse_lines)
            fields, _all_clear = arbitrate_fields(fields, challenger_fields)
            warnings = []
        else:
            warnings = ["SECOND_PASS_UNAVAILABLE"]
        trade_candidates = []
        trades = []
    else:
        fields = extract_fields(lines, template)

        # Field-level arbitrage with the challenger pass (§ engine quality -
        # agreement boosts, disagreements recorded, single-source kept honest).
        if sparse_lines:
            challenger_fields = extract_fields(sparse_lines, template)
            fields, _all_clear = arbitrate_fields(fields, challenger_fields)
            warnings = []
        else:
            warnings = ["SECOND_PASS_UNAVAILABLE"]

        # Multi-trade candidates - grouped evidence from account-history rows
        # (never merged into one fake trade; empty for the mono-trade path).
        candidates = extract_trade_candidates(lines, template)
        trade_candidates = [EngineTradeCandidate(fields=group) for group in candidates]
        # The response-level trade read: clustered trades when grouping found
        # order rows, else the V1 flat extraction as one trade - the review
        # card never disappears just because clustering found no row.
        trades = extract_trades(lines, template)

    # Regions live in UPSCALED working-copy coordinates - map them back to
    # the ORIGINAL asset (÷ scale, + crop origin) for every member (§18).
    _rescale_result_regions(
        fields,
        trade_candidates,
        trades,
        working.scale,
        crop_offset_x,
        crop_offset_y,
    )

    logger.info(
        "recognition request_id=%s bytes=%d lines=%d fields=%d candidates=%d template=%s ocr_ms=%d total_ms=%d",
        request_id,
        len(image_bytes),
        len(lines),
        len(fields),
        len(trade_candidates),
        template.name,
        ocr_ms,
        durations()["totalMs"],
    )

    return _respond(
        request_id,
        processing_status="COMPLETED",
        classification=classification,
        fields=fields,
        warnings=warnings,
        failure=None,
        durations={"totalMs": durations()["totalMs"], "ocrMs": ocr_ms},
        trade_candidates=trade_candidates,
        perceptual_hash=None if request.cropRegion is not None else prepared.dhash_hex,
        passes=passes_ran,
        layout_template=template.name,
        deskew_deg=working.skew_deg,
        trades=trades,
    )


@app.post("/v1/recrops")
def recrop(request: EngineRequest) -> JSONResponse:
    """Targeted re-OCR over a user-selected region (§ engine quality 2.4).

    Same contract as /v1/recognitions but the pipeline runs on the CROP,
    not the full screenshot: the review UI sends the region when a field
    came back LOW_CONFIDENCE and the user re-frames it by hand. The dHash
    is computed on the crop (irrelevant for dedup here; the Nest side
    ignores it on this route).
    """
    if request.contractVersion != CONTRACT_VERSION:
        raise HTTPException(status_code=400, detail="unsupported contractVersion")
    if request.crop is None:
        raise HTTPException(status_code=400, detail="crop region is required on /v1/recrops")

    started = time.perf_counter()
    request_id = request.requestId

    def durations() -> dict:
        return {"totalMs": int((time.perf_counter() - started) * 1000)}

    if len(request.imageBase64) > settings.max_bytes * 1.4:
        return JSONResponse(
            status_code=413,
            content={"error": "ResourceLimit", "message": "image payload exceeds the sidecar limit"},
        )
    try:
        image_bytes = base64.b64decode(request.imageBase64, validate=True)
    except (binascii.Error, ValueError):
        raise HTTPException(status_code=400, detail="imageBase64 is not valid base64")

    cropped = _crop_bytes(image_bytes, request.crop)
    if cropped is None:
        return _respond(
            request_id,
            processing_status="UNPROCESSABLE",
            classification=None,
            fields=[],
            warnings=[],
            failure=EngineFailure(category="SCREENSHOT_UNSUPPORTED", message="the stored image could not be decoded"),
            durations=durations(),
        )
    if cropped.width * cropped.height > settings.max_pixels:
        return _respond(
            request_id,
            processing_status="UNPROCESSABLE",
            classification=None,
            fields=[],
            warnings=[],
            failure=EngineFailure(category="RESOURCE_LIMIT", message="the crop exceeds the pixel budget"),
            durations=durations(),
        )

    # Minimal preparation of the crop (no full re-validation - the source
    # was already validated at upload; region coordinates were checked).
    gray = ImageOps.grayscale(cropped)
    zone = prepare_gray(gray, settings.max_pixels)
    main = zone.main
    alternate = zone.alternate

    try:
        lines = run_ocr(main, settings.tesseract_lang)
        try:
            sparse_lines = run_sparse_pass(alternate, settings.tesseract_lang)
        except (RuntimeError, OSError):
            sparse_lines = []
    except (RuntimeError, OSError):
        return _respond(
            request_id,
            processing_status="FAILED",
            classification=None,
            fields=[],
            warnings=[],
            failure=EngineFailure(category="OCR_UNAVAILABLE", message="tesseract engine failed"),
            durations=durations(),
        )

    text_joined = " ".join(line.text for line in lines)
    if not lines or not text_joined.strip():
        return _respond(
            request_id,
            processing_status="UNPROCESSABLE",
            classification=None,
            fields=[],
            warnings=[],
            failure=EngineFailure(
                category="SCREENSHOT_UNSUPPORTED",
                message="no readable text found in this region",
            ),
            durations=durations(),
        )

    classification = classify(text_joined)
    template = choose_template(classification.type, zone.width, zone.height, classification.platform)

    # Same profile routing as the main route (Account & Chart V1.1): a
    # region re-scan on an account snapshot re-reads the ACCOUNT grammar,
    # on a chart the CHART grammar - never trade-only.
    profile = request.extractionProfile
    if profile == "ACCOUNT_POSITION":
        fields = extract_account_fields(lines)
    elif profile == "CHART_ANALYSIS":
        fields = extract_chart_fields(lines)
    else:
        fields = extract_fields(lines, template)
    recrop_warnings: list[str] = []
    if sparse_lines:
        if profile == "ACCOUNT_POSITION":
            challenger_fields = extract_account_fields(sparse_lines)
        elif profile == "CHART_ANALYSIS":
            challenger_fields = extract_chart_fields(sparse_lines)
        else:
            challenger_fields = extract_fields(sparse_lines, template)
        fields, _ = arbitrate_fields(fields, challenger_fields)
    else:
        # Same honest degradation as the main route (V2 audit: the recrop
        # path used to fail the whole request when the sparse pass failed).
        recrop_warnings = ["SECOND_PASS_UNAVAILABLE"]

    # Region coordinates are zone-local and upscaled - report them in the
    # zone's ORIGINAL pixel space (÷ scale; no offset: recrop answers are
    # zone-scoped by contract, the Nest side knows the region).
    _rescale_regions(fields, zone.scale)

    logger.info(
        "recrop request_id=%s region=%dx%d+%d+%d fields=%d total_ms=%d",
        request_id,
        request.crop.width,
        request.crop.height,
        request.crop.x,
        request.crop.y,
        len(fields),
        durations()["totalMs"],
    )

    return _respond(
        request_id,
        processing_status="COMPLETED",
        classification=classification,
        fields=fields,
        warnings=recrop_warnings,
        failure=None,
        durations={"totalMs": durations()["totalMs"]},
        perceptual_hash=None,
        passes=list(PASS_NAMES),
        layout_template=template.name,
    )


@app.post("/v1/recognitions/document")
def recognize_document(request: EngineDocumentRequest) -> JSONResponse:
    """Multi-page PDF statement recognition (V2 document pipeline).

    Mirrors EngineDocumentRecognizeRequest/Response on the Nest side: the
    sidecar answers PAGE-WISE (per-page classification, fields, grouped
    trades) and the Nest side owns the cross-page merge. The checksum member
    is accepted for wire parity but not verified here - the render pipeline
    IS the integrity check (undecodable/corrupt documents are rejected as
    UNPROCESSABLE, never guessed through).

    Per-page pipeline = the SAME chain as a screenshot (prepare_gray → two
    OCR passes → arbitrage → profile grammar → clustered trades); the soft
    deadline is honored BETWEEN pages - an overrun stops further pages and
    carries an explicit PDF_DEADLINE_PARTIAL warning (never a silent
    truncation). Region coordinates are reported in the page's rendered
    pixel space (÷ upscale scale, §18).
    """
    if request.contractVersion != CONTRACT_VERSION:
        raise HTTPException(status_code=400, detail="unsupported contractVersion")

    started = time.perf_counter()
    request_id = request.requestId

    def durations() -> dict:
        return {"totalMs": int((time.perf_counter() - started) * 1000)}

    if len(request.documentBase64) > settings.max_bytes * 1.4:
        return JSONResponse(
            status_code=413,
            content={"error": "ResourceLimit", "message": "document payload exceeds the sidecar limit"},
        )
    try:
        document_bytes = base64.b64decode(request.documentBase64, validate=True)
    except (binascii.Error, ValueError):
        raise HTTPException(status_code=400, detail="documentBase64 is not valid base64")

    deadline_seconds = request.deadlineMs / 1000.0

    if not looks_like_pdf(document_bytes):
        return _respond_document(
            request_id,
            "UNPROCESSABLE",
            [],
            None,
            EngineFailure(category="SCREENSHOT_UNSUPPORTED", message="the payload is not a PDF document"),
            durations(),
        )
    try:
        pages = render_pdf_pages(document_bytes, settings.max_pixels)
    except PdfRejected as exc:
        return _respond_document(
            request_id,
            "UNPROCESSABLE",
            [],
            None,
            EngineFailure(category="SCREENSHOT_UNSUPPORTED", message=str(exc)),
            durations(),
        )
    except ValueError as exc:
        return _respond_document(
            request_id,
            "UNPROCESSABLE",
            [],
            None,
            EngineFailure(category="RESOURCE_LIMIT", message=str(exc)),
            durations(),
        )

    doc_hash = compute_dhash(ImageOps.grayscale(pages[0]))

    page_results: list[EngineDocumentPage] = []
    partial = False
    processed_pages = 0

    for index, page in enumerate(pages):
        if time.perf_counter() - started > deadline_seconds:
            partial = True
            break
        gray = ImageOps.grayscale(page)
        prep = prepare_gray(gray, settings.max_pixels)
        try:
            lines = run_ocr(prep.main, settings.tesseract_lang)
            try:
                sparse_lines = run_sparse_pass(prep.alternate, settings.tesseract_lang)
            except (RuntimeError, OSError):
                sparse_lines = []
        except (RuntimeError, OSError):
            return _respond_document(
                request_id,
                "FAILED",
                [],
                doc_hash,
                EngineFailure(category="OCR_UNAVAILABLE", message="tesseract engine failed"),
                durations(),
                document_pages=len(pages),
                document_width=pages[0].width,
                document_height=pages[0].height,
            )

        text_joined = " ".join(line.text for line in lines)
        page_classification = classify(text_joined) if text_joined.strip() else None
        page_fields = []
        page_trades: list[EngineTrade] = []
        if page_classification is not None:
            template = choose_template(
                page_classification.type, prep.width, prep.height, page_classification.platform
            )
            if request.extractionProfile == "ACCOUNT_POSITION":
                page_fields = extract_account_fields(lines)
                if sparse_lines:
                    page_fields, _ = arbitrate_fields(
                        page_fields, extract_account_fields(sparse_lines)
                    )
                for group in extract_trade_candidates(lines, template):
                    if len(page_trades) >= 20:
                        break
                    page_trades.append(EngineTrade(pageIndex=index, fields=group))
            elif request.extractionProfile == "CHART_ANALYSIS":
                page_fields = extract_chart_fields(lines)
                if sparse_lines:
                    page_fields, _ = arbitrate_fields(
                        page_fields, extract_chart_fields(sparse_lines)
                    )
            else:
                page_fields = extract_fields(lines, template)
                if sparse_lines:
                    page_fields, _ = arbitrate_fields(
                        page_fields, extract_fields(sparse_lines, template)
                    )
                page_trades = extract_trades(lines, template)
                for trade in page_trades:
                    trade.pageIndex = index

            # Regions live in the UPSCALED working copy - map them back to
            # the rendered page pixels (÷ scale, §18).
            _rescale_regions(page_fields, prep.scale)
            for trade in page_trades:
                _rescale_regions(trade.fields, prep.scale)

        page_results.append(
            EngineDocumentPage(
                pageIndex=index,
                classification=page_classification,
                fields=page_fields,
                trades=page_trades,
                warnings=[],
            )
        )
        processed_pages += 1

    # Nothing readable on ANY page - an explicit UNPROCESSABLE, never an
    # empty pretend-result (§20/§21).
    if not page_results or all(
        not page.fields and not page.trades and page.classification is None
        for page in page_results
    ):
        return _respond_document(
            request_id,
            "UNPROCESSABLE",
            [],
            doc_hash,
            EngineFailure(
                category="SCREENSHOT_UNSUPPORTED",
                message="no readable text found in this document",
            ),
            durations(),
            document_pages=len(pages),
            document_width=pages[0].width,
            document_height=pages[0].height,
        )

    warnings: list[str] = []
    if partial:
        warnings.append(f"PDF_DEADLINE_PARTIAL:{processed_pages}")
    # Statement PDFs are TRADE-vocabulary documents (Account & Chart V1.1):
    # the extraction stays on the trade path and the answer says so honestly.
    if request.extractionProfile != "TRADE_SUMMARY":
        warnings.append("PROFILE_PDF_TRADE_ONLY")

    logger.info(
        "document recognition request_id=%s pages=%d/%d pages_with_results=%d total_ms=%d",
        request_id,
        processed_pages,
        len(pages),
        len(page_results),
        durations()["totalMs"],
    )

    return _respond_document(
        request_id,
        "COMPLETED",
        page_results,
        doc_hash,
        None,
        {"totalMs": durations()["totalMs"]},
        warnings=warnings,
        document_pages=len(pages),
        document_width=pages[0].width,
        document_height=pages[0].height,
    )
