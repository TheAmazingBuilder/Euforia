/**
 * Stats HTTP surface (B1) - three read-only GET routes: the dashboard
 * overview (netPnl, win rate, equity curve, deltas, sparklines, ghost
 * chips, weekly compare), the Phase-9 analytics aggregates, and the
 * Analytics MODULE dataset (the global filter system's single source of
 * truth, §5) with Zod-parsed query filters and the Monte Carlo sims count.
 * All authenticated (global guard), user-scoped (§34); no writes exist.
 */
import { Controller, Get } from "@nestjs/common";
import type { AuthPrincipal } from "../../shared/auth/current-user.decorator";
import { CurrentUser } from "../../shared/auth/current-user.decorator";
import { StatsService } from "./stats.service";


@Controller("stats")
export class StatsController {
  constructor(private readonly stats: StatsService) {}

  /** GET /stats/overview - dashboard aggregates (equity fuel included). */
  @Get("overview")
  async overview(@CurrentUser() principal: AuthPrincipal) {
    return this.stats.statsOverview(principal.userId);
  }

  /** GET /stats/analytics - summary cards, heatmap, buckets, correlations. */
  @Get("analytics")
  async analytics(@CurrentUser() principal: AuthPrincipal) {
    return this.stats.analytics(principal.userId);
  }

  // NOTE (reconciliation): GET /stats/analytics-suite moved to the Phase-8
  // AnalyticsModule (one route owner per path). The legacy StatsService suite
  // stays available internally for the wired /stats/overview + /stats/analytics
  // surfaces.
}
