/**
 * Multi-screenshot fusion (V2 spec §14/§18) — PURE functions, no I/O.
 *
 * N member recognitions of ONE trading event → ONE fused TradeDraft.
 * Fusion is an EVIDENCE combiner, never an inventor (V2 §103):
 *
 *   - agreement  — members read the SAME value → the strongest confidence
 *                  wins with a small, capped, documented boost per extra
 *                  agreeing member (MULTI_SOURCE_AGREEMENT note);
 *   - conflict   — members disagree → the field carries the disagreement
 *                  (AMBIGUOUS + CONFLICTING_VALUES warning) AND the conflict
 *                  is recorded with BOTH values and their provenance (V2
 *                  §18: "never silently discard conflicting evidence");
 *   - single     — only one member read the value → kept honestly with a
 *                  SINGLE_SOURCE note and NO boost;
 *   - missing    — no member read the value → the field is absent (V2 §20).
 *
 * Correlation (V2 §14): the fused draft reports `coherent` — the members'
 * symbol + direction agreement. An incoherent set is a POSSIBLE GROUP: the
 * confirmation stays available (the user grouped it deliberately) but the
 * review UI must say so.
 */
import { Prisma } from "@prisma/client";

import type {
  OcrClassification,
  OcrExtractedField,
  OcrFieldConflict,
  OcrFieldKey,
  OcrIssue,
  OcrQualityScore,
  OcrTimelineEntry,
} from "../../shared/contracts";
import {
  buildRecognitionTimeline,
  computeQualityScore,
  deriveRecognitionIssues,
} from "./ocr.logic";

/** Confidence boost per extra agreeing member — capped at 0.99 (§17). */
export const AGREEMENT_BOOST_PER_MEMBER = 0.03;

const SIGNED_KEYS: ReadonlySet<OcrFieldKey> = new Set(["profit"]);

/** Values equal under exact decimal semantics when both parse as decimals. */
function valuesEqual(a: string, b: string, key: OcrFieldKey): boolean {
  if (a === b) return true;
  if (SIGNED_KEYS.has(key)) return false; // signed profit: textual equality only
  try {
    return new Prisma.Decimal(a).equals(new Prisma.Decimal(b));
  } catch {
    return false;
  }
}

export interface FusionMember {
  recognitionId: string;
  fields: readonly OcrExtractedField[];
  createdAt: string;
}

export interface FusionResult {
  fields: OcrExtractedField[];
  conflicts: OcrFieldConflict[];
  coherent: boolean;
}

/**
 * Fuse the members' machine fields into one draft (V2 §18). Deterministic:
 * the same member fields always produce the same fused draft (V2 §77).
 */
export function fuseMemberFields(members: readonly FusionMember[]): FusionResult {
  const conflicts: OcrFieldConflict[] = [];
  const fused: OcrExtractedField[] = [];

  // Field keys in stable first-seen order (every member shares the enum).
  const keys: OcrFieldKey[] = [];
  for (const member of members) {
    for (const field of member.fields) {
      if (!keys.includes(field.field)) keys.push(field.field);
    }
  }

  for (const key of keys) {
    const readings = members
      .map((member) => {
        const field = member.fields.find((f) => f.field === key);
        return field && field.normalizedValue !== null
          ? { member, field }
          : null;
      })
      .filter((entry): entry is { member: FusionMember; field: OcrExtractedField } => entry !== null);

    if (readings.length === 0) {
      // Nothing readable anywhere — keep the best MISSING evidence for the
      // review UI (the field exists but no member could read it).
      const missing = members
        .map((member) => member.fields.find((f) => f.field === key))
        .filter((f): f is OcrExtractedField => f !== undefined)
        .sort((a, b) => b.confidence - a.confidence)[0];
      if (missing) fused.push(missing);
      continue;
    }

    if (readings.length === 1) {
      const { field } = readings[0]!;
      fused.push(
        withNotes(field, ["SINGLE_SOURCE"], field.validationStatus),
      );
      continue;
    }

    // Group the readings by equality under the field's semantics.
    const groups: { value: string; entries: typeof readings }[] = [];
    for (const entry of readings) {
      const value = entry.field.normalizedValue as string;
      const group = groups.find((g) => valuesEqual(g.value, value, key));
      if (group) group.entries.push(entry);
      else groups.push({ value, entries: [entry] });
    }

    if (groups.length === 1) {
      // Full agreement — strongest confidence + documented boost per extra
      // member, never past 0.99 (V2 §17).
      const sorted = [...readings].sort((a, b) => b.field.confidence - a.field.confidence);
      const best = sorted[0]!;
      const boost = Math.min(
        AGREEMENT_BOOST_PER_MEMBER * (readings.length - 1),
        0.99 - best.field.confidence,
      );
      fused.push(
        withNotes(
          { ...best.field, confidence: round3(Math.min(0.99, best.field.confidence + Math.max(0, boost))) },
          ["MULTI_SOURCE_AGREEMENT"],
          best.field.validationStatus,
        ),
      );
      continue;
    }

    // Conflict — keep the strongest reading as the draft value but mark the
    // disagreement, and RECORD every value with its member (V2 §18).
    const strongest = [...readings].sort((a, b) => b.field.confidence - a.field.confidence)[0]!;
    fused.push(
      withNotes(
        strongest.field,
        ["CONFLICTING_VALUES"],
        "AMBIGUOUS",
      ),
    );
    conflicts.push({
      field: key,
      values: groups.map((group) => ({
        value: group.value,
        recognitionId: group.entries[0]!.member.recognitionId,
      })),
    });
  }

  // Correlation (V2 §14): symbol + direction agreement.
  const valueOf = (key: OcrFieldKey): string | null =>
    fused.find((f) => f.field === key && f.normalizedValue !== null)?.normalizedValue ?? null;
  const coherent =
    valueOf("symbol") !== null &&
    (valueOf("direction") === "BUY" || valueOf("direction") === "SELL") &&
    !conflicts.some((c) => c.field === "symbol" || c.field === "direction");

  return { fields: fused, conflicts, coherent };
}

