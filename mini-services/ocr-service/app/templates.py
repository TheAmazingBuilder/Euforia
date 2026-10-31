"""Platform layout templates (engine quality review §1.3).

The classifier already names the platform (§9). Templates turn that name
into STRUCTURAL PRIORS for extraction - known layouts constrain what the
field finders may accept and reward evidence found in the expected shape:

  MT5_DESKTOP_HISTORY - landscape panels with one trade per row:
      time · type · volume · symbol · price [· sl · tp · profit];
      S/L and T/P often appear as COLUMN HEADERS rather than per-row labels;
      a trailing signed number on a closed row is the profit;
      volumes span a wider plausible range (portfolio accounts).

  MT5_MOBILE_SUMMARY - portrait position cards:
      direction and volume are adjacent ("buy 0.15"),
      S/L / T/P / Profit are explicit per-card labels,
      one trade per screenshot.

  GENERIC - the conservative V1 behavior (no structural assumptions).

Templates NEVER invent values - they can only (a) widen/tighten plausibility
windows, (b) add a small explainable confidence bonus when the evidence fits
the expected row shape (LAYOUT_MATCH note), (c) enable the trailing-profit
rule for history rows. Everything stays deterministic and auditable.
"""

from __future__ import annotations

import re
from dataclasses import dataclass, field
from typing import List, Optional, Tuple

from .contract import EngineField, SourceRegion
from .extraction_types import OcrLine, OcrWord

# Layout template names - reported in processingMetadata.passes for observability.
MT5_DESKTOP_HISTORY = "MT5_DESKTOP_HISTORY"
MT5_MOBILE_SUMMARY = "MT5_MOBILE_SUMMARY"
GENERIC = "GENERIC"

# Direction words - V2 §11 normalization vocabulary: the LONG/SHORT synonyms
# are now FIRST-CLASS direction evidence (they were already accepted by
# normalize_direction; the regex simply never matched them before).
DIRECTION_WORD = re.compile(r"^(buy|sell|b|s|long|short)$", re.IGNORECASE)
DECIMAL_TOKEN = re.compile(r"^[-+]?\d{1,3}(?:[.,\s]\d{3})*(?:[.,]\d+)?|[-+]?\d+[.,]\d+|^[-+]?\d+$")
TIME_TOKEN = re.compile(r"^\d{4}[.-]\d{2}[.-]\d{2}[ T]?\d{2}:\d{2}(?::\d{2})?$")
SYMBOL_TOKEN = re.compile(r"^[A-Za-z]{2,6}(?:[A-Za-z0-9]{0,4})?$")
SL_LABELS = re.compile(r"\bs[./]?l\b", re.IGNORECASE)
TP_LABELS = re.compile(r"\bt[./]?p\b", re.IGNORECASE)
PROFIT_LABELS = re.compile(r"\bprofit\b", re.IGNORECASE)
# Exit price (V2 §11) lives in extraction.py as WORD-level label shapes -
# the bare word "close" in a history row is an order TYPE there, and the
# OCR splits "exit price" into two words, so a single-line regex cannot
# express the rule (see _EXIT_WORD / _exit_labeled_value).

# Words that can never be a symbol (platform vocabulary - mirrors extraction).
SYMBOL_STOPWORDS = {
    "BUY", "SELL", "PROFIT", "BALANCE", "EQUITY", "MARGIN", "DEPOSIT",
    "WITHDRAWAL", "CREDIT", "SYMBOL", "TIME", "TYPE", "VOLUME", "PRICE",
    "ORDER", "DEAL", "POSITION", "METATRADER", "TRADINGVIEW", "CHART",
    "INDICATOR", "TOOLS", "MARKET", "WATCH", "NAVIGATOR", "TOOLBOX",
    "LOGIN", "ACCOUNT", "HISTORY", "EXPERT", "TRADE", "LOSS",
}


@dataclass(frozen=True)
class LayoutTemplate:
    """Structural priors for one platform layout (deterministic, explainable)."""

    name: str
    # Plausible volume window - lots (history panels accept portfolio sizes).
    volume_min: float
    volume_max: float
    # History rows may carry the profit as the LAST signed decimal (no label).
    trailing_profit: bool
    # Confidence bonus applied when a field matches the expected row shape.
    shape_bonus: float


MT5_DESKTOP = LayoutTemplate(
    name=MT5_DESKTOP_HISTORY,
    volume_min=0.01,
    volume_max=500.0,
    trailing_profit=True,
    shape_bonus=0.04,
)

MT5_MOBILE = LayoutTemplate(
    name=MT5_MOBILE_SUMMARY,
    volume_min=0.01,
    volume_max=200.0,
    trailing_profit=False,
    shape_bonus=0.03,
)

