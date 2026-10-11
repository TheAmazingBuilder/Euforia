import { z } from "zod";

import { marketIntervalSchema } from "./market";

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
 *
 * V3 type set (Drawing toolbar v2 — TradingView-parity rail): eight ADDITIVE
 * members. The persistence envelope is unchanged (same version, same file
 * shape) — old records load untouched, and every new member has a renderer
 * in the same build that can persist it (the "unrenderable type" loader
 * filter above remains a safety net, never the happy path).
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
  // ── V3 additions (additive, backward-compatible) ──
  /** Infinite line through a→b, extended BOTH directions (clipped to plot). */
  "extended",
  /** One-click cross: horizontal + vertical line through one anchor. */
  "crossline",
  /** Trend-based Fibonacci extension — three anchors a→b projected from c. */
  "fibext",
  /** Vertical price ruler: Δprice / Δ% / pips readout. */
  "pricerange",
  /** Horizontal time ruler: elapsed duration + bars readout. */
  "daterange",
  /** Long position tool: entry at a, stop at b.p, 1:1 target derived. */
  "longpos",
  /** Short position tool: entry at a, stop at b.p, 1:1 target derived. */
  "shortpos",
  /** Ellipse inscribed in the a→b bounding rect. */
  "ellipse",
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

// ── V3 types (Drawing toolbar v2 — additive members, same style/anchors) ────

/** Extended line — two anchors, drawn infinitely in BOTH directions. */
export const oryonExtendedDrawingSchema = z.object({
  ...commonDrawingFields,
  type: z.literal("extended"),
  a: oryonDrawingAnchorSchema,
  b: oryonDrawingAnchorSchema,
});

/** Cross line — one anchor; horizontal AND vertical through it. */
export const oryonCrosslineDrawingSchema = z.object({
  ...commonDrawingFields,
  type: z.literal("crossline"),
  at: oryonDrawingAnchorSchema,
});

/**
 * Trend-based Fibonacci extension — THREE anchors: the A→B swing measured
 * and projected from C. Extension levels = c.p + (b.p − a.p) × level
 * (ORYON_FIB_EXT_LEVELS), drawn from the last-placed anchor rightward.
 */
export const oryonFibExtDrawingSchema = z.object({
  ...commonDrawingFields,
  type: z.literal("fibext"),
  a: oryonDrawingAnchorSchema,
  b: oryonDrawingAnchorSchema,
  c: oryonDrawingAnchorSchema,
});

/** Price range — vertical ruler between the two anchor prices (at a.t). */
export const oryonPriceRangeDrawingSchema = z.object({
  ...commonDrawingFields,
  type: z.literal("pricerange"),
  a: oryonDrawingAnchorSchema,
  b: oryonDrawingAnchorSchema,
});

/** Date range — horizontal ruler between the two anchor times (at a.p). */
export const oryonDateRangeDrawingSchema = z.object({
  ...commonDrawingFields,
  type: z.literal("daterange"),
  a: oryonDrawingAnchorSchema,
  b: oryonDrawingAnchorSchema,
});

/**
 * Position tool (long/short) — TWO anchors: a = entry (time + price),
 * b = stop corner (time + stop price). The TARGET is DERIVED at 1:1 R:R
 * (ORYON_POSITION_RR): target.p = entry.p + (entry.p − stop.p) — never
 * persisted (a stored value could silently disagree with the documented
 * ratio); the time span is a.t → b.t.
 */
export const oryonLongPositionDrawingSchema = z.object({
  ...commonDrawingFields,
  type: z.literal("longpos"),
  a: oryonDrawingAnchorSchema,
  b: oryonDrawingAnchorSchema,
});

export const oryonShortPositionDrawingSchema = z.object({
  ...commonDrawingFields,
  type: z.literal("shortpos"),
  a: oryonDrawingAnchorSchema,
  b: oryonDrawingAnchorSchema,
});

/** Ellipse — inscribed in the a→b bounding rect. */
export const oryonEllipseDrawingSchema = z.object({
  ...commonDrawingFields,
  type: z.literal("ellipse"),
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
  oryonExtendedDrawingSchema,
  oryonCrosslineDrawingSchema,
  oryonFibExtDrawingSchema,
  oryonPriceRangeDrawingSchema,
  oryonDateRangeDrawingSchema,
  oryonLongPositionDrawingSchema,
  oryonShortPositionDrawingSchema,
  oryonEllipseDrawingSchema,
]);

