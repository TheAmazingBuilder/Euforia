/**
 * Performance snapshots (Dashboard Customization Phase 08) - point-in-time
 * captures of the analytics-suite summary for a named scope + period.
 *
 * Rules pinned by the spec (§6–§9):
 *   - A snapshot is captured SERVER-SIDE from the ONE authoritative analytics
 *     engine (computeAnalyticsSuite via AnalyticsService) - never recomputed
 *     from mutable trade rows after capture, never edited.
 *   - Captured metric values are IMMUTABLE. Only name/notes metadata may be
 *     patched (updatePerformanceSnapshotInputSchema has no metric field -
 *     the shape itself is the guarantee).
 *   - Every snapshot carries SCHEMA_VERSION so a future metric-definition
 *     change is detectable at comparison time (never silently reinterpreted).
 *   - Money metrics are null when the scope spans multiple currencies
 *     (singleCurrency false → currency null) - the same honesty rule as the
 *     analytics suite. Comparisons refuse money rows across currency
 *     contexts and WARN instead of inventing a conversion.
 *   - Duplicate names are rejected (409 SNAPSHOT_NAME_TAKEN) - a clear,
 *     consistent product rule; each POST creates a NEW record and never
 *     overwrites an existing snapshot.
 */
import { z } from "zod";
import { analyticsFiltersSchema } from "./api";
import { currencySchema } from "../enums";
import {
  dateKeySchema,
  decimalStringSchema,
  isoDateTimeSchema,
  uuidSchema,
} from "./primitives";

/** Bump when the metric-set definition changes (comparison guard, §9). */
export const SNAPSHOT_SCHEMA_VERSION = 1;

/**
 * Stable snapshot error-code registry - values ride the existing AppError
 * envelope (`{ error, code, message, issues?, requestId? }`), same pattern
 * as TRADE_ERROR_CODES. Ownership access is SNAPSHOT_NOT_FOUND (404) per
 * the repository-wide "foreign = not found" IDOR convention.
 */
export const SNAPSHOT_ERROR_CODES = {
  SNAPSHOT_NOT_FOUND: "SNAPSHOT_NOT_FOUND",
  SNAPSHOT_NAME_TAKEN: "SNAPSHOT_NAME_TAKEN",
} as const;

export type SnapshotErrorCode = (typeof SNAPSHOT_ERROR_CODES)[keyof typeof SNAPSHOT_ERROR_CODES];

/**
 * The frozen scope: the non-period half of the analytics filter bag. The
 * PERIOD is stored resolved (periodFrom/periodTo date keys + the original
 * period preset key) so a snapshot never shifts when "YTD"/"MTD" would
 * silently change meaning later (§9: preserve the analyzed period).
 */
export const snapshotScopeSchema = z.object({
  accountId: uuidSchema.optional(),
  instrumentId: uuidSchema.optional(),
  assetClass: z.string().optional(),
  strategyId: z.string().optional(),
  direction: z.string().optional(),
  session: z.string().optional(),
  emotion: z.string().optional(),
  exitReason: z.string().optional(),
  tagId: uuidSchema.optional(),
});
export type SnapshotScope = z.infer<typeof snapshotScopeSchema>;

/** Frozen captured metrics - units are documented per field, never implied. */
export const snapshotMetricsSchema = z.object({
  /** Realized net P&L in `currency` (null when multi-currency scope). */
  netPnl: decimalStringSchema.nullable(),
  /** Realized win rate 0–1 (null when no closed trade). */
  winRate: decimalStringSchema.nullable(),
  /** Gross profit ÷ gross loss (null when no loss or no win). */
  profitFactor: decimalStringSchema.nullable(),
  /** Completed (closed) trade count. */
  trades: z.number().int().min(0),
  /** Mean R-multiple over closed trades (null when none). */
  avgR: decimalStringSchema.nullable(),
  /** Per-trade mean R (primary expectancy). */
  expectancyR: decimalStringSchema,
  /** Worst peak-to-trough R drawdown (≤ 0, always computable). */
  maxDrawdownR: decimalStringSchema,
  /** Worst peak-to-trough % drawdown (null without balance context). */
  maxDrawdownPct: decimalStringSchema.nullable(),
});
export type SnapshotMetrics = z.infer<typeof snapshotMetricsSchema>;

