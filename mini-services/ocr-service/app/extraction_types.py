"""Shared OCR line/word types - kept separate from extraction.py so
templates.py and arbitration.py can import them without a cycle.
"""

from __future__ import annotations

from dataclasses import dataclass, field as dc_field
from typing import List, Optional

from .contract import SourceRegion


@dataclass
class OcrWord:
    text: str
    x: int
    y: int
    w: int
    h: int
    confidence: float


@dataclass
class OcrLine:
    words: List[OcrWord] = dc_field(default_factory=list)

    @property
    def text(self) -> str:
        return " ".join(word.text for word in self.words)

    @property
    def confidence(self) -> float:
        if not self.words:
            return 0.0
        return sum(word.confidence for word in self.words) / len(self.words) / 100.0

    @property
    def region(self) -> Optional[SourceRegion]:
        if not self.words:
            return None
        x0 = min(word.x for word in self.words)
        y0 = min(word.y for word in self.words)
        x1 = max(word.x + word.w for word in self.words)
        y1 = max(word.y + word.h for word in self.words)
        return SourceRegion(x=x0, y=y0, width=x1 - x0, height=y1 - y0)
