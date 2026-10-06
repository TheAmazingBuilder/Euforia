import { SIDEBAR_ITEMS, NAV_SECTIONS, BOTTOM_NAV_ITEMS } from "@/lib/navigation";
import { authCopy } from "@/components/auth/auth-copy";
import { sessionDict } from "@/i18n/dictionaries/en/session";
import { tradesDict } from "@/i18n/dictionaries/en/trades";
import { nofyDict } from "@/i18n/dictionaries/en/nofy";
import { analyticsDict } from "@/i18n/dictionaries/en/analytics";
import { playbookDict } from "@/i18n/dictionaries/en/playbook";
import { academyDict } from "@/i18n/dictionaries/en/academy";
import { recognitionDict } from "@/i18n/dictionaries/en/recognition";

/**
 * EN dictionary — the CANONICAL language pack and the type source for every
 * other locale (`Dictionary = typeof en`). Nav labels are derived from the
 * single source of truth in lib/navigation so the sidebar and the dictionary
 * can never drift.
 *
 * Namespaces:
 *   common   — cross-module strings (actions, shared toasts)
 *   nav      — app shell: sidebar items (keyed by href), section titles,
 *              mobile bottom nav, page-title fallbacks
 *   auth     — the full auth surface (auth-copy.ts, migrated verbatim)
 *   settings — settings shell categories + the Localization card
 *   session  — Session Live module (dictionaries/en/session.ts)
 *   trades   — Trades module (dictionaries/en/trades.ts)
 *   recognition — Import & Recognition module (dictionaries/en/recognition.ts)
 *   nofy     — Nofy module (dictionaries/en/nofy.ts)
 */
