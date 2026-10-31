/** TanStack Query key registry - stable, hierarchical, prefix-invalidation friendly. */
export const queryKeys = {
  accounts: ["accounts"] as const,
  taskyBoard: ["tasky-board"] as const,
  taskySavedViews: ["tasky-saved-views"] as const,
  taskyAutomations: ["tasky-automations"] as const,
  taskyAutomationRuns: ["tasky-automation-runs"] as const,
  taskyAttachments: (cardId: string | null) => ["tasky-attachments", cardId] as const,
  taskyAttachmentsRoot: ["tasky-attachments"] as const,
  instruments: (q: string) => ["instruments", q] as const,
  strategies: ["strategies"] as const,
  strategiesStats: ["strategies-stats"] as const,
  tags: ["tags"] as const,
  rulesStatus: (accountId: string | null) => ["rules-status", accountId] as const,
  rulesStatusRoot: ["rules-status"] as const,
  profile: ["profile"] as const,
  preferences: ["preferences"] as const,
  screenshots: (tradeId: string) => ["screenshots", tradeId] as const,
  rules: ["rules"] as const,
  violations: ["violations"] as const,
  disciplineScore: ["discipline-score"] as const,
  emotionMatrix: ["emotion-matrix"] as const,
  mistakesLedger: ["mistakes-ledger"] as const,
  trades: (params: { status?: string; graded?: string; accountId?: string }) =>
    ["trades", params] as const,
  tradesRoot: ["trades"] as const,
  // Trade module upgrades
  tradeViews: ["trade-views"] as const,
  sessionSeries: (tradeId: string) => ["session-series", tradeId] as const,
  // Trade Plans (Phase 11) - list keyed by filters, detail carries the
  // plan-vs-actual comparison (refetched after every lifecycle mutation).
  plans: (params: { tradeId?: string; status?: string; symbol?: string }) =>
    ["plans", params] as const,
  plansRoot: ["plans"] as const,
  planDetail: (planId: string) => ["plans", "detail", planId] as const,
  review: (tradeId: string) => ["review", tradeId] as const,
  reviewRoot: ["review"] as const,
  alerts: ["alerts"] as const,
  // Metric alert rules (Dashboard Customization Phase 07)
  alertRules: ["alert-rules"] as const,
  alertRuleEvents: (ruleId: string) => ["alert-rules", "events", ruleId] as const,
  // Performance snapshots (Dashboard Customization Phase 08)
  snapshots: ["snapshots"] as const,
  ecoEvents: ["eco-events"] as const,
  personalEventsBoard: ["personal-events-board"] as const,
  // Calendar module upgrades
  calendarView: (from: string, to: string) => ["calendar-view", from, to] as const,
  calendarBlocks: ["calendar-blocks"] as const,
  statsOverview: ["stats-overview"] as const,
  analyticsSuite: (filters: string) => ["analytics-suite", filters] as const,
  skippedTrades: ["skipped-trades"] as const,
  sessionTimeline: ["session-timeline"] as const,
  sessionNotes: ["session-notes"] as const,
  brokerSession: ["broker-session"] as const,
  // Accounts & Trading Connectivity (Phase 02). NOTE: `accounts` (above) is
  // the journal identity list - trading keys are namespaced `trading-*`.
  tradingAccounts: ["trading-accounts"] as const,
  tradingAccount: (accountId: string) => ["trading-accounts", "detail", accountId] as const,
  tradingAccountProviders: ["trading-accounts", "providers"] as const,
  // Phase 07 - universal broker catalog (identity metadata, honest status).
  tradingAccountBrokers: ["trading-accounts", "brokers"] as const,
  tradingAccountPositions: (accountId: string) =>
    ["trading-accounts", accountId, "positions"] as const,
  tradingAccountOrders: (accountId: string) =>
    ["trading-accounts", accountId, "orders"] as const,
  tradingAccountDeals: (accountId: string) => ["trading-accounts", accountId, "deals"] as const,
  tradingAccountSyncRuns: (accountId: string) =>
    ["trading-accounts", accountId, "sync-runs"] as const,
  // Phase 08 - MT5 terminal bridge pairing sheet (owner-only view).
  tradingAccountBridgePairing: (accountId: string) =>
    ["trading-accounts", accountId, "bridge-pairing"] as const,
  integrations: ["integrations"] as const,
  security: ["security"] as const,
  securityEvents: (filters: {
    type?: string;
    outcome?: "SUCCESS" | "FAILURE";
    from?: string;
    to?: string;
  }) => ["security", "events", filters] as const,
  securityLogins: (filters: {
    success?: boolean;
    from?: string;
    to?: string;
  }) => ["security", "logins", filters] as const,
  monitoring: ["monitoring"] as const,
  // Import & Recognition (/recognition - PROMPT 3)
  ocrRecognitions: (status?: string) => ["ocr-recognitions", status ?? "all"] as const,
  ocrRecognitionsRoot: ["ocr-recognitions"] as const,
  ocrRecognition: (id: string) => ["ocr-recognitions", "job", id] as const,
  ocrAnalytics: (days: number) => ["ocr-analytics", days] as const,
  ocrStorage: ["ocr-storage"] as const,
  // V2 - sets, collections, reprocess
  ocrSetsRoot: ["ocr-sets"] as const,
  ocrSet: (id: string) => ["ocr-sets", "set", id] as const,
  ocrCollections: ["ocr-collections"] as const,
  // Professional Playbook module
  playbookOverview: ["playbook-overview"] as const,
  playbookTemplates: ["playbook-templates"] as const,
  playbookRules: ["playbook-rules"] as const,
  setups: ["setups"] as const,
  setupInsights: ["setup-insights"] as const,
  strategyVersions: (strategyId: string) => ["strategy-versions", strategyId] as const,
  checklists: ["checklists"] as const,
  analyticsSuiteRoot: ["analytics-suite"] as const,
  // Trade Review module (fusion with Goal)
  reviewWorkspaceOverview: ["review-workspace-overview"] as const,
  reviewWorkspace: ["review-workspace"] as const,
  reviewWorkspaceRoot: ["review-workspace"] as const,
  reviewLessons: ["review-lessons"] as const,
  goals: ["goals"] as const,
  goalsRoot: ["goals"] as const,
  // Academy module (learning platform)
  academyCatalog: ["academy-catalog"] as const,
  academyOverview: ["academy-overview"] as const,
  academyProgress: ["academy-progress"] as const,
  academyCourse: (courseId: string) => ["academy-course", courseId] as const,
  academyLesson: (lessonId: string) => ["academy-lesson", lessonId] as const,
  academyQuiz: (quizId: string) => ["academy-quiz", quizId] as const,
  academyGlossary: (q: string) => ["academy-glossary", q] as const,
  academySearch: (q: string) => ["academy-search", q] as const,
  academyBookmarks: ["academy-bookmarks"] as const,
  academyPatternDrill: ["academy-pattern-drill"] as const,
  academySrDrill: ["academy-sr-drill"] as const,
  academyPositionDrill: ["academy-position-drill"] as const,
  academyZoneDrill: ["academy-zone-drill"] as const,
  academyPracticeStats: ["academy-practice-stats"] as const,
  academyScenarios: ["academy-scenarios"] as const,
  academyFlashcards: ["academy-flashcards"] as const,
  academyCertifications: ["academy-certifications"] as const,
  academyExam: (categoryId: string) => ["academy-exam", categoryId] as const,
  academyMilestones: ["academy-milestones"] as const,
  academySuggestions: ["academy-suggestions"] as const,
  academyEvents: ["academy-events"] as const,
  academyTasks: ["academy-tasks"] as const,
  /** Mutations that touch learning state refresh these aggregates (array of key arrays). */
  academyAggregates: [
    ["academy-catalog"],
    ["academy-overview"],
    ["academy-progress"],
    ["academy-bookmarks"],
    ["academy-practice-stats"],
    ["academy-certifications"],
    ["academy-milestones"],
  ] as const,
  // Nofy module (personal knowledge & notes workspace)
  nofyOverview: ["nofy-overview"] as const,
  nofyNotes: (view: string, folderId: string, tagId: string, q: string, sort: string) =>
    ["nofy-notes", view, folderId, tagId, q, sort] as const,
  nofyNotesRoot: ["nofy-notes"] as const,
  nofyLinkedNotes: (kind: string, id: string) => ["nofy-notes", "linked", kind, id] as const,
  nofyNote: (noteId: string) => ["nofy-note", noteId] as const,
  nofyFolders: ["nofy-folders"] as const,
  nofyTags: ["nofy-tags"] as const,
  nofyTemplates: ["nofy-templates"] as const,
  nofySearch: (q: string) => ["nofy-search", q] as const,
  nofyRefs: (q: string, kind: string) => ["nofy-refs", q, kind] as const,
  nofyVersions: (noteId: string) => ["nofy-versions", noteId] as const,
  /** Mutations that touch note state refresh these aggregates. */
  nofyAggregates: [
    ["nofy-overview"],
    ["nofy-notes"],
    ["nofy-folders"],
    ["nofy-tags"],
  ] as const,
  // Application authentication - the single authoritative session state
  authMe: ["auth", "me"] as const,
  authRoot: ["auth"] as const,
} as const;

/**
 * Root keys invalidated by any trade mutation. The discipline banner
 * (rules-status) refetches after EACH mutation per trade-entry-ux.md §12,
 * and the Session Live timeline is rebuilt from trades/events/alerts.
 *
 * Phase 09 (data freshness): `analyticsSuiteRoot` joined the bundle - a
 * single-trade create/edit/close/decision/delete changes every derived
 * aggregate (dashboard comparison widgets consume the sims=50 suite; the
 * Analytics page refetches on mount after navigation because its cached
 * entry is stale). Bulk-tag and CSV-import already invalidated it - the
 * single-trade path was the gap (audit finding #1, evidence-ranked).
 */
export const tradeMutationInvalidations = [
  queryKeys.tradesRoot,
  queryKeys.rulesStatusRoot,
  queryKeys.alerts,
  queryKeys.statsOverview,
  queryKeys.sessionTimeline,
  queryKeys.analyticsSuiteRoot,
] as const;
