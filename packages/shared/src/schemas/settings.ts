import { z } from "zod";
import {
  assetClassSchema,
  currencySchema,
  directionSchema,
} from "../enums";
import { dateKeySchema, decimalStringSchema, isoDateTimeSchema, uuidSchema } from "./primitives";
import { analyticsPeriodSchema } from "./api";

/**
 * Structured user preferences — the Settings module contract.
 *
 * Architecture (MASTER PROMPT §Architecture): User → Preferences →
 * domain-specific settings. One JSON document per user, edited ONE DOMAIN
 * AT A TIME (PATCH /me/preferences/:domain) so unrelated settings are never
 * saved together. Every domain has a strict zod schema with safe defaults
 * (DEFAULT_USER_PREFERENCES) — the server validates before merging and the
 * client hydrates from the same source of truth.
 *
 * Boundary rules:
 * - Auth, passwords and broker credentials NEVER live here (Security /
 *   Integrations own them).
 * - System health / service status NEVER lives here (Monitoring owns it).
 * - The user's timezone has ONE source of truth: Profile (PATCH /me) —
 *   the Localization domain mirrors it in the UI but writes through /me,
 *   because the trading-day key is computed server-side from it.
 * - Risk preferences are DEFAULTS for the Rules Engine (docs/specs/
 *   data-model.md): they seed/patch rule params, they don't enforce
 *   anything by themselves.
 */

// ── Shared primitives ────────────────────────────────────────────────────────

/** Valid IANA timezone identifier — validated against Intl at runtime. */
export const ianaTimezoneSchema = z.string().min(1).superRefine((value, ctx) => {
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: value });
  } catch {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: "Unknown IANA timezone identifier",
    });
  }
});

export type IanaTimezone = z.infer<typeof ianaTimezoneSchema>;

/** Percent config value (e.g. 1.5 = 1.5%) — plain number like rule params. */
const percentConfigSchema = z.number().min(0).max(100);

/** Per-event channel matrix — the three delivery channels Cosmoz supports. */
export const notificationChannelsSchema = z.object({
  inApp: z.boolean(),
  email: z.boolean(),
  push: z.boolean(),
});

export type NotificationChannels = z.infer<typeof notificationChannelsSchema>;

// ── Trading preferences ──────────────────────────────────────────────────────

export const timeframeSchema = z.enum(["M1", "M5", "M15", "M30", "H1", "H4", "D1", "W1"]);
export type Timeframe = z.infer<typeof timeframeSchema>;

/** Renamed from tradingSessionSchema — the Session Live module owns the
 * "Trading Session" entity name (schemas/sessionLive.ts). */
export const marketSessionSchema = z.enum(["ASIA", "LONDON", "NEW_YORK", "LONDON_NY_OVERLAP"]);
export type MarketSession = z.infer<typeof marketSessionSchema>;

export const positionTypeSchema = z.enum(["MARKET", "LIMIT", "STOP"]);
export type PositionType = z.infer<typeof positionTypeSchema>;

/** How planned R:R is rendered across the app ("1:2" vs "+100 %"). */
export const rrDisplaySchema = z.enum(["RATIO", "PERCENT"]);
export type RrDisplay = z.infer<typeof rrDisplaySchema>;

export const chartStyleSchema = z.enum(["CANDLES", "LINE", "AREA"]);
export type ChartStyle = z.infer<typeof chartStyleSchema>;

export const tradingPreferencesSchema = z.object({
  defaultAccountId: uuidSchema.nullable(),
  defaultAssetClass: assetClassSchema.nullable(),
  defaultInstrumentId: uuidSchema.nullable(),
  defaultTimeframe: timeframeSchema.nullable(),
  defaultSession: marketSessionSchema.nullable(),
  /** Currency used for P&L display when a trade is in another currency. */
  displayCurrency: currencySchema,
  defaultDirection: directionSchema.nullable(),
  defaultPositionType: positionTypeSchema.nullable(),
  rrDisplay: rrDisplaySchema,
  chart: z.object({
    style: chartStyleSchema,
    showVolume: z.boolean(),
    showGrid: z.boolean(),
  }),
  /**
   * Session Live duration cap in minutes (15–600) — when the session timer
   * runs past it, Cosmoz raises a « max duration » alert. null = no cap.
   */
  sessionMaxDurationMin: z.number().int().min(15).max(600).nullable(),
  /**
   * Guardrail — soft-lock the capture form after N rule violations TODAY.
   * The lock is a deliberate two-step acknowledgment, never a hard block.
   * null = guardrail off.
   */
  softLockAfterViolations: z.number().int().min(1).max(20).nullable(),
});

export type TradingPreferences = z.infer<typeof tradingPreferencesSchema>;

export const tradingPreferencesInputSchema = tradingPreferencesSchema;
export type TradingPreferencesInput = z.infer<typeof tradingPreferencesInputSchema>;

// ── Risk preferences (defaults that feed the Rules Engine) ──────────────────

export const positionSizingMethodSchema = z.enum([
  "FIXED_AMOUNT",
  "PERCENT_RISK",
  "R_BASED",
  "MANUAL",
]);
export type PositionSizingMethod = z.infer<typeof positionSizingMethodSchema>;