export type OryonDrawing = z.infer<typeof oryonDrawingSchema>;

/** Two-anchor drawing shapes (trend, ray, rect, measure, fib + V3 pairs). */
export type OryonTwoAnchorDrawing = Extract<
  OryonDrawing,
  { a: OryonDrawingAnchor; b: OryonDrawingAnchor }
>;

/** Three-anchor drawing shapes (fibext). */
export type OryonThreeAnchorDrawing = Extract<
  OryonDrawing,
  { a: OryonDrawingAnchor; b: OryonDrawingAnchor; c: OryonDrawingAnchor }
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

/**
 * Trend-based Fibonacci EXTENSION ratios (fractions of the A→B swing,
 * projected from C). 0 = at C itself, 1 = one full swing beyond C,
 * 1.618 = the golden extension. Values > 1 genuinely extend — the
 * readout labels every line with its ratio + price, nothing hidden.
 */
export const ORYON_FIB_EXT_LEVELS = [0, 0.236, 0.382, 0.5, 0.618, 0.786, 1, 1.618] as const;

/**
 * Position tool risk:reward — DERIVED target ratio (documented constant;
 * a configurable ratio arrives with the property editor, never a silent
 * change of the drawn geometry).
 */
export const ORYON_POSITION_RR = 1 as const;

/** Derives the position-tool target price from entry/stop (pure, tested).
 *  target = entry + (entry − stop) × RR — works for BOTH directions: the
 *  risk term is naturally positive for a long (stop below entry) and
 *  negative for a short (stop above entry). */
export function oryonPositionTargetPrice(
  entryPrice: number,
  stopPrice: number,
): number {
  return entryPrice + (entryPrice - stopPrice) * ORYON_POSITION_RR;
}

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

// ── Price-alert contracts (Phase 5 — spec §6, §9) ───────────────────────────
//
// Oryon has NO server-side alert infrastructure in this deployment (no NestJS
// alert module, no database model, no evaluation transport — audited Phase 5
// §2). The alert record therefore lives in the SHARED contract like drawings
// and indicators: the frontend persists it locally (versioned envelope,
// safeParse on load — invalid records are dropped, never rendered) and
// evaluates it against the app's verified market feed while the workspace is
// open. This schema intentionally carries NO delivery-channel field: the
// only implemented channel is the in-app toast + panel state, and a contract
// that pretends email/push/webhook support would be a product lie.
//
// The lifecycle is deliberately minimal and HONEST:
//   active    — evaluated against live feed observations;
//   triggered — the evaluator CONFIRMED a crossing (timestamped); one-shot
//               until the user re-arms (documented product decision, spec
//               §6.2: re-arm behavior defined by an explicit decision);
//   disabled  — kept but not evaluated, not drawn.
// There is no "expired" state: no expiry policy exists in the product yet,
// and inventing one would imply an evaluator that does not exist.

export const oryonAlertConditionSchema = z.enum(["crosses_above", "crosses_below"]);

export type OryonAlertCondition = z.infer<typeof oryonAlertConditionSchema>;

export const oryonAlertStatusSchema = z.enum(["active", "triggered", "disabled"]);

export type OryonAlertStatus = z.infer<typeof oryonAlertStatusSchema>;

export const oryonAlertSchema = z.object({
  id: z.string().min(8).max(64),
  /** Market symbol — the repo's stable identity, matched EXACTLY (never a
   *  substring) against the feed and the chart instrument. */
  symbol: z.string().min(1).max(32),
  /** Threshold the condition evaluates against (chart price domain). */
  targetPrice: z.number().finite(),
  condition: oryonAlertConditionSchema,
  /** Optional user label (max 64, mirroring the drawing label contract). */
  label: z.string().max(64).nullable(),
  status: oryonAlertStatusSchema,
  /** Creation / modification timestamps, unix ms (repo convention). */
  createdAt: z.number().finite().int(),
  updatedAt: z.number().finite().int(),
  /** Client epoch ms of the CONFIRMED trigger — null while not triggered. */
  triggeredAt: z.number().finite().int().nullable(),
});

