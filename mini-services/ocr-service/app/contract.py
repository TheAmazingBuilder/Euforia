"""NestJS ↔ FastAPI contract models (Phase 19 §26).

Mirrors the Zod schemas in apps/api/src/modules/ocr/engine/ocr-engine.port.ts
(contractVersion "1"). The sidecar ANSWERS with these shapes and strips
unknown inputs — the Nest side re-validates everything (§54: engine output
is untrusted) but the wire discipline starts here.
"""

from __future__ import annotations

from typing import Any, Dict, List, Literal, Optional

from pydantic import BaseModel, Field

ProcessingStatus = Literal["COMPLETED", "UNPROCESSABLE", "FAILED"]
Profile = Literal["TRADE_SUMMARY"]

FIELD_KEYS = (
    "symbol",
    "direction",
    "volume",
    "entryPrice",
    "exitPrice",
    "stopLoss",
    "takeProfit",
    "profit",
    "openTime",
    "closeTime",
)

FAILURE_CATEGORIES = (
    "PROCESSING_TIMEOUT",
    "OCR_UNAVAILABLE",
    "SCREENSHOT_UNSUPPORTED",
    "EXTRACTION_FAILED",
    "VALIDATION_FAILED",
    "RESOURCE_LIMIT",
    "ENGINE_ERROR",
)


class EngineMetadata(BaseModel):
    mime: str
    sizeBytes: int = Field(ge=0)
    width: int = Field(ge=1)
    height: int = Field(ge=1)
    checksumSha256: str


class SourceRegion(BaseModel):
    x: int = Field(ge=0)
    y: int = Field(ge=0)
    width: int = Field(gt=0)
    height: int = Field(gt=0)


class EngineRequest(BaseModel):
    requestId: str = Field(min_length=1, max_length=128)
    contractVersion: str = Field(min_length=1, max_length=8)
    imageBase64: str = Field(min_length=16)
    metadata: EngineMetadata
    extractionProfile: Profile = "TRADE_SUMMARY"
    deadlineMs: int = Field(default=25_000, ge=1_000, le=120_000)
    # Re-OCR by crop (engine quality phase §2.4): optional pixel region —
    # the image is cropped to this region BEFORE preprocessing. Owner-side
    # (NestJS) validates the region against the asset dimensions.
    crop: Optional[SourceRegion] = None


class EngineField(BaseModel):
    field: str
    rawValue: Optional[str] = None
    normalizedValue: Optional[str] = None
    confidence: float = Field(ge=0.0, le=1.0)
    sourceRegion: Optional[SourceRegion] = None
    notes: List[str] = Field(default_factory=list, max_length=8)


class ClassificationCandidate(BaseModel):
    type: str
    confidence: float = Field(ge=0.0, le=1.0)


class EngineClassification(BaseModel):
    type: str
    confidence: float = Field(ge=0.0, le=1.0)
    alternatives: List[ClassificationCandidate] = Field(default_factory=list, max_length=4)


class EngineProcessingMetadata(BaseModel):
    engine: str
    engineVersion: str
    pipelineVersion: str
    durationsMs: Dict[str, int] = Field(default_factory=dict)
    # Engine-quality observability: the passes that ran ("block_psm6",
    # "sparse_psm11"), the chosen layout template, deskew measurement.
    passes: List[str] = Field(default_factory=list, max_length=8)
    layoutTemplate: Optional[str] = None
    deskewDeg: Optional[float] = None
    # PDF statements (ops §4.3): pages processed + rendered first-page dims
    # (PDFs carry no intrinsic pixel size — the Nest side learns them here).
    documentPages: Optional[int] = None
    documentWidth: Optional[int] = None
    documentHeight: Optional[int] = None


class EngineTradeCandidate(BaseModel):
    """One multi-trade draft grouped from an account-history screenshot.
    Fields only — grouping is evidence, never a created trade (§21)."""

    fields: List[EngineField] = Field(default_factory=list, max_length=16)


class EngineFailure(BaseModel):
    category: str
    message: str = Field(max_length=256)


class EngineResponse(BaseModel):
    requestId: str
    contractVersion: str
    processingStatus: ProcessingStatus
    classification: Optional[EngineClassification] = None
    fields: List[EngineField] = Field(default_factory=list, max_length=64)
    # Multi-trade drafts (account-history screenshots) — empty for the
    # mono-trade path (UI keeps a single review card).
    tradeCandidates: List[EngineTradeCandidate] = Field(default_factory=list, max_length=20)
    warnings: List[str] = Field(default_factory=list, max_length=16)
    # Perceptual fingerprint (dHash, 16 hex chars) — the Nest side owns
    # storage and duplicate decisions; the sidecar only computes it.
    perceptualHash: Optional[str] = None
    processingMetadata: EngineProcessingMetadata
    failure: Optional[EngineFailure] = None


def field_names() -> List[str]:
    """Valid field keys — the sidecar never invents fields outside this set."""
    return list(FIELD_KEYS)