export const riskPreferencesSchema = z
  .object({
    /** Comfort default proposed by the trade form / position sizer. */
    defaultRiskPerTradePct: percentConfigSchema,
    /** Hard ceiling — the Rules Engine seeds MAX_RISK_PCT_PER_TRADE with it. */
    maxRiskPerTradePct: percentConfigSchema,
    dailyLossLimitPct: percentConfigSchema,
    weeklyLossLimitPct: percentConfigSchema,
    monthlyLossLimitPct: percentConfigSchema,
    maxOpenPositions: z.number().int().min(1).max(50),
    /** Correlated-exposure cap, percent of account (same asset class/direction). */
    maxCorrelatedExposurePct: percentConfigSchema,
    /** Total account exposure cap, percent of account. */
    maxAccountExposurePct: percentConfigSchema,
    sizingMethod: positionSizingMethodSchema,
    /** Fixed-currency risk amount — required when sizingMethod = FIXED_AMOUNT. */
    fixedRiskAmount: decimalStringSchema.nullable(),
    /** Whether new rule defaults propagate to the Rules Engine on save. */
    syncWithRulesEngine: z.boolean(),
  })
  .refine(
    (value) => value.maxRiskPerTradePct >= value.defaultRiskPerTradePct,
    {
      message: "Max risk per trade must be ≥ default risk per trade",
      path: ["maxRiskPerTradePct"],
    },
  );

export type RiskPreferences = z.infer<typeof riskPreferencesSchema>;
export const riskPreferencesInputSchema = riskPreferencesSchema;
export type RiskPreferencesInput = z.infer<typeof riskPreferencesInputSchema>;

// ── Journal preferences ──────────────────────────────────────────────────────

export const journalRequiredFieldSchema = z.enum([
  "STRATEGY",
  "STOP_LOSS",
  "TAKE_PROFIT",
  "PLANNED_RR",
  "TAGS",
  "SCREENSHOT",
]);
export type JournalRequiredField = z.infer<typeof journalRequiredFieldSchema>;

export const journalTemplateSchema = z.enum(["MINIMAL", "STANDARD", "DEEP_REVIEW"]);
export type JournalTemplate = z.infer<typeof journalTemplateSchema>;

export const reminderFrequencySchema = z.enum(["OFF", "DAILY", "WEEKLY"]);
export type ReminderFrequency = z.infer<typeof reminderFrequencySchema>;

export const journalPreferencesSchema = z.object({
  requiredFields: z.array(journalRequiredFieldSchema).max(6),
  requireScreenshot: z.boolean(),
  requirePreTradeJournal: z.boolean(),
  requirePostTradeReview: z.boolean(),
  trackEmotions: z.boolean(),
  trackConfidence: z.boolean(),
  trackStress: z.boolean(),
  autoSaveDrafts: z.boolean(),
  defaultTemplate: journalTemplateSchema,
  reviewReminders: reminderFrequencySchema,
});

export type JournalPreferences = z.infer<typeof journalPreferencesSchema>;
export const journalPreferencesInputSchema = journalPreferencesSchema;
export type JournalPreferencesInput = z.infer<typeof journalPreferencesInputSchema>;

// ── Notification preferences (7 categories × events × channels) ─────────────

export const notificationCategoryKeySchema = z.enum([
  "TRADING",
  "RISK",
  "STRATEGY",
  "GOALS",
  "ECONOMIC",
  "SYSTEM",
  "REPORTS",
]);
export type NotificationCategoryKey = z.infer<typeof notificationCategoryKeySchema>;

const tradingEventsSchema = z.object({
  TRADE_OPENED: notificationChannelsSchema,
  TRADE_CLOSED: notificationChannelsSchema,
  POSITION_UPDATED: notificationChannelsSchema,
});

const riskEventsSchema = z.object({
  RISK_LIMIT_BREACH: notificationChannelsSchema,
  DAILY_LOSS_LIMIT: notificationChannelsSchema,
  DRAWDOWN_THRESHOLD: notificationChannelsSchema,
  EXPOSURE_THRESHOLD: notificationChannelsSchema,
});

const strategyEventsSchema = z.object({
  STRATEGY_VIOLATION: notificationChannelsSchema,
  CHECKLIST_INCOMPLETE: notificationChannelsSchema,
  RULE_VIOLATION: notificationChannelsSchema,
});

/** Goals → notification bridge: pacing alerts, recoveries, achievements. */
const goalsEventsSchema = z.object({
  GOAL_AT_RISK: notificationChannelsSchema,
  GOAL_RECOVERED: notificationChannelsSchema,
  GOAL_ACHIEVED: notificationChannelsSchema,
});

const economicEventsSchema = z.object({
  HIGH_IMPACT_EVENT: notificationChannelsSchema,
  EVENT_APPROACHING: notificationChannelsSchema,
  EVENT_RELEASED: notificationChannelsSchema,
});

const systemEventsSchema = z.object({
  BROKER_DISCONNECTED: notificationChannelsSchema,
  MARKET_DATA_STALE: notificationChannelsSchema,
  INTEGRATION_FAILURE: notificationChannelsSchema,
});

const reportsEventsSchema = z.object({
  DAILY_SUMMARY: notificationChannelsSchema,
  WEEKLY_SUMMARY: notificationChannelsSchema,
  MONTHLY_SUMMARY: notificationChannelsSchema,
});

export const notificationPreferencesSchema = z.object({
  trading: z.object({ enabled: z.boolean(), events: tradingEventsSchema }),
  risk: z.object({ enabled: z.boolean(), events: riskEventsSchema }),
  strategy: z.object({ enabled: z.boolean(), events: strategyEventsSchema }),
  goals: z.object({ enabled: z.boolean(), events: goalsEventsSchema }),
  economic: z.object({ enabled: z.boolean(), events: economicEventsSchema }),
  system: z.object({ enabled: z.boolean(), events: systemEventsSchema }),
  reports: z.object({ enabled: z.boolean(), events: reportsEventsSchema }),
  /**
   * Quiet hours (module upgrade) — OUT-OF-BAND channels only (push/email).
   * In-app is never silenced: the inbox is the system of record. "HH:MM"
   * 24h keys; a window crossing midnight is supported by the engine.
   */
  quietHours: z.object({
    enabled: z.boolean(),
    /** Inclusive start, "HH:MM" in the user's timezone. */
    from: z.string().regex(/^\d{2}:\d{2}$/, "HH:MM"),
    /** Exclusive end, "HH:MM". */
    to: z.string().regex(/^\d{2}:\d{2}$/, "HH:MM"),
    /** Which channels are muted inside the window. */
    channels: z.object({ push: z.boolean(), email: z.boolean() }),
  }),
});

