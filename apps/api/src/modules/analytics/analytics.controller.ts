/**
 * Analytics controller (Phase 8 §41/§55) — thin HTTP boundary over the
 * analytics application service. Authentication (global guard) → query
 * validation (shared contract) → application use case → response.
 *
 * Routes follow the FRONTEND contract (the module speaks /stats/*):
 *   GET /stats/analytics-suite — the Analytics module's ONE dataset (13 tabs)
 *   GET /stats/overview        — dashboard/session KPI aggregation
 * The legacy GET /stats/analytics shape has no remaining consumer in the UI
 * (dead hook) and is deliberately NOT implemented (documented deferral).
 *
 * All routes require authentication (global JwtAuthGuard — no @Public).
 * The userId ALWAYS comes from the auth principal, never from the client —
 * every downstream read is ownership-scoped (IDOR battery in e2e, §46).
 */
import { Controller, Get, Query } from "@nestjs/common";
import { z } from "zod";
import { ZodValidationPipe } from "../../shared/http/zod-validation.pipe";
import { CurrentUser, type AuthPrincipal } from "../../shared/auth/current-user.decorator";
import {
  analyticsFiltersSchema,
  type AnalyticsFilters,
  type AnalyticsSuiteResponse,
  type StatsOverviewResponse,
} from "../../shared/contracts";
import { AnalyticsService } from "./analytics.service";

/**
 * The suite query = the shared global filter bag + the Monte Carlo sims
 * count. `sims` is a raw string here (query params are strings); the service
 * normalizes it with the contract's default-and-clamp semantics (default
 * 400, clamped 100–2000 by the engine — an unparsable value falls back to
 * the default instead of failing the whole dataset).
 */
const analyticsSuiteQuerySchema = analyticsFiltersSchema.extend({
  sims: z.string().optional(),
});

type AnalyticsSuiteQuery = z.infer<typeof analyticsSuiteQuerySchema>;

@Controller("stats")
export class AnalyticsController {
  constructor(private readonly analytics: AnalyticsService) {}

  /** The Analytics module's single dataset definition (§5 of the product). */
  @Get("analytics-suite")
  suite(
    @CurrentUser() principal: AuthPrincipal,
    @Query(new ZodValidationPipe(analyticsSuiteQuerySchema)) query: AnalyticsSuiteQuery,
  ): Promise<AnalyticsSuiteResponse> {
    const { sims, ...filters } = query;
    const parsedSims = Number(sims);
    return this.analytics.getAnalyticsSuite(
      principal.userId,
      filters as AnalyticsFilters,
      Number.isFinite(parsedSims) ? parsedSims : 400,
    );
  }

  /** Dashboard/Session KPI aggregation (no filters — the global dataset). */
  @Get("overview")
  overview(@CurrentUser() principal: AuthPrincipal): Promise<StatsOverviewResponse> {
    return this.analytics.getStatsOverview(principal.userId);
  }
}
