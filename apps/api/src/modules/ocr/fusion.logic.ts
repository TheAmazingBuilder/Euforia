/**
 * Multi-screenshot fusion (V2 spec §14/§18) - PURE functions, no I/O.
 *
 * N member recognitions of ONE trading event → ONE fused TradeDraft.
 * Fusion is an EVIDENCE combiner, never an inventor (V2 §103):
 *
 *   - agreement  - members read the SAME value → the strongest confidence
 *                  wins with a small, capped, documented boost per extra
 *                  agreeing member (MULTI_SOURCE_AGREEMENT note);
 *   - conflict   - members disagree → the field carries the disagreement
 *                  (AMBIGUOUS + CONFLICTING_VALUES warning) AND the conflict
 *                  is recorded with BOTH values and their provenance (V2
 *                  §18: "never silently discard conflicting evidence");
 *   - single     - only one member read the value → kept honestly with a
 *                  SINGLE_SOURCE note and NO boost;
 *   - missing    - no member read the value → the field is absent (V2 §20).
 *
 * Correlation (V2 §14): the fused draft reports `coherent` - the members'
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
import type {
  CorrelationEvidence,
  RecognitionFieldKey,
  RecognizedTrade,
  TradeDraftRecord,
} from "../../shared/contracts";
import {
  buildRecognitionTimeline,
  computeQualityScore,
  deriveRecognitionIssues,
} from "./ocr.logic";

/** Confidence boost per extra agreeing member - capped at 0.99 (§17). */
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
      // Nothing readable anywhere - keep the best MISSING evidence for the
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
      // Full agreement - strongest confidence + documented boost per extra
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

    // Conflict - keep the strongest reading as the draft value but mark the
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
 * Derive the fused draft's issues (V2 §16) - the fused fields plus a
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

/** Quality over the fused fields - agreement lifts the consistency component
 * through the ABSENCE of duplicates/unknown classification penalties, and
 * conflicts count as AMBIGUOUS (never INVALID - a conflict is not an error). */
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
  // on consistency - the correlation evidence itself (V2 §14).
  if (!input.coherent) {
    return {
      score: round3(score.score - 0.1 < 0 ? 0 : score.score - 0.1),
      components: { ...score.components, consistency: round3(Math.max(0, score.components.consistency - 0.5)) },
    };
  }
  return score;
}

/** Timeline across members: recognized stamps + the earliest member upload +
 * the confirmation instant (V2 §23 - every entry carries real evidence). */
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

// ── V3 - wire-level member fusion over RecognizedTrade ──────────────────────
// The group pipeline fuses the WIRE trade fields of several jobs (not the
// engine field arrays above). Same evidence discipline: agreement wins by
// confidence, conflicts are recorded with provenance, nothing is invented.

/** One fusable member: a job's recognized wire trade (null ⇒ unfusable). */
export interface FusionMemberInput {
  jobId: string;
  screenshotName: string;
  status: string;
  trade: RecognizedTrade | null;
  detectedPlatform: string | null;
  /** Raw provider screenshot-type token (deliberately not an enum). */
  screenshotType: string | null;
  uploadedAt: string;
}

/** Wire trade keys the fusion engine reads (never platform - provenance only). */
const FUSED_WIRE_KEYS = [
  "symbol",
  "direction",
  "volume",
  "entryPrice",
  "exitPrice",
  "stopLoss",
  "takeProfit",
  "profitLoss",
  "openTime",
  "closeTime",
  "currency",
  "positionId",
  "orderId",
  "accountBalance",
  "accountEquity",
] as const;

/** Signed keys keep textual equality (profit sign is part of the value). */
const FUSED_TEXTUAL_KEYS: ReadonlySet<string> = new Set(["profitLoss", "direction", "symbol", "openTime", "closeTime"]);

function wireValuesEqual(key: string, a: string, b: string): boolean {
  if (a === b) return true;
  if (FUSED_TEXTUAL_KEYS.has(key)) return false;
  try {
    return new Prisma.Decimal(a).equals(new Prisma.Decimal(b));
  } catch {
    return false;
  }
}

function readWireValue(trade: RecognizedTrade | null, key: RecognitionFieldKey): string | null {
  const field = trade?.fields?.[key];
  if (!field || field.value === undefined) return null;
  return field.value;
}

function readWireConfidence(trade: RecognizedTrade | null, key: RecognitionFieldKey): number | null {
  const field = trade?.fields?.[key];
  return field?.confidence ?? null;
}

function typeKind(screenshotType: string | null): string | null {
  if (screenshotType === null) return null;
  if (screenshotType.endsWith("HISTORY")) return "HISTORY";
  if (screenshotType.endsWith("OPEN_POSITION") || screenshotType.endsWith("POSITION")) return "POSITION";
  if (screenshotType.endsWith("TRADE")) return "TRADE";
  return null;
}

const COMPLEMENTARY_TYPE_KINDS: ReadonlySet<string> = new Set(["TRADE", "HISTORY", "POSITION"]);