export type NotificationPreferences = z.infer<typeof notificationPreferencesSchema>;
export const notificationPreferencesInputSchema = notificationPreferencesSchema;
export type NotificationPreferencesInput = z.infer<typeof notificationPreferencesInputSchema>;

// ── Appearance preferences ───────────────────────────────────────────────────

/**
 * Theme is stored SCREAMING_SNAKE (API convention) and mapped to the
 * next-themes keys ("dark-blue" | "dark" | "light" | "system") in the
 * client. SYSTEM follows the OS preference (next-themes resolvedTheme).
 * The runtime source of truth stays next-themes; this mirror enables
 * multi-device sync when the real API ships.
 */
export const appearanceThemeSchema = z.enum(["DARK_BLUE", "DARK", "LIGHT", "SYSTEM"]);
export type AppearanceTheme = z.infer<typeof appearanceThemeSchema>;

export const densitySchema = z.enum(["COMFORTABLE", "COMPACT"]);
export type Density = z.infer<typeof densitySchema>;

export const dashboardLayoutSchema = z.enum(["COACH_FIRST", "RISK_FIRST", "PERFORMANCE_FIRST"]);
export type DashboardLayout = z.infer<typeof dashboardLayoutSchema>;

/** How P&L numbers are rendered across dashboards and tables. */
export const pnlDisplaySchema = z.enum(["CURRENCY", "R_MULTIPLE", "PERCENT"]);
export type PnlDisplay = z.infer<typeof pnlDisplaySchema>;

export const appearancePreferencesSchema = z.object({
  theme: appearanceThemeSchema,
  density: densitySchema,
  defaultDashboardLayout: dashboardLayoutSchema,
  pnlDisplay: pnlDisplaySchema,
});

export type AppearancePreferences = z.infer<typeof appearancePreferencesSchema>;
export const appearancePreferencesInputSchema = appearancePreferencesSchema;
export type AppearancePreferencesInput = z.infer<typeof appearancePreferencesInputSchema>;

// ── Dashboard preferences (customizable widget workspace) ───────────────────

/**
 * Dashboard widget types. Keys map 1:1 to the widget registry in the web
 * app; every customization document references these canonical keys only.
 * Phase 02 adds the performance-analytics widgets (metrics card, strategy
 * comparison, long-vs-short, activity heatmap) — all fed by the EXISTING
 * server analytics-suite aggregates (the client never re-derives metrics).
 */
export const DASHBOARD_WIDGET_KEYS = [
  "PNL_BAND",
  "EQUITY_ROW",
  "GOALS_PACE",
  "WEEK_COMPARE",
  "HEATMAP",
  "BEST_WORST",
  "ALERTS",
  "METRICS_CARD",
  "STRATEGY_COMPARE",
  "LONG_SHORT",
  "ACTIVITY_HEATMAP",
  // Phase 05 — performance insights, pattern analysis & trading behavior
  // (opt-in through the widget library — the default arrangement never
  // grows under existing dashboards).
  "PERFORMANCE_BREAKDOWN",
  "BEHAVIORAL_INSIGHTS",
  "LOSS_STREAKS",
  "PERFORMANCE_TREND",
] as const;
export type DashboardWidgetKey = (typeof DASHBOARD_WIDGET_KEYS)[number];

export const dashboardWidgetKeySchema = z.enum(DASHBOARD_WIDGET_KEYS);

// ── Per-widget instance configuration (Phase 02) ───────────────────────────

/** Config document version — bump on breaking shape changes; readers
 * migrate or fall back per widget instance instead of crashing. */
export const WIDGET_CONFIG_VERSION = 1;
export const dashboardWidgetConfigVersionSchema = z.literal(WIDGET_CONFIG_VERSION);

/** Ranges the P&L charts already support (period chips contract). */
export const dashboardPnlRangeSchema = z.union([
  z.literal(7),
  z.literal(30),
  z.literal(90),
]);

/**
 * PNL_BAND — the twin P&L charts. Every field drives REAL rendering:
 * range = period window, cumulativeType = the left chart's ECharts series
 * shape, the toggles = end marker / average mark line / zero baseline.
 */
export const pnlBandWidgetConfigSchema = z.object({
  kind: z.literal("PNL_BAND"),
  v: dashboardWidgetConfigVersionSchema,
  range: dashboardPnlRangeSchema,
  cumulativeType: z.enum(["AREA", "LINE", "BAR"]),
  showAvgLine: z.boolean(),
  showEndMarker: z.boolean(),
  showZeroLine: z.boolean(),
});

/** HEATMAP — the monthly calendar. Toggling cell text off declutters small
 * spans; the tint scale itself is fixed by the design system. */
export const heatmapWidgetConfigSchema = z.object({
  kind: z.literal("HEATMAP"),
  v: dashboardWidgetConfigVersionSchema,
  showCellValues: z.boolean(),
});

