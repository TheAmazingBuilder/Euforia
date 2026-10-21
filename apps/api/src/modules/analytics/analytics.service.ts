/**
 * Analytics application service (Phase 8) — orchestration + resolution.
 *
 * Analytics is a CONSUMER of domain truth (Phase 8 §2): this service reads
 * every source through its owning context's PUBLIC contract — Trading Core
 * (canonical trades), Trade Review (verdicts + frozen plan snapshots), Trade
 * Planning (canonical planned RR + instrument catalog), Playbook (strategy
 * names), Accounts (scope currencies + starting balances), Identity (the
 * user's trading-day timezone). No Prisma here, no writes anywhere, no
 * competing financial formula (§4/§29/§69).
 *
 * Attribution rules (documented seams, §21/§22):
 *   - strategy: Trade → review.originTradePlanId → TradePlan.strategyId.
 *     Trades without that explicit chain are OUT OF PLAYBOOK — attribution
 *     never resolves against the latest strategy state.
 *   - plannedRR: review.planSnapshot.rrRatio (FROZEN at review time) ?? the
 *     origin plan's canonical rrRatio — never recomputed (no second engine).
 *   - instrumentId: InstrumentSpecification catalog match by symbol, else a
 *     deterministic v5 group id derived from the raw symbol (stable group
 *     identity for uncataloged tickers — a display id, not a DB reference).
 *
 * Honest gaps (§8/§34/§54): emotions/confidence/tags/mistakes/eco-calendar/
 * intratrade excursions are NOT journal fields backend yet — those blocks
 * ship empty/null (never fabricated), flagged in the report.
 */
import { Inject, Injectable } from "@nestjs/common";
import type { RootLogger } from "../../infrastructure/logging/logger.factory";
import { ROOT_LOGGER } from "../../infrastructure/logging/logger.factory";
import { NotFoundError } from "../../shared/errors/app-error";
import type {
  AnalyticsFilters,
  AnalyticsSuiteResponse,
  ReviewPlanSnapshot,
  StatsOverviewResponse,
} from "../../shared/contracts";
import { AccountsRepository } from "../accounts/accounts.repository";
import { IdentityRepository } from "../identity/identity.repository";
import { PlaybookRepository } from "../playbook/playbook.repository";
import { parsePlanSnapshot } from "../trade-review/domain/plan-snapshot";
import { TradeReviewRepository } from "../trade-review/trade-review.repository";
import type { InstrumentSpecificationProvider } from "../trade-planning/domain/ports";
import { TradePlanRepository } from "../trade-planning/trade-plan.repository";
import { INSTRUMENT_SPECIFICATION_PROVIDER } from "../trade-planning/trade-planning.tokens";
import { TradingRepository } from "../trading/trading.repository";
import { CalendarQueriesService } from "../calendar/calendar-queries.service";
import type { AnalyticsTradeRow } from "./domain/analytics-input";
import type { SuiteCalendarEvent } from "./domain/analytics-suite";
import { computeAnalyticsOverview } from "./domain/analytics-overview";
import { computeAnalyticsSuite } from "./domain/analytics-suite";
import { todayKeyFor } from "./domain/analytics-clock";
import { ANALYTICS_UUID_NAMESPACE, uuidV5 } from "./domain/analytics-math";

function toNumber(value: { toFixed(): string } | null | undefined): number | null {
  if (value === null || value === undefined) return null;
  const parsed = Number(value.toFixed());
  return Number.isFinite(parsed) ? parsed : null;
}

