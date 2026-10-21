"""Account snapshot extraction (Account & Chart V1.1 — ACCOUNT_POSITION).

The ACCOUNT_POSITION profile reads:
  1. the account HEADER — labeled values on an account summary panel
     (login, server, currency, leverage, balance, equity, margin, free
     margin, margin level);
  2. the OPEN POSITIONS table — rows reusing the trade-row grammar
     (find_order_rows + the multi-trade candidate grouper), each position
     becoming one candidate draft for grouped confirmation.

MT5 vocabulary (desktop Toolbox "Trade" tab, mobile account page, position
cards): Login, Server, Currency / Deposit currency, Leverage, Balance,
Equity, Margin, Free Margin, Margin Level.

Extraction stays CONSERVATIVE (§20): labeled evidence only — a value is
accepted when a KNOWN label precedes it, never from position alone. The
"margin" family is matched by SPECIFICITY priority (margin level > free
margin > margin) so the least specific label can never swallow a value
that belongs to a more specific one.
"""

from __future__ import annotations

import re
from typing import Dict, List, Optional, Tuple

from .contract import EngineField
from .extraction import DECIMAL_TOKEN, _decimal_from, _region_in
from .extraction_types import OcrLine, OcrWord

__all__ = ["extract_account_fields"]

# ── Label vocabulary (deterministic, explainable evidence) ───────────────────

# kind: DECIMAL → normalize_decimal; DIGITS → pure-digit token (login);
# CURRENCY → 3-letter code; LEVERAGE → "1:500" shape; TEXT → short free text
# (server names — letters/digits/dot/dash only, never prose).
_LABEL_RULES: Tuple[Tuple[re.Pattern, str, str], ...] = tuple(
    (re.compile(pattern, re.IGNORECASE), key, kind)
    for pattern, key, kind in (
        (r"^margin[ ]?level[:.]?$", "accountMarginLevel", "DECIMAL"),  # most specific first
        (r"^free[ ]?margin[:.]?$", "accountFreeMargin", "DECIMAL"),
        (r"^margin[:.]?$", "accountMargin", "DECIMAL"),
        (r"^balance[:.]?$", "accountBalance", "DECIMAL"),
        (r"^equity[:.]?$", "accountEquity", "DECIMAL"),
        (r"^(deposit[ ]?currency|currency)[:.]?$", "accountCurrency", "CURRENCY"),
        (r"^leverage[:.]?$", "accountLeverage", "LEVERAGE"),
        (r"^login[:.]?$", "accountLogin", "DIGITS"),
        (r"^server[:.]?$", "accountServer", "TEXT"),
    )
)

_LEVERAGE_TOKEN = re.compile(r"^\d{1,3}:\d{1,5}$")
_DIGITS_TOKEN = re.compile(r"^\d{4,12}$")
_CURRENCY_TOKEN = re.compile(r"^[A-Za-z]{3}$")
_TEXT_TOKEN = re.compile(r"^[A-Za-z0-9][A-Za-z0-9 ._-]{0,30}$")

# Header labels must START a value — a label in the middle of a position row
# ("Symbol Margin Profit") is table chrome, not a labeled header value.
# Two-word labels ("Free Margin", "Margin Level", "Deposit Currency") are
# joined ACROSS adjacent words: the two-word form is checked FIRST so the
# more specific label always wins over its bare prefix.
def _label_at(line: OcrLine, index: int) -> Optional[Tuple[str, str, int]]:
    """The label rule matching at `index` — (key, kind, label_word_count).

    The two-word join wins over the single-word match; the word count tells
    the value scanner where the label ends.
    """
    first = line.words[index].text.strip(",.;:")
    if index + 1 < len(line.words):
        joined = f"{first} {line.words[index + 1].text.strip(',.;:')}"
        for pattern, key, kind in _LABEL_RULES:
            if pattern.match(joined):
                return (key, kind, 2)
    for pattern, key, kind in _LABEL_RULES:
        if pattern.match(first):
            return (key, kind, 1)
    return None


def _value_after(line: OcrLine, index: int, kind: str) -> Optional[Tuple[OcrWord, str]]:
    """The value token following a label, per the label's value kind.

    DECIMAL keeps the strict shape discipline of the trade extraction
    (fullmatch on the punctuation-stripped token + actual normalization);
    text kinds accept the FIRST conforming follower within a 2-word window.
    """
    for follower in line.words[index + 1 : index + 3]:
        candidate = follower.text.strip(",.;:")
        if kind == "DECIMAL":
            if not DECIMAL_TOKEN.fullmatch(candidate):
                continue
            normalized = _decimal_from(follower)
            if normalized is not None and normalized.value is not None:
                return (follower, normalized.value)
        elif kind == "DIGITS":
            if _DIGITS_TOKEN.match(candidate):
                return (follower, candidate)
        elif kind == "CURRENCY":
            if _CURRENCY_TOKEN.match(candidate):
                return (follower, candidate.upper())
        elif kind == "LEVERAGE":
            if _LEVERAGE_TOKEN.match(candidate):
                return (follower, candidate)
        elif kind == "TEXT":
            if _TEXT_TOKEN.match(candidate) and not DECIMAL_TOKEN.fullmatch(candidate):
                return (follower, candidate)
    return None


def _confidence(line: OcrLine, word: OcrWord) -> float:
    return round(min(line.confidence * (word.confidence / 100.0), 0.99), 3)


def extract_account_fields(lines: List[OcrLine]) -> List[EngineField]:
    """Labeled account-header extraction over the OCR lines.

    Returns one EngineField per recognized header value, highest confidence
    wins per key. Positions are NOT extracted here — the caller groups them
    through the shared trade-row grammar (extract_trade_candidates).
    """
    fields: Dict[str, EngineField] = {}

    for line in lines:
        index = 0
        while index < len(line.words):
            labeled = _label_at(line, index)
            if labeled is None:
                index += 1
                continue
            key, kind, label_words = labeled
            found = _value_after(line, index + label_words - 1, kind)
            if found is None:
                index += 1
                continue
            value_word, value = found
            candidate = EngineField(
                field=key,
                rawValue=value_word.text,
                normalizedValue=value,
                confidence=_confidence(line, value_word),
                sourceRegion=_region_in(line, value_word),
                notes=[],
            )
            existing = fields.get(key)
            if existing is None or candidate.confidence > existing.confidence:
                fields[key] = candidate
            index += label_words
            break

    return list(fields.values())