/**
 * Period presets the METRICS_CARD may aggregate over. CUSTOM requires the
 * date keys below (inclusive, trading-day keys resolved server-side).
 * Comparisons vs the previous equivalent period are available only for the
 * presets the SERVER resolves natively (TODAY/THIS_WEEK/THIS_MONTH — see
 * PREVIOUS_PERIOD mapping in the web layer); other presets render an
 * explicit "comparison unavailable" state instead of a fake baseline.
 */
export const metricsCardPeriodSchema = z.enum([
  "TODAY",
  "YESTERDAY",
  "THIS_WEEK",
  "LAST_WEEK",
  "THIS_MONTH",
  "LAST_MONTH",
  "THIS_QUARTER",
  "THIS_YEAR",
  "LAST_30",
  "LAST_90",
  "YTD",
  "ALL",
  "CUSTOM",
]);

/** METRICS_CARD — configurable performance metric cards (KPI selection,
 * period, optional previous-period comparison, presentation formatting).
 * The CUSTOM-period date requirement is enforced at the ITEM level (see
 * dashboardWidgetItemSchema) — discriminated-union members must stay plain
 * objects in zod v3. */
export const metricsCardWidgetConfigSchema = z.object({
  kind: z.literal("METRICS_CARD"),
  v: dashboardWidgetConfigVersionSchema,
  period: metricsCardPeriodSchema,
  /** Required when period = CUSTOM (trading-date keys, inclusive). */
  customFrom: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  customTo: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  /** Selected metric ids from the shared metric catalog (order = display
   * order), 1–12 entries, unique. Unknown ids fail validation. */
  metrics: z.array(z.string().min(1).max(40)).min(1).max(12),
  /** OFF hides comparisons; PREVIOUS shows the previous equivalent period
   * when the server can resolve one (presets mapped in the web layer). */
  comparison: z.enum(["OFF", "PREVIOUS"]),
  /** Money presentation — full or compact notation. */
  notation: z.enum(["STANDARD", "COMPACT"]),
  /** Decimal digits for numbers/percents (money follows currency rules). */
  decimals: z.union([z.literal(0), z.literal(1), z.literal(2)]),
});

/** STRATEGY_COMPARE — which playbook strategies (or the out-of-playbook
 * population "none") to compare side by side, 1–6 entries, unique. */
export const strategyCompareWidgetConfigSchema = z.object({
  kind: z.literal("STRATEGY_COMPARE"),
  v: dashboardWidgetConfigVersionSchema,
  strategyIds: z.array(z.union([uuidSchema, z.literal("none")])).min(1).max(6),
});

/** LONG_SHORT — metric visibility over the server's BUY/SELL rows. */
export const longShortWidgetConfigSchema = z.object({
  kind: z.literal("LONG_SHORT"),
  v: dashboardWidgetConfigVersionSchema,
  metrics: z
    .array(z.enum(["TRADES", "NET_PNL", "WIN_RATE", "PROFIT_FACTOR", "EXPECTANCY_R", "AVG_DURATION"]))
    .min(1)
    .max(6),
});

/** ACTIVITY_HEATMAP — weekday × hour-bucket grid, server-computed cells.
 * metric: avgR (signed, profit/loss ink) or trades (volume, accent scale). */
export const activityHeatmapWidgetConfigSchema = z.object({
  kind: z.literal("ACTIVITY_HEATMAP"),
  v: dashboardWidgetConfigVersionSchema,
  metric: z.enum(["AVG_R", "TRADES"]),
});

/** PERFORMANCE_BREAKDOWN — one factual breakdown table (Phase 05 §9A) over
 * the analytics-suite dimension rows. The dimension is the only choice:
 * the rows themselves are server-computed with their sample sizes — the
 * widget never re-derives or ranks. */
export const performanceBreakdownWidgetConfigSchema = z.object({
  kind: z.literal("PERFORMANCE_BREAKDOWN"),
  v: dashboardWidgetConfigVersionSchema,
  dimension: z.enum(["STRATEGY", "INSTRUMENT", "DIRECTION", "WEEKDAY", "HOUR", "DURATION", "ASSET_CLASS"]),
});

/**
 * The per-instance config union — a discriminated union on `kind` so each
 * widget owns its own shape (a chart, a KPI card and a comparison table
 * never share irrelevant fields) and future widgets slot in without
 * redesigning the schema. `kind` must match the item's `type`.
 */
export const dashboardWidgetConfigSchema = z.discriminatedUnion("kind", [
  pnlBandWidgetConfigSchema,
  heatmapWidgetConfigSchema,
  metricsCardWidgetConfigSchema,
  strategyCompareWidgetConfigSchema,
  longShortWidgetConfigSchema,
  activityHeatmapWidgetConfigSchema,
  performanceBreakdownWidgetConfigSchema,
]);

export type DashboardWidgetConfig = z.infer<typeof dashboardWidgetConfigSchema>;
export type PnlBandWidgetConfig = z.infer<typeof pnlBandWidgetConfigSchema>;
export type HeatmapWidgetConfig = z.infer<typeof heatmapWidgetConfigSchema>;
export type MetricsCardWidgetConfig = z.infer<typeof metricsCardWidgetConfigSchema>;
export type StrategyCompareWidgetConfig = z.infer<typeof strategyCompareWidgetConfigSchema>;
export type LongShortWidgetConfig = z.infer<typeof longShortWidgetConfigSchema>;
export type ActivityHeatmapWidgetConfig = z.infer<typeof activityHeatmapWidgetConfigSchema>;
export type PerformanceBreakdownWidgetConfig = z.infer<typeof performanceBreakdownWidgetConfigSchema>;

/**
 * One widget INSTANCE placed on a layout. The instance id is stable and
 * unique WITHIN its layout (never the widget type, never an array index):
 * removing one instance never touches other instances of the same type.
 */
