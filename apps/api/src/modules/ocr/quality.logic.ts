/**
 * V3 per-recognition quality score (spec §28) - PURE functions, no I/O,
 * no Nest (house standard: unit-testable in plain node).
 *
 * Every component is computed from ACTUAL evidence of the wire result -
 * never an arbitrary constant, never a random percentage (spec §27/§77):
 *
 *   textRecognition      mean OCR confidence of the detected primary fields
 *   fieldExtraction      share of core trade fields actually detected
 *   tradingInterpretation how coherently the read maps to a trade
 *                        (identity fields found, values unambiguous)
 *   crossFieldValidation share of the SAME coherence rules the draft layer
 *                        enforces (validateDraftCoherence) that pass
 *   consistency          multi-screenshot agreement - null for single-image
 *                        jobs (never invented), supplied by the fusion for
 *                        groups
 *
 * The overall is a documented weighted mean bounded 0..100. The SAME input
 * ALWAYS produces the SAME score (spec §77 determinism).
 */
import { validateDraftCoherence } from "../../shared/contracts";
import type { RecognizedTrade } from "../../shared/contracts";
import { draftFromRecognizedFields } from "./ocr.logic";

/** The identity fields a usable trade cannot miss (spec §24/§28). */
const CORE_FIELDS = ["symbol", "direction", "volume", "entryPrice"] as const;

/** Documented component weights of the overall score. */
const WEIGHTS = {
  textRecognition: 0.2,
  fieldExtraction: 0.3,
  tradingInterpretation: 0.25,
  crossFieldValidation: 0.25,
} as const;

const round = (value: number): number => Math.round(value * 100) / 100;

function clamp100(value: number): number {
  return Math.min(100, Math.max(0, Math.round(value)));
}

export interface QualityInput {
  trades: RecognizedTrade[];
  /** Overall wire confidence 0..100 or null (no detected fields at all). */
  overallConfidence: number | null;
  /** Group consistency 0..100 - pass ONLY from the fusion (N→1). */
  consistency?: number | null;
}

export interface QualityScore {
  overall: number;
  components: {
    textRecognition: number;
    fieldExtraction: number;
    tradingInterpretation: number;
    crossFieldValidation: number;
    consistency: number | null;
  };
}

/**
 * Compute the deterministic quality score for one recognition. The lead
 * trade (index 1) is the scored surface - exactly what the review screen
 * shows first; multi-trade jobs keep per-trade confidence in their fields.
 */
export function computeQuality(input: QualityInput): QualityScore {
  const lead = input.trades[0];
  const fields: RecognizedTrade["fields"] = lead?.fields ?? {};

  // ── textRecognition: mean confidence across detected fields ──────────────
  const confidences = Object.values(fields)
    .filter((field) => field.value !== null && field.confidence !== null)
    .map((field) => field.confidence as number);
  const textRecognition =
    confidences.length > 0
      ? clamp100(confidences.reduce((sum, value) => sum + value, 0) / confidences.length)
      : 0;

  // ── fieldExtraction: share of core fields detected with a value ──────────
  const coreFound = CORE_FIELDS.filter((key) => {
    const field = fields[key];
    return field !== undefined && field.value !== null && field.state !== "NOT_FOUND";
  }).length;
  const fieldExtraction = clamp100((coreFound / CORE_FIELDS.length) * 100);

  // ── tradingInterpretation: identity + ambiguity evidence ─────────────────
  // Base credit for each identity field that is FOUND (not merely present),
  // penalized when the value is flagged UNCERTAIN (ambiguous read).
  let interpretation = 0;
  const identityKeys = ["symbol", "direction", "volume", "entryPrice"] as const;
  for (const key of identityKeys) {
    const field = fields[key];
    if (field === undefined) continue;
    if (field.value === null) continue;
    if (field.state === "UNCERTAIN") interpretation += 10;
    else if (field.state === "FOUND") interpretation += 25;
  }
  const tradingInterpretation = clamp100(interpretation);

  // ── crossFieldValidation: the draft coherence rules on the machine read ──
  // The SAME rules the confirmation layer enforces (single source of truth);
  // every applicable rule that passes earns its share. With no parseable
  // prices at all there is nothing to validate - the component is honest 0.
  const draft = draftFromRecognizedFields(fields);
  const issues = validateDraftCoherence({
    direction: (draft.direction === "SELL" ? "SELL" : "BUY") as "BUY" | "SELL",
    entryPrice: draft.entryPrice ?? null,
    stopLoss: draft.stopLoss ?? null,
    takeProfit: draft.takeProfit ?? null,
    openTime: draft.openTime ?? null,
    closeTime: draft.closeTime ?? null,
  });
  const prices = [draft.entryPrice, draft.stopLoss, draft.takeProfit].some(
    (value) => value !== null,
  );
  const times = draft.openTime !== null || draft.closeTime !== null;
  const applicableRules = (prices ? 2 : 0) + (times ? 1 : 0);
  const crossFieldValidation =
    applicableRules === 0 ? 0 : clamp100(((applicableRules - issues.length) / applicableRules) * 100);

  // ── consistency: ONLY from real multi-screenshot evidence (or null) ──────
  const consistency =
    input.consistency === null || input.consistency === undefined ? null : clamp100(input.consistency);

  // ── overall: documented weighted mean; consistency joins when present ────
  const parts: Array<{ value: number; weight: number }> = [
    { value: textRecognition, weight: WEIGHTS.textRecognition },
    { value: fieldExtraction, weight: WEIGHTS.fieldExtraction },
    { value: tradingInterpretation, weight: WEIGHTS.tradingInterpretation },
    { value: crossFieldValidation, weight: WEIGHTS.crossFieldValidation },
  ];
  if (consistency !== null) {
    parts.push({ value: consistency, weight: 0.2 });
    // Renormalize so the weights always sum to 1 (documented behavior).
    const totalWeight = parts.reduce((sum, part) => sum + part.weight, 0);
    const weighted = parts.reduce((sum, part) => sum + part.value * part.weight, 0);
    return {
      overall: clamp100(round(weighted / totalWeight)),
      components: { textRecognition, fieldExtraction, tradingInterpretation, crossFieldValidation, consistency },
    };
  }
  const weighted = parts.reduce((sum, part) => sum + part.value * part.weight, 0);
  return {
    overall: clamp100(round(weighted)),
    components: { textRecognition, fieldExtraction, tradingInterpretation, crossFieldValidation, consistency: null },
  };
}
