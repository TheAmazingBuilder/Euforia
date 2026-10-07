/**
 * OCR → Trade import mapping (Phase 21) — the PURE half of the confirmation
 * bridge (§72/§76/§77). No I/O, no clock, no Prisma: the same confirmed
 * fields always produce the same trade input (§94 determinism).
 *
 * Responsibility boundary:
 *   - THIS module decides WHETHER the confirmed values can resolve into a
 *     complete canonical trade and WHAT the Trading Core input looks like;
 *   - the bridge service (ocr-trade-import.service.ts) resolves the account
 *     and the instrument, calls TradesService.createTrade (the canonical
 *     application service — §77: no OCR-side Trade persistence) and links
 *     the result;
 *   - Trading Core owns the trade row, the sizing math and the P&L
 *     recomputation (never trust a client/OCR-sent pnl — house standard §15).
 *
 * Import floor (documented §19/§52/§55 semantics):
 *   - Review-layer statuses (AMBIGUOUS/LOW_CONFIDENCE/INVALID) are signals
 *     for the human review; the user SAW them and confirmed anyway, so the
 *     confirmed declaration is authoritative (§21).
 *   - The hard floor for importing a decimal is positivity + finiteness: a
 *     non-positive price/volume cannot be a trade fact. Core fields that
 *     fail the floor make the import INCOMPLETE (skipped — never fabricated,
 *     §44/§54); optional fields that fail it are simply left out.
 */
import { Prisma } from "@prisma/client";

import type { CreateTradeInput, OcrExtractedField, OcrFieldKey } from "../../shared/contracts";

// ── Stable skip warnings (machine-readable tokens, review-UI vocabulary) ────

/** Confirmed values lack the minimum complete trade set (§76 validate fields). */
export const TRADE_IMPORT_SKIPPED_INCOMPLETE = "TRADE_IMPORT_SKIPPED_INCOMPLETE";
/** No persisted trading account for the owner (importTrades house convention). */
export const TRADE_IMPORT_SKIPPED_NO_ACCOUNT = "TRADE_IMPORT_SKIPPED_NO_ACCOUNT";
/** Symbol not in the instrument catalog — user correction required (§50). */
export const TRADE_IMPORT_SKIPPED_UNKNOWN_SYMBOL = "TRADE_IMPORT_SKIPPED_UNKNOWN_SYMBOL";
/** Trading Core refused the import (duplicate/ownership/domain rule). */
export const TRADE_IMPORT_SKIPPED_REJECTED = "TRADE_IMPORT_SKIPPED_REJECTED";
/** Non-trade profile (ACCOUNT_POSITION / CHART_ANALYSIS) — there is no trade
 * to import; the confirmation stores the reviewed snapshot/reading instead.
 * An explicit token, never a misleading INCOMPLETE (Account & Chart V1.1). */
export const TRADE_IMPORT_SKIPPED_PROFILE = "TRADE_IMPORT_SKIPPED_PROFILE";
/** Unexpected bridge failure — never propagated to the confirmation (§126). */
export const TRADE_IMPORT_FAILED = "TRADE_IMPORT_FAILED";

/** Core fields that MUST resolve for a canonical trade to exist (§76). */
const CORE_KEYS: readonly OcrFieldKey[] = ["symbol", "direction", "entryPrice", "volume"];

/** A positive finite decimal — the hard import floor for money/size facts. */
function positiveDecimalOrNull(raw: string | null): Prisma.Decimal | null {
  if (raw === null || raw.trim().length === 0) return null;
  try {
    const dec = new Prisma.Decimal(raw);
    return dec.isFinite() && dec.greaterThan("0") ? dec : null;
  } catch {
    return null;
  }
}

export type TradeImportValues = {
  symbol: string;
  direction: "BUY" | "SELL";
  entryPrice: string;
  volume: string;
  stopLoss: string | null;
  takeProfit: string | null;
  exitPrice: string | null;
  openTime: string | null;
  closeTime: string | null;
};

export type TradeImportEligibility =
  | { eligible: true; values: TradeImportValues }
  | { eligible: false; reason: typeof TRADE_IMPORT_SKIPPED_INCOMPLETE };