export const dashboardWidgetItemSchema = z
  .object({
    instanceId: z.string().min(1).max(64),
    type: dashboardWidgetKeySchema,
    /** Hidden instances keep their full configuration (hide ≠ remove). */
    visible: z.boolean(),
    /** Width span on the 12-column desktop grid (mobile is single-column). */
    w: z.number().int().min(1).max(12),
    /** Height level: 1 = natural content height, higher = taller minimum.
     * Semantics are min-height — content may always grow past the level. */
    h: z.number().int().min(1).max(4),
    /** Per-instance presentation config (Phase 02) — OPTIONAL and additive:
     * documents stored before it keep validating unchanged (schemaVersion
     * stays 1). Absent config = the widget's defaults; a config whose kind
     * does not match the item type is invalid and dropped on read. */
    config: dashboardWidgetConfigSchema.optional(),
  })
  .superRefine((item, ctx) => {
    if (item.config && item.config.kind !== item.type) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["config"],
        message: `Config kind "${item.config.kind}" does not match widget type "${item.type}"`,
      });
    }
    if (
      item.config &&
      item.config.kind === "METRICS_CARD" &&
      item.config.period === "CUSTOM" &&
      (item.config.customFrom === undefined ||
        item.config.customTo === undefined ||
        item.config.customFrom > item.config.customTo)
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["config"],
        message: "CUSTOM period requires customFrom and customTo (from ≤ to)",
      });
    }
  });
export type DashboardWidgetItem = z.infer<typeof dashboardWidgetItemSchema>;

/**
 * One saved dashboard workspace. Display order = array order; hidden
 * widgets keep their slot configuration so showing them again restores
 * their place. Layout ids are stable strings (never array indexes).
 */
export const dashboardLayoutDocumentSchema = z.object({
  id: z.string().min(1).max(64),
  name: z.string().min(1).max(60),
  description: z.string().max(200).optional(),
  /** Bump on breaking widget-config shape changes; clients migrate or fall
   * back per layout instead of discarding the whole collection. */
  schemaVersion: z.literal(1),
  widgets: z.array(dashboardWidgetItemSchema).max(30),
  createdAt: isoDateTimeSchema.optional(),
  updatedAt: isoDateTimeSchema.optional(),
  /** Present when the layout was created from a template preset. */
  templateId: z.string().max(40).optional(),
});
export type DashboardLayoutDocument = z.infer<typeof dashboardLayoutDocumentSchema>;

/**
 * The dashboard domain carries BOTH the legacy flat order and the layout
 * collection:
 *  - `widgetOrder` stays REQUIRED and client-derived from the active
 *    layout, so pre-customization documents, older backups and the
 *    §19 order-bound contract keep validating unchanged;
 *  - `layouts` + `activeLayoutId` are OPTIONAL: documents stored before
 *    the customization phase carry `widgetOrder` only, and readers
 *    synthesize the default collection from it (never a hard failure).
 */
/**
 * Phase 03 — the authoritative global dashboard filter model.
 *
 * A deliberately SMALL, single-value-per-dimension subset of the analytics
 * suite contract (the existing application convention — the Analytics
 * FilterBar and the `analyticsFiltersSchema` suite query are single-select):
 * absent field = the dimension imposes no restriction. Multi-value OR
 * semantics are NOT offered in v1 — the suite API is scalar per dimension
 * and inventing array params here would fake a capability the authoritative
 * calculation layer does not provide.
 *
 * Dimensions intentionally EXCLUDED from the dashboard bar:
 *  - `emotion` / `tagId` (honest no-op seams in the suite engine — always
 *    filter to empty),
 *  - trade status (the suite aggregates CLOSED trades only — an open/
 *    planned/cancelled filter would be a lie; documented limitation),
 *  - assetClass/session (kept as widget-level/Analytics-page concerns for
 *    now — addable later without breaking stored views since the schema is
 *    versioned per view).
 */
export const dashboardFiltersSchema = z
  .object({
    /** Named date preset resolved SERVER-SIDE against the user's trading-day
     * clock (never client date math). Default = no date restriction. */
    period: analyticsPeriodSchema.default("ALL"),
    /** Required together when period = CUSTOM (trading-date keys, inclusive). */
    customFrom: dateKeySchema.optional(),
    customTo: dateKeySchema.optional(),
    accountId: uuidSchema.optional(),
    /** Catalog instrument id OR the deterministic v5 group id used by the
     * suite for uncataloged symbols. */
    instrumentId: uuidSchema.optional(),
    /** Strategy uuid, or the literal "none" = out-of-playbook trades. The
     * analytics attribution chain (review → plan → strategy) applies. */
    strategyId: uuidSchema.or(z.literal("none")).optional(),
    direction: directionSchema.optional(),
  })
  .superRefine((filters, ctx) => {
    if (filters.period === "CUSTOM") {
      if (filters.customFrom === undefined || filters.customTo === undefined) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["customFrom"],
          message: "CUSTOM period requires customFrom and customTo",
        });
      } else if (filters.customFrom > filters.customTo) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["customTo"],
          message: "customFrom must be ≤ customTo",
        });
      }
    }
  });
export type DashboardFilters = z.infer<typeof dashboardFiltersSchema>;

/**
 * Phase 03 — one saved analytical view: a NAME + a validated filter context.
 * Strictly separate from layouts (widget arrangement) and per-widget configs
 * (presentation): applying a view never moves widgets, switching layouts
 * never changes filters (spec §11). Store shape mirrors the layout document
 * conventions (stable ids, schemaVersion, timestamps).
 */
