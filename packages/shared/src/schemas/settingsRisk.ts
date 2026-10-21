import { z } from "zod";
import { decimalStringSchema } from "./primitives";

/**
 * RiskDefaults — the trader's standing risk rules (Settings). Applied by
 * the discipline engine when a better source is absent; stored as decimal
 * strings like every measured quantity.
 */

export const riskDefaultsSchema = z.object({
  /** Max risk per trade as % of equity (e.g. "0.5"). */
  riskPerTradePct: decimalStringSchema,
  /** Max daily loss as % of equity — the hard stop (e.g. "2"). */
  maxDailyLossPct: decimalStringSchema,
  /** Max trades in a single trading day. */
  maxTradesPerDay: z.number().int().min(1).max(50),
});

export type RiskDefaults = z.infer<typeof riskDefaultsSchema>;

export const updateRiskDefaultsInputSchema = riskDefaultsSchema;
export type UpdateRiskDefaultsInput = z.input<typeof updateRiskDefaultsInputSchema>;
