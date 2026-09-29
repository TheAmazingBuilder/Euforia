import { z } from "zod";
import {
  assetClassSchema,
  currencySchema,
  directionSchema,
} from "../enums";
import { decimalStringSchema, isoDateTimeSchema, uuidSchema } from "./primitives";

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

export const tradingSessionSchema = z.enum(["ASIA", "LONDON", "NEW_YORK", "LONDON_NY_OVERLAP"]);
export type TradingSession = z.infer<typeof tradingSessionSchema>;

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
  defaultSession: tradingSessionSchema.nullable(),
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

// ── Notification preferences (6 categories × events × channels) ─────────────

export const notificationCategoryKeySchema = z.enum([
  "TRADING",
  "RISK",
  "STRATEGY",
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
  economic: z.object({ enabled: z.boolean(), events: economicEventsSchema }),
  system: z.object({ enabled: z.boolean(), events: systemEventsSchema }),
  reports: z.object({ enabled: z.boolean(), events: reportsEventsSchema }),
});

export type NotificationPreferences = z.infer<typeof notificationPreferencesSchema>;
export const notificationPreferencesInputSchema = notificationPreferencesSchema;
export type NotificationPreferencesInput = z.infer<typeof notificationPreferencesInputSchema>;

// ── Appearance preferences ───────────────────────────────────────────────────

/**
 * Theme is stored SCREAMING_SNAKE (API convention) and mapped to the
 * next-themes keys ("dark-blue" | "dark" | "light") in the client. The
 * runtime source of truth stays next-themes; this mirror enables multi-device
 * sync when the real API ships.
 */
export const appearanceThemeSchema = z.enum(["DARK_BLUE", "DARK", "LIGHT"]);
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

// ── Academy preferences (module provisioned — arrives in a later phase) ─────

export const academyDifficultySchema = z.enum(["BEGINNER", "INTERMEDIATE", "ADVANCED"]);
export type AcademyDifficulty = z.infer<typeof academyDifficultySchema>;

export const academyPreferencesSchema = z.object({
  enabled: z.boolean(),
  difficulty: academyDifficultySchema,
  showProgressOnDashboard: z.boolean(),
  autoplayLessons: z.boolean(),
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

export const languageSchema = z.enum(["fr", "en"]);
export type Language = z.infer<typeof languageSchema>;

export const dateFormatSchema = z.enum(["ISO", "EU", "US", "LONG"]);
export type DateFormat = z.infer<typeof dateFormatSchema>;

export const timeFormatSchema = z.enum(["H24", "H12"]);
export type TimeFormat = z.infer<typeof timeFormatSchema>;

export const decimalSeparatorSchema = z.enum(["LOCALE", "COMMA", "DOT"]);
export type DecimalSeparator = z.infer<typeof decimalSeparatorSchema>;

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
  "academy",
  "privacy",
  "localization",
]);
export type PreferenceDomain = z.infer<typeof preferenceDomainSchema>;

export const resetPreferencesInputSchema = z.object({
  domain: preferenceDomainSchema,
});

export type ResetPreferencesInput = z.infer<typeof resetPreferencesInputSchema>;

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
    reports: {
      enabled: false,
      events: {
        DAILY_SUMMARY: { inApp: false, email: true, push: false },
        WEEKLY_SUMMARY: { inApp: false, email: true, push: false },
        MONTHLY_SUMMARY: { inApp: false, email: true, push: false },
      },
    },
  },
  appearance: {
    theme: "DARK_BLUE",
    density: "COMFORTABLE",
    defaultDashboardLayout: "COACH_FIRST",
    pnlDisplay: "CURRENCY",
  },
  academy: {
    enabled: true,
    difficulty: "INTERMEDIATE",
    showProgressOnDashboard: true,
    autoplayLessons: false,
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
    currencyDisplay: "CODE",
    weekStart: "MONDAY",
  },
};
