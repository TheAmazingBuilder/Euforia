import { z } from "zod";

import { currencySchema } from "../enums";
import { decimalStringSchema } from "./primitives";

/**
 * The Analytics Atlas panel system (Phase 9) - a discriminated union of
 * server-computed chart payloads. The server ships raw decimal strings plus
 * a unit hint; the client only formats and paints (same principle as
 * /stats/overview). Every rate keeps its n; honest at zero.
 */

/** Unit hint driving client-side formatting of raw decimal values. */
export const panelUnitSchema = z.enum(["money", "r", "count", "percent", "plain"]);
export type PanelUnit = z.infer<typeof panelUnitSchema>;

/** Ink of a panel element - the register's four semantic colors. */
export const panelInkSchema = z.enum(["accent", "profit", "warning", "loss"]);
export type PanelInk = z.infer<typeof panelInkSchema>;

/** Shared framing for every panel (title block rendered by the section view). */
const panelFrame = {
  /** Subsection key - groups panels under one Atlas subsection. */
  subsection: z.string().min(1),
  title: z.string().min(1),
  caption: z.string().min(1),
  ariaLabel: z.string().min(1),
};

// ── KPI chip ─────────────────────────────────────────────────────────────────

export const panelKpiSchema = z.object({
  key: z.string().min(1),
  label: z.string().min(1),
  /** Raw decimal string; null renders as "-" with no color claims. */
  value: decimalStringSchema.nullable(),
  unit: panelUnitSchema,
  ink: panelInkSchema,
  hint: z.string().nullable(),
});
export type PanelKpi = z.infer<typeof panelKpiSchema>;

// ── bars ─────────────────────────────────────────────────────────────────────

export const panelBarsSchema = z.object({
  ...panelFrame,
  kind: z.literal("bars"),
  unit: panelUnitSchema,
  items: z.array(
    z.object({
      label: z.string().min(1),
      value: decimalStringSchema.nullable(),
      /** Sample size shown under the axis; null hides the n line. */
      n: z.number().int().min(0).nullable(),
      /** Explicit ink; when null the client colors by value sign. */
      ink: panelInkSchema.nullable(),
    }),
  ),
});
export type PanelBars = z.infer<typeof panelBarsSchema>;

// ── line ─────────────────────────────────────────────────────────────────────

export const panelLineSchema = z.object({
  ...panelFrame,
  kind: z.literal("line"),
  unit: panelUnitSchema,
  xLabels: z.array(z.string().min(1)),
  series: z.array(
    z.object({
      name: z.string().min(1),
      ink: panelInkSchema,
      points: z.array(decimalStringSchema.nullable()),
    }),
  ),
  /** Optional percentile/Monte-Carlo corridors drawn under the lines. */
  bands: z
    .array(
      z.object({
        name: z.string().min(1),
        ink: panelInkSchema,
        lower: z.array(decimalStringSchema.nullable()),
        upper: z.array(decimalStringSchema.nullable()),
      }),
    )
    .nullable(),
});
export type PanelLine = z.infer<typeof panelLineSchema>;

// ── donut ────────────────────────────────────────────────────────────────────

export const panelDonutSchema = z.object({
  ...panelFrame,
  kind: z.literal("donut"),
  centerLabel: z.string().min(1),
  slices: z.array(
    z.object({
      label: z.string().min(1),
      value: z.number().int().min(0),
      ink: panelInkSchema,
    }),
  ),
});
export type PanelDonut = z.infer<typeof panelDonutSchema>;

// ── scatter ──────────────────────────────────────────────────────────────────

export const panelScatterSchema = z.object({
  ...panelFrame,
  kind: z.literal("scatter"),
  unit: panelUnitSchema,
  xLabel: z.string().min(1),
  yLabel: z.string().min(1),
  /** Draw the y = x guide spanning the observed range. */
  diagonal: z.boolean(),
  points: z.array(
    z.object({
      x: decimalStringSchema,
      y: decimalStringSchema,
      ink: panelInkSchema.nullable(),
      label: z.string().min(1),
    }),
  ),
});
export type PanelScatter = z.infer<typeof panelScatterSchema>;

// ── heatmap ──────────────────────────────────────────────────────────────────

export const panelHeatmapSchema = z.object({
  ...panelFrame,
  kind: z.literal("heatmap"),
  /** Row labels (y axis) and column labels (x axis), string keyed. */
  rows: z.array(z.string().min(1)),
  columns: z.array(z.string().min(1)),
  cells: z.array(
    z.object({
      row: z.number().int().min(0),
      col: z.number().int().min(0),
      /** Average R of the cell; null (or trades = 0) renders "-". */
      avgR: decimalStringSchema.nullable(),
      trades: z.number().int().min(0),
    }),
  ),
});
export type PanelHeatmap = z.infer<typeof panelHeatmapSchema>;

// ── table ────────────────────────────────────────────────────────────────────

export const panelTableCellSchema = z.object({
  text: z.string(),
  ink: panelInkSchema.nullable(),
  mono: z.boolean(),
  strong: z.boolean(),
});
export type PanelTableCell = z.infer<typeof panelTableCellSchema>;

export const panelTableSchema = z.object({
  ...panelFrame,
  kind: z.literal("table"),
  columns: z.array(z.string().min(1)),
  /** Indices of right-aligned numeric columns. */
  numericCols: z.array(z.number().int().min(0)),
  rows: z.array(
    z.object({
      id: z.string().min(1),
      cells: z.array(panelTableCellSchema),
    }),
  ),
  footnote: z.string().nullable(),
});
export type PanelTable = z.infer<typeof panelTableSchema>;

// ── buckets ──────────────────────────────────────────────────────────────────

export const panelBucketsSchema = z.object({
  ...panelFrame,
  kind: z.literal("buckets"),
  /** Reuses the trusted AnalyticsBucket contract (BucketBars renderer). */
  buckets: z.array(
    z.object({
      key: z.string().min(1),
      label: z.string().min(1),
      trades: z.number().int().min(0),
      wins: z.number().int().min(0),
      avgR: decimalStringSchema.nullable(),
      winRate: decimalStringSchema.nullable(),
    }),
  ),
});
export type PanelBuckets = z.infer<typeof panelBucketsSchema>;

// ── union ────────────────────────────────────────────────────────────────────

export const analyticsPanelSchema = z.discriminatedUnion("kind", [
  panelBarsSchema,
  panelLineSchema,
  panelDonutSchema,
  panelScatterSchema,
  panelHeatmapSchema,
  panelTableSchema,
  panelBucketsSchema,
]);
export type AnalyticsPanel = z.infer<typeof analyticsPanelSchema>;

// ── section response ─────────────────────────────────────────────────────────

/** GET /stats/analytics/sections/:sectionId - one Atlas section page. */
export const analyticsSectionResponseSchema = z.object({
  sectionId: z.string().min(1),
  currency: currencySchema,
  /** Number of closed trades the section aggregates (honesty strip). */
  sampleTrades: z.number().int().min(0),
  kpis: z.array(panelKpiSchema),
  panels: z.array(analyticsPanelSchema),
});
export type AnalyticsSectionResponse = z.infer<typeof analyticsSectionResponseSchema>;