/** Correlate two members - evidence only, never invention (V3 §14). */
export function correlatePair(a: FusionMemberInput, b: FusionMemberInput): CorrelationEvidence[] {
  const evidence: CorrelationEvidence[] = [];

  const symbolA = readWireValue(a.trade, "symbol");
  const symbolB = readWireValue(b.trade, "symbol");
  if (symbolA !== null && symbolB !== null) {
    const equal = symbolA.toUpperCase() === symbolB.toUpperCase();
    evidence.push({
      kind: "SYMBOL",
      score: equal ? 1 : 0,
      detail: equal ? `symbol agreement (${symbolA})` : `symbol mismatch (${symbolA} vs ${symbolB})`,
    });
  }

  const directionA = readWireValue(a.trade, "direction");
  const directionB = readWireValue(b.trade, "direction");
  if (directionA !== null && directionB !== null) {
    const equal = directionA.toUpperCase() === directionB.toUpperCase();
    evidence.push({
      kind: "DIRECTION",
      score: equal ? 1 : 0,
      detail: equal ? `direction agreement (${directionA})` : `direction mismatch (${directionA} vs ${directionB})`,
    });
  }

  const timeA = readWireValue(a.trade, "openTime");
  const timeB = readWireValue(b.trade, "openTime");
  const openA = timeA !== null ? Date.parse(timeA) : Number.NaN;
  const openB = timeB !== null ? Date.parse(timeB) : Number.NaN;
  if (!Number.isNaN(openA) && !Number.isNaN(openB)) {
    const minutes = Math.abs(openA - openB) / 60_000;
    if (minutes <= FUSION_TIME_WINDOW_MINUTES) {
      evidence.push({
        kind: "TIMESTAMP_PROXIMITY",
        score: 1 - minutes / FUSION_TIME_WINDOW_MINUTES,
        detail: `recognized opens ${Math.round(minutes)} min apart`,
      });
    }
  }

  const kindA = typeKind(a.screenshotType);
  const kindB = typeKind(b.screenshotType);
  if (kindA !== null && kindB !== null && COMPLEMENTARY_TYPE_KINDS.has(kindA) && COMPLEMENTARY_TYPE_KINDS.has(kindB)) {
    const score = kindA === kindB ? 0.5 : 0.7;
    evidence.push({
      kind: "SCREENSHOT_TYPE",
      score,
      detail: score > 0.5 ? `complementary types (${kindA} + ${kindB})` : `identical types (${kindA})`,
    });
  }

  const positionA = readWireValue(a.trade, "positionId");
  const positionB = readWireValue(b.trade, "positionId");
  if (positionA !== null && positionB !== null) {
    const equal = positionA === positionB;
    evidence.push({
      kind: "POSITION_ID",
      score: equal ? 1 : 0,
      detail: equal ? `position id agreement (${positionA})` : "position id mismatch",
    });
  }

  return evidence;
}

/** Timestamp correlation window (minutes) - 4 hours, documented (V3 §14). */
export const FUSION_TIME_WINDOW_MINUTES = 240;

/**
 * Auto-confirm gate - a documented free parameter inside (40, 83.3]: the
 * fully-agreeing fixture (SYMBOL 1 + DIRECTION 1 + type 0.5) aggregates to
 * ≈83.3, a symbol mismatch is capped at 40, so 70 cleanly separates both.
 */
export const AUTO_CONFIRM_THRESHOLD = 70;

/** Mean of evidence scores ×100, capped at 40 on a symbol mismatch. */
export function aggregateEvidence(pairs: readonly CorrelationEvidence[][]): {
  fusionConfidence: number;
  autoConfirmed: boolean;
} {
  const flat = pairs.flat();
  if (flat.length === 0) return { fusionConfidence: 0, autoConfirmed: false };

  const overall =
    (pairs.reduce((sum, pair) => {
      if (pair.length === 0) return sum;
      return sum + pair.reduce((s, e) => s + e.score, 0) / pair.length;
    }, 0) /
      pairs.length) *
    100;

  const symbolMismatch = flat.some((e) => e.kind === "SYMBOL" && e.score === 0);
  const directionMismatch = flat.some((e) => e.kind === "DIRECTION" && e.score === 0);

  const fusionConfidence = symbolMismatch ? Math.min(overall, 40) : overall;
  const autoConfirmed = (
    !symbolMismatch && !directionMismatch && fusionConfidence >= AUTO_CONFIRM_THRESHOLD
  );
  return { fusionConfidence, autoConfirmed };
}

export interface FusedGroupOutcome {
  fusedDraft: TradeDraftRecord;
  /** Winning member per wire key (field → jobId). */
  fieldOrigins: Record<string, string>;
  conflicts: Array<{
    field: string;
    values: Array<{ value: string; jobId: string }>;
    selectedJobId: string;
  }>;
  timeline: Array<{ jobId: string; role: "ENTRY" | "EXIT" | "POSITION"; at: string | null }>;
  evidence: CorrelationEvidence[];
  fusionConfidence: number;
  autoConfirmed: boolean;
  /** Mean identity (symbol+direction) agreement across pairs, 0..100. */
  consistency: number;
}