export type OryonAlert = z.infer<typeof oryonAlertSchema>;

/** Versioned persistence envelope (Phase 5) — ONE browser-local file. */
export const oryonAlertsFileSchema = z.object({
  version: z.literal(1),
  savedAt: z.number().finite().int(),
  alerts: z.array(oryonAlertSchema).max(100),
});

export type OryonAlertsFile = z.infer<typeof oryonAlertsFileSchema>;

// ── Workspace layout contracts (Phase 6 — spec §4, §5) ──────────────────────
//
// A workspace layout describes HOW THE WORKSPACE IS ARRANGED: the active
// instrument, timeframe, chart type, crosshair mode and the visibility of
// the workspace rails/panels. It is deliberately DISTINCT from a chart
// template (below): a layout answers "how is my working environment set
// up", a template answers "how do I analyze a chart". They share no mutable
// state and applying one never mutates the other.
//
// Scope discipline (spec §5): ONLY state the current application can
// actually apply is part of the contract. Transient UI state (hover
// tooltips, in-progress gestures, context menus, drag states, loading and
// error surfaces) is structurally excluded — it does not exist here.
// Chart-panel split proportions do not exist in the current single-chart
// workspace (fixed-height lower panel), so nothing is persisted for them;
// the schema grows additively when a future phase introduces resizable
// arrangements (version bump + migration, never a silent reshape).
//
// Multi-chart note (spec §12): Oryon renders ONE chart panel today. The
// layout record is a single-chart shape by design; a future multi-chart
// engine adds a `charts` array alongside these fields in a NEW schema
// version instead of overloading this one.

/** The panels the utility rail can show (mirrors the rail's tab model). */
export const oryonLayoutPanelSchema = z.enum(["notifications", "alerts", "calendar"]);

export type OryonLayoutPanel = z.infer<typeof oryonLayoutPanelSchema>;

/** Chart types the engine implements (mirrors OryonChartType). */
export const oryonLayoutChartTypeSchema = z.enum(["candles", "line"]);

export type OryonLayoutChartType = z.infer<typeof oryonLayoutChartTypeSchema>;

export const oryonWorkspaceLayoutSchema = z.object({
  id: z.string().min(8).max(64),
  /** Display name, trimmed, 1..48 chars. Uniqueness is a store policy
   *  (case-insensitive) — Zod cannot express it inside a list. */
  name: z.string().min(1).max(48),
  /** Active instrument SYMBOL (the feed identity — stable across sessions),
   *  or null to keep the app's default selection. Resolved through the
   *  instrument catalog on apply; an unknown symbol applies the REST of the
   *  layout and leaves the selection at its default (partial restore). */
  symbol: z.string().min(1).max(32).nullable(),
  interval: marketIntervalSchema,
  chartType: oryonLayoutChartTypeSchema,
  /** Magnet crosshair mode (toolbar toggle). */
  magnet: z.boolean(),
  /** Lower positions panel visibility. */
  lowerPanel: z.boolean(),
  /** Right utility rail visibility + active panel. */
  utilityRail: z.object({
    open: z.boolean(),
    panel: oryonLayoutPanelSchema,
  }),
  /** Creation / modification timestamps, unix ms (repo convention). */
  createdAt: z.number().finite().int(),
  updatedAt: z.number().finite().int(),
});

export type OryonWorkspaceLayout = z.infer<typeof oryonWorkspaceLayoutSchema>;

/**
 * Versioned persistence envelope (Phase 6) — ONE browser-local file.
 * `activeLayoutId` is the persisted pointer to the layout that was active
 * when the workspace last saved; null = the built-in default layout. The
 * DEFAULT LAYOUT ITSELF IS NEVER STORED — it is a code-level constant, so
 * it stays recoverable no matter what the user does to their saved records.
 */
export const oryonLayoutsFileSchema = z.object({
  version: z.literal(1),
  savedAt: z.number().finite().int(),
  layouts: z.array(oryonWorkspaceLayoutSchema).max(20),
  activeLayoutId: z.string().min(8).max(64).nullable(),
});

export type OryonLayoutsFile = z.infer<typeof oryonLayoutsFileSchema>;