export const dashboardSavedViewSchema = z.object({
  id: z.string().min(1).max(64),
  name: z.string().min(1).max(60),
  description: z.string().max(200).optional(),
  schemaVersion: z.literal(1),
  filters: dashboardFiltersSchema,
  createdAt: isoDateTimeSchema.optional(),
  updatedAt: isoDateTimeSchema.optional(),
});
export type DashboardSavedView = z.infer<typeof dashboardSavedViewSchema>;

/**
 * Phase 06 — one USER-CREATED workspace template: a frozen deep copy of one
 * of the user's own layouts, reusable to spawn independent workspaces.
 * Strictly separate from built-in templates (owner-classified in the UI);
 * never shared across users (the domain is per-user JSON, ownership enforced
 * by the preferences PATCH). The embedded layout is validated by the SAME
 * dashboardLayoutDocumentSchema — an unknown widget type inside a template
 * degrades exactly like an unknown type inside a layout (dropped on read).
 */
export const dashboardUserTemplateSchema = z.object({
  id: z.string().min(1).max(64),
  name: z.string().min(1).max(60),
  description: z.string().max(200).optional(),
  schemaVersion: z.literal(1),
  /** Frozen snapshot — applying a template CLONES it (fresh layout id +
   * fresh instance ids); the stored copy is never mutated by use. */
  layout: dashboardLayoutDocumentSchema,
  createdAt: isoDateTimeSchema.optional(),
});
export type DashboardUserTemplate = z.infer<typeof dashboardUserTemplateSchema>;

export const dashboardPreferencesSchema = z.object({
  widgetOrder: z.array(dashboardWidgetKeySchema).max(DASHBOARD_WIDGET_KEYS.length),
  activeLayoutId: z.string().min(1).max(64).optional(),
  layouts: z.array(dashboardLayoutDocumentSchema).max(20).optional(),
  /** Phase 03 — saved analytical views (global dashboard filters). OPTIONAL
   * and additive: documents stored before it keep validating unchanged.
   * Views are filter contexts ONLY — never layouts, never widget configs. */
  savedViews: z.array(dashboardSavedViewSchema).max(30).optional(),
  /** Phase 03 — the last applied ACTIVE filter context (spec §16: filter
   * state survives reload "according to the persistence design"; the design
   * here = the dashboard domain, same mechanism as saved views). Readers
   * normalize it defensively (invalid → default ALL), so a stale or
   * malformed document can never lock the dashboard into a broken filter. */
  activeFilters: dashboardFiltersSchema.optional(),
  /** Phase 06 — the user's default workspace (falls back here when the
   * active layout id no longer resolves). OPTIONAL additive key; null/
   * missing = no explicit default (the first layout wins). */
  defaultLayoutId: z.string().min(1).max(64).optional(),
  /** Phase 06 — user-created templates (frozen layout snapshots). OPTIONAL
   * additive key, capped at 10; each item validated by its own schema so
   * one malformed template never destroys the collection. */
  userTemplates: z.array(dashboardUserTemplateSchema).max(10).optional(),
});

export type DashboardPreferences = z.infer<typeof dashboardPreferencesSchema>;
export const dashboardPreferencesInputSchema = dashboardPreferencesSchema;
export type DashboardPreferencesInput = z.infer<typeof dashboardPreferencesInputSchema>;

/**
 * The SHIPPED default arrangement — the designed ledger layout (Phase 01
 * canonical order). The Phase 02 analytics widgets are OPT-IN through the
 * widget library: they extend the canon without silently growing every
 * user's default view (existing dashboards never change under their feet,
 * and Reset restores exactly this designed arrangement).
 */
export const DEFAULT_LAYOUT_WIDGET_KEYS = [
  "PNL_BAND",
  "EQUITY_ROW",
  "GOALS_PACE",
  "WEEK_COMPARE",
  "HEATMAP",
  "BEST_WORST",
  "ALERTS",
] as const;
export type DefaultLayoutWidgetKey = (typeof DEFAULT_LAYOUT_WIDGET_KEYS)[number];

/** Deterministic instance ids for the shipped default layout. */
const DEFAULT_DASHBOARD_WIDGETS: DashboardWidgetItem[] = DEFAULT_LAYOUT_WIDGET_KEYS.map(
  (type) => ({ instanceId: `win_${type.toLowerCase()}`, type, visible: true, w: 12, h: 1 }),
);

/** The single shipped "Default" layout — canonical order, full width. */
export const DEFAULT_DASHBOARD_LAYOUT: DashboardLayoutDocument = {
  id: "layout_default",
  name: "Default",
  description: "The designed dashboard — every widget, full width.",
  schemaVersion: 1,
  widgets: DEFAULT_DASHBOARD_WIDGETS,
};

// ── Academy preferences (module provisioned — arrives in a later phase) ─────

export const academyDifficultySchema = z.enum(["BEGINNER", "INTERMEDIATE", "ADVANCED"]);
export type AcademyDifficulty = z.infer<typeof academyDifficultySchema>;

export const academyPreferencesSchema = z.object({
  enabled: z.boolean(),
  difficulty: academyDifficultySchema,
  showProgressOnDashboard: z.boolean(),
  autoplayLessons: z.boolean(),
  /** Learning notifications — in-app alerts when new lessons/drills land. */
  newContentNotifications: z.boolean(),
  weeklyReminder: reminderFrequencySchema,
  /** Weekly learning goal in minutes (0–600). */
  weeklyGoalMinutes: z.number().int().min(0).max(600),
});

export type AcademyPreferences = z.infer<typeof academyPreferencesSchema>;
export const academyPreferencesInputSchema = academyPreferencesSchema;
export type AcademyPreferencesInput = z.infer<typeof academyPreferencesInputSchema>;

