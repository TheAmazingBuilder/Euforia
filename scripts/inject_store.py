#!/usr/bin/env python3
"""Inject the store extension block into mocks/store.ts."""
from pathlib import Path

STORE = Path("/home/z/my-project/apps/web/src/mocks/store.ts")
PARTS = [Path(f"/home/z/my-project/scripts/store_ext_part{i}.ts").read_text() for i in range(1, 6)]

# extra state used by the CSV preview/commit methods
csv_state = """
/** In-memory CSV preview batches (commit consumes the stored parse). */
const csvBatches = new Map<string, { input: CsvImportPreviewRequest; parsed: CsvParseResult }>();

"""

src = STORE.read_text()

# ── 1. type imports: append before the final `} from "@cosmoz/shared";` ──────
anchor = '  type NotifyTestResponse,\n} from "@cosmoz/shared";'
assert anchor in src, "shared import tail not found"
new_types = '''  type NotifyTestResponse,
  // ── restored domains ──
  type AccountBandResponse,
  type MonthHighlight,
  type MonthHighlightsResponse,
  type MonthlyGoal,
  type MonthlyGoalsResponse,
  type ProductMetricsResponse,
  type CoachWeeklyReportResponse,
  type CoachDecision,
  type DisciplineStreak,
  type WeeklyReportResponse,
  type WeekInsight,
  type RiskOverviewResponse,
  type RiskLevel,
  type SystemHealth,
  type AnalyticsSectionResponse,
  type EconomicCalendarResponse,
  type ChartCandlesResponse,
  type SymbolHistoryResponse,
  type UpdateTradeChartInput,
  type TradeChartResponse,
  type Timeframe,
  type PortfolioOverviewResponse,
  type BrokerConnectionsResponse,
  type ConnectBrokerResponse,
  type SyncConnectionResponse,
  type ImportBatchesResponse,
  type ImportBatchRow,
  type BrokerConnectionRow,
  type CreateBrokerConnectionInput,
  type UpdateBrokerConnectionInput,
  type CreateAccountInput,
  type UpdateAccountInput,
  type DeleteAccountResponse,
  type Account,
  type CsvImportPreviewRequest,
  type CsvImportPreviewResponse,
  type CsvImportCommitRequest,
  type CsvImportCommitResponse,
  type ImportTradesInput,
  type ImportTradesResponse,
  type GoalSettings,
  type UpdateGoalSettingsInput,
  type GoalProgressResponse,
  type GoalProgressStatus,
  type GoalProgressRow,
  type RiskDefaults,
  type UpdateRiskDefaultsInput,
  type JournalGoals,
  type UpdateJournalGoalsInput,
  type JournalEntry,
  type JournalListResponse,
  type CreateJournalEntryInput,
  type UpdateJournalEntryInput,
  type SecurityOverview,
  type ChangePasswordInput,
  type ChangePasswordResponse,
  type TwoFactorToggleResponse,
  type RevokeSessionResponse,
  type SecurityLogResponse,
  type SecurityEvent,
  type SocialOverviewResponse,
  type SocialMe,
  type UpdateSocialMeInput,
  type CreateSocialPostInput,
  type SocialPost,
  type SocialPeriod,
  type SocialTrader,
  type SocialLeaderboardRow,
  type IntegrationsCatalogResponse,
  type Integration,
  type ToggleIntegrationResponse,
} from "@cosmoz/shared";'''
src = src.replace(anchor, new_types, 1)

# ── 2. value imports after the fixtures/integrations import block ────────────
val_anchor = '''import {
  INTEGRATION_PROVIDERS,
  INITIAL_PROVIDER_STATUS,
  latencySeries,
  buildNews,
} from "./fixtures/integrations";'''
assert val_anchor in src, "value import anchor not found"
val_new = val_anchor + '''
import { TIMEFRAME_MS } from "@cosmoz/shared";
import { mulberry32, type Rng } from "./fixtures/random";
import { buildEconomicWeek } from "./economic-calendar";
import { buildAnalyticsSection } from "./analytics-sections";
import { parseCsvFile, type CsvParseResult } from "./csv-parse";'''
src = src.replace(val_anchor, val_new, 1)

# ── 3. inject the extension block right before the final `return {` ─────────
# the final return is at the end of createMockStore — find last occurrence
idx = src.rfind("\n  return {")
assert idx != -1, "final return not found"
block = "\n  // ═══ RESTORED DOMAINS (Academy-save wiring) ═══\n" + csv_state + "\n".join(PARTS) + "\n"
src = src[:idx] + block + src[idx:]

# ── 4. extend the returned object ────────────────────────────────────────────
ret_anchor = """    getProfile,
    updateProfile,"""
assert ret_anchor in src
ret_new = ret_anchor + """

    // ── restored domains ──
    analyticsSection,
    economicCalendar,
    accountBand,
    monthHighlights,
    monthlyGoals,
    productMetrics,
    weeklyReport,
    coachWeeklyReport,
    riskOverview,
    getSystemHealth,
    getInstrumentCandles,
    getSymbolHistory,
    updateTradeChart,
    portfolioOverview,
    listBrokerConnections,
    createBrokerConnection,
    updateBrokerConnection,
    deleteBrokerConnection,
    syncBrokerConnection,
    createAccount,
    updateAccount,
    deleteAccount,
    listImportBatches,
    importTrades,
    previewCsv,
    commitCsvImport,
    getGoalSettings,
    updateGoalSettings,
    goalProgress,
    getRiskDefaults,
    updateRiskDefaults,
    getJournalGoals,
    updateJournalGoals,
    listJournalEntries,
    createJournalEntry,
    updateJournalEntry,
    deleteJournalEntry,
    getSecurityOverview,
    changePassword,
    toggleTwoFactor,
    revokeSession,
    securityLog,
    socialOverview,
    getSocialMe,
    updateSocialMe,
    createSocialPost,
    toggleSocialPostLike,
    toggleSocialFollow,
    listSystemIntegrations,
    toggleSystemIntegration,"""
src = src.replace(ret_anchor, ret_new, 1)

STORE.write_text(src)
print(f"store.ts patched: {len(src)} chars")
