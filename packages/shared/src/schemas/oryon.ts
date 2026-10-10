import { z } from "zod";

/**
 * Oryon drawing contracts — cahier des charges §8.3 (RF-04, RF-09).
 *
 * The drawing object model lives in the SHARED package because it is a
 * module contract, not a component detail: the frontend persists it (local
 * storage, per symbol, versioned envelope) and validates it back with the
 * exact same schema (safeParse — invalid data is dropped, never rendered).
 *
 * Anchors are stored in CHART-DOMAIN coordinates, never screen pixels:
 *  - `t`  — time anchor, unix SECONDS (the Lightweight Charts UTCTimestamp
 *           domain the engine already uses: Candle.t / 1000)
 *  - `p`  — price anchor, raw price number
 * A trend/ray/rect/fib/measure object keeps two anchors; hline keeps a
 * price; vline keeps a time; text keeps one anchor + its text.
 *
 * V2 type set (RF-04): the seven V1 types (TREND, HLINE, RAY, RECT, TEXT,
 * MEASURE, FIB) plus VLINE. All eight are part of the persisted contract;
 * a renderer may not exist for every type yet — the loader filters
 * unrenderable types out instead of rendering something dishonest.
 */

export const oryonDrawingTypeSchema = z.enum([
  "trend",
  "hline",
  "vline",
  "ray",
  "rect",
  "text",
  "measure",
  "fib",
]);

export type OryonDrawingType = z.infer<typeof oryonDrawingTypeSchema>;

/** Chart-domain anchor: unix seconds + price. Both must be finite numbers. */
export const oryonDrawingAnchorSchema = z.object({
  t: z.number().finite(),
  p: z.number().finite(),
});

export type OryonDrawingAnchor = z.infer<typeof oryonDrawingAnchorSchema>;

export const oryonLineDashSchema = z.enum(["solid", "dashed", "dotted"]);

export type OryonLineDash = z.infer<typeof oryonLineDashSchema>;

/** Persisted style. Palette VALUES resolve at render time from theme tokens. */
export const oryonDrawingStyleSchema = z.object({
  /** Theme token KEY (e.g. "accent", "profit") — never a raw hex. */
  color: z.string().min(1).max(32),
  width: z.number().int().min(1).max(4),
  dash: oryonLineDashSchema,
  /** Fill token key + opacity for area-like types (rect, fib, measure). */
  fill: z.string().min(1).max(32).nullable(),
  fillOpacity: z.number().min(0).max(1),
  /** Text annotation font size (px). */
  fontSize: z.number().int().min(10).max(28),
});

export type OryonDrawingStyle = z.infer<typeof oryonDrawingStyleSchema>;

const commonDrawingFields = {
  id: z.string().min(8).max(64),
  visible: z.boolean(),
  locked: z.boolean(),
  label: z.string().max(64).nullable(),
  /** Creation / modification timestamps, unix ms (repo convention). */
  createdAt: z.number().finite().int(),
  updatedAt: z.number().finite().int(),
  style: oryonDrawingStyleSchema,
};

/** Trend line — two anchors (a → b). */
export const oryonTrendDrawingSchema = z.object({
  ...commonDrawingFields,
  type: z.literal("trend"),
  a: oryonDrawingAnchorSchema,
  b: oryonDrawingAnchorSchema,
});

/** Horizontal line — one price, spans the plot area. */
export const oryonHLineDrawingSchema = z.object({
  ...commonDrawingFields,
  type: z.literal("hline"),
  price: z.number().finite(),
});

/** Vertical line — one bar time (unix seconds). */
export const oryonVLineDrawingSchema = z.object({
  ...commonDrawingFields,
  type: z.literal("vline"),
  time: z.number().finite(),
});

/** Ray — anchor a through anchor b, extended past b. */
export const oryonRayDrawingSchema = z.object({
  ...commonDrawingFields,
  type: z.literal("ray"),
  a: oryonDrawingAnchorSchema,
  b: oryonDrawingAnchorSchema,
});