function parseNumber(value: string | null | undefined): number | null {
  if (value === null || value === undefined) return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

/**
 * Tolerant snapshot read: a corrupted JSONB snapshot degrades to null
 * (planned RR falls back to the live plan / "No plan") instead of failing
 * the whole analytics dataset for one malformed review.
 */
function safeParseSnapshot(raw: unknown): ReviewPlanSnapshot | null {
  try {
    return parsePlanSnapshot(raw);
  } catch {
    return null;
  }
}

@Injectable()
export class AnalyticsService {
  constructor(
    private readonly trading: TradingRepository,
    private readonly reviews: TradeReviewRepository,
    private readonly plans: TradePlanRepository,
    private readonly accounts: AccountsRepository,
    private readonly playbook: PlaybookRepository,
    private readonly identity: IdentityRepository,
    private readonly calendarQueries: CalendarQueriesService,
    @Inject(INSTRUMENT_SPECIFICATION_PROVIDER)
    private readonly instruments: InstrumentSpecificationProvider,
    @Inject(ROOT_LOGGER) private readonly logger: RootLogger,
  ) {}

  /**
   * The Analytics module's single dataset endpoint. Every tab renders the
   * SAME filtered set — the filter bag is validated by the shared schema
   * before this method runs.
   */
  async getAnalyticsSuite(userId: string, filters: AnalyticsFilters, sims: number): Promise<AnalyticsSuiteResponse> {
    const startedAt = Date.now();
    const user = await this.requireUser(userId);
    const environment = await this.buildSuiteEnvironment(userId, user.timezone);

    const suite = computeAnalyticsSuite(environment, filters, sims);

    // Structured telemetry (§67) — counters and ids only, never payloads.
    this.logger.info(
      {
        event: "analytics.suite_computed",
        userId,
        analyticsType: "SUITE",
        closedTrades: suite.meta.closedTrades,
        singleCurrency: suite.meta.singleCurrency,
        anomalyCount: suite.meta.anomalies.length,
        queryDurationMs: Date.now() - startedAt,
      },
      "analytics suite computed",
    );
    return suite;
  }

  /** Dashboard/Session KPI aggregation (global, unfiltered). */
  async getStatsOverview(userId: string): Promise<StatsOverviewResponse> {
    const startedAt = Date.now();
    const user = await this.requireUser(userId);
    const [tradeRows, openTradeCount, accountRows] = await Promise.all([
      this.trading.listClosedJournalRows(userId),
      this.trading.countOpenTrades(userId),
      this.accounts.listAccountsByUser(userId),
    ]);

    const trades = tradeRows.map((row) => this.toEngineRow(row));
    const accounts = accountRows.map((row) => ({
      id: row.id,
      name: row.name,
      currency: row.currency,
      startingBalance: toNumber(row.startingBalance) ?? 0,
      isDefault: row.isDefault,
    }));

    const overview = computeAnalyticsOverview({
      trades,
      accounts,
      openTradeCount,
      timezone: user.timezone,
      now: new Date(),
    });

    this.logger.info(
      {
        event: "analytics.overview_computed",
        userId,
        analyticsType: "OVERVIEW",
        closedTrades: trades.length,
        queryDurationMs: Date.now() - startedAt,
      },
      "analytics overview computed",
    );
    return overview;
  }

  // ── Internal resolution ───────────────────────────────────────────────────

  private async requireUser(userId: string): Promise<{ timezone: string }> {
    const user = await this.identity.findUserById(userId);
    if (user === null) {
      // The principal comes from the JWT guard — a vanished user is an
      // honest 404, never a silent empty dataset.
      throw new NotFoundError("User not found.");
    }
    return user;
  }

  private async buildSuiteEnvironment(userId: string, timezone: string) {
    const [tradeRows, openTradeCount, reviewRows, planRows, strategyRows, accountRows, specRows] =
      await Promise.all([
        this.trading.listClosedJournalRows(userId),
        this.trading.countOpenTrades(userId),
        this.reviews.listActiveReviewSummaries(userId),
        this.plans.listPlanAttributionRows(userId),
        this.playbook.listStrategies(userId),
        this.accounts.listAccountsByUser(userId),
        this.instruments.listSpecifications(),
      ]);

    // Instrument resolution by symbol (catalog id ?? deterministic group id).
    // quoteCurrency rides along for the Phase 13 §21 economic-event join
    // (null for uncataloged symbols — they never correlate, honest).
    const specBySymbol = new Map(specRows.map((spec) => [spec.symbol, spec]));
    const instrumentBySymbol = new Map<
      string,
      { id: string; symbol: string; assetClass: string; quoteCurrency: string | null }
    >();
    const resolveInstrument = (
      symbol: string,
    ): { id: string; symbol: string; assetClass: string; quoteCurrency: string | null } => {
      const cached = instrumentBySymbol.get(symbol);
      if (cached) return cached;
      const spec = specBySymbol.get(symbol);
      const resolved =
        spec === undefined
          ? { id: uuidV5(symbol, ANALYTICS_UUID_NAMESPACE), symbol, assetClass: "?", quoteCurrency: null }
          : { id: spec.id, symbol: spec.symbol, assetClass: spec.assetClass, quoteCurrency: spec.quoteCurrency };
      instrumentBySymbol.set(symbol, resolved);
      return resolved;
    };

    // Attribution maps: trade → review (verdict + origin plan) → plan.
    const reviewByTradeId = new Map(reviewRows.map((review) => [review.tradeId, review]));
    const planById = new Map(planRows.map((plan) => [plan.id, plan]));
    const strategyNames = Object.fromEntries(strategyRows.map((s) => [s.id, s.name]));

    const trades = tradeRows.map((row) => {
      const instrument = resolveInstrument(row.symbol);
      const review = reviewByTradeId.get(row.id);
      const originPlan = review?.originTradePlanId !== null && review?.originTradePlanId !== undefined
        ? planById.get(review.originTradePlanId)
        : undefined;
      const strategyId = originPlan?.strategyId ?? null;
      // Canonical planned RR — frozen snapshot first, then the live plan
      // (plans stay mutable in DRAFT/PLANNED; the snapshot preserves what
      // the review actually compared against, §22/§26). A corrupted snapshot
      // degrades to the live plan / "No plan" — never poisons the dataset.
      const snapshot = safeParseSnapshot(review?.planSnapshot);
      const plannedRR =
        parseNumber(snapshot?.rrRatio ?? null) ?? toNumber(originPlan?.rrRatio ?? null);
      return this.toEngineRow(row, {
        instrument,
        strategyId,
        plannedRR,
        followedPlan: review ? review.followedPlan : null,
      });
    });

    const accounts = accountRows.map((row) => ({
      id: row.id,
      name: row.name,
      currency: row.currency,
      startingBalance: toNumber(row.startingBalance) ?? 0,
      isDefault: row.isDefault,
    }));

    // Phase 13 §21 — canonical economic events over the sync window; the
    // pure engine performs the correlation (no second event store here).
    const calendarEvents: SuiteCalendarEvent[] = (
      await this.calendarQueries.listSyncWindowEventsForCorrelation()
    ).map((event) => ({
      id: event.id,
      currency: event.currency,
      impact: event.impact,
      scheduledAtMs: event.scheduledAt.getTime(),
    }));

    return {
      trades,
      accounts,
      strategyNames,
      todayKey: todayKeyFor(timezone),
      openTradeCount,
      calendarEvents,
    };
  }

  /**
   * Canonical trade row → engine row. The overview path passes EMPTY maps
   * (no review/plan context needed there — followedPlan/plannedRR feed the
   * suite blocks only; the overview has no such block).
   */
  private toEngineRow(
    row: {
      id: string;
      accountId: string;
      symbol: string;
      direction: string;
      exitReason: string | null;
      entryAt: Date;
      exitAt: Date | null;
      tradingDate: Date;
      pnlNet: { toFixed(): string } | null;
      rMultiple: { toFixed(): string } | null;
      riskAmount: { toFixed(): string } | null;
    },
    resolved?: {
      instrument: { id: string; symbol: string; assetClass: string; quoteCurrency: string | null };
      strategyId: string | null;
      plannedRR: number | null;
      followedPlan: boolean | null;
    },
  ): AnalyticsTradeRow {
    const rMultipleRaw = row.rMultiple === null ? null : row.rMultiple.toFixed();
    const riskAmountRaw = row.riskAmount === null ? null : row.riskAmount.toFixed();
    const riskParsed = toNumber(row.riskAmount);
    return {
      id: row.id,
      accountId: row.accountId,
      symbol: row.symbol,
      instrumentId: resolved?.instrument.id ?? uuidV5(row.symbol, ANALYTICS_UUID_NAMESPACE),
      instrumentSymbol: resolved?.instrument.symbol ?? row.symbol,
      assetClass: resolved?.instrument.assetClass ?? "?",
      quoteCurrency: resolved?.instrument.quoteCurrency ?? null,
      direction: row.direction,
      exitReason: row.exitReason,
      entryAtIso: row.entryAt.toISOString(),
      exitAtIso: row.exitAt === null ? null : row.exitAt.toISOString(),
      entryAtMs: row.entryAt.getTime(),
      exitAtMs: row.exitAt === null ? null : row.exitAt.getTime(),
      // tradingDate is a @db.Date column — Prisma returns UTC midnight of the
      // stored key; the key itself is the canonical trading day.
      tradingDate: row.tradingDate.toISOString().slice(0, 10),
      pnlNet: toNumber(row.pnlNet) ?? 0,
      rMultiple: toNumber(row.rMultiple) ?? 0,
      riskMoney: riskParsed !== null && riskParsed > 0 ? riskParsed : null,
      riskAmountRaw,
      rMultipleRaw,
      plannedRR: resolved?.plannedRR ?? null,
      followedPlan: resolved?.followedPlan ?? null,
      strategyId: resolved?.strategyId ?? null,
    };
  }
}