// ── Chart template contracts (Phase 6 — spec §6) ────────────────────────────
//
// A chart template is a reusable ANALYSIS configuration: chart type, an
// optional timeframe and the indicator stack with its validated parameters
// and styles. Indicator entries REUSE the existing oryonIndicatorSchema —
// the exact same validated shape the live chart persists — so a template
// can never carry configuration the chart cannot rebuild, and business
// rules (MACD fast < slow, RSI lower < upper) are re-checked on apply by
// the same validation layer.
//
// What a template deliberately does NOT contain: runtime objects (chart
// instances, DOM nodes, subscriptions, callbacks — impossible in JSON, and
// the contract states it), broker/account data, drawings, price alerts and
// workspace arrangement (a layout's job, spec §3). Applying a template
// never erases drawings, alerts or positions (spec §11).
//
// `interval` semantics: null = the timeframe is NOT part of this template
// (applying it leaves the current timeframe untouched). Non-null = the
// template restores the timeframe it was saved with. The save flow captures
// the current interval; the null case exists so future template flows can
// scope a template to "analysis settings only" without a schema change.

export const oryonChartTemplateSchema = z.object({
  id: z.string().min(8).max(64),
  /** Display name, trimmed, 1..48 chars. Uniqueness is a store policy
   *  (case-insensitive), mirroring layouts. */
  name: z.string().min(1).max(48),
  chart: z.object({
    type: oryonLayoutChartTypeSchema,
    /** null = applying this template does not touch the timeframe. */
    interval: marketIntervalSchema.nullable(),
  }),
  /** The validated indicator stack this template restores (max = the
   *  live chart's own instance cap, so a template can always be applied). */
  indicators: z.array(oryonIndicatorSchema).max(50),
  createdAt: z.number().finite().int(),
  updatedAt: z.number().finite().int(),
});

export type OryonChartTemplate = z.infer<typeof oryonChartTemplateSchema>;

/** Versioned persistence envelope (Phase 6) — ONE browser-local file. */
export const oryonChartTemplatesFileSchema = z.object({
  version: z.literal(1),
  savedAt: z.number().finite().int(),
  templates: z.array(oryonChartTemplateSchema).max(30),
});

export type OryonChartTemplatesFile = z.infer<typeof oryonChartTemplatesFileSchema>;

// ── Multi-chart workspace contracts (Phase 7 — spec §4, §5, §8, §9, §12) ────
//
// Phase 6 documented the growth path: "a future multi-chart engine adds a
// `charts` array alongside these fields in a NEW schema version instead of
// overloading this one." Phase 7 is that version. The v2 layout REPLACES the
// flat single-chart fields with an explicit panel list — the migration from
// v1 is deterministic (one panel built from the flat fields) and lives in
// the web domain layer, so this contract stays a pure data description.
//
// Sync model (spec §9, simpler-model clause): the workspace is ONE implicit
// synchronization group — every panel is a member by construction (derived
// membership can never hold stale references, and conflicting memberships
// are structurally impossible). The group carries four INDEPENDENT feature
// flags; enabling one never enables another (spec §8.3/§8.4). A future
// multi-group partition grows this record additively.

/** Chart-grid arrangements the workspace implements (spec §5). */
export const oryonGridSchema = z.enum(["single", "twoHorizontal", "twoVertical", "quad"]);

export type OryonGrid = z.infer<typeof oryonGridSchema>;

/** Synchronization features — each toggled independently (spec §8). */
export const oryonSyncSettingsSchema = z.object({
  /** Align the visible time range of synchronized charts. */
  timeScale: z.boolean(),
  /** Mirror the crosshair time position across synchronized charts. */
  crosshair: z.boolean(),
  /** An instrument change on one chart updates the linked charts. */
  instrument: z.boolean(),
  /** A timeframe change on one chart updates the linked charts. */
  timeframe: z.boolean(),
});

export type OryonSyncSettings = z.infer<typeof oryonSyncSettingsSchema>;

/** Deterministic all-off sync state — the default (nothing is linked). */
export const ORYON_SYNC_ALL_OFF: OryonSyncSettings = {
  timeScale: false,
  crosshair: false,
  instrument: false,
  timeframe: false,
};

/** Hard panel cap — the quad grid is the largest implemented arrangement. */
export const ORYON_MAX_PANELS = 4;

/** Stable id of the DEFAULT panel (the Phase 1 single chart). A code-level
 *  constant so the default panel's analysis stack keeps a stable identity
 *  across sessions even when no layout is saved. */
