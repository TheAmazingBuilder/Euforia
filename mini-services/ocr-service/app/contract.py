"""NestJS ↔ FastAPI contract models (Phase 19 §26).

Mirrors the Zod schemas in apps/api/src/modules/ocr/engine/ocr-engine.port.ts
(contractVersion "1"). The sidecar ANSWERS with these shapes and strips
unknown inputs - the Nest side re-validates everything (§54: engine output
is untrusted) but the wire discipline starts here.
"""

from __future__ import annotations

from typing import Any, Dict, List, Literal, Optional

from pydantic import BaseModel, Field

ProcessingStatus = Literal["COMPLETED", "UNPROCESSABLE", "FAILED"]
# Recognition V1.1 - Account & Chart expansion. TRADE_SUMMARY stays the V1
# target; ACCOUNT_POSITION reads account snapshots (header fields + the open
# positions table as candidates); CHART_ANALYSIS reads chart screenshots
# (quote panel + visible indicator readings). Profiles route the extraction
# vocabulary - never invent fields outside the set.
Profile = Literal["TRADE_SUMMARY", "ACCOUNT_POSITION", "CHART_ANALYSIS"]

TRADE_FIELD_KEYS = (
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

ACCOUNT_FIELD_KEYS = (
    "accountLogin",
    "accountServer",
    "accountCurrency",
    "accountLeverage",
    "accountBalance",
    "accountEquity",
    "accountMargin",
    "accountFreeMargin",
    "accountMarginLevel",
)

CHART_FIELD_KEYS = (
    "chartTimeframe",
    "chartTime",
    "chartOpen",
    "chartHigh",
    "chartLow",
    "chartClose",
    "chartPrice",
    "chartChangePct",
    "chartRsi",
    "chartMacd",
    "chartAtr",
    "chartStoch",
    "chartAdx",
    "chartMa",
)

# Legacy name kept: candidate grouping validates against the TRADE set (the
# open-positions table of an account snapshot reuses the trade row grammar).
FIELD_KEYS = TRADE_FIELD_KEYS

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
    # Re-OCR by crop (engine quality phase §2.4): optional pixel region -
    # the image is cropped to this region BEFORE preprocessing. Owner-side
    # (NestJS) validates the region against the asset dimensions.
    crop: Optional[SourceRegion] = None
    # V2 §24 - pixel-rect re-read of a user-selected zone on the MAIN route
    # (mirrors ocr-engine.port.ts cropRegion). Distinct from `crop` (the
    # dedicated /v1/recrops route): this one rides the full recognition
    # contract and reports sourceRegion values OFFSET by the region origin
    # so every box lands in ORIGINAL-asset coordinates.
    cropRegion: Optional[SourceRegion] = None


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
    # V2 spec §18 - detected platform (MT5/MT4/TRADINGVIEW/CTRADER/...);
    # UNKNOWN is explicit, never a guess. Default keeps old callers parsing.
    platform: str = "UNKNOWN"


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
    # (PDFs carry no intrinsic pixel size - the Nest side learns them here).
    documentPages: Optional[int] = None
    documentWidth: Optional[int] = None
    documentHeight: Optional[int] = None


class EngineFailure(BaseModel):
    category: str
    message: str = Field(max_length=256)


class EngineTradeCandidate(BaseModel):
    """One multi-trade draft grouped from an account-history screenshot.
    Fields only - grouping is evidence, never a created trade (§21)."""

    fields: List[EngineField] = Field(default_factory=list, max_length=16)


class EngineTrade(BaseModel):
    """One grouped trade read by the engine's row clustering (V2 §2.2,
    mirrors engineTradeSchema on the Nest side): the pageIndex keeps the
    0-based screenshot/page provenance (documents merge pages)."""

    pageIndex: int = Field(ge=0)
    fields: List[EngineField] = Field(default_factory=list, max_length=64)


class EngineDocumentMetadata(BaseModel):
    """Document metadata - mirrors the Nest document request (NO width/
    height: PDFs carry no intrinsic pixel size; the sidecar learns the
    rendered dims and reports them back via processingMetadata)."""

    mime: str
    sizeBytes: int = Field(ge=0)
    checksumSha256: str


class EngineDocumentRequest(BaseModel):
    """PDF statement recognition (V2 document pipeline) - mirrors
    EngineDocumentRecognizeRequest on the Nest side. The checksum member is
    accepted for wire parity but NOT verified here: the document integrity
    check IS the render pipeline (undecodable/corrupt PDFs are rejected by
    the renderer); the strict checksum discipline stays on the image route
    where the bytes are the fingerprint subject."""

    requestId: str = Field(min_length=1, max_length=128)
    contractVersion: str = Field(min_length=1, max_length=8)
    documentBase64: str = Field(min_length=16)
    metadata: EngineDocumentMetadata
    extractionProfile: Profile = "TRADE_SUMMARY"
    deadlineMs: int = Field(default=60_000, ge=1_000, le=120_000)


class EngineDocumentPage(BaseModel):
    """One rendered page of a document recognition (per-page extraction -
    the Nest side owns the cross-page merge, the sidecar answers page-wise)."""

    pageIndex: int = Field(ge=0)
    classification: Optional[EngineClassification] = None
    fields: List[EngineField] = Field(default_factory=list, max_length=64)
    trades: List[EngineTrade] = Field(default_factory=list, max_length=20)
    warnings: List[str] = Field(default_factory=list, max_length=16)


class EngineDocumentResponse(BaseModel):
    requestId: str
    contractVersion: str
    processingStatus: ProcessingStatus
    pages: List[EngineDocumentPage] = Field(default_factory=list, max_length=1000)
    warnings: List[str] = Field(default_factory=list, max_length=16)
    perceptualHash: Optional[str] = None
    processingMetadata: EngineProcessingMetadata
    failure: Optional[EngineFailure] = None


class EngineResponse(BaseModel):
    requestId: str
    contractVersion: str
    processingStatus: ProcessingStatus
    classification: Optional[EngineClassification] = None
    fields: List[EngineField] = Field(default_factory=list, max_length=64)
    # V2 - grouped trades from row clustering ( pageIndex provenance). The
    # flat `fields` stay populated (back-compat: they mirror the primary
    # trade) - the review UI renders trades when present, else the flat set.
    trades: Optional[List[EngineTrade]] = Field(default=None, max_length=20)
    # Multi-trade drafts (account-history screenshots) - empty for the
    # mono-trade path (UI keeps a single review card).
    tradeCandidates: List[EngineTradeCandidate] = Field(default_factory=list, max_length=20)
    warnings: List[str] = Field(default_factory=list, max_length=16)
    # Perceptual fingerprint (dHash, 16 hex chars) - the Nest side owns
    # storage and duplicate decisions; the sidecar only computes it.
    perceptualHash: Optional[str] = None
    processingMetadata: EngineProcessingMetadata
    failure: Optional[EngineFailure] = None


def field_names() -> List[str]:
    """Valid field keys - the sidecar never invents fields outside this set.

    The union spans every profile: the Nest side re-validates per profile,
    so a TRADE_SUMMARY run returning account fields would be rejected there
    (defense in depth - the wire stays honest).
    """
    return list(TRADE_FIELD_KEYS) + list(ACCOUNT_FIELD_KEYS) + list(CHART_FIELD_KEYS)