/** One saved performance snapshot (the `data` JSON document). */
export const performanceSnapshotSchema = z.object({
  id: uuidSchema,
  name: z.string().min(1).max(80),
  notes: z.string().max(500),
  /** Server capture instant (ISO) - the "as of" truth. */
  capturedAt: isoDateTimeSchema,
  /** Original period preset (ALL, YTD, CUSTOM, …) kept for context only. */
  period: z.string().min(1),
  /** Resolved inclusive trading-date window actually analyzed. */
  periodFrom: dateKeySchema,
  periodTo: dateKeySchema,
  /** Frozen non-period scope (account/strategy/instrument/direction…). */
  scope: snapshotScopeSchema,
  /** Server human echo of the effective scope (suite meta.descriptor). */
  descriptor: z.string().min(1),
  /** ISO 4217 currency of the money metrics (null when multi-currency). */
  currency: currencySchema.nullable(),
  singleCurrency: z.boolean(),
  metrics: snapshotMetricsSchema,
  schemaVersion: z.number().int().min(1),
});
export type PerformanceSnapshot = z.infer<typeof performanceSnapshotSchema>;

export const performanceSnapshotsResponseSchema = z.object({
  snapshots: z.array(performanceSnapshotSchema),
});
export type PerformanceSnapshotsResponse = z.infer<typeof performanceSnapshotsResponseSchema>;

/** POST /snapshots - capture the CURRENT analytics scope as a snapshot. */
export const createPerformanceSnapshotInputSchema = z.object({
  name: z.string().trim().min(1).max(80),
  notes: z.string().max(500).default(""),
  /** The analytics filter bag (period + scope) resolved server-side. */
  filters: analyticsFiltersSchema,
});
export type CreatePerformanceSnapshotInput = z.infer<typeof createPerformanceSnapshotInputSchema>;

/** PATCH /snapshots/:id - METADATA ONLY. Metrics/scope/period are absent by construction. */
export const updatePerformanceSnapshotInputSchema = z
  .object({
    name: z.string().trim().min(1).max(80).optional(),
    notes: z.string().max(500).optional(),
  })
  .refine((patch) => patch.name !== undefined || patch.notes !== undefined, {
    message: "At least one of name/notes is required",
  });
export type UpdatePerformanceSnapshotInput = z.infer<typeof updatePerformanceSnapshotInputSchema>;

// ── Comparison (§8) ─────────────────────────────────────────────────────────

export const snapshotMetricKeySchema = z.enum([
  "netPnl",
  "winRate",
  "profitFactor",
  "trades",
  "avgR",
  "expectancyR",
  "maxDrawdownR",
  "maxDrawdownPct",
]);
export type SnapshotMetricKey = z.infer<typeof snapshotMetricKeySchema>;

/**
 * One comparison row. `absoluteDiff` = b − a in the metric's own unit.
 * `relativeDiffPct` = (b − a)/|a| × 100 ONLY when mathematically meaningful
 * (both values present AND a ≠ 0) - winRate uses percentage points instead,
 * trade counts are absolute only. `higherIsBetter` carries the metric's
 * DIRECTION so the UI never paints a bigger drawdown as an improvement (§8).
 */
export const snapshotComparisonRowSchema = z.object({
  metric: snapshotMetricKeySchema,
  unit: z.enum(["money", "ratio", "count", "R", "percent"]),
  higherIsBetter: z.boolean(),
  a: z.string().nullable(),
  b: z.string().nullable(),
  absoluteDiff: z.string().nullable(),
  relativeDiffPct: z.string().nullable(),
  comparable: z.boolean(),
});
export type SnapshotComparisonRow = z.infer<typeof snapshotComparisonRowSchema>;

export const snapshotComparisonSchema = z.object({
  /** False when currency contexts or schema versions are incompatible. */
  compatible: z.boolean(),
  warnings: z.array(z.string()),
  a: z.object({ id: uuidSchema, name: z.string(), capturedAt: isoDateTimeSchema }),
  b: z.object({ id: uuidSchema, name: z.string(), capturedAt: isoDateTimeSchema }),
  rows: z.array(snapshotComparisonRowSchema),
});
export type SnapshotComparison = z.infer<typeof snapshotComparisonSchema>;