const en = {
  common: {
    save: "Save",
    saving: "Saving…",
    reset: "Reset",
    cancel: "Cancel",
    close: "Close",
    retry: "Retry",
    loading: "Loading…",
    sessionExpiredTitle: "Your session has expired",
    sessionExpiredBody: "Please sign in again to continue.",
  },

  nav: {
    items: Object.fromEntries(SIDEBAR_ITEMS.map((item) => [item.href, item.label])) as Record<string, string>,
    sections: Object.fromEntries(NAV_SECTIONS.map((section) => [section.title, section.title])) as Record<string, string>,
    bottom: Object.fromEntries(BOTTOM_NAV_ITEMS.map((item) => [item.href, item.label])) as Record<string, string>,
    app: "Euforia",
    profile: "Profile",
    signIn: "Sign in",
    createAccount: "Create account",
    language: "Language",
    // LanguageSelector (header) — sync status chip + option subtitles.
    languageSaving: "Saving…",
    languageSynced: "Synced to your account",
    languageSyncError: "Couldn't sync — retry from Settings",
    languageLocalOnly: "Saved on this device",
    languageEnSubtitle: "Interface in English",
    languageFrSubtitle: "Interface in French",
  },

  auth: authCopy,

  settings: {
    view: {
      title: "Settings",
      subtitle: "Tune Euforia to how you trade, journal and review — one card at a time.",
      searchPlaceholder: "Search settings — try “risk”, “timezone”, “push”…",
      searchAria: "Search settings",
      categoriesNavAria: "Settings categories",
    },
    categories: {
      profile: { label: "Profile", description: "Avatar, name, handle, bio, timezone" },
      trading: { label: "Trading", description: "Defaults for the trade form and session runner" },
      risk: { label: "Risk", description: "Risk numbers and Rules Engine linkage" },
      journal: { label: "Journal", description: "Required fields, tracking, reminders" },
      notifications: { label: "Notifications", description: "Per event, per channel" },
      appearance: { label: "Appearance", description: "Theme, density, P&L display" },
      academy: { label: "Academy", description: "Learning preferences and reminders" },
      privacy: { label: "Privacy", description: "Analytics, visibility and data ownership" },
      localization: { label: "Localization", description: "Language, formats, timezone" },
      account: { label: "Account", description: "Plan, connected accounts, dangerous actions" },
    } as Record<string, { label: string; description: string }>,

    localization: {
      title: "Localization",
      description: "Language, formats and how numbers present themselves — everywhere in the journal.",
      preview: "Preview",
      previewAria: "Format preview",
      language: "Language",
      timezone: "Timezone",
      timezoneHint: "Saves instantly via your profile — it defines your trading days.",
      dateFormat: "Date format",
      timeFormat: "Time format",
      decimalSeparator: "Decimal separator",
      numberFormat: "Number format",
      currencyDisplay: "Currency display",
      weekStart: "Week starts on",
      optionLanguageDefault: "Language default",
      optionDecimalComma: "Comma — 1 234,50",
      optionDecimalDot: "Dot — 1,234.50",
      optionCurrencyCode: "Code — USD 1,234.50",
      optionCurrencySymbol: "Symbol — $1,234.50",
      optionMonday: "Monday",
      optionSunday: "Sunday",
      toastSaved: "Localization saved",
      toastSaveFailed: "Could not save localization",
      toastTimezoneSaved: "Timezone updated — trading days follow it",
      toastTimezoneFailed: "Could not update timezone",
      toastReset: "Localization reset to defaults",
      resetTitle: "Reset to defaults?",
      resetBody: "Formats return to the safe defaults (your timezone is untouched). This cannot be undone.",
      resetConfirm: "Reset card",
    },

    /**
     * Cross-card strings reused by several settings cards (11-a wave 1).
     */
    shared: {
      name: "Name",
      email: "Email",
      username: "Username",
      timezone: "Timezone",
      off: "Off",
      daily: "Daily",
      weekly: "Weekly",
      exporting: "Exporting…",
      resetTitle: "Reset to defaults?",
      resetConfirm: "Reset card",
      resetBodyGeneric: "Every preference in this card returns to the safe Euforia defaults. This cannot be undone.",
    },

    /** settings-primitives.tsx — save bar, status line, typed-confirm dialog. */
    primitives: {
      unsavedChanges: "Unsaved changes",
      allChangesSaved: "All changes saved",
      typedConfirmPrefix: "Type",
      typedConfirmSuffix: "to confirm",
    },

    profile: {
      title: "Profile",
      description: "Your identity across the journal — avatar, name, handle and the timezone that drives your trading days.",
      toastSaved: "Profile saved",
      toastSaveFailed: "Could not save profile",
      avatarErrorNotImage: "Please choose an image file (PNG or JPG).",
      avatarErrorTooLarge: "Image is too large — pick one under 150 KB.",
      upload: "Upload",
      remove: "Remove",
      avatarFormatHint: "PNG or JPG, under 150 KB.",
      avatarInputAria: "Avatar image",
      usernameHint: "Letters, digits, _ and - (3–30 chars).",
      usernameError: "Username must be 3–30 characters: letters, digits, underscore or dash.",
      bio: "Bio",
      bioPlaceholder: "A few lines about your trading focus…",
      timezoneHint: "Drives your local trading days — when a “day” starts and ends. Shared with the Localization tab.",
    },

    account: {
      title: "Account",
      planBadge: "FREE plan",
      connectedTitle: "Connected trading accounts",
      defaultBadge: "default",
      connectedNote: "Broker connections and credentials are managed in Integrations — never stored in preferences.",
      baseCurrency: "Base currency",
      dataTitle: "Your data",
      dataDescription: "Full JSON snapshot — trades, strategies, tags. Also in Privacy.",
      exportData: "Export data",
      dangerTitle: "Danger zone",
      deactivateTitle: "Deactivate account",
      deactivateDescription: "Pause the journal. Your data is kept; sign back in to reactivate.",
      deactivateButton: "Deactivate…",
      deleteTitle: "Delete account",
      deleteDescription: "Permanent removal after a 14-day grace period. Requires typing DELETE.",
      deleteButton: "Delete…",
      signOut: "Sign out",
      toastDeactivated: "Account deactivated",
      toastDeactivatedDescription: "Your journal is paused — sign back in any time to reactivate it.",
      toastDeactivateFailed: "Could not deactivate the account",
      toastDeletionScheduled: "Deletion scheduled",
      toastDeletionDatePrefix: "Your account will be deleted on",
      toastDeletionDateSuffix: ". Sign back in before then to cancel.",
      toastDeletionFailed: "Could not schedule the deletion",
      deactivateDialogTitle: "Deactivate your account?",
      deactivateDialogDescription:
        "The journal becomes read-only and alerts stop. Nothing is deleted — signing back in reactivates everything.",
      deactivateConfirm: "Deactivate account",
      deleteDialogTitle: "Delete your account?",
      deleteDialogDescription:
        "All trades, journals and analytics will be permanently deleted after a 14-day grace period. This is the point of no return — type DELETE to confirm.",
      deleteConfirm: "Schedule deletion",
    },

    risk: {
      title: "Risk preferences",
      description: "Your risk numbers — defaults for the trade form and the limits the Rules Engine enforces.",
      toastSaved: "Risk preferences saved",
      toastSaveFailed: "Could not save risk preferences",
      toastReset: "Risk preferences reset to defaults",
      maxBelowDefault: "Max risk per trade must be greater than or equal to the default risk per trade.",
      defaultRiskLabel: "Default risk / trade",
      defaultRiskHint: "Pre-filled by the position sizer.",
      maxRiskLabel: "Max risk / trade",
      maxRiskHint: "Hard ceiling — seeds the LOCK rule.",
      dailyLossLabel: "Daily loss limit",
      weeklyLossLabel: "Weekly loss limit",
      monthlyLossLabel: "Monthly loss limit",
      maxOpenPositionsLabel: "Max open positions",
      correlatedLabel: "Max correlated exposure",
      correlatedHint: "Same asset class / direction.",
      exposureLabel: "Max account exposure",
      sizingLabel: "Position sizing method",
      sizingHint: "How the trade form proposes a size.",
      sizingPercentRisk: "Percentage risk",
      sizingFixedAmount: "Fixed amount",
      sizingRBased: "R-based",
      sizingManual: "Manual",
      fixedAmountLabel: "Fixed risk amount",
      fixedAmountHint: "Account currency per trade (e.g. 100.00).",
      syncToggleLabel: "Keep the Rules Engine in sync",
      syncToggleHint: "Enables the one-click apply below; rule severities stay independent.",
      linkageTitle: "Rules Engine linkage",
      applyLimits: "Apply limits",
      applying: "Applying…",
      linkageNote: "Settings → Rules Engine → Monitoring & alerts. Applying upserts the matching discipline rules with your numbers.",
      /** Labels for the RISK_RULE_MAPPINGS rows (de-labeled module map). */
      rules: {
        MAX_RISK_PCT_PER_TRADE: "Max risk per trade",
        MAX_DAILY_LOSS_PCT: "Max daily loss",
        MAX_OPEN_POSITIONS: "Max open positions",
      } as Record<string, string>,
      rulePrefix: "rule:",
      yoursPrefix: "yours:",
      inSync: "in sync",
      toastRulesUpdated: "Rules Engine updated",
      toastRulesUpdatedDescription: "Monitoring, alerts and locks now follow these limits.",
      toastRulesFailed: "Could not update the Rules Engine",
      resetBody: "Every preference in this card returns to the safe Euforia defaults. Rules in the Rules Engine are untouched.",
    },

    appearance: {
      title: "Appearance",
      description: "How Euforia looks and feels — theme, density and how P&L numbers are shown.",
      toastSaved: "Appearance saved",
      toastSaveFailed: "Could not save appearance",
      toastReset: "Appearance reset to defaults",
      themeLabel: "Theme",
      themeDarkBlue: "Dark blue",
      themeDarkBlueHint: "Default night ocean",
      themeDark: "Dark",
      themeDarkHint: "Pure black",
      themeLight: "Light",
      themeLightHint: "Daylight paper",
      themeSystem: "System",
      themeSystemHint: "Follows your OS",
      densityLabel: "Density",
      densityHint: "Compact tightens spacing across cards and the page shell.",
      densityComfortable: "Comfortable",
      densityComfortableHint: "Default rhythm",
      densityCompact: "Compact",
      densityCompactHint: "More on screen",
      layoutLabel: "Dashboard layout",
      layoutHint: "Which block leads the dashboard.",
      layoutCoachFirst: "Coach first",
      layoutRiskFirst: "Risk first",
      layoutPerformanceFirst: "Performance first",
      pnlLabel: "P&L display",
      pnlHint: "Primary figure in dashboards and tables.",
      pnlCurrency: "Currency",
      pnlRMultiple: "R multiple",
      pnlPercent: "Percent",
      tradingNote: "Chart style and overlays live in Trading preferences — one source of truth per setting.",
      resetBody: "Appearance returns to the dark-blue, comfortable default. This cannot be undone.",
    },

    trading: {
      title: "Trading preferences",
      description: "Pre-fills for the trade form and session runner — defaults, never hard limits.",
      toastSaved: "Trading preferences saved",
      toastSaveFailed: "Could not save trading preferences",
      toastReset: "Trading preferences reset to defaults",
      noDefault: "No default",
      defaultAccountLabel: "Default account",
      defaultMarketLabel: "Default market",
      defaultSymbolLabel: "Default symbol",
      timeframeLabel: "Timeframe",
      sessionLabel: "Session",
      /** Session labels for the de-labeled SESSIONS module list. */
      sessions: {
        ASIA: "Asia (00–08 UTC)",
        LONDON: "London (08–13 UTC)",
        LONDON_NY_OVERLAP: "London/NY overlap (13–16 UTC)",
        NEW_YORK: "New York (13–21 UTC)",
      } as Record<string, string>,
      currencyLabel: "Display currency",
      currencyHint: "Converts P&L display when a trade is in another currency.",
      directionLabel: "Default direction",
      positionTypeLabel: "Default position type",
      /** Position-type labels for the de-labeled POSITION_TYPES module list. */
      positionTypes: {
        MARKET: "Market",
        LIMIT: "Limit",
        STOP: "Stop",
      } as Record<string, string>,
      rrLabel: "Planned R:R display",
      rrRatio: "Ratio — 1 : 2",
      rrPercent: "Percent — +100 %",
      chartStyleLabel: "Chart style",
      chartCandles: "Candles",
      chartLine: "Line",
      chartArea: "Area",
      showVolumeLabel: "Show volume",
      showVolumeHint: "Volume bars under the entry chart.",
      showGridLabel: "Show grid",
      showGridHint: "Price/time grid lines on charts.",
      guardrailLabel: "Capture guardrail",
      guardrailHint: "Soft-locks the capture form after N rule violations today — an acknowledgment step, never a hard block.",
      guardrailAfterPrefix: "After",
      violationOne: "violation",
      violationMany: "violations",
      guardrailToday: "today",
    },

    journal: {
      title: "Journal",
      description: "What each entry asks of you — required fields, behavioral tracking and review discipline.",
      toastSaved: "Journal preferences saved",
      toastSaveFailed: "Could not save journal preferences",
      toastReset: "Journal preferences reset to defaults",
      requiredLabel: "Required fields at capture",
      requiredHint: "The trade form blocks saving until these are set.",
      requiredAria: "Required trade fields",
      /** Labels for the de-labeled REQUIRED_FIELDS module list. */
      fields: {
        STRATEGY: "Strategy",
        STOP_LOSS: "Stop loss",
        TAKE_PROFIT: "Take profit",
        PLANNED_RR: "Planned R:R",
        TAGS: "Tags",
      } as Record<string, string>,
      screenshotLabel: "Require chart screenshot",
      screenshotHint: "Ask for a screenshot before the entry can be graded.",
      preTradeLabel: "Require pre-trade journal",
      preTradeHint: "A short plan note is mandatory before opening.",
      postTradeLabel: "Require post-trade review",
      postTradeHint: "Close flows end with the review step (Reflect).",
      emotionsLabel: "Track emotions",
      emotionsHint: "Emotion before/after pickers on capture and close.",
      confidenceLabel: "Track confidence",
      confidenceHint: "1–5 confidence slider on entry.",
      stressLabel: "Track stress & sleep",
      stressHint: "Daily context prompts in the session runner.",
      autoSaveLabel: "Auto-save drafts",
      autoSaveHint: "Unfinished capture forms survive a reload.",
      templateLabel: "Default journal template",
      templateMinimal: "Minimal — note only",
      templateStandard: "Standard — plan + review",
      templateDeep: "Deep review — full checklist",
      remindersLabel: "Review reminders",
    },

    notifications: {
      title: "Notifications",
      description: "Choose exactly what reaches you, and where — per event, per channel.",
      footerNote: "In-app alerts feed the topbar inbox. Email and push activate when the delivery service ships — your choices are stored now.",
      toastSaved: "Notification preferences saved",
      toastSaveFailed: "Could not save notification preferences",
      toastReset: "Notification preferences reset to defaults",
      channelInApp: "In-app",
      channelEmail: "Email",
      channelPush: "Push",
      eventColumn: "Event",
      /** Word used to compose `${label} notifications` aria labels. */
      wordNotifications: "notifications",
      wordEnabled: "enabled",
      /** Categories + concrete events for the de-labeled CATEGORY_META module list. */
      categories: {
        trading: {
          label: "Trading",
          description: "Execution lifecycle — opens, closes, position updates.",
          events: {
            TRADE_OPENED: "Trade opened",
            TRADE_CLOSED: "Trade closed",
            POSITION_UPDATED: "Position updated",
          } as Record<string, string>,
        },
        risk: {
          label: "Risk",
          description: "Budget breaches and exposure thresholds.",
          events: {
            RISK_LIMIT_BREACH: "Risk limit breached",
            DAILY_LOSS_LIMIT: "Daily loss limit hit",
            DRAWDOWN_THRESHOLD: "Drawdown threshold reached",
            EXPOSURE_THRESHOLD: "Exposure threshold reached",
          } as Record<string, string>,
        },
        strategy: {
          label: "Strategy",
          description: "Playbook adherence and checklists.",
          events: {
            STRATEGY_VIOLATION: "Strategy violation",
            CHECKLIST_INCOMPLETE: "Checklist incomplete",
            RULE_VIOLATION: "Rule violation",
          } as Record<string, string>,
        },
        goals: {
          label: "Goals",
          description: "Target pacing against real behavior — at-risk alerts, recoveries, achievements.",
          events: {
            GOAL_AT_RISK: "Goal slipping (at risk)",
            GOAL_RECOVERED: "Goal back on track",
            GOAL_ACHIEVED: "Goal achieved",
          } as Record<string, string>,
        },
        economic: {
          label: "Economic calendar",
          description: "High-impact events around your session.",
          events: {
            HIGH_IMPACT_EVENT: "High-impact event today",
            EVENT_APPROACHING: "Event approaching (30 min)",
            EVENT_RELEASED: "Event released",
          } as Record<string, string>,
        },
        system: {
          label: "System",
          description: "Connections and data health.",
          events: {
            BROKER_DISCONNECTED: "Broker disconnected",
            MARKET_DATA_STALE: "Market data stale",
            INTEGRATION_FAILURE: "Integration failure",
          } as Record<string, string>,
        },
        reports: {
          label: "Reports",
          description: "Scheduled summaries of your journal.",
          events: {
            DAILY_SUMMARY: "Daily summary",
            WEEKLY_SUMMARY: "Weekly summary",
            MONTHLY_SUMMARY: "Monthly summary",
          } as Record<string, string>,
        },
      } as Record<string, { label: string; description: string; events: Record<string, string> }>,
      quietHoursTitle: "Quiet hours",
      quietHoursDescription:
        "Silence push and email inside a daily window. In-app alerts are never silenced — the inbox stays the system of record. A window crossing midnight (22:00 → 07:00) is supported.",
      quietHoursEnabledAria: "Quiet hours enabled",
      quietHoursFrom: "From (HH:MM)",
      quietHoursTo: "To (HH:MM)",
      quietHoursMuted: "Muted channels inside the window",
      quietHoursMuteAriaPrefix: "Quiet hours — mute",
      resetBody: "The whole notification matrix returns to the safe Euforia defaults. This cannot be undone.",
    },

    academy: {
      title: "Academy",
      description: "How the coach teaches you — difficulty, rhythm and reminders.",
      footerNote: "The Academy module arrives in a later phase — your preferences are already wired for it.",
      toastSaved: "Academy preferences saved",
      toastSaveFailed: "Could not save academy preferences",
      toastReset: "Academy preferences reset to defaults",
      enableLabel: "Enable Academy",
      enableHint: "Lessons and drills woven into your journal.",
      difficultyLabel: "Preferred difficulty",
      difficultyBeginner: "Beginner",
      difficultyIntermediate: "Intermediate",
      difficultyAdvanced: "Advanced",
      reminderLabel: "Weekly reminder",
      goalLabel: "Weekly learning goal",
      goalHint: "Minutes of lessons per week.",
      progressLabel: "Show progress on dashboard",
      progressHint: "A compact learning-progress card next to your KPIs.",
      notificationsLabel: "Learning notifications",
      notificationsHint: "Tell me in-app when new lessons or drills land.",
      autoplayLabel: "Autoplay lessons",
      autoplayHint: "Start the next lesson video automatically.",
      resetBody: "Academy preferences return to the safe defaults. This cannot be undone.",
    },

    privacy: {
      title: "Privacy",
      description: "What Euforia may collect and who can see you — nothing about security lives here.",
      toastSaved: "Privacy preferences saved",
      toastSaveFailed: "Could not save privacy preferences",
      toastReset: "Privacy preferences reset to defaults",
      analyticsLabel: "Usage analytics",
      analyticsHint: "Anonymous product metrics — screens used, never trade content.",
      crashLabel: "Crash diagnostics",
      crashHint: "Error reports with technical context when something breaks.",
      shareLabel: "Share anonymous statistics",
      shareHint: "Aggregated, de-identified discipline benchmarks for the community.",
      emailsLabel: "Product emails",
      emailsHint: "Occasional product news — never trade digests or marketing spam.",
      visibilityLabel: "Profile visibility",
      visibilityHint: "Controls what shared views expose.",
      visibilityPrivate: "Private — only me",
      visibilityAnonymous: "Anonymous — handle only",
      visibilityPublic: "Public — profile page",
      emailDisplayLabel: "Show email on profile",
      emailDisplayHint: "Never affects sign-in or security.",
      emailHidden: "Hidden",
      emailVisible: "Visible",
      resetBody: "Privacy consents return to the safe defaults. This cannot be undone.",
      securityNote: "Sign-in, passwords and broker credentials are managed in Security — never in this tab.",
    },

    /** BackupCard + PreferencesBackupCard + the shared backup-export helper. */
    backup: {
      dataTitle: "Data & backup",
      dataDescription: "Your journal lives on this device — carry a plain JSON snapshot with you.",
      exportButton: "Export backup",
      importButton: "Import backup",
      importing: "Importing…",
      fileAria: "Backup file",
      toastImported: "Backup imported",
      toastImportedTrades: "trades restored,",
      toastImportedStrategies: "strategies",
      toastImportedAnd: "and",
      toastImportedTags: "tags",
      toastImportedAdded: "added.",
      toastImportFailed: "Import failed",
      toastImportFailedDescription: "That file is not a valid Euforia backup (JSON + schema).",
      exportToastTitle: "Backup exported",
      exportToastTrades: "trades",
      exportToastStrategies: "strategies",
      exportToastTags: "tags",
      exportToastFailed: "Export failed",
      exportToastFailedDescription: "The backup could not be generated — please retry.",
      profileTitle: "Preferences profile",
      profileDescription:
        "Export your SETTINGS profile (theme, risk numbers, notifications, quiet hours…) as JSON and restore it on any device. Journal data lives in the data backup below.",
      exportProfileButton: "Export profile",
      importProfileButton: "Import profile",
      restoring: "Restoring…",
      profileFileAria: "Preferences profile file",
      toastProfileExported: "Preferences exported",
      toastProfileExportedDescription:
        "The JSON profile carries every settings card — journal data stays in the data backup.",
      toastProfileRestored: "Preferences restored",
      sectionOne: "settings section",
      sectionMany: "settings sections",
      sectionImportedSuffix: "imported from the profile.",
      toastProfileImportFailedDescription: "That file is not a valid Euforia preferences profile.",
    },

    themePreview: {
      previewAria: "Live theme preview — a miniature trade card",
      sideBuy: "Buy",
      sideSell: "Sell",
      sessionLondon: "London",
      statusClosed: "Closed",
      statNetPnl: "Net P&L",
      statR: "R",
      statPlan: "Plan",
      planFollowed: "Followed",
      note: "Live preview — re-tints instantly with the theme",
    },
  },

  session: sessionDict,
  recognition: recognitionDict,

  trades: tradesDict,

  nofy: nofyDict,

  analytics: analyticsDict,

  playbook: playbookDict,

  academy: academyDict,
} as const;

/**
 * Deep structural widening: EN's `as const` literal values become primitive
 * types while the KEY STRUCTURE stays strictly checked — another pack must
 * provide every key (compile error otherwise) but with its own strings.
 * The mapped types are HOMOMORPHIC (readonly/optionality preserved), so the
 * literal EN pack itself still satisfies `Dictionary` and packs interoperate.
 */
type Widen<T> =
  T extends string
    ? string
    : T extends number
      ? number
      : T extends boolean
        ? boolean
        : T extends readonly (infer U)[]
          ? readonly Widen<U>[]
          : { [K in keyof T]: Widen<T[K]> };

export type Dictionary = Widen<typeof en>;
export { en };