/**
 * Fuse 2..8 members into one wire draft (V3 §31). Deterministic (§77): the
 * same members always produce the same outcome - no clock, no I/O.
 */
export function fuseMembers(members: readonly FusionMemberInput[]): FusedGroupOutcome {
  if (members.length < 2 || members.length > 8) {
    throw new RangeError("fusion requires 2..8 members");
  }

  const fusedDraft: TradeDraftRecord = {
    symbol: null,
    direction: null,
    volume: null,
    entryPrice: null,
    exitPrice: null,
    stopLoss: null,
    takeProfit: null,
    profitLoss: null,
    openTime: null,
    closeTime: null,
    platform: members[0]!.detectedPlatform,
    currency: null,
    positionId: null,
    orderId: null,
    accountBalance: null,
    accountEquity: null,
  };
  const fieldOrigins: Record<string, string> = {};
  const conflicts: FusedGroupOutcome["conflicts"] = [];

  for (const key of FUSED_WIRE_KEYS) {
    const readings = members
      .map((member) => ({
        jobId: member.jobId,
        value: readWireValue(member.trade, key),
        confidence: readWireConfidence(member.trade, key),
      }))
      .filter((reading): reading is { jobId: string; value: string; confidence: number | null } => reading.value !== null);

    if (readings.length === 0) continue;

    // Strongest confidence wins; ties keep the first member (member order).
    const winner = readings.reduce((best, reading) =>
      (reading.confidence ?? 0) > (best.confidence ?? 0) ? reading : best,
    );
    (fusedDraft as Record<string, unknown>)[key] = winner.value;
    fieldOrigins[key] = winner.jobId;

    const distinct: Array<{ value: string; jobId: string }> = [];
    for (const reading of readings) {
      const known = distinct.find((entry) => wireValuesEqual(key, entry.value, reading.value));
      if (!known) distinct.push({ value: reading.value, jobId: reading.jobId });
    }
    if (distinct.length > 1) {
      conflicts.push({ field: key, values: distinct, selectedJobId: winner.jobId });
    }
  }

  // Draft direction must carry the wire enum (BUY|SELL) - never a guess.
  if (fusedDraft.direction !== null && fusedDraft.direction !== "BUY" && fusedDraft.direction !== "SELL") {
    fusedDraft.direction = null;
    delete fieldOrigins.direction;
  }

  // All pairs' evidence (i<j, member order) - inputs to the aggregate gate.
  const pairEvidence: CorrelationEvidence[][] = [];
  for (let i = 0; i < members.length; i += 1) {
    for (let j = i + 1; j < members.length; j += 1) {
      pairEvidence.push(correlatePair(members[i]!, members[j]!));
    }
  }
  const aggregate = aggregateEvidence(pairEvidence);

  // Timeline: one entry per member; recognized stamp (openTime, else
  // closeTime); timed entries ASC, untimed members last (at: null).
  const roleOf = (screenshotType: string | null): "ENTRY" | "EXIT" | "POSITION" => {
    const kind = typeKind(screenshotType);
    if (kind === "HISTORY") return "EXIT";
    if (kind === "POSITION") return "POSITION";
    return "ENTRY";
  };
  const stamped = members.map((member) => {
    const open = readWireValue(member.trade, "openTime");
    const close = readWireValue(member.trade, "closeTime");
    const stamp = [open, close].find((value) => value !== null && !Number.isNaN(Date.parse(value))) ?? null;
    return {
      jobId: member.jobId,
      role: roleOf(member.screenshotType),
      at: stamp !== null ? new Date(Date.parse(stamp)).toISOString() : null,
    };
  });
  const timeline = [
    ...stamped.filter((entry) => entry.at !== null).sort((a, b) => Date.parse(a.at!) - Date.parse(b.at!)),
    ...stamped.filter((entry) => entry.at === null),
  ];

  // Consistency: mean identity agreement (SYMBOL + DIRECTION) over pairs,
  // 0..100. Pairs without identity evidence do not penalize the mean.
  const identityScores: number[] = [];
  for (let i = 0; i < members.length; i += 1) {
    for (let j = i + 1; j < members.length; j += 1) {
      const pair = correlatePair(members[i]!, members[j]!);
      const identity = pair.filter((e) => e.kind === "SYMBOL" || e.kind === "DIRECTION");
      if (identity.length > 0) {
        identityScores.push(identity.reduce((s, e) => s + e.score, 0) / identity.length);
      }
    }
  }
  const consistency =
    identityScores.length === 0
      ? 0
      : Math.round((identityScores.reduce((s, score) => s + score, 0) / identityScores.length) * 100);

  return {
    fusedDraft,
    fieldOrigins,
    conflicts,
    timeline,
    evidence: pairEvidence.flat(),
    fusionConfidence: aggregate.fusionConfidence,
    autoConfirmed: aggregate.autoConfirmed,
    consistency,
  };
}