// ── Privacy preferences ──────────────────────────────────────────────────────

export const profileVisibilitySchema = z.enum(["PRIVATE", "ANONYMOUS", "PUBLIC"]);
export type ProfileVisibility = z.infer<typeof profileVisibilitySchema>;

export const privacyPreferencesSchema = z.object({
  usageAnalytics: z.boolean(),
  crashDiagnostics: z.boolean(),
  shareAnonymousStats: z.boolean(),
  productEmails: z.boolean(),
  profileVisibility: profileVisibilitySchema,
  /** Show the email address on shared/public views (never affects security). */
  showEmailOnProfile: z.boolean(),
});

export type PrivacyPreferences = z.infer<typeof privacyPreferencesSchema>;
export const privacyPreferencesInputSchema = privacyPreferencesSchema;
export type PrivacyPreferencesInput = z.infer<typeof privacyPreferencesInputSchema>;

// ── Localization preferences ────────────────────────────────────────────────

// English-only application: the field stays part of the stored document
// (older backups carry it) but accepts a single value.
export const languageSchema = z.literal("en");
export type Language = z.infer<typeof languageSchema>;

export const dateFormatSchema = z.enum(["ISO", "EU", "US", "LONG"]);
export type DateFormat = z.infer<typeof dateFormatSchema>;

export const timeFormatSchema = z.enum(["H24", "H12"]);
export type TimeFormat = z.infer<typeof timeFormatSchema>;

export const decimalSeparatorSchema = z.enum(["LOCALE", "COMMA", "DOT"]);
export type DecimalSeparator = z.infer<typeof decimalSeparatorSchema>;

/**
 * Digit-grouping style for numbers (§12): LOCALE follows the language,
 * SPACE renders 1 234.50, COMMA renders 1,234.50, NONE renders 1234.50.
 */
export const numberFormatSchema = z.enum(["LOCALE", "SPACE", "COMMA", "NONE"]);
export type NumberFormat = z.infer<typeof numberFormatSchema>;

export const currencyDisplaySchema = z.enum(["CODE", "SYMBOL"]);
export type CurrencyDisplay = z.infer<typeof currencyDisplaySchema>;

export const weekStartSchema = z.enum(["MONDAY", "SUNDAY"]);
export type WeekStart = z.infer<typeof weekStartSchema>;

export const localizationPreferencesSchema = z.object({
  language: languageSchema,
  /**
   * MIRROR of Profile.timezone (single source of truth: PATCH /me — the
   * server computes trading-day keys from it). The settings UI writes this
   * field through the profile endpoint, never directly here.
   */
  timezone: ianaTimezoneSchema,
  dateFormat: dateFormatSchema,
  timeFormat: timeFormatSchema,
  decimalSeparator: decimalSeparatorSchema,
  numberFormat: numberFormatSchema,
  currencyDisplay: currencyDisplaySchema,
  weekStart: weekStartSchema,
});

export type LocalizationPreferences = z.infer<typeof localizationPreferencesSchema>;
export const localizationPreferencesInputSchema = localizationPreferencesSchema;
export type LocalizationPreferencesInput = z.infer<typeof localizationPreferencesInputSchema>;

// ── Root document ────────────────────────────────────────────────────────────

export const userPreferencesSchema = z.object({
  userId: uuidSchema,
  trading: tradingPreferencesSchema,
  risk: riskPreferencesSchema,
  journal: journalPreferencesSchema,
  notifications: notificationPreferencesSchema,
  appearance: appearancePreferencesSchema,
  dashboard: dashboardPreferencesSchema,
  academy: academyPreferencesSchema,
  privacy: privacyPreferencesSchema,
  localization: localizationPreferencesSchema,
  updatedAt: isoDateTimeSchema,
});

export type UserPreferences = z.infer<typeof userPreferencesSchema>;

/** Domains that can be PATCHed / reset individually. */
export const preferenceDomainSchema = z.enum([
  "trading",
  "risk",
  "journal",
  "notifications",
  "appearance",
  "dashboard",
  "academy",
  "privacy",
  "localization",
]);
export type PreferenceDomain = z.infer<typeof preferenceDomainSchema>;

export const resetPreferencesInputSchema = z.object({
  domain: preferenceDomainSchema,
});

export type ResetPreferencesInput = z.infer<typeof resetPreferencesInputSchema>;

/** Business error codes for the Settings bounded context (Phase 15 §35). */
export const SETTINGS_ERROR_CODES = {
  /** Referenced default trading account does not exist or belongs to another user. */
  DEFAULT_ACCOUNT_NOT_FOUND: "DEFAULT_ACCOUNT_NOT_FOUND",
} as const;
export type SettingsErrorCode = (typeof SETTINGS_ERROR_CODES)[keyof typeof SETTINGS_ERROR_CODES];

// ── Account actions (dangerous — explicit typed confirmation) ───────────────

export const deactivateAccountInputSchema = z.object({
  confirmation: z.literal("DEACTIVATE"),
});
export type DeactivateAccountInput = z.infer<typeof deactivateAccountInputSchema>;

export const requestAccountDeletionInputSchema = z.object({
  confirmation: z.literal("DELETE"),
});
export type RequestAccountDeletionInput = z.infer<typeof requestAccountDeletionInputSchema>;

export const deactivateAccountResponseSchema = z.object({
  status: z.literal("DEACTIVATED"),
  deactivatedAt: isoDateTimeSchema,
});
export type DeactivateAccountResponse = z.infer<typeof deactivateAccountResponseSchema>;

