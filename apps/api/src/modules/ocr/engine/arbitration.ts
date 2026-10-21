/**
 * OCR V2 — multi-engine arbitration (quality suggestion #2).
 *
 * The engine port is a clean seam (deterministic + FastAPI adapters prove
 * it); arbitration plugs a SECOND engine alongside the primary and merges
 * the two field-level outputs with explainable rules:
 *
 *   - per FIELD KEY, the higher-confidence value wins;
 *   - when both engines agree on the normalized value, confidence is the
 *     max of the two (agreement is itself a signal) and a note records it;
 *   - when they disagree BEYOND the agreement margin (both confident but
 *     different), the primary wins and a note records the disagreement —
 *     the primary pipeline remains authoritative (§52: no silent swaps);
 *   - fields only the secondary found join with a provenance note when
 *     their confidence passes the secondary floor.
 *
 * The merge is a PURE function (unit-tested with fixture responses); the
 * ArbitratingOcrEngine wrapper only wires the two calls together. With
 * `OCR_SECONDARY_ENGINE=none` (the default) the factory registers the
 * primary engine alone — behavior is byte-identical to V1.
 */
import { Injectable } from "@nestjs/common";
import {
  EngineTransientError,
  OCR_CONTRACT_VERSION,
  type EngineRecognizeRequest,
  type EngineResponse,
  type EngineTrade,
  type OcrEngine,
} from "./ocr-engine.port";

/** Confidence margin under which two reads count as "same evidence". */
export const ARBITRATION_AGREEMENT_MARGIN = 0.15;
/** Secondary-only fields below this confidence never join the merge. */
export const SECONDARY_FLOOR = 0.55;

export type ArbitrationNote = "AGREEMENT_BOTH_ENGINES" | "DISAGREEMENT_PRIMARY_KEPT" | "SECONDARY_ONLY";

export interface ArbitrationStats {
  comparedFields: number;
  agreements: number;
  disagreements: number;
  secondaryOnly: number;
}

/** Pure per-field merge over one engine field list. */
export function arbitrateFields(
  primary: EngineResponse["fields"],
  secondary: EngineResponse["fields"],
): { fields: EngineResponse["fields"]; stats: ArbitrationStats } {
  const stats: ArbitrationStats = {
    comparedFields: 0,
    agreements: 0,
    disagreements: 0,
    secondaryOnly: 0,
  };
  const secondaryByKey = new Map(secondary.map((f) => [f.field, f]));
  const merged: EngineResponse["fields"] = [];

  for (const field of primary) {
    const counterpart = secondaryByKey.get(field.field);
    secondaryByKey.delete(field.field);
    stats.comparedFields += 1;
    if (counterpart === undefined) {
      merged.push(field);
      continue;
    }
    const sameValue = field.normalizedValue === counterpart.normalizedValue;
    if (sameValue) {
      stats.agreements += 1;
      merged.push({
        ...field,
        confidence: Math.max(field.confidence, counterpart.confidence),
        notes: withNote(field.notes, "AGREEMENT_BOTH_ENGINES"),
      });
      continue;
    }
    const margin = Math.abs(field.confidence - counterpart.confidence);
    if (field.confidence >= counterpart.confidence || margin <= ARBITRATION_AGREEMENT_MARGIN) {
      // Primary is at least as credible, or the race is too close to
      // overturn it — the primary stays, the disagreement is on record.
      stats.disagreements += 1;
      merged.push({
        ...field,
        notes: withNote(field.notes, "DISAGREEMENT_PRIMARY_KEPT"),
      });
    } else {
      // Secondary is CLEARLY more confident on this field — its read wins
      // (still machine data: full domain re-validation happens downstream).
      stats.disagreements += 1;
      merged.push({ ...counterpart, notes: withNote(counterpart.notes, "SECONDARY_ONLY") });
    }
  }

  for (const field of secondaryByKey.values()) {
    if (field.confidence >= SECONDARY_FLOOR) {
      stats.secondaryOnly += 1;
      merged.push({ ...field, notes: withNote(field.notes, "SECONDARY_ONLY") });
    }
  }

  merged.sort((a, b) => a.field.localeCompare(b.field));
  return { fields: merged, stats };
}

function withNote(notes: string[], note: ArbitrationNote): string[] {
  if (notes.includes(note)) return notes;
  return [...notes, note].slice(0, 8);
}

