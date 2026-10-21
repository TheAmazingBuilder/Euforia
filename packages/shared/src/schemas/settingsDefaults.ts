import type {
  AcademySettings,
  AppearanceSettings,
  AccountSettings,
  JournalSettings,
  LocalizationSettings,
  NotificationPrefs,
  PrivacySettings,
  RiskPreferences,
  TradingPreferences,
} from "./settings";

/**
 * Safe defaults for every settings domain (MASTER PROMPT §15). Shared by the
 * mock backend (bundle construction, reset-to-default §17) so the client and
 * the server can never disagree on what "default" means.
 *
 * Risk defaults mirror the legacy fixture values (riskPerTradePct "0.5",
 * maxDailyLossPct "2", maxTradesPerDay 4) so existing surfaces keep their
 * behavior until the operator changes something.
 */
export const SETTINGS_DEFAULTS: {
  trading: TradingPreferences;
  risk: RiskPreferences;
  journal: JournalSettings;
  notifications: NotificationPrefs;
  appearance: AppearanceSettings;
  privacy: PrivacySettings;
  localization: LocalizationSettings;
  academy: AcademySettings;
  account: AccountSettings;
} = {
  trading: {
    defaultAccountId: null,
    defaultMarket: "FOREX",
    defaultSymbol: "EURUSD",
    defaultTimeframe: "M15",
    defaultSession: "LONDON",
    defaultDirection: "BUY",
    defaultRRDisplay: "R_MULTIPLE",
    defaultChartType: "CANDLESTICK",
  },

  risk: {
    riskPerTradePct: "0.5",
    maxRiskPerTradePct: "1",
    maxDailyLossPct: "2",
    maxWeeklyLossPct: "6",
    maxMonthlyLossPct: "10",
    maxTradesPerDay: 4,
    maxOpenPositions: 3,
    maxCorrelatedExposurePct: "10",
    maxAccountExposurePct: "25",
    positionSizingMethod: "PERCENTAGE_RISK",
  },

  journal: {
    requiredFields: [],
    requireScreenshots: false,
    requirePreTradeNotes: false,
    requirePostTradeReview: false,
    trackEmotions: true,
    trackConfidence: true,
    trackStress: false,
    autoSave: true,
    defaultTemplate: "FREE",
    reviewReminders: false,
    reminderTime: "21:00",
  },

  notifications: {
    trading: {
      tradeOpened: { inApp: true, email: false },
      tradeClosed: { inApp: true, email: false },
      positionUpdate: { inApp: true, email: false },
    },
    risk: {
      riskLimit: { inApp: true, email: false },
      dailyLossLimit: { inApp: true, email: true },
      drawdownThreshold: { inApp: true, email: true },
      exposureThreshold: { inApp: true, email: false },
    },
    strategy: {
      strategyViolation: { inApp: true, email: false },
      checklistIncomplete: { inApp: true, email: false },
      ruleViolation: { inApp: true, email: true },
    },
    economic: {
      highImpactEvent: { inApp: true, email: false },
      eventApproaching: { inApp: true, email: false },
      eventReleased: { inApp: true, email: false },
    },
    system: {
      brokerDisconnected: { inApp: true, email: true },
      marketDataStale: { inApp: true, email: false },
      integrationFailure: { inApp: true, email: true },
    },
    reports: {
      dailyReport: { inApp: false, email: true },
      weeklyReport: { inApp: false, email: true },
      monthlyReport: { inApp: false, email: true },
    },
  },

  appearance: {
    density: "COMFORTABLE",
    pnlDisplay: "CURRENCY",
    showCents: true,
  },

  privacy: {
    analyticsEnabled: true,
    shareAnonymousStats: false,
    profileVisibility: "COMMUNITY",
    showOnLeaderboard: true,
  },

  localization: {
    language: "fr",
    dateFormat: "DD/MM/YYYY",
    timeFormat: "H24",
    decimalSeparator: "COMMA",
    currencyDisplay: "CODE",
  },

  academy: {
    preferredLevel: "ALL",
    showProgress: true,
    dailyReminder: false,
    reminderTime: "09:00",
    learningNotifications: true,
  },

  account: {
    status: "ACTIVE",
  },
};