export const requestAccountDeletionResponseSchema = z.object({
  status: z.literal("SCHEDULED"),
  /** Grace period end — the user can cancel until this moment. */
  scheduledFor: isoDateTimeSchema,
});
export type RequestAccountDeletionResponse = z.infer<typeof requestAccountDeletionResponseSchema>;

// ── Defaults (safe, conservative — MASTER PROMPT §Validation) ───────────────

/** Preference defaults without the server-managed envelope fields. */
export type UserPreferencesDefaults = Omit<UserPreferences, "userId" | "updatedAt">;

/**
 * Safe defaults for every domain — deep-frozen intent, mutable shape (the
 * mock store clones it). Risk values follow the discipline conventions:
 * 1 % comfort default, 2 % hard ceiling, 3 % daily stop.
 */
export const DEFAULT_USER_PREFERENCES: UserPreferencesDefaults = {
  trading: {
    defaultAccountId: null,
    defaultAssetClass: "FOREX",
    defaultInstrumentId: null,
    defaultTimeframe: "M15",
    defaultSession: "LONDON",
    displayCurrency: "USD",
    defaultDirection: null,
    defaultPositionType: "MARKET",
    rrDisplay: "RATIO",
    chart: { style: "CANDLES", showVolume: false, showGrid: true },
    sessionMaxDurationMin: null,
    softLockAfterViolations: null,
  },
  risk: {
    defaultRiskPerTradePct: 1,
    maxRiskPerTradePct: 2,
    dailyLossLimitPct: 3,
    weeklyLossLimitPct: 6,
    monthlyLossLimitPct: 10,
    maxOpenPositions: 3,
    maxCorrelatedExposurePct: 10,
    maxAccountExposurePct: 20,
    sizingMethod: "PERCENT_RISK",
    fixedRiskAmount: null,
    syncWithRulesEngine: true,
  },
  journal: {
    requiredFields: ["STRATEGY", "STOP_LOSS"],
    requireScreenshot: false,
    requirePreTradeJournal: false,
    requirePostTradeReview: true,
    trackEmotions: true,
    trackConfidence: true,
    trackStress: false,
    autoSaveDrafts: true,
    defaultTemplate: "STANDARD",
    reviewReminders: "WEEKLY",
  },
  notifications: {
    trading: {
      enabled: true,
      events: {
        TRADE_OPENED: { inApp: true, email: false, push: true },
        TRADE_CLOSED: { inApp: true, email: false, push: true },
        POSITION_UPDATED: { inApp: true, email: false, push: false },
      },
    },
    risk: {
      enabled: true,
      events: {
        RISK_LIMIT_BREACH: { inApp: true, email: true, push: true },
        DAILY_LOSS_LIMIT: { inApp: true, email: true, push: true },
        DRAWDOWN_THRESHOLD: { inApp: true, email: true, push: false },
        EXPOSURE_THRESHOLD: { inApp: true, email: false, push: false },
      },
    },
    strategy: {
      enabled: true,
      events: {
        STRATEGY_VIOLATION: { inApp: true, email: false, push: true },
        CHECKLIST_INCOMPLETE: { inApp: true, email: false, push: false },
        RULE_VIOLATION: { inApp: true, email: true, push: true },
      },
    },
    economic: {
      enabled: true,
      events: {
        HIGH_IMPACT_EVENT: { inApp: true, email: false, push: true },
        EVENT_APPROACHING: { inApp: true, email: false, push: false },
        EVENT_RELEASED: { inApp: false, email: false, push: false },
      },
    },
    system: {
      enabled: true,
      events: {
        BROKER_DISCONNECTED: { inApp: true, email: true, push: true },
        MARKET_DATA_STALE: { inApp: true, email: false, push: false },
        INTEGRATION_FAILURE: { inApp: true, email: true, push: false },
      },
    },
    goals: {
      enabled: true,
      events: {
        GOAL_AT_RISK: { inApp: true, email: false, push: true },
        GOAL_RECOVERED: { inApp: true, email: false, push: false },
        GOAL_ACHIEVED: { inApp: true, email: false, push: true },
      },
    },
    reports: {
      enabled: false,
      events: {
        DAILY_SUMMARY: { inApp: false, email: true, push: false },
        WEEKLY_SUMMARY: { inApp: false, email: true, push: false },
        MONTHLY_SUMMARY: { inApp: false, email: true, push: false },
      },
    },
    quietHours: {
      enabled: false,
      from: "22:00",
      to: "07:00",
      channels: { push: true, email: true },
    },
  },
  appearance: {
    theme: "DARK_BLUE",
    density: "COMFORTABLE",
    defaultDashboardLayout: "COACH_FIRST",
    pnlDisplay: "CURRENCY",
  },
  dashboard: {
    widgetOrder: [...DEFAULT_LAYOUT_WIDGET_KEYS],
    activeLayoutId: DEFAULT_DASHBOARD_LAYOUT.id,
    layouts: [DEFAULT_DASHBOARD_LAYOUT],
  },
  academy: {
    enabled: true,
    difficulty: "INTERMEDIATE",
    showProgressOnDashboard: true,
    autoplayLessons: false,
    newContentNotifications: true,
    weeklyReminder: "WEEKLY",
    weeklyGoalMinutes: 60,
  },
  privacy: {
    usageAnalytics: true,
    crashDiagnostics: true,
    shareAnonymousStats: false,
    productEmails: false,
    profileVisibility: "PRIVATE",
    showEmailOnProfile: false,
  },
  localization: {
    language: "en",
    timezone: "America/Toronto",
    dateFormat: "ISO",
    timeFormat: "H24",
    decimalSeparator: "LOCALE",
    numberFormat: "LOCALE",
    currencyDisplay: "CODE",
    weekStart: "MONDAY",
  },
};
