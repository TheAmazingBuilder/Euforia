"""Deterministic screenshot classification (Phase 19 §9 + V2 spec §18/§19).

Two independent, keyword-weighted detectors over the recognized text —
no ML, no vision models (V2 §5):

  detect_platform()        → MT5 | MT4 | TRADINGVIEW | CTRADER |
                             NINJATRADER | INTERACTIVE_BROKERS | DERIV
  detect_screenshot_type() → TRADE_HISTORY | OPEN_POSITION | ORDER |
                             TRADE_DETAIL | ACCOUNT_SUMMARY | CHART |
                             POSITION_DETAIL

UNKNOWN is an explicit outcome for both — never a guess. Confidence is a
transparent function of matched keyword weights (score / (score + 2)),
bounded, monotonic in the evidence, and documented here so every number
the review UI shows can be explained (V2 §27/§77).
"""

from __future__ import annotations

import re
from typing import Dict, List, Tuple

from .contract import ClassificationCandidate, EngineClassification

# ── Platform evidence (V2 §18) ───────────────────────────────────────────────
# (keyword, weight) — deterministic, explainable. A platform needs STRONG
# vocabulary (its own name/product terms); generic trade words (S/L, profit)
# belong to the TYPE detector, not to a platform claim.
PLATFORM_KEYWORDS: Dict[str, Tuple[Tuple[str, float], ...]] = {
    "MT5": (
        (r"\bmetatrader\s*5\b", 1.2),
        (r"\bmt5\b", 1.1),
        (r"\bmetatrader\b", 0.5),
        (r"\bmarket watch\b", 0.6),
        (r"\btoolbox\b", 0.5),
        (r"\bnavigator\b", 0.5),
    ),
    "MT4": (
        (r"\bmetatrader\s*4\b", 1.2),
        (r"\bmt4\b", 1.1),
    ),
    "CTRADER": (
        (r"\bctrader\b", 1.2),
        (r"\bc\s?trader\b", 1.0),
        (r"\bspotware\b", 0.9),
    ),
    "NINJATRADER": (
        (r"\bninjatrader\b", 1.2),
        (r"\bninja\s?trader\b", 1.0),
    ),
    "INTERACTIVE_BROKERS": (
        (r"\binteractive\s?brokers?\b", 1.2),
        (r"\bibkr\b", 1.1),
        (r"\btrader\s?workstation\b", 1.0),
        (r"\btws\b", 0.7),
    ),
    "DERIV": (
        (r"\bderiv\b", 1.2),
        (r"\bdtrader\b", 1.0),
    ),
    "TRADINGVIEW": (
        (r"\btradingview\b", 1.2),
        (r"\bpine\b", 0.6),
        (r"\bindicator\b", 0.4),
    ),
}

# ── Screenshot-type evidence (V2 §19) ────────────────────────────────────────
# Weighted vocabulary per type. Structural adjustments (row counts, account
# vs trade vocabulary) are applied afterwards — all deterministic.
TYPE_KEYWORDS: Dict[str, Tuple[Tuple[str, float], ...]] = {
    "TRADE_HISTORY": (
        (r"\baccount history\b", 1.2),
        (r"\bhistory\b", 0.9),
        (r"\bdeals?\b", 0.5),
    ),
    "OPEN_POSITION": (
        (r"\bopen positions?\b", 1.2),
        (r"\bpositions?\b", 0.4),
    ),
    "ORDER": (
        (r"\bnew order\b", 1.2),
        (r"\bmarket execution\b", 1.1),
        (r"\bpending order\b", 1.0),
        (r"\bbuy limit\b", 0.9),
        (r"\bsell limit\b", 0.9),
        (r"\bbuy stop\b", 0.9),
        (r"\bsell stop\b", 0.9),
        (r"\bplace order\b", 0.9),
    ),
    "ACCOUNT_SUMMARY": (
        (r"\bfree margin\b", 1.0),
        (r"\bmargin level\b", 0.9),
        (r"\bbalance\b", 0.7),
        (r"\bequity\b", 0.7),
        (r"\bdeposit\b", 0.4),
        (r"\bwithdrawal\b", 0.4),
    ),
    "POSITION_DETAIL": (
        (r"\bposition detail\b", 1.1),
        (r"\bposition information\b", 1.0),
    ),
    "CHART": (
        (r"\bchart\b", 0.9),
        (r"\bcandles?\b", 0.5),
        (r"\btimeframe\b", 0.4),
        (r"\bm1\b", 0.3),
        (r"\bm5\b", 0.3),
        (r"\bm15\b", 0.3),
        (r"\bh1\b", 0.3),
        (r"\bh4\b", 0.3),
        (r"\bd1\b", 0.3),
    ),
}