/** Rectangle — two opposing anchors. */
export const oryonRectDrawingSchema = z.object({
  ...commonDrawingFields,
  type: z.literal("rect"),
  a: oryonDrawingAnchorSchema,
  b: oryonDrawingAnchorSchema,
});

/** Text annotation — one anchor + the text content. */
export const oryonTextDrawingSchema = z.object({
  ...commonDrawingFields,
  type: z.literal("text"),
  at: oryonDrawingAnchorSchema,
  text: z.string().max(200),
});

/** Measure — two anchors, readout of Δprice / Δ% / Δpips / Δbars. */
export const oryonMeasureDrawingSchema = z.object({
  ...commonDrawingFields,
  type: z.literal("measure"),
  a: oryonDrawingAnchorSchema,
  b: oryonDrawingAnchorSchema,
});

/** Fibonacci retracement — two anchors, levels computed at render time. */
export const oryonFibDrawingSchema = z.object({
  ...commonDrawingFields,
  type: z.literal("fib"),
  a: oryonDrawingAnchorSchema,
  b: oryonDrawingAnchorSchema,
});

export const oryonDrawingSchema = z.discriminatedUnion("type", [
  oryonTrendDrawingSchema,
  oryonHLineDrawingSchema,
  oryonVLineDrawingSchema,
  oryonRayDrawingSchema,
  oryonRectDrawingSchema,
  oryonTextDrawingSchema,
  oryonMeasureDrawingSchema,
  oryonFibDrawingSchema,
]);

export type OryonDrawing = z.infer<typeof oryonDrawingSchema>;

/** Two-anchor drawing shapes (trend, ray, rect, measure, fib). */
export type OryonTwoAnchorDrawing = Extract<
  OryonDrawing,
  { a: OryonDrawingAnchor; b: OryonDrawingAnchor }
>;

/** Versioned persistence envelope (RF-09) — one file per symbol. */
export const oryonDrawingsFileSchema = z.object({
  version: z.literal(1),
  symbol: z.string().min(1),
  savedAt: z.number().finite().int(),
  drawings: z.array(oryonDrawingSchema).max(500),
});

export type OryonDrawingsFile = z.infer<typeof oryonDrawingsFileSchema>;

/** Fibonacci retracement levels (verified ratios, 0..1 band). */
export const ORYON_FIB_LEVELS = [0, 0.236, 0.382, 0.5, 0.618, 0.786, 1] as const;

// ── Indicator contracts (Phase 3 — cahier des charges RF-05, jalon P2) ──────
//
// The indicator instance model mirrors the drawing model: persisted through
// the SAME shared schema that validates the load (safeParse — invalid data
// is dropped, never rendered), styles carry THEME TOKEN KEYS resolved at
// render time (never raw hex), and the envelope is versioned for future
// migrations.
//
// Persistence scope decision (documented in the Phase 3 report): indicators
// are a CHART-LEVEL setup (an analyst's stack — e.g. RSI 14 + MACD 12/26/9),
// not per-symbol annotation: one file, keyed by nothing but the versioned
// prefix. They survive instrument and timeframe switches and are recomputed
// from the candles actually displayed. Drawings stay per-symbol.
//
// Business rules that Zod CANNOT express inside a discriminated union
// (MACD fast < slow, RSI lower < upper) live in the calc/validation layer —
// the loader drops rule-violating instances with a warning instead of
// rendering mathematically dishonest series.

/** The implemented indicator set (RF-05). No placeholder entries. */
export const oryonIndicatorTypeSchema = z.enum([
  "sma",
  "ema",
  "rsi",
  "macd",
  "bbands",
  "atr",
  "volume",
]);

export type OryonIndicatorType = z.infer<typeof oryonIndicatorTypeSchema>;