export const ORYON_MAIN_PANEL_ID = "panel-main";

/**
 * One chart panel's validated configuration (spec §4). Everything here is
 * serializable configuration the application can actually apply — chart
 * runtime objects, DOM nodes, subscriptions and callbacks do not exist in
 * this contract by construction.
 */
export const oryonChartPanelSchema = z.object({
  /** Stable panel identity — independent of instrument and timeframe. */
  id: z.string().min(8).max(64),
  /** Instrument SYMBOL (feed identity), or null = the app's default
   *  selection. Resolved through the instrument catalog on apply. */
  symbol: z.string().min(1).max(32).nullable(),
  interval: marketIntervalSchema,
  chartType: oryonLayoutChartTypeSchema,
  /**
   * The indicator stack the LAYOUT restores for this panel. null = the
   * layout does not manage this panel's analysis stack (v1 heritage and an
   * explicit "not managed" marker) — applying the layout leaves the live
   * stack untouched. An array is applied as-is through the validated
   * indicator schema (business rules re-checked at apply time).
   */
  indicators: z.array(oryonIndicatorSchema).max(50).nullable(),
});

export type OryonChartPanel = z.infer<typeof oryonChartPanelSchema>;

/**
 * Workspace layout v2 — the multi-chart arrangement (spec §12): grid
 * arrangement, stable panel identities, per-panel instrument/timeframe and
 * supported chart configuration, synchronization preferences and the
 * workspace shell settings Phase 6 already persisted.
 */
export const oryonWorkspaceLayoutV2Schema = z.object({
  id: z.string().min(8).max(64),
  /** Display name, trimmed, 1..48 chars — uniqueness is a store policy. */
  name: z.string().min(1).max(48),
  grid: oryonGridSchema,
  /** 1..4 panels; ids are unique within the record (store invariant). */
  panels: z.array(oryonChartPanelSchema).min(1).max(ORYON_MAX_PANELS),
  /** The panel that was active when the layout was saved (viewing
   *  preference — restored on apply, excluded from the dirty comparison). */
  activePanelId: z.string().min(8).max(64),
  sync: oryonSyncSettingsSchema,
  magnet: z.boolean(),
  lowerPanel: z.boolean(),
  utilityRail: z.object({
    open: z.boolean(),
    panel: oryonLayoutPanelSchema,
  }),
  createdAt: z.number().finite().int(),
  updatedAt: z.number().finite().int(),
});

export type OryonWorkspaceLayoutV2 = z.infer<typeof oryonWorkspaceLayoutV2Schema>;

/**
 * Versioned persistence envelope v2 (Phase 7) — ONE browser-local file.
 * Loaders accept the v1 envelope (single-chart records) and migrate them
 * deterministically; saves always write v2. The default layout stays a
 * code-level constant — never stored.
 */
export const oryonLayoutsFileV2Schema = z.object({
  version: z.literal(2),
  savedAt: z.number().finite().int(),
  layouts: z.array(oryonWorkspaceLayoutV2Schema).max(20),
  activeLayoutId: z.string().min(8).max(64).nullable(),
});

export type OryonLayoutsFileV2 = z.infer<typeof oryonLayoutsFileV2Schema>;

// ── Temporal-context contracts (Phase 8 — spec §12) ─────────────────────────
//
// Session overlays and economic-event markers are PER-PANEL display
// preferences: a multi-chart workspace compares, among other things, a
// session-driven FX chart against a 24/7 crypto chart, so a single
// workspace-level toggle would flatten a real product need (spec §11
// "per-chart visibility preferences remain independent").
//
// What is deliberately NOT in this contract (spec §12 scope discipline):
//  - the session DEFINITIONS themselves (IANA zones, local hours, days) —
//    they are versioned CODE constants in the web domain layer, not user
//    data; persisting them would let an old layout resurrect an outdated
//    schedule;
//  - the economic-event RECORDS (they live in the calendar data layer,
//    refetched and revalidated — never copied into a layout);
//  - transient event-detail popovers / open menus (not applyable state);
//  - the events-panel browsing filters (currency / date-range filters are
//    reading controls of the calendar surface, not chart configuration).
//
// The v3 layout REPLACES the v2 panel shape additively (context field);
// the migration v2→v3 is deterministic (context = the documented default)
// and lives in the web domain layer, mirroring the v1→v2 pattern.