/**
 * Resolve the confirmed (merged) fields into the trade fact set. Eligibility
 * requires symbol + direction + entryPrice + volume to be complete and
 * positive (§76 "validate fields") — everything else is best-effort from the
 * same confirmed declaration.
 */
export function resolveTradeImportValues(fields: OcrExtractedField[]): TradeImportEligibility {
  const byKey = new Map(fields.map((f) => [f.field, f]));
  const textOf = (key: OcrFieldKey): string | null => byKey.get(key)?.normalizedValue ?? null;

  for (const key of CORE_KEYS) {
    const raw = textOf(key);
    const dec = key === "symbol" || key === "direction" ? null : positiveDecimalOrNull(raw);
    if (raw === null || (dec === null && key !== "symbol" && key !== "direction")) {
      return { eligible: false, reason: TRADE_IMPORT_SKIPPED_INCOMPLETE };
    }
  }

  const direction = textOf("direction");
  if (direction !== "BUY" && direction !== "SELL") {
    return { eligible: false, reason: TRADE_IMPORT_SKIPPED_INCOMPLETE };
  }

  // Timestamps: preserved only when present — never invented (§54). Wall
  // clock stays wall clock here; timezone attribution is Trading Core's
  // capture concern (documented Phase 21 limitation).
  const openTime = textOf("openTime");
  const closeTime = textOf("closeTime");

  return {
    eligible: true,
    values: {
      symbol: (textOf("symbol") ?? "").toUpperCase(),
      direction,
      entryPrice: textOf("entryPrice") ?? "",
      volume: textOf("volume") ?? "",
      stopLoss: positiveDecimalOrNull(textOf("stopLoss"))?.toFixed() ?? null,
      takeProfit: positiveDecimalOrNull(textOf("takeProfit"))?.toFixed() ?? null,
      exitPrice: positiveDecimalOrNull(textOf("exitPrice"))?.toFixed() ?? null,
      openTime: openTime !== null && !Number.isNaN(new Date(openTime).getTime()) ? openTime : null,
      closeTime:
        closeTime !== null && !Number.isNaN(new Date(closeTime).getTime()) ? closeTime : null,
    },
  };
}

/**
 * Build the Trading Core capture input from the confirmed fact set (§77:
 * the canonical creation path — createTrade — does the account check, the
 * sizing, the P&L computation and the external-ref dedup).
 *
 * Variant rule (no fabrication, §54):
 *   - CLOSED only when BOTH the exit price and the close time are present —
 *     the capture contract requires the exit triplet and OCR cannot invent
 *     an exit reason (MANUAL, same as the CSV import);
 *   - otherwise OPEN (an exit price without a close time is not enough to
 *     close a trade honestly — it stays on the recognition).
 */
export function buildOcrTradeInput(input: {
  values: TradeImportValues;
  accountId: string;
  instrumentId: string;
  /** Deterministic dedup handle: `ocr:<recognitionId>` (§79 reuse). */
  externalRef: string;
}): CreateTradeInput {
  const { values, accountId, instrumentId, externalRef } = input;
  const closed = values.exitPrice !== null && values.closeTime !== null;

  const base = {
    accountId,
    instrumentId,
    direction: values.direction,
    entryPrice: values.entryPrice,
    ...(values.openTime !== null ? { entryAt: values.openTime } : {}),
    size: { mode: "quantity" as const, quantity: values.volume },
    ...(values.stopLoss !== null ? { initialStop: values.stopLoss } : {}),
    ...(values.takeProfit !== null ? { initialTP: values.takeProfit } : {}),
    // Provenance (§82) + traceability: the recognition id rides in the notes.
    reason: `Imported from screenshot recognition (${externalRef.replace(/^ocr:/, "recognition ")})`,
    externalRef,
    source: "IMPORT" as const,
    // An OCR import has no playbook context by definition.
    outOfPlaybook: true as const,
  };

  return closed
    ? {
        variant: "closed",
        ...base,
        exitPrice: values.exitPrice as string,
        exitAt: values.closeTime as string,
        exitReason: "MANUAL" as const,
      }
    : { variant: "open", ...base };
}