/** Persisted line style. Palette VALUES resolve at render time from tokens. */
export const oryonIndicatorStyleSchema = z.object({
  /** Theme token KEY (e.g. "cat-ta", "warning") — never a raw hex. */
  color: z.string().min(1).max(32),
  width: z.number().int().min(1).max(4),
  dash: oryonLineDashSchema,
});

export type OryonIndicatorStyle = z.infer<typeof oryonIndicatorStyleSchema>;

const commonIndicatorFields = {
  id: z.string().min(8).max(64),
  visible: z.boolean(),
  /** Creation / modification timestamps, unix ms (repo convention). */
  createdAt: z.number().finite().int(),
  updatedAt: z.number().finite().int(),
};

/** Simple Moving Average — configurable period, main-chart overlay. */
export const oryonSmaIndicatorSchema = z.object({
  ...commonIndicatorFields,
  type: z.literal("sma"),
  period: z.number().int().min(2).max(500),
  style: oryonIndicatorStyleSchema,
});

/** Exponential Moving Average — SMA-seeded, main-chart overlay. */
export const oryonEmaIndicatorSchema = z.object({
  ...commonIndicatorFields,
  type: z.literal("ema"),
  period: z.number().int().min(2).max(500),
  style: oryonIndicatorStyleSchema,
});

/** Relative Strength Index — Wilder smoothing, dedicated pane. */
export const oryonRsiIndicatorSchema = z.object({
  ...commonIndicatorFields,
  type: z.literal("rsi"),
  period: z.number().int().min(2).max(500),
  /** Reference levels (0..100) — configurable, drawn as price lines. */
  upper: z.number().min(1).max(100),
  lower: z.number().min(1).max(100),
  style: oryonIndicatorStyleSchema,
});

/** MACD — fast/slow/signal EMAs, dedicated pane with histogram. */
export const oryonMacdIndicatorSchema = z.object({
  ...commonIndicatorFields,
  type: z.literal("macd"),
  fast: z.number().int().min(2).max(200),
  slow: z.number().int().min(3).max(400),
  signal: z.number().int().min(1).max(100),
  /** MACD line style. */
  style: oryonIndicatorStyleSchema,
  /** Signal line style. */
  signalStyle: oryonIndicatorStyleSchema,
});

/** Bollinger Bands — SMA basis ± k·σ (population), main-chart overlay. */
export const oryonBbandsIndicatorSchema = z.object({
  ...commonIndicatorFields,
  type: z.literal("bbands"),
  period: z.number().int().min(2).max(500),
  stddev: z.number().min(0.1).max(10),
  /** Basis line style; upper/lower bands reuse color with hairline width. */
  style: oryonIndicatorStyleSchema,
});

/** Average True Range — Wilder-smoothed true range, dedicated pane. */
export const oryonAtrIndicatorSchema = z.object({
  ...commonIndicatorFields,
  type: z.literal("atr"),
  period: z.number().int().min(2).max(500),
  style: oryonIndicatorStyleSchema,
});

/** Volume histogram — candle volumes, dedicated pane. */
export const oryonVolumeIndicatorSchema = z.object({
  ...commonIndicatorFields,
  type: z.literal("volume"),
});

export const oryonIndicatorSchema = z.discriminatedUnion("type", [
  oryonSmaIndicatorSchema,
  oryonEmaIndicatorSchema,
  oryonRsiIndicatorSchema,
  oryonMacdIndicatorSchema,
  oryonBbandsIndicatorSchema,
  oryonAtrIndicatorSchema,
  oryonVolumeIndicatorSchema,
]);

export type OryonIndicatorInstance = z.infer<typeof oryonIndicatorSchema>;

/** Versioned persistence envelope (Phase 3 §11) — ONE chart-level file. */
export const oryonIndicatorsFileSchema = z.object({
  version: z.literal(1),
  savedAt: z.number().finite().int(),
  indicators: z.array(oryonIndicatorSchema).max(50),
});

export type OryonIndicatorsFile = z.infer<typeof oryonIndicatorsFileSchema>;