/** Minimum event importance a panel renders as chart markers (spec §8). */
export const oryonEventImportanceSchema = z.enum(["LOW", "MEDIUM", "HIGH"]);

export type OryonEventImportance = z.infer<typeof oryonEventImportanceSchema>;

/** One panel's temporal-context display preferences (spec §12). */
export const oryonPanelContextSchema = z.object({
  /** Subtle session background shading + start markers. */
  sessionShading: z.boolean(),
  /** Economic-event markers within the loaded chart span. */
  eventMarkers: z.boolean(),
  /** Events below this importance never become markers. */
  eventMinImportance: oryonEventImportanceSchema,
});

export type OryonPanelContext = z.infer<typeof oryonPanelContextSchema>;

/**
 * Default context for a NEW panel and the deterministic v2→v3 migration:
 * shading ON (standard terminal furniture, subtle by design), markers ON
 * restricted to MEDIUM+ (readable default — LOW noise stays in the panel).
 */
export const ORYON_DEFAULT_PANEL_CONTEXT: OryonPanelContext = {
  sessionShading: true,
  eventMarkers: true,
  eventMinImportance: "MEDIUM",
};

/** Chart panel v3 — the v2 configuration plus the context preferences. */
export const oryonChartPanelV3Schema = oryonChartPanelSchema.extend({
  context: oryonPanelContextSchema,
});

export type OryonChartPanelV3 = z.infer<typeof oryonChartPanelV3Schema>;

/** Workspace layout v3 — the v2 arrangement with per-panel context. */
export const oryonWorkspaceLayoutV3Schema = oryonWorkspaceLayoutV2Schema.extend({
  panels: z.array(oryonChartPanelV3Schema).min(1).max(ORYON_MAX_PANELS),
});

export type OryonWorkspaceLayoutV3 = z.infer<typeof oryonWorkspaceLayoutV3Schema>;

/** Versioned persistence envelope v3 (Phase 8) — ONE browser-local file.
 *  Loaders accept v1/v2 and migrate deterministically; saves write v3. */
export const oryonLayoutsFileV3Schema = z.object({
  version: z.literal(3),
  savedAt: z.number().finite().int(),
  layouts: z.array(oryonWorkspaceLayoutV3Schema).max(20),
  activeLayoutId: z.string().min(8).max(64).nullable(),
});

export type OryonLayoutsFileV3 = z.infer<typeof oryonLayoutsFileV3Schema>;

// ── Market-structure & key-level contracts (Phase 9 — spec §7, §9) ──────────
//
// Structure and key-level analysis are PER-PANEL configuration, exactly
// like the Phase 8 context: a multi-chart workspace legitimately compares
// a structure-annotated FX chart with a clean crypto chart, so the config
// cannot be workspace-level. The v4 layout EXTENDS the v3 panel shape
// additively (`analysis` field); the migration v3→v4 is deterministic
// (every migrated panel takes the documented defaults — everything OFF, so
// a restored old layout renders exactly as it did before) and lives in the
// web domain layer, mirroring the v2→v3 pattern.
//
// Deliberately NOT in this contract (scope discipline):
//  - calculation RESULTS (pivots, labels, break events, level prices) —
//    they are derived data recomputed from candles, never persisted;
//  - the session DEFINITIONS (same rule as v3: code constants, so an old
//    layout can never resurrect an outdated schedule — the persisted
//    vocabulary is the session ID, the schedule always renders from code).

/** How a structure break is confirmed (spec §4.4: both modes are reliably
 *  implementable, so the choice is user-facing; "close" is the default). */
export const oryonBreakModeSchema = z.enum(["close", "wick"]);

export type OryonBreakMode = z.infer<typeof oryonBreakModeSchema>;

/** Whitelist of opening-range durations (validated config, §7.3). */
export const oryonOpeningRangeDurationSchema = z.union([
  z.literal(15),
  z.literal(30),
  z.literal(60),
  z.literal(120),
]);

/**
 * One panel's analysis configuration. Values are WHITELISTED (enums,
 * bounded ints, literal unions) so a persisted record can never carry an
 * invalid calculation parameter — the calculation engines never see
 * unvalidated numbers.
 */
