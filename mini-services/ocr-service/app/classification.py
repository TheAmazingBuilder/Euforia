"""Deterministic screenshot classification (Phase 19 §9).

Keyword heuristics over the recognized text — no ML, no provider-specific
logic beyond the platforms the product targets (§9): MT5 trade panels and
TradingView charts. Confidence is a transparent function of matched
keyword weights; UNKNOWN is an explicit outcome, never a guess.
"""

from __future__ import annotations

import re
from typing import List, Tuple

from .contract import ClassificationCandidate, EngineClassification

# (keyword, weight) — deterministic, explainable evidence (§9).
MT5_KEYWORDS: Tuple[Tuple[str, float], ...] = (
    (r"\bmetatrader\b", 1.0),
    (r"\bmt5\b", 0.9),
    (r"\btoolbox\b", 0.7),
    (r"\bnavigator\b", 0.7),
    (r"\bmarket watch\b", 0.8),
    (r"\bs/l\b", 0.5),
    (r"\bt/p\b", 0.5),
    (r"\bprofit\b", 0.4),
)
TRADINGVIEW_KEYWORDS: Tuple[Tuple[str, float], ...] = (
    (r"\btradingview\b", 1.2),
    (r"\bpine\b", 0.6),
    (r"\bindicator\b", 0.4),
    (r"\bchart\b", 0.3),
)

_WORD = re.compile(r"[a-z]+")


def classify(text: str) -> EngineClassification:
    haystack = text.lower()
    mt5_score = sum(weight for pattern, weight in MT5_KEYWORDS if re.search(pattern, haystack))
    tv_score = sum(weight for pattern, weight in TRADINGVIEW_KEYWORDS if re.search(pattern, haystack))
    words = _WORD.findall(haystack)
    total = max(len(words), 1)

    # Normalized scores — bounded, monotonic in the matched evidence.
    mt5_conf = min(0.98, mt5_score / (mt5_score + 2.0)) if mt5_score > 0 else 0.0
    tv_conf = min(0.95, tv_score / (tv_score + 2.0)) if tv_score > 0 else 0.0
    # Density bonus: trade-line vocabulary in a text-poor screenshot is a
    # strong MT5 signal (real MT5 screenshots OCR with few words).
    if mt5_score >= 1.0 and total < 60:
        mt5_conf = min(0.98, mt5_conf + 0.25)

    candidates: List[Tuple[str, float]] = []
    if mt5_conf > 0.05:
        candidates.append(("MT5_TRADE", round(mt5_conf, 3)))
    if tv_conf > 0.05:
        candidates.append(("TRADINGVIEW_CHART", round(tv_conf, 3)))
    candidates.sort(key=lambda item: item[1], reverse=True)

    if not candidates or candidates[0][1] < 0.2:
        return EngineClassification(
            type="UNKNOWN",
            confidence=round(max(0.05, candidates[0][1] if candidates else 0.05), 3),
            alternatives=[],
        )

    best_type, best_conf = candidates[0]
    alternatives = [ClassificationCandidate(type=t, confidence=c) for t, c in candidates[1:4]]
    return EngineClassification(type=best_type, confidence=best_conf, alternatives=alternatives)