function withNotes(
  field: OcrExtractedField,
  notes: string[],
  validationStatus: OcrExtractedField["validationStatus"],
): OcrExtractedField {
  const warnings = [...field.warnings];
  for (const note of notes) if (!warnings.includes(note)) warnings.push(note);
  return { ...field, validationStatus, warnings: warnings.slice(0, 8) };
}

function round3(value: number): number {
  return Math.round(value * 1000) / 1000;
}

/**
 * Derive the fused draft's issues (V2 §16) — the fused fields plus a
 * CONFLICTING_FIELDS issue per recorded conflict. Fusion conflicts on
 * direction surface as AMBIGUOUS_DIRECTION (the trade's side is the one
 * thing a user must resolve before import).
 */
export function deriveFusedIssues(input: {
  fields: readonly OcrExtractedField[];
  conflicts: readonly OcrFieldConflict[];
  classification: OcrClassification | null;
  duplicateOf: { recognitionId: string } | null;
  possibleTradeDuplicate: { tradeId: string; matchedOn: readonly string[] } | null;
  symbolInCatalog: boolean;
}): OcrIssue[] {
  const issues = deriveRecognitionIssues({
    fields: input.fields,
    classification: input.classification,
    duplicateOf: input.duplicateOf,
    possibleTradeDuplicate: input.possibleTradeDuplicate,
    symbolInCatalog: input.symbolInCatalog,
  });
  for (const conflict of input.conflicts) {
    if (issues.length >= 32) break;
    issues.push({
      code: conflict.field === "direction" ? "AMBIGUOUS_DIRECTION" : "CONFLICTING_FIELDS",
      field: conflict.field,
      detail: conflict.values.map((v) => v.value).join(" | ").slice(0, 256),
    });
  }
  return issues;
}

/** Quality over the fused fields — agreement lifts the consistency component
 * through the ABSENCE of duplicates/unknown classification penalties, and
 * conflicts count as AMBIGUOUS (never INVALID — a conflict is not an error). */
export function fusedQualityScore(input: {
  fields: readonly OcrExtractedField[];
  classification: OcrClassification | null;
  duplicateOf: { recognitionId: string } | null;
  coherent: boolean;
}): OcrQualityScore | null {
  const score = computeQualityScore({
    fields: input.fields,
    classification: input.classification,
    duplicateOf: input.duplicateOf,
  });
  if (score === null) return null;
  // An incoherent set (members disagree on symbol/direction) is penalized
  // on consistency — the correlation evidence itself (V2 §14).
  if (!input.coherent) {
    return {
      score: round3(score.score - 0.1 < 0 ? 0 : score.score - 0.1),
      components: { ...score.components, consistency: round3(Math.max(0, score.components.consistency - 0.5)) },
    };
  }
  return score;
}

/** Timeline across members: recognized stamps + the earliest member upload +
 * the confirmation instant (V2 §23 — every entry carries real evidence). */
export function buildFusedTimeline(input: {
  fusedFields: readonly OcrExtractedField[];
  members: readonly FusionMember[];
  confirmedAt: string | null;
}): OcrTimelineEntry[] {
  const uploadedAt =
    input.members.map((m) => m.createdAt).sort()[0] ?? null;
  return buildRecognitionTimeline({
    fields: input.fusedFields,
    uploadedAt,
    confirmedAt: input.confirmedAt,
  });
}