export const oryonPanelAnalysisSchema = z.object({
  structure: z.object({
    /** Master switch — off renders nothing (default: charts stay clean). */
    enabled: z.boolean(),
    showSwingHighs: z.boolean(),
    showSwingLows: z.boolean(),
    /** HH/LH/HL/LL labels, independent from the pivot markers (§4.3). */
    showLabels: z.boolean(),
    /** Provisional (right-window-incomplete) candidates, opt-in (§4.2). */
    showProvisional: z.boolean(),
    leftBars: z.number().int().min(1).max(10),
    rightBars: z.number().int().min(1).max(10),
    /** Optional minimum swing distance in pips (null = disabled, §4.1). */
    minDistancePips: z.number().int().min(1).max(10_000).nullable(),
    /** Optional minimum bar separation between same-kind pivots (§4.1). */
    minSeparationBars: z.number().int().min(1).max(200).nullable(),
    /** BOS/CHoCH annotations — implemented with tested semantics (§4.4). */
    breaksEnabled: z.boolean(),
    breakMode: oryonBreakModeSchema,
  }),
  levels: z.object({
    prevDayHighLow: z.boolean(),
    /** Previous-day open/close lines (secondary reference, off default). */
    prevDayOpenClose: z.boolean(),
    prevWeekHighLow: z.boolean(),
    prevWeekOpenClose: z.boolean(),
    /** Session opening range (requires a session-scoped asset class, §5.3). */
    openingRange: z.boolean(),
    /** Session whose OPEN defines the range — ID of the code constants. */
    orSessionId: z.enum(["sydney", "tokyo", "london", "newyork"]),
    orDurationMinutes: oryonOpeningRangeDurationSchema,
    /** Show a still-forming range (developing) at all (§5.3). */
    orShowDeveloping: z.boolean(),
  }),
});

export type OryonPanelAnalysis = z.infer<typeof oryonPanelAnalysisSchema>;

/**
 * Defaults for a NEW panel and the deterministic v3→v4 migration: every
 * analysis overlay is OFF — restoring an older layout must not suddenly
 * decorate charts the user configured before this phase existed (§6.3
 * "sensible visibility defaults" + §9.2 backward compatibility).
 */
export const ORYON_DEFAULT_PANEL_ANALYSIS: OryonPanelAnalysis = {
  structure: {
    enabled: false,
    showSwingHighs: true,
    showSwingLows: true,
    showLabels: true,
    showProvisional: false,
    leftBars: 3,
    rightBars: 3,
    minDistancePips: null,
    minSeparationBars: null,
    breaksEnabled: false,
    breakMode: "close",
  },
  levels: {
    prevDayHighLow: false,
    prevDayOpenClose: false,
    prevWeekHighLow: false,
    prevWeekOpenClose: false,
    openingRange: false,
    orSessionId: "newyork",
    orDurationMinutes: 60,
    orShowDeveloping: true,
  },
};

/** Chart panel v4 — the v3 configuration plus the analysis preferences. */
export const oryonChartPanelV4Schema = oryonChartPanelV3Schema.extend({
  analysis: oryonPanelAnalysisSchema,
});

export type OryonChartPanelV4 = z.infer<typeof oryonChartPanelV4Schema>;

/** Workspace layout v4 — the v3 arrangement with per-panel analysis. */
export const oryonWorkspaceLayoutV4Schema = oryonWorkspaceLayoutV2Schema.extend({
  panels: z.array(oryonChartPanelV4Schema).min(1).max(ORYON_MAX_PANELS),
});

export type OryonWorkspaceLayoutV4 = z.infer<typeof oryonWorkspaceLayoutV4Schema>;

/** Versioned persistence envelope v4 (Phase 9) — ONE browser-local file.
 *  Loaders accept v1/v2/v3 and migrate deterministically; saves write v4. */
export const oryonLayoutsFileV4Schema = z.object({
  version: z.literal(4),
  savedAt: z.number().finite().int(),
  layouts: z.array(oryonWorkspaceLayoutV4Schema).max(20),
  activeLayoutId: z.string().min(8).max(64).nullable(),
});

export type OryonLayoutsFileV4 = z.infer<typeof oryonLayoutsFileV4Schema>;