// ── Pure comparison engine (shared API/client + tests) ──────────────────────

interface MetricSpec {
  unit: SnapshotComparisonRow["unit"];
  higherIsBetter: boolean;
}

/** Units + direction semantics per metric (§8: direction-aware rendering). */
const METRIC_SPECS: Record<SnapshotMetricKey, MetricSpec> = {
  netPnl: { unit: "money", higherIsBetter: true },
  winRate: { unit: "ratio", higherIsBetter: true },
  profitFactor: { unit: "ratio", higherIsBetter: true },
  trades: { unit: "count", higherIsBetter: false },
  avgR: { unit: "R", higherIsBetter: true },
  expectancyR: { unit: "R", higherIsBetter: true },
  maxDrawdownR: { unit: "R", higherIsBetter: false },
  maxDrawdownPct: { unit: "percent", higherIsBetter: false },
};

const METRIC_KEYS = Object.keys(METRIC_SPECS) as SnapshotMetricKey[];

function round(value: number, places = 4): string {
  const factor = 10 ** places;
  return String(Math.round(value * factor) / factor);
}

/**
 * Compare two snapshots. Pure, deterministic, currency-honest:
 *   - schema-version mismatch → compatible=false + warning (never reinterpreted)
 *   - currency mismatch (one null / two different currencies) → compatible=false
 *     + warning; money rows marked NOT comparable, ratio/R/count rows stay comparable
 *   - a null value (metric unavailable in that capture) → row not comparable
 */
export function comparePerformanceSnapshots(
  a: PerformanceSnapshot,
  b: PerformanceSnapshot,
): SnapshotComparison {
  const warnings: string[] = [];

  const sameSchema = a.schemaVersion === b.schemaVersion;
  if (!sameSchema) {
    warnings.push(
      `Schema versions differ (A v${a.schemaVersion} / B v${b.schemaVersion}) - metric definitions may not be comparable.`,
    );
  }

  const sameCurrency =
    a.currency !== null && b.currency !== null && a.currency === b.currency;
  const bothSingle = a.singleCurrency && b.singleCurrency;
  const moneyComparable = bothSingle && sameCurrency;
  if (bothSingle && !sameCurrency) {
    warnings.push(
      `Currencies differ (A ${a.currency} / B ${b.currency}) - money metrics are NOT comparable without a conversion; only ratio/R/count rows are shown.`,
    );
  } else if (!bothSingle) {
    warnings.push(
      "At least one snapshot spans multiple currencies - money metrics are unavailable; only ratio/R/count rows are shown.",
    );
  }

  const rows: SnapshotComparisonRow[] = METRIC_KEYS.map((metric) => {
    const spec = METRIC_SPECS[metric];
    const isMoney = spec.unit === "money";
    const comparable = (!isMoney || moneyComparable) && sameSchema;
    const rawA = a.metrics[metric];
    const rawB = b.metrics[metric];

    if (!comparable || rawA === null || rawB === null) {
      return {
        metric,
        unit: spec.unit,
        higherIsBetter: spec.higherIsBetter,
        a: rawA === null ? null : String(rawA),
        b: rawB === null ? null : String(rawB),
        absoluteDiff: null,
        relativeDiffPct: null,
        comparable: false,
      };
    }

    const numA = Number(rawA);
    const numB = Number(rawB);
    const absoluteDiff = round(numB - numA);
    // Relative % only when mathematically meaningful (base ≠ 0) - and never
    // for winRate (percentage-point space) or counts (absolute meaning).
    const allowRelative =
      metric !== "winRate" && metric !== "trades" && numA !== 0;
    const relativeDiffPct = allowRelative ? round(((numB - numA) / Math.abs(numA)) * 100, 2) : null;

    return {
      metric,
      unit: spec.unit,
      higherIsBetter: spec.higherIsBetter,
      a: String(rawA),
      b: String(rawB),
      absoluteDiff,
      relativeDiffPct,
      comparable: true,
    };
  });

  return {
    compatible: sameSchema && moneyComparable,
    warnings,
    a: { id: a.id, name: a.name, capturedAt: a.capturedAt },
    b: { id: b.id, name: b.name, capturedAt: b.capturedAt },
    rows,
  };
}
