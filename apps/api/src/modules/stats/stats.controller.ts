/**
 * Stats HTTP surface (B1) — three read-only GET routes: the dashboard
 * overview (netPnl, win rate, equity curve, deltas, sparklines, ghost
 * chips, weekly compare), the Phase-9 analytics aggregates, and the
 * Analytics MODULE dataset (the global filter system's single source of
 * truth, §5) with Zod-parsed query filters and the Monte Carlo sims count.
 * All authenticated (global guard), user-scoped (§34); no writes exist.
 */
import { Controller, Get, Query } from "@nestjs/common";
import { z } from "zod";
import type { AuthPrincipal } from "../../shared/auth/current-user.decorator";
import { CurrentUser } from "../../shared/auth/current-user.decorator";
import { ZodValidationPipe } from "../../shared/http/zod-validation.pipe";
import { analyticsFiltersSchema } from "../../shared/contracts";
import { StatsService } from "./stats.service";

const simsQuerySchema = z.object({ sims: z.coerce.number().int().min(100).max(2000).optional() });

@Controller("stats")
export class StatsController {
  constructor(private readonly stats: StatsService) {}

  /** GET /stats/overview — dashboard aggregates (equity fuel included). */
  @Get("overview")
  async overview(@CurrentUser() principal: AuthPrincipal) {
    return this.stats.statsOverview(principal.userId);
  }

  /** GET /stats/analytics — summary cards, heatmap, buckets, correlations. */
  @Get("analytics")
  async analytics(@CurrentUser() principal: AuthPrincipal) {
    return this.stats.analytics(principal.userId);
  }

  /**
   * GET /stats/analytics-suite — the filtered analytics dataset. Unknown
   * query params are ignored, ""/all values are dropped, invalid values →
   * 400 (the shared analyticsFiltersSchema is the single truth).
   */
  @Get("analytics-suite")
  async analyticsSuite(
    @CurrentUser() principal: AuthPrincipal,
    @Query(new ZodValidationPipe(analyticsFiltersSchema)) filters: z.infer<typeof analyticsFiltersSchema>,
    @Query(new ZodValidationPipe(simsQuerySchema)) sims: { sims?: number },
  ) {
    return this.stats.analyticsSuite(principal.userId, filters, sims.sims ?? 400);
  }
}