# Risk/profit labels — the vocabulary of a single-trade detail card (used as
# structural evidence for TRADE_DETAIL, matching the extraction labels).
_TRADE_LABELS = re.compile(r"\bs[./]?l\b|\bt[./]?p\b|\bprofit\b", re.IGNORECASE)
_DIRECTION_OCCURRENCE = re.compile(r"\b(?:buy|sell|long|short)\b", re.IGNORECASE)

_WORD = re.compile(r"[a-z]+")

# Platforms whose screenshots are charts by nature — platform evidence alone
# lifts the CHART type (TradingView windows are charts even with sparse text).
_CHART_BY_PLATFORM = {"TRADINGVIEW"}

# Minimum normalized confidence to claim anything at all (V2 §18: UNKNOWN is
# explicit — below this the answer is UNKNOWN, never the best guess).
_CLAIM_THRESHOLD = 0.2


def _confidence(score: float, cap: float) -> float:
    """Normalized, bounded, monotonic confidence (the V1 formula)."""
    return min(cap, score / (score + 2.0)) if score > 0 else 0.0


def detect_platform(text: str) -> Tuple[str, float]:
    """Weighted keyword sum → (platform, confidence). UNKNOWN below threshold."""
    haystack = text.lower()
    best_name, best_score = "UNKNOWN", 0.0
    for name, keywords in PLATFORM_KEYWORDS.items():
        score = sum(weight for pattern, weight in keywords if re.search(pattern, haystack))
        if score > best_score:
            best_name, best_score = name, score
    confidence = _confidence(best_score, 0.98)
    if confidence < _CLAIM_THRESHOLD:
        return "UNKNOWN", round(max(0.05, confidence), 3)
    return best_name, round(confidence, 3)


def detect_screenshot_type(text: str, platform: str) -> Tuple[str, float]:
    """Weighted vocabulary + structural evidence → (type, confidence).

    Structural rules (deterministic, documented):
      - a TradingView screenshot is a CHART by nature (platform evidence);
      - many direction words + history vocabulary is a TRADE_HISTORY table;
      - exactly one direction word + trade labels is a single TRADE_DETAIL
        card (the MT5 mobile summary shape);
      - account vocabulary with NO direction words is an ACCOUNT_SUMMARY;
      - everything below the claim threshold stays UNKNOWN.
    """
    haystack = text.lower()
    direction_count = len(_DIRECTION_OCCURRENCE.findall(haystack))
    has_trade_labels = bool(_TRADE_LABELS.search(haystack))

    scores: Dict[str, float] = {}
    for type_name, keywords in TYPE_KEYWORDS.items():
        scores[type_name] = sum(weight for pattern, weight in keywords if re.search(pattern, haystack))

    # Structural adjustments — explainable deltas, never fabricated evidence.
    if direction_count >= 2 and scores.get("TRADE_HISTORY", 0.0) > 0.0:
        scores["TRADE_HISTORY"] += 0.4
    if direction_count == 1 and has_trade_labels:
        scores["TRADE_DETAIL"] = scores.get("TRADE_DETAIL", 0.0) + 0.8
    if direction_count == 0 and scores.get("ACCOUNT_SUMMARY", 0.0) > 0.0:
        scores["ACCOUNT_SUMMARY"] += 0.5
    if platform in _CHART_BY_PLATFORM and direction_count == 0:
        scores["CHART"] = scores.get("CHART", 0.0) + 1.0

    ranked: List[Tuple[str, float]] = sorted(
        ((name, score) for name, score in scores.items() if score > 0.0),
        key=lambda item: item[1],
        reverse=True,
    )
    if not ranked:
        return "UNKNOWN", 0.05
    best_type, best_score = ranked[0]
    confidence = _confidence(best_score, 0.95)
    if confidence < _CLAIM_THRESHOLD:
        return "UNKNOWN", round(max(0.05, confidence), 3)
    return best_type, round(confidence, 3)


def classify(text: str) -> EngineClassification:
    """Full classification: platform + screenshot type + type alternatives."""
    platform, _platform_conf = detect_platform(text)
    ranked: List[Tuple[str, float]] = []
    haystack = text.lower()
    for type_name, keywords in TYPE_KEYWORDS.items():
        score = sum(weight for pattern, weight in keywords if re.search(pattern, haystack))
        if score > 0.0:
            ranked.append((type_name, score))
    ranked.sort(key=lambda item: item[1], reverse=True)

    best_type, best_conf = detect_screenshot_type(text, platform)
    alternatives = [
        ClassificationCandidate(type=name, confidence=round(_confidence(score, 0.95), 3))
        for name, score in ranked[1:4]
        if name != best_type
    ]
    return EngineClassification(type=best_type, confidence=best_conf, alternatives=alternatives, platform=platform)
