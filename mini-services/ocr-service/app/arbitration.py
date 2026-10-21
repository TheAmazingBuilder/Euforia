"""Second-engine arbitration (engine quality review §1.2).

The engine port in NestJS was designed for multiple engines; this module is
the sidecar's concrete answer: a SECOND DETERMINISTIC PASS run in parallel
with the primary one, plus field-level arbitrage between the two.

Design (honest, no ML, §28):
  - Pass A (primary): tesseract's default page segmentation (PSM 3, full
    auto analysis) over the complete preprocessing chain (denoise → deskew
    → ×2 LANCZOS → CLAHE) — the best all-round configuration for panel
    screenshots with mixed column layouts.
  - Pass B (challenger): PSM 11 (sparse text) over the OTSU-BINARIZED
    variant — a genuinely different segmentation of the same pixels, which
    is exactly what makes disagreement informative. Sparse text finds
    scattered values (MT5 mobile cards) that block segmentation misses.
  - Arbitrage is PER FIELD, explainable, and never invents values:
      · both passes agree on the normalized value → confidence boost
        (PASS_AGREEMENT note) — two independent segmentations reading the
        same glyphs is the strongest deterministic evidence available;
      · both found the field but disagree → the higher-confidence reading
        wins, the other is recorded (PASS_DISAGREEMENT note) so the review
        UI can flag it;
      · only one pass found the field → keep it with a note
        (SECOND_PASS_ONLY / FIRST_PASS_ONLY) and NO bonus — single-source
        evidence stays single-source.
"""

from __future__ import annotations

import pytesseract
from pytesseract import Output

from .contract import EngineField, SourceRegion
from .extraction_types import OcrLine
from .extraction import extract_fields  # re-exported for pipeline composition

# Note tokens — stable, client-copyable (the review UI surfaces them).
PASS_AGREEMENT = "PASS_AGREEMENT"
PASS_DISAGREEMENT = "PASS_DISAGREEMENT"
SECOND_PASS_ONLY = "SECOND_PASS_ONLY"
FIRST_PASS_ONLY = "FIRST_PASS_ONLY"

# Honest pass labels (V2 audit fix): pass A runs tesseract's DEFAULT
# segmentation (PSM 3) — the previous "block_psm6" label claimed a config
# that was never passed. Renaming keeps the observability surface truthful;
# contractVersion stays "1" (labels are metadata, not contract shape).
PASS_NAMES = ("block_psm3", "sparse_psm11")


def run_sparse_pass(image, lang: str) -> list[OcrLine]:
    """Challenger pass: PSM 11 sparse text over the binarized variant.

    Same word→line grouping as the primary pass (§18 boxes preserved) but
    with sparse-text page segmentation, which reads isolated values without
    assuming a block structure.
    """
    data = pytesseract.image_to_data(
        image, lang=lang, config="--psm 11", output_type=Output.DICT
    )
    lines: dict[tuple, list] = {}
    count = len(data.get("text", []))
    for i in range(count):
        raw_text = (data["text"][i] or "").strip()
        conf_raw = data["conf"][i]
        try:
            conf = float(conf_raw)
        except (TypeError, ValueError):
            conf = -1.0
        if not raw_text or conf < 0:
            continue
        from .extraction_types import OcrWord

        word = OcrWord(
            text=raw_text,
            x=int(data["left"][i]),
            y=int(data["top"][i]),
            w=int(data["width"][i]),
            h=int(data["height"][i]),
            confidence=conf,
        )
        key = (data["block_num"][i], data["par_num"][i], data["line_num"][i])
        lines.setdefault(key, []).append(word)
    return [OcrLine(words=words) for words in lines.values()]


def arbitrate_fields(
    primary: list[EngineField],
    challenger: list[EngineField],
) -> tuple[list[EngineField], bool]:
    """Field-level arbitrage between the two passes.

    Returns (arbitrated_fields, all_clear). A field is CLSear when both
    passes agree — the only case that earns the confidence boost.
    """
    challenger_by_key = {f.field: f for f in challenger}
    arbitrated: list[EngineField] = []
    for field in primary:
        other = challenger_by_key.get(field.field)
        challenger_by_key.pop(field.field, None)
        arbitrated.append(_merge_pair(field, other))
    # Fields ONLY the challenger found — appended with the honest note.
    for field in challenger_by_key.values():
        arbitrated.append(
            EngineField(
                field=field.field,
                rawValue=field.rawValue,
                normalizedValue=field.normalizedValue,
                confidence=round(field.confidence, 3),
                sourceRegion=field.sourceRegion,
                notes=field.notes + [SECOND_PASS_ONLY],
            )
        )
    arbitrated.sort(key=lambda f: f.field)
    all_clear = all(PASS_AGREEMENT in f.notes for f in arbitrated) and bool(arbitrated)
    return arbitrated, all_clear


def _merge_pair(primary: EngineField, challenger: EngineField | None) -> EngineField:
    if challenger is None:
        # Primary found it, challenger missed it — keep primary unchanged.
        return EngineField(
            field=primary.field,
            rawValue=primary.rawValue,
            normalizedValue=primary.normalizedValue,
            confidence=round(primary.confidence, 3),
            sourceRegion=primary.sourceRegion,
            notes=primary.notes + ([FIRST_PASS_ONLY] if primary.normalizedValue is not None else primary.notes),
        )

    if primary.normalizedValue is not None and challenger.normalizedValue == primary.normalizedValue:
        # Agreement — the one explainable confidence boost in the engine.
        boosted = min(primary.confidence + 0.06, 0.99)
        return EngineField(
            field=primary.field,
            rawValue=primary.rawValue,
            normalizedValue=primary.normalizedValue,
            confidence=round(boosted, 3),
            sourceRegion=primary.sourceRegion,
            notes=primary.notes + [PASS_AGREEMENT],
        )

    if primary.normalizedValue is None and challenger.normalizedValue is None:
        return primary  # both failed — keep the primary's failure shape

    if primary.normalizedValue is None and challenger.normalizedValue is not None:
        # Challenger rescued a field the primary could not read.
        return EngineField(
            field=primary.field,
            rawValue=challenger.rawValue,
            normalizedValue=challenger.normalizedValue,
            confidence=round(challenger.confidence, 3),
            sourceRegion=challenger.sourceRegion,
            notes=challenger.notes + [SECOND_PASS_ONLY],
        )

    # Disagreement — higher confidence wins, the divergence is recorded so
    # the review UI can flag the field (never silently averaged, §14).
    winner, loser = (primary, challenger)
    if challenger.confidence > primary.confidence:
        winner, loser = (challenger, primary)
    note = f"{PASS_DISAGREEMENT}:{loser.rawValue or '?'}"
    notes = list(winner.notes)
    if note not in notes:
        notes.append(note[:256])
    return EngineField(
        field=winner.field,
        rawValue=winner.rawValue,
        normalizedValue=winner.normalizedValue,
        confidence=round(winner.confidence * 0.97, 3),  # tiny honesty haircut
        sourceRegion=winner.sourceRegion,
        notes=notes,
    )


def region_union(regions: list[SourceRegion]) -> SourceRegion | None:
    """Bounding box over regions — used by the crop suggestion helper."""
    if not regions:
        return None
    x0 = min(r.x for r in regions)
    y0 = min(r.y for r in regions)
    x1 = max(r.x + r.width for r in regions)
    y1 = max(r.y + r.height for r in regions)
    return SourceRegion(x=x0, y=y0, width=x1 - x0, height=y1 - y0)
