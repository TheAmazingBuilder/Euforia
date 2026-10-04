"""FastAPI OCR sidecar (Phase 19 §4/§26/§27).

Boundary discipline:
  - NO users, NO authnz decisions, NO trading state, NO persistence (§4):
    the sidecar is a STATELESS processing function over one image;
  - service-to-service shared token (§27) — no public unauthenticated OCR;
  - strict request schema; unknown fields stripped by pydantic;
  - per-image failures answer 200 with processingStatus
    UNPROCESSABLE/FAILED (the Nest side maps them, §34); request-level
    problems (auth, size, schema) are HTTP errors;
  - no LLM (§28) — deterministic OCR (Tesseract) + keyword classification;
  - never logs image bytes or secrets (§36): request ids, sizes, durations.
"""

from __future__ import annotations

import base64
import binascii
import logging
import time
from typing import Optional

from fastapi import FastAPI, HTTPException, Request
from fastapi.responses import JSONResponse

from .classification import classify
from .config import CONTRACT_VERSION, settings
from .contract import EngineRequest, EngineResponse, EngineProcessingMetadata, EngineFailure
from .extraction import ENGINE_NAME, extract_fields, run_ocr, tesseract_version
from .validation import ImageRejected, validate_and_prepare

logger = logging.getLogger("ocr-service")
logging.basicConfig(level=logging.INFO, format="%(message)s")

PIPELINE_VERSION = "1.0.0"
ENGINE_VERSION = tesseract_version()

app = FastAPI(title="Cosmoz OCR Service", version=PIPELINE_VERSION, docs_url=None, redoc_url=None)


@app.middleware("http")
async def internal_token_guard(request: Request, call_next):
    """Service-to-service auth (§27) — every route except /healthz is guarded."""
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
    """Liveness for orchestration — carries NO user data."""
    return {"status": "ok", "engine": ENGINE_NAME, "engineVersion": ENGINE_VERSION}


@app.post("/v1/recognitions")
def recognize(request: EngineRequest) -> JSONResponse:
    if request.contractVersion != CONTRACT_VERSION:
        raise HTTPException(status_code=400, detail="unsupported contractVersion")

    started = time.perf_counter()
    request_id = request.requestId
    image_size = len(request.imageBase64)

    def durations() -> dict:
        return {"totalMs": int((time.perf_counter() - started) * 1000)}

    # Request-level size guard (§38) — before base64 decoding.
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

    try:
        _mime, prepared = validate_and_prepare(image_bytes, request.metadata, settings.max_pixels)
    except ImageRejected as exc:
        return _respond(
            request_id,
            processing_status="UNPROCESSABLE",
            classification=None,
            fields=[],
            warnings=[],
            failure=EngineFailure(category="SCREENSHOT_UNSUPPORTED", message=str(exc)),
            durations=durations(),
        )  # mime is advisory — validation already reconciled it with the metadata

    # Deadline honoring between heavy stages (soft — best effort, §26).
    deadline_seconds = request.deadlineMs / 1000.0

    ocr_started = time.perf_counter()
    try:
        lines = run_ocr(prepared.upscaled, settings.tesseract_lang)
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
        # No readable text at all — nothing usable for a trade review (§20:
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
        )

    classification = classify(text_joined)
    fields = extract_fields(lines)

    logger.info(
        "recognition request_id=%s bytes=%d lines=%d fields=%d ocr_ms=%d total_ms=%d",
        request_id,
        len(image_bytes),
        len(lines),
        len(fields),
        ocr_ms,
        durations()["totalMs"],
    )

    return _respond(
        request_id,
        processing_status="COMPLETED",
        classification=classification,
        fields=fields,
        warnings=[],
        failure=None,
        durations={"totalMs": durations()["totalMs"], "ocrMs": ocr_ms},
    )


def _respond(
    request_id: str,
    processing_status: str,
    classification,
    fields,
    warnings: list,
    failure: Optional[EngineFailure],
    durations: dict,
) -> JSONResponse:
    body = EngineResponse(
        requestId=request_id,
        contractVersion=CONTRACT_VERSION,
        processingStatus=processing_status,  # type: ignore[arg-type]
        classification=classification,
        fields=fields,
        warnings=warnings,
        processingMetadata=EngineProcessingMetadata(
            engine=ENGINE_NAME,
            engineVersion=ENGINE_VERSION,
            pipelineVersion=PIPELINE_VERSION,
            durationsMs=durations,
        ),
        failure=failure,
    )
    return JSONResponse(status_code=200, content=body.model_dump(mode="json"))