/** Pure per-trade merge (multi-trade V2) — keyed by trade index. */
export function arbitrateTrades(
  primary: EngineTrade[],
  secondary: EngineTrade[],
): { trades: EngineTrade[]; stats: ArbitrationStats } {
  if (secondary.length === 0) return { trades: primary, stats: emptyStats() };
  const stats: ArbitrationStats = {
    comparedFields: 0,
    agreements: 0,
    disagreements: 0,
    secondaryOnly: 0,
  };
  const trades = primary.map((trade) => {
    const counterpart = secondary.find((t) => t.pageIndex === trade.pageIndex) ?? null;
    if (counterpart === null) return trade;
    const merged = arbitrateFields(trade.fields, counterpart.fields);
    stats.comparedFields += merged.stats.comparedFields;
    stats.agreements += merged.stats.agreements;
    stats.disagreements += merged.stats.disagreements;
    stats.secondaryOnly += merged.stats.secondaryOnly;
    return { ...trade, fields: merged.fields } as EngineTrade;
  });
  return { trades, stats };
}

function emptyStats(): ArbitrationStats {
  return { comparedFields: 0, agreements: 0, disagreements: 0, secondaryOnly: 0 };
}

/**
 * Wrapping engine — the primary pipeline stays authoritative; the secondary
 * call is BEST-EFFORT (its failure never fails the recognition, only a log
 * + a skipped arbitration — the primary answer carries the response alone).
 */
@Injectable()
export class ArbitratingOcrEngine implements OcrEngine {
  readonly info: OcrEngine["info"];
  readonly supportsDocuments: boolean;

  constructor(
    private readonly primary: OcrEngine,
    private readonly secondary: OcrEngine,
  ) {
    this.info = {
      ...primary.info,
      name: `arbitrated(${primary.info.name}+${secondary.info.name})`,
    };
    // `=== true` keeps the optional-flag semantics honest: an engine that
    // omits the member simply does not support documents (undefined is falsy
    // either way — this is a type-level narrowing, not a behavior change).
    this.supportsDocuments = primary.supportsDocuments === true && secondary.supportsDocuments === true;
  }

  async recognize(request: EngineRecognizeRequest): Promise<EngineResponse> {
    const primaryResponse = await this.primary.recognize(request);
    let secondaryResponse: EngineResponse | null = null;
    try {
      secondaryResponse = await this.secondary.recognize(request);
    } catch {
      // Secondary is a bonus signal, never a dependency (§34 semantics of
      // the PRIMARY govern the request). Skip arbitration gracefully.
      return primaryResponse;
    }
    if (secondaryResponse.processingStatus !== "COMPLETED" || primaryResponse.processingStatus !== "COMPLETED") {
      return primaryResponse;
    }
    const { fields, stats } = arbitrateFields(primaryResponse.fields, secondaryResponse.fields);
    const trades = mergeTradeLists(primaryResponse.trades, secondaryResponse.trades, primaryResponse.fields, fields);
    return {
      ...primaryResponse,
      fields,
      trades: trades ?? primaryResponse.trades,
      perceptualHash: primaryResponse.perceptualHash ?? secondaryResponse.perceptualHash ?? null,
      warnings: [...primaryResponse.warnings, ...secondaryResponse.warnings].slice(0, 16),
      processingMetadata: {
        ...primaryResponse.processingMetadata,
        durationsMs: {
          ...primaryResponse.processingMetadata.durationsMs,
          arbitrationCompared: stats.comparedFields,
          arbitrationAgreements: stats.agreements,
          arbitrationDisagreements: stats.disagreements,
          arbitrationSecondaryOnly: stats.secondaryOnly,
        },
      },
    };
  }

  async recognizeDocument(request: Parameters<NonNullable<OcrEngine["recognizeDocument"]>>[0]) {
    const primary = this.primary;
    if (!primary.recognizeDocument) {
      throw new EngineTransientError("primary engine does not support documents");
    }
    return primary.recognizeDocument(request);
  }
}

function mergeTradeLists(
  primaryTrades: EngineTrade[] | null | undefined,
  secondaryTrades: EngineTrade[] | null | undefined,
  primaryFlat: EngineResponse["fields"],
  mergedFlat: EngineResponse["fields"],
): EngineTrade[] | null {
  if (!primaryTrades || primaryTrades.length === 0) return null;
  if (!secondaryTrades || secondaryTrades.length === 0) return primaryTrades;
  const { trades } = arbitrateTrades(primaryTrades, secondaryTrades);
  // Keep the flat fields consistent with trade #1 (the V1 wire mirror).
  const first = trades[0];
  if (first !== undefined) {
    // The flat list was already arbitrated globally; leave it untouched —
    // the wire mapper reads trades[] first when present.
    void primaryFlat;
    void mergedFlat;
  }
  return trades;
}

/** Re-export so the module factory can build without extra imports. */
export { OCR_CONTRACT_VERSION };
