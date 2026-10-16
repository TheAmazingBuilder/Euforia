/**
 * Analytics bounded context (Phase 8) — derived measurements and analytical
 * interpretations over canonical trading data.
 *
 * Core domain (Phase 0 §I): flat application-service + thin-controller
 * discipline. This context owns NO Prisma repository of its own: every
 * source is consumed through the owning context's PUBLIC contract
 * (TradingRepository / TradeReviewRepository / TradePlanRepository +
 * instrument-catalog port / AccountsRepository / PlaybookRepository /
 * IdentityRepository) — Analytics never writes, never duplicates a
 * financial formula, never mutates another domain (§2/§4/§17/§29/§69).
 *
 * The aggregation engines are PURE domain functions (domain/): deterministic,
 * unit-testable, framework-free. Live queries only — no analytics tables,
 * no read models, no cache (journal-scale data; the filter bag changes per
 * request so a cache would be dead code — §36/§44 documented decision).
 *
 * NO FastAPI: no workload here justifies a Python round-trip yet (§39 —
 * specialized statistical processing remains a documented future seam).
 *
 * Behavioral analytics V1 = deterministic thresholded signals (tail loss,
 * overtrading, loss streak, tilt timeline) — measured FACTS with evidence,
 * never diagnoses, never AI/LLM (§23–§32/§49/§50).
 *
 * Out of scope forever in this context (§70): trade execution, order
 * placement, OCR, AI analysis, backtesting, academy, notifications,
 * community features.
 */
import { Module } from "@nestjs/common";
import { ConfigModule } from "../../config/config.module";
import { LoggingModule } from "../../infrastructure/logging/logging.module";
import { PrismaModule } from "../../infrastructure/prisma/prisma.module";
import { AccountsModule } from "../accounts/accounts.module";
import { IdentityModule } from "../identity/identity.module";
import { PlaybookModule } from "../playbook/playbook.module";
import { TradePlanningModule } from "../trade-planning/trade-planning.module";
import { TradeReviewModule } from "../trade-review/trade-review.module";
import { TradingModule } from "../trading/trading.module";
import { CalendarModule } from "../calendar/calendar.module";
import { AnalyticsController } from "./analytics.controller";
import { AnalyticsService } from "./analytics.service";

@Module({
  imports: [
    ConfigModule,
    LoggingModule,
    PrismaModule,
    // Cross-context READS through public contracts only (§26/§69): the
    // canonical journal, review verdicts + frozen plan snapshots, canonical
    // planned RR + instrument catalog, account scope, strategy names and the
    // user's trading-day timezone.
    IdentityModule,
    AccountsModule,
    TradingModule,
    TradePlanningModule,
    TradeReviewModule,
    PlaybookModule,
    // Phase 13 §21 — the economic-event context (phases/byImpact) reads
    // the canonical Calendar through its public read port (no duplicate
    // event store, §57).
    CalendarModule,
  ],
  controllers: [AnalyticsController],
  providers: [AnalyticsService],
  // Narrow contract (§26/§69): the Phase-07 metric-alerts engine consumes
  // the suite as the authoritative per-scope metric source — the alert
  // engine computes no financial math of its own.
  exports: [AnalyticsService],
})
export class AnalyticsModule {}