GENERIC_TEMPLATE = LayoutTemplate(
    name=GENERIC,
    volume_min=0.01,
    volume_max=1000.0,
    trailing_profit=False,
    shape_bonus=0.0,
)


# Classification types that carry MT5 layout evidence (V2 §19 taxonomy +
# the legacy MT5_TRADE value that older persisted results still use).
MT5_TYPES = frozenset({
    "MT5_TRADE",
    "TRADE_HISTORY",
    "OPEN_POSITION",
    "TRADE_DETAIL",
    "POSITION_DETAIL",
    "ORDER",
})


def choose_template(
    classification_type: Optional[str],
    width: int,
    height: int,
    platform: Optional[str] = None,
) -> LayoutTemplate:
    """Pick the layout template from the classification + geometry.

    MT5 evidence (detected platform, or an MT5-shaped type for legacy
    callers) + a landscape aspect ratio (desktop panel) selects the history
    template; MT5 evidence on a portrait/square crop selects the mobile
    summary. Anything else stays GENERIC - no guesses (§9).
    """
    is_mt5 = (platform == "MT5") or (
        platform is None and classification_type in MT5_TYPES
    )
    if not is_mt5:
        return GENERIC_TEMPLATE
    if height <= 0:
        return GENERIC_TEMPLATE
    aspect = width / height
    if aspect >= 1.5:
        return MT5_DESKTOP
    if aspect <= 1.05:
        return MT5_MOBILE
    # Ambiguous aspect (1.05..1.5): landscape-leaning wide panels with many
    # candidate rows behave like history; otherwise the summary priors are
    # the safer default (tighter windows, no trailing-profit inference).
    return MT5_MOBILE


def symbol_candidate(word: OcrWord) -> bool:
    """Token plausibility for a symbol (shared by extraction + templates)."""
    candidate = word.text.strip(",.;:")
    if not SYMBOL_TOKEN.match(candidate):
        return False
    if DECIMAL_TOKEN.match(candidate) or TIME_TOKEN.match(candidate):
        return False
    return candidate.upper() not in SYMBOL_STOPWORDS


def find_order_rows(lines: List[OcrLine]) -> List[Tuple[int, OcrLine]]:
    """Lines that look like trade rows: a direction word + a symbol token.

    Used by the history template to locate per-trade evidence. Returns
    (line_index, line) in reading order.
    """
    rows: List[Tuple[int, OcrLine]] = []
    for index, line in enumerate(lines):
        texts = [word.text for word in line.words]
        has_direction = any(DIRECTION_WORD.match(text) for text in texts)
        has_symbol = any(symbol_candidate(word) for word in line.words)
        if has_direction and has_symbol:
            rows.append((index, line))
    return rows


def is_header_row(line: OcrLine) -> bool:
    """A desktop header row: S/L and/or T/P present with NO decimal values."""
    has_labels = any(SL_LABELS.search(w.text) or TP_LABELS.search(w.text) for w in line.words)
    has_values = any(DECIMAL_TOKEN.match(w.text) for w in line.words)
    return has_labels and not has_values


def trailing_profit_value(line: OcrLine) -> Optional[OcrWord]:
    """The LAST signed decimal on a history row - MT5's profit column.

    Only enabled by the desktop history template (trailing_profit=True) and
    only when the sign is explicit (+/−): an unsigned trailing number is far
    too ambiguous to claim (§20 - never invent).
    """
    for word in reversed(line.words):
        if re.match(r"^[-+]\d", word.text) and DECIMAL_TOKEN.match(word.text):
            return word
        if PROFIT_LABELS.search(word.text):
            return None  # labeled profit already handled by the base extractor
    return None


def apply_shape_bonus(field: EngineField, template: LayoutTemplate) -> EngineField:
    """Reward evidence that fits the expected layout - small, explainable.

    The bonus never pushes a field past 0.99 and always carries the
    LAYOUT_MATCH note so the review UI can show why confidence rose.
    """
    if template.shape_bonus <= 0.0 or field.normalizedValue is None:
        return field
    boosted = min(field.confidence + template.shape_bonus, 0.99)
    return EngineField(
        field=field.field,
        rawValue=field.rawValue,
        normalizedValue=field.normalizedValue,
        confidence=round(boosted, 3),
        sourceRegion=field.sourceRegion,
        notes=field.notes + ["LAYOUT_MATCH"] if "LAYOUT_MATCH" not in field.notes else field.notes,
    )


def volume_plausible(value: float, template: LayoutTemplate) -> bool:
    return template.volume_min <= value <= template.volume_max
